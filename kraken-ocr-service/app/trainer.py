import asyncio
import json
import logging
import os
import shutil
import subprocess
import tempfile
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
            output_path = out_dir / "trained.mlmodel"

            cmd = [
                "ketos", "train",
                "-f", str(train_list),
                "-i", str(self._settings.model_path),
                "-o", str(output_path),
                "--epochs", str(self._settings.train_epochs),
                "--batch-size", str(self._settings.train_batch_size),
                "--device", self._settings.train_device,
            ]
            logger.info("Running: %s", " ".join(cmd))
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=self._settings.train_timeout
            )
            if result.returncode != 0:
                raise RuntimeError(f"Training failed:\n{result.stderr}")

            trained_path = self._settings.model_dir / "trained.mlmodel"
            shutil.copy2(output_path, trained_path)
            self._model.reload_from_path(trained_path)

            self._archive_used_samples(samples)

            return {
                "samples": len(samples),
                "output": str(trained_path),
                "stdout": result.stdout[-500:] if result.stdout else "",
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
