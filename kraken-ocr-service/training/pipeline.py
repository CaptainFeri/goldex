"""
Fine-tune a Kraken OCR model on Persian (Farsi) text line data.

Usage:
    # Prepare data: place line images + .gt.txt files in data_dir
    # Directory structure:
    #   data_dir/
    #   ├── line_001.png
    #   ├── line_001.gt.txt
    #   ├── line_002.png
    #   ├── line_002.gt.txt
    #   └── ...

    # Train (fine-tune from an existing base model, tuned for small sample counts)
    python -m training.pipeline \\
        --data-dir data/training/data \\
        --base-model data_model/arabic_best.mlmodel \\
        --output data_model/persian_best.mlmodel \\
        --epochs 20 \\
        --min-epochs 3 \\
        --lag 5 \\
        --batch-size 8 \\
        --val-split 0.1 \\
        --device cpu \\
        --timeout 3600

    # Evaluate on test set
    python -m training.pipeline \\
        --data-dir data/training/data \\
        --model data_model/persian_best.mlmodel \\
        --test-only

Why this file looks the way it does
-------------------------------------
Kraken's own docs note that a full `ketos train` run with default early
stopping (`--lag 10`, no epoch cap) commonly takes 8-24 hours, because it
just keeps training until validation accuracy stops improving. With a
handful of fine-tuning samples that "improvement" signal is mostly noise,
so early stopping can fail to trigger for a very long time. Two things
fix this:

1. A real wall-clock timeout AND a "stall" timeout (no new progress line
   for N minutes) that actually get enforced on the subprocess, with the
   best checkpoint produced so far salvaged instead of the whole run
   being wasted.
2. Early-stopping parameters and few-shot fine-tuning flags
   (`--freeze-backbone`, `--warmup`) tuned for training from a handful of
   samples on top of an existing base model, instead of the defaults
   meant for training a model from scratch on thousands of lines.
"""

import argparse
import glob
import json
import logging
import os
import select
import shutil
import subprocess
import sys
import time
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("training")

console = Console()


class TrainingIncomplete(Exception):
    """Raised when ketos was stopped early (timeout/stall) and no
    checkpoint could be salvaged."""


def _find_images(data_dir: Path) -> list[Path]:
    return sorted(data_dir.glob("*.png")) + sorted(data_dir.glob("*.jpg"))


def _check_ground_truth(data_dir: Path) -> int:
    images = _find_images(data_dir)
    valid = 0
    for img in images:
        gt = img.with_name(img.stem + ".gt.txt")
        if gt.exists() and gt.read_text(encoding="utf-8").strip():
            valid += 1
        else:
            logger.warning("Missing or empty ground truth: %s", gt)
    return valid


def _split_data(data_dir: Path, val_split: float, min_val: int = 1):
    """Split images into train/val lists.

    With very small sample counts (this pipeline is meant to fine-tune on
    as few as train_min_samples=5 images) a naive `val_split` can produce
    zero validation images, which makes early stopping meaningless (no
    signal to stop on) and is a real contributor to runs that never
    converge. We always keep at least `min_val` images for validation,
    and fall back to reusing the training set for evaluation only if
    there truly aren't enough images to spare any.
    """
    images = _find_images(data_dir)
    import random

    random.shuffle(images)

    n = len(images)
    split_at = int(n * (1 - val_split))
    train = images[:split_at]
    val = images[split_at:]

    if len(val) < min_val and n > min_val:
        # Borrow the minimum needed from train rather than training with
        # an empty/near-empty validation set.
        needed = min_val - len(val)
        val = images[-min_val:]
        train = images[: max(n - min_val, 1)]
        logger.warning(
            "val_split=%.2f produced too few validation images for %d "
            "samples; reserved %d image(s) for validation instead.",
            val_split, n, min_val,
        )

    no_val = len(val) == 0
    if no_val:
        logger.warning(
            "Only %d image(s) available; there is no held-out validation "
            "set. Early stopping will be disabled for this run (use "
            "--quit fixed) since there's no signal to stop on.",
            n,
        )
        val = train

    train_list = data_dir.parent / "train_set.list"
    val_list = data_dir.parent / "val_set.list"

    train_list.write_text("\n".join(str(p.resolve()) for p in train), encoding="utf-8")
    val_list.write_text("\n".join(str(p.resolve()) for p in val), encoding="utf-8")

    logger.info(
        "Split: %d train, %d val -> %s, %s",
        len(train), len(val), train_list, val_list,
    )
    return train_list, val_list, no_val


def _print_config(table_title: str, rows: list[tuple[str, str]]) -> None:
    table = Table(title=table_title, show_header=False, pad_edge=False, title_justify="left")
    table.add_column(style="cyan", no_wrap=True)
    table.add_column()
    for key, value in rows:
        table.add_row(key, value)
    console.print(table)


def _run_ketos(
    args: list[str],
    threads: int | None,
    timeout_sec: int,
    stall_timeout_sec: int,
) -> str:
    """Run a ketos command with real timeout + stall enforcement.

    Returns one of: "completed", "failed", "timeout", "stalled".
    Unlike a plain subprocess.run(timeout=...), this also detects the
    case where ketos is still alive but has stopped printing progress
    (e.g. it's spinning on validation with a degenerate val set) and
    treats that as a stall rather than waiting the full timeout.
    """
    logger.info("Running: %s", " ".join(args))
    console.print(f"[bold cyan]▶[/] [white]{' '.join(args)}[/]")

    env = os.environ.copy()
    if threads:
        env["OMP_NUM_THREADS"] = str(threads)
        env["MKL_NUM_THREADS"] = str(threads)
        env["TORCH_NUM_THREADS"] = str(threads)

    process = subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    assert process.stdout is not None

    start = time.monotonic()
    last_output = time.monotonic()
    status = "completed"

    while True:
        now = time.monotonic()
        if timeout_sec and (now - start) > timeout_sec:
            status = "timeout"
            break
        if stall_timeout_sec and (now - last_output) > stall_timeout_sec:
            status = "stalled"
            break

        ready, _, _ = select.select([process.stdout], [], [], 5)
        if ready:
            line = process.stdout.readline()
            if line == "" and process.poll() is not None:
                break
            if line:
                last_output = time.monotonic()
                logger.info("%s", line.rstrip())
        elif process.poll() is not None:
            break

    if status in ("timeout", "stalled"):
        elapsed = time.monotonic() - start
        reason = (
            f"exceeded timeout of {timeout_sec}s"
            if status == "timeout"
            else f"no progress output for {stall_timeout_sec}s"
        )
        logger.warning("Stopping ketos after %.0fs: %s", elapsed, reason)
        console.print(
            Panel(
                f"Training stopped after [bold]{elapsed:.0f}s[/]: {reason}.\n"
                "Attempting to salvage the best checkpoint produced so far...",
                title="[bold yellow]Training interrupted[/]",
                border_style="yellow",
                title_align="left",
            )
        )
        process.terminate()
        try:
            process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            logger.warning("ketos did not exit after SIGTERM; killing it")
            process.kill()
            process.wait()
        return status

    returncode = process.wait()
    if returncode != 0:
        logger.error("Command exited with code %d: %s", returncode, " ".join(args))
        console.print(
            Panel(
                f"Command exited with code {returncode}: {' '.join(args)}",
                title="[bold red]Command failed[/]",
                border_style="red",
                title_align="left",
            )
        )
        return "failed"
    return "completed"


def _salvage_checkpoint(train_base: Path) -> Path | None:
    """Find the most usable checkpoint after an interrupted run.

    Checks, in order:
      1. `{train_base}_best.mlmodel` (ketos already picked a best epoch)
      2. The most recently modified `{train_base}_*.mlmodel` (per-epoch
         checkpoint from ketos <7.0, saved as prefix_N.mlmodel)
      3. A Lightning `.ckpt` file (kraken >=7.0 writes `checkpoint_abort.ckpt`
         on interruption). We can't convert that to weights here without
         knowing the exact kraken version's conversion API, so we surface
         its path so the caller can resume from it with `ketos train --resume`.
    """
    best = Path(f"{train_base}_best.mlmodel")
    if best.exists():
        return best

    candidates = sorted(
        glob.glob(f"{train_base}_*.mlmodel"),
        key=lambda p: Path(p).stat().st_mtime,
        reverse=True,
    )
    if candidates:
        logger.info("No _best checkpoint; using most recent epoch checkpoint: %s", candidates[0])
        return Path(candidates[0])

    ckpts = sorted(
        glob.glob(f"{train_base.parent}/*.ckpt"),
        key=lambda p: Path(p).stat().st_mtime,
        reverse=True,
    )
    if ckpts:
        logger.warning(
            "Only a Lightning checkpoint was found (%s). This kraken "
            "version writes .ckpt during training instead of .mlmodel; "
            "resume it with `ketos train --resume %s ...` to get a "
            "usable weights file, or lower --timeout further so runs "
            "finish within the window instead of relying on salvage.",
            ckpts[0], ckpts[0],
        )
        return None

    return None


def train(
    data_dir: Path,
    base_model: Path,
    output: Path,
    epochs: int = 20,
    min_epochs: int = 3,
    lag: int = 5,
    min_delta: float = 0.005,
    quit_mode: str = "early",
    batch_size: int = 8,
    val_split: float = 0.1,
    device: str = "cpu",
    threads: int | None = None,
    freeze_backbone: int = 5,
    warmup: int = 600,
    timeout_sec: int = 3600,
    stall_timeout_sec: int = 900,
) -> None:
    if threads is None:
        threads = os.cpu_count() or 1
    logger.info("=== Training Pipeline ===")
    _print_config(
        "[bold]Training configuration[/]",
        [
            ("Data", str(data_dir)),
            ("Base model", str(base_model)),
            ("Output", str(output)),
            ("Epochs (cap)", str(epochs)),
            ("Min epochs", str(min_epochs)),
            ("Quit mode", quit_mode),
            ("Lag", str(lag)),
            ("Min delta", str(min_delta)),
            ("Batch size", str(batch_size)),
            ("Val split", f"{val_split:.0%}"),
            ("Device", device),
            ("Threads/workers", str(threads)),
            ("Freeze backbone (epochs)", str(freeze_backbone)),
            ("Warmup (steps)", str(warmup)),
            ("Timeout", f"{timeout_sec}s"),
            ("Stall timeout", f"{stall_timeout_sec}s"),
        ],
    )

    start = time.monotonic()

    with console.status("[cyan]Checking ground truth files...[/]", spinner="dots"):
        valid = _check_ground_truth(data_dir)
    if valid == 0:
        raise SystemExit("No valid ground truth found. Place .gt.txt files beside each image.")
    logger.info("Valid ground truth pairs: %d", valid)
    console.print(f"[green]✓[/] Valid ground truth pairs: [bold]{valid}[/]")

    with console.status("[cyan]Splitting train/validation...[/]", spinner="dots"):
        train_list, val_list, no_val = _split_data(data_dir, val_split)
    train_count = len(train_list.read_text(encoding="utf-8").splitlines())
    val_count = len(val_list.read_text(encoding="utf-8").splitlines())
    console.print(f"[green]✓[/] Split: [bold]{train_count}[/] train / [bold]{val_count}[/] val")

    # With no real validation set there's no signal for early stopping to
    # act on, so respect a fixed epoch count instead of waiting on
    # "improvement" that will never register.
    effective_quit = "fixed" if no_val else quit_mode
    if no_val and quit_mode == "early":
        logger.warning("No validation set available; forcing --quit fixed instead of early.")

    train_base = output.with_suffix("")

    ketos_args = [
        "ketos", "-v", "train",
        "-t", str(train_list),
        "-e", str(val_list),
        "-i", str(base_model),
        "-o", str(train_base),
        "-N", str(epochs),
        "-B", str(batch_size),
        "-d", device,
        "--workers", str(threads),
        "--resize", "union",
        "-q", effective_quit,
    ]
    if effective_quit == "early":
        ketos_args += ["--min-epochs", str(min_epochs), "--lag", str(lag), "--min-delta", str(min_delta)]
    if freeze_backbone > 0:
        ketos_args += ["--freeze-backbone", str(freeze_backbone)]
    if warmup > 0:
        ketos_args += ["--warmup", str(warmup)]

    status = _run_ketos(ketos_args, threads, timeout_sec, stall_timeout_sec)

    salvaged = False
    if status in ("timeout", "stalled"):
        checkpoint = _salvage_checkpoint(train_base)
        if checkpoint is None:
            raise TrainingIncomplete(
                f"Training was stopped ({status}) and no usable checkpoint "
                f"could be found near {train_base}. See the warning above "
                "for how to resume from a Lightning checkpoint if one exists."
            )
        if checkpoint != output:
            shutil.move(str(checkpoint), str(output))
        salvaged = True
    elif status == "failed":
        raise RuntimeError(f"ketos train failed; see log output above.")
    else:
        best_model = Path(f"{train_base}_best.mlmodel")
        if best_model.exists() and best_model != output:
            shutil.move(str(best_model), str(output))

    _write_metadata(output, base_model, epochs, batch_size, device, salvaged=salvaged, status=status)
    logger.info("=== Training complete: %s (status=%s) ===", output, status)

    elapsed = time.monotonic() - start
    size_mb = output.stat().st_size / 1e6 if output.exists() else 0.0
    title = "[bold green]Training complete[/]" if not salvaged else "[bold yellow]Training complete (salvaged)[/]"
    border = "green" if not salvaged else "yellow"
    note = "" if not salvaged else "\n    [yellow]Note: stopped early, this is the best checkpoint found, not a converged model.[/]"
    console.print(
        Panel(
            f"[green]✓[/] Model saved: [bold]{output}[/]\n"
            f"    Size: [bold]{size_mb:.1f} MB[/]\n"
            f"    Duration: [bold]{elapsed:.0f}s[/]{note}",
            title=title,
            border_style=border,
            title_align="left",
        )
    )


def _write_metadata(
    model_path: Path,
    base_model: Path,
    epochs: int,
    batch_size: int,
    device: str,
    salvaged: bool = False,
    status: str = "completed",
) -> None:
    meta = {
        "name": model_path.stem,
        "version": "1.0.0",
        "language": "fa",
        "script": "Persian",
        "source": "fine-tuned",
        "description": f"Persian OCR model fine-tuned from {base_model.name}",
        "training_samples": None,
        "metrics": {"cer": None, "wer": None},
        "training_date": None,
        "base_model": str(base_model),
        "hyperparameters": {
            "epochs": epochs,
            "batch_size": batch_size,
            "device": device,
        },
        "training_status": status,
        "salvaged_checkpoint": salvaged,
    }
    meta_path = model_path.with_suffix(".json")
    if meta_path.parent.name != "metadata":
        meta_dir = model_path.parent / "metadata"
        meta_dir.mkdir(parents=True, exist_ok=True)
        meta_path = meta_dir / (model_path.stem + ".json")

    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Metadata written to %s", meta_path)


def evaluate(model: Path, data_dir: Path) -> None:
    logger.info("=== Evaluation ===")
    _print_config("[bold]Evaluation configuration[/]", [("Model", str(model)), ("Data", str(data_dir))])
    images = _find_images(data_dir)
    if not images:
        logger.error("No images found in %s", data_dir)
        console.print(f"[red]✗[/] No images found in [bold]{data_dir}[/]")
        return

    test_list = data_dir.parent / "test_set.list"
    test_list.write_text("\n".join(str(p.resolve()) for p in images), encoding="utf-8")
    console.print(f"[green]✓[/] Test images: [bold]{len(images)}[/]")

    status = _run_ketos(["ketos", "-v", "test", "-m", str(model), "-e", str(test_list)], None, 0, 0)
    if status == "completed":
        console.print("[bold green]Evaluation complete[/]")
    else:
        console.print(f"[bold red]Evaluation did not complete cleanly ({status})[/]")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune Kraken OCR for Persian")
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--base-model", type=Path, default=None)
    parser.add_argument("--model", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--epochs", type=int, default=20, help="Hard cap on epochs (default: 20)")
    parser.add_argument("--min-epochs", type=int, default=3, help="Minimum epochs before early stopping can trigger")
    parser.add_argument("--lag", type=int, default=5, help="Evaluations without improvement before stopping")
    parser.add_argument("--min-delta", type=float, default=0.005, help="Minimum accuracy improvement to reset early stopping")
    parser.add_argument("--quit", dest="quit_mode", choices=["early", "fixed"], default="early")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--val-split", type=float, default=0.1)
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    parser.add_argument(
        "--threads", type=int, default=None,
        help="OpenMP threads/data workers for CPU training (default: all available cores)",
    )
    parser.add_argument(
        "--freeze-backbone", type=int, default=5,
        help="Freeze all but the final layer for this many epochs when fine-tuning "
        "from --base-model (0 disables). Recommended for small sample counts.",
    )
    parser.add_argument("--warmup", type=int, default=600, help="Learning-rate warmup steps (0 disables)")
    parser.add_argument(
        "--timeout", type=int, default=3600,
        help="Hard wall-clock limit in seconds for the whole training run (0 disables)",
    )
    parser.add_argument(
        "--stall-timeout", type=int, default=900,
        help="Abort if no progress output is seen for this many seconds (0 disables)",
    )
    parser.add_argument("--test-only", action="store_true")

    args = parser.parse_args()

    if args.test_only:
        if not args.model:
            raise SystemExit("--model is required with --test-only")
        evaluate(args.model, args.data_dir)
    else:
        if not args.base_model or not args.output:
            raise SystemExit("--base-model and --output are required for training")
        train(
            data_dir=args.data_dir,
            base_model=args.base_model,
            output=args.output,
            epochs=args.epochs,
            min_epochs=args.min_epochs,
            lag=args.lag,
            min_delta=args.min_delta,
            quit_mode=args.quit_mode,
            batch_size=args.batch_size,
            val_split=args.val_split,
            device=args.device,
            threads=args.threads,
            freeze_backbone=args.freeze_backbone,
            warmup=args.warmup,
            timeout_sec=args.timeout,
            stall_timeout_sec=args.stall_timeout,
        )


if __name__ == "__main__":
    main()
