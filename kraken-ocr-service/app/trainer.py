import asyncio
import json
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path

from app.image import decode_base64

logger = logging.getLogger("kraken-ocr")


class SelfTrainer:
    def __init__(self, settings, model) -> None:
        self._settings = settings
        self._model = model
        self._training = False
        self._status: dict = {
            "state": "idle",
            "last_train_at": None,
            "last_result": None,
            "error": None,
            "sample_count": 0,
        }

    async def trigger(self) -> dict:
        if self._training:
            return {"status": "already_training", "state": self._status}
        asyncio.create_task(self._run())
        return {"status": "training_started"}

    def get_status(self) -> dict:
        samples = self._count_feedback_samples()
        return {**self._status, "available_samples": samples}

    def _count_feedback_samples(self) -> int:
        if not self._settings.feedback_data_dir.exists():
            return 0
        return sum(1 for p in self._settings.feedback_data_dir.iterdir() if p.is_dir())

    async def _run(self) -> None:
        self._training = True
        self._status = {
            "state": "training",
            "started_at": time.time(),
            "last_train_at": self._status.get("last_train_at"),
            "last_result": None,
            "error": None,
            "sample_count": 0,
        }
        logger.info("Self-training started")

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, self._train_sync
            )
            self._status = {
                "state": "completed",
                "started_at": self._status["started_at"],
                "last_train_at": time.time(),
                "last_result": result,
                "error": None,
                "sample_count": result.get("samples", 0),
            }
            logger.info("Self-training completed: %s", result)
        except Exception as e:
            logger.error("Self-training failed: %s", e, exc_info=True)
            self._status = {
                "state": "failed",
                "started_at": self._status.get("started_at"),
                "last_train_at": None,
                "last_result": None,
                "error": str(e),
                "sample_count": 0,
            }
        finally:
            self._training = False

    def _train_sync(self) -> dict:
        samples = self._collect_samples()
        if len(samples) < 5:
            raise ValueError(
                f"Not enough samples for training (got {len(samples)}, need at least 5)"
            )

        out_dir = Path(tempfile.mkdtemp(prefix="kraken_train_"))
        try:
            train_list = self._prepare_training_data(samples, out_dir)
            output_base = out_dir / "trained"
            output_path = Path(f"{output_base}_best.mlmodel")

            cmd = [
                "ketos", "-v", "train",
                "-t", str(train_list),
                "-i", str(self._settings.model_path),
                "-o", str(output_base),
                "-N", str(self._settings.train_epochs),
                "-B", str(self._settings.train_batch_size),
                "-d", self._settings.train_device,
                "--workers", str(self._settings.train_threads),
                "--resize", "union",
            ]
            logger.info("Running: %s", " ".join(cmd))
            env = os.environ.copy()
            env["OMP_NUM_THREADS"] = str(self._settings.train_threads)
            env["MKL_NUM_THREADS"] = str(self._settings.train_threads)
            env["TORCH_NUM_THREADS"] = str(self._settings.train_threads)
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                encoding="utf-8",
                errors="replace",
                env=env,
            )
            assert process.stdout is not None
            lines: list[str] = []

            def _drain() -> None:
                for line in process.stdout:
                    line = line.rstrip()
                    if line:
                        logger.info("%s", line)
                        lines.append(line)

            drain = threading.Thread(target=_drain, daemon=True)
            drain.start()
            try:
                returncode = process.wait(timeout=self._settings.train_timeout)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                raise RuntimeError(
                    f"Training timed out after {self._settings.train_timeout}s"
                )
            drain.join()
            if returncode != 0:
                raise RuntimeError(
                    f"Training failed (exit {returncode}):\n{chr(10).join(lines[-50:])}"
                )
            if not output_path.exists():
                raise RuntimeError(
                    f"Training finished but no model produced at {output_path}"
                )

            trained_path = self._settings.model_dir / "trained.mlmodel"
            shutil.copy2(output_path, trained_path)
            self._model.reload_from_path(trained_path)

            self._archive_used_samples(samples)

            return {
                "samples": len(samples),
                "output": str(trained_path),
                "stdout": "\n".join(lines[-20:]),
            }
        finally:
            shutil.rmtree(out_dir, ignore_errors=True)

    def _collect_samples(self) -> list[dict]:
        feedback_dir = self._settings.feedback_data_dir
        if not feedback_dir.exists():
            return []
        samples = []
        for entry in sorted(feedback_dir.iterdir()):
            if not entry.is_dir():
                continue
            image_file = entry / "image.png"
            corrected_file = entry / "corrected.txt"
            if image_file.exists() and corrected_file.exists():
                text = corrected_file.read_text(encoding="utf-8").strip()
                if text:
                    samples.append({
                        "sample_id": entry.name,
                        "image_path": image_file,
                        "text": text,
                        "used_flag": entry / ".used",
                    })
        return [s for s in samples if not s["used_flag"].exists()]

    def _prepare_training_data(self, samples: list[dict], out_dir: Path) -> Path:
        data_dir = out_dir / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        entries: list[str] = []
        for i, s in enumerate(samples):
            ext = s["image_path"].suffix
            dest_img = data_dir / f"sample_{i:06d}{ext}"
            shutil.copy2(s["image_path"], dest_img)
            gt = data_dir / f"sample_{i:06d}.gt.txt"
            gt.write_text(s["text"], encoding="utf-8")
            entries.append(str(dest_img.resolve()))
        train_list = out_dir / "train_set.list"
        train_list.write_text("\n".join(entries), encoding="utf-8")
        return train_list

    def _archive_used_samples(self, samples: list[dict]) -> None:
        for s in samples:
            s["used_flag"].touch()
