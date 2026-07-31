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

    # Train
    python -m training.pipeline \\
        --data-dir data/training/data \\
        --base-model data_model/arabic_best.mlmodel \\
        --output data_model/persian_best.mlmodel \\
        --epochs 50 \\
        --batch-size 8 \\
        --val-split 0.1 \\
        --device cpu

    # Evaluate on test set
    python -m training.pipeline \\
        --data-dir data/training/data \\
        --model data_model/persian_best.mlmodel \\
        --test-only
"""

import argparse
import json
import logging
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("training")


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


def _split_data(data_dir: Path, val_split: float):
    images = _find_images(data_dir)
    import random

    random.shuffle(images)
    split_at = int(len(images) * (1 - val_split))
    train = images[:split_at]
    val = images[split_at:]

    train_list = data_dir.parent / "train_set.list"
    val_list = data_dir.parent / "val_set.list"

    train_list.write_text(
        "\n".join(str(p.resolve()) for p in train), encoding="utf-8"
    )
    val_list.write_text(
        "\n".join(str(p.resolve()) for p in val), encoding="utf-8"
    )

    logger.info(
        "Split: %d train, %d val -> %s, %s",
        len(train),
        len(val),
        train_list,
        val_list,
    )
    return train_list, val_list


def cmd(*args: str) -> None:
    logger.info("Running: %s", " ".join(args))
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error("STDERR:\n%s", result.stderr)
        raise RuntimeError(f"Command failed: {' '.join(args)}")
    if result.stdout:
        logger.info("STDOUT:\n%s", result.stdout.strip())


def train(
    data_dir: Path,
    base_model: Path,
    output: Path,
    epochs: int = 50,
    batch_size: int = 8,
    val_split: float = 0.1,
    device: str = "cpu",
) -> None:
    logger.info("=== Training Pipeline ===")
    logger.info("Data: %s", data_dir)
    logger.info("Base model: %s", base_model)
    logger.info("Output: %s", output)
    logger.info("Epochs: %d, Batch: %d, Device: %s", epochs, batch_size, device)

    valid = _check_ground_truth(data_dir)
    if valid == 0:
        raise SystemExit(
            "No valid ground truth found. "
            "Place .gt.txt files beside each image."
        )
    logger.info("Valid ground truth pairs: %d", valid)

    train_list, val_list = _split_data(data_dir, val_split)

    train_base = output.with_suffix("")

    cmd(
        "ketos",
        "train",
        "-t", str(train_list),
        "-e", str(val_list),
        "-i", str(base_model),
        "-o", str(train_base),
        "-N", str(epochs),
        "-B", str(batch_size),
        "-d", device,
        "--resize", "union",
    )

    best_model = Path(f"{train_base}_best.mlmodel")
    if best_model.exists() and best_model != output:
        shutil.move(str(best_model), str(output))

    _write_metadata(output, base_model, epochs, batch_size, device)
    logger.info("=== Training complete: %s ===", output)


def _write_metadata(
    model_path: Path,
    base_model: Path,
    epochs: int,
    batch_size: int,
    device: str,
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
    images = _find_images(data_dir)
    if not images:
        logger.error("No images found in %s", data_dir)
        return

    test_list = data_dir.parent / "test_set.list"
    test_list.write_text(
        "\n".join(str(p.resolve()) for p in images), encoding="utf-8"
    )

    cmd("ketos", "test", "-m", str(model), "-e", str(test_list))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fine-tune Kraken OCR for Persian"
    )
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--base-model", type=Path, default=None)
    parser.add_argument("--model", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--val-split", type=float, default=0.1)
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
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
            batch_size=args.batch_size,
            val_split=args.val_split,
            device=args.device,
        )


if __name__ == "__main__":
    main()
