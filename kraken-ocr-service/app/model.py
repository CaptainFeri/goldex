import asyncio
import json
import logging
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stderr
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("kraken-ocr")

with open(os.devnull, "w") as _dn, redirect_stderr(_dn):
    import torch


class KrakenModel:
    def __init__(self, settings) -> None:
        self._settings = settings
        self._model = None
        self._executor = ThreadPoolExecutor(
            max_workers=settings.torch_threads
        )
        self._loaded = False
        self._metadata: dict[str, Any] = {}

    def load(self) -> None:
        model_path = self._settings.model_path
        if not model_path.exists():
            self._download_model()

        logger.info("Loading model from %s", model_path)
        with open(os.devnull, "w") as _dn, redirect_stderr(_dn):
            from kraken.lib import models as kmodels

            self._model = kmodels.load_any(str(model_path))
        self._loaded = True
        self._load_metadata()
        logger.info(
            "Model loaded: %s (%s)",
            self._metadata.get("name", model_path.stem),
            self._metadata.get("language", "unknown"),
        )

    def _download_model(self) -> None:
        self._settings.model_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Downloading model from %s ...", self._settings.model_url)
        urllib.request.urlretrieve(
            self._settings.model_url, self._settings.model_path
        )
        logger.info("Model downloaded")

    def _load_metadata(self) -> None:
        meta_path = (
            self._settings.model_dir
            / "metadata"
            / (self._settings.model_path.stem + ".json")
        )
        if meta_path.exists():
            try:
                self._metadata = json.loads(meta_path.read_text(encoding="utf-8"))
                logger.info("Loaded metadata from %s", meta_path)
            except Exception as e:
                logger.warning("Failed to load metadata: %s", e)
        else:
            self._metadata = {
                "name": self._settings.model_path.stem,
                "language": "unknown",
                "version": "0.0.0",
            }

    async def predict(self, image, seg) -> list[str]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor, self._predict_sync, image, seg
        )

    def _predict_sync(self, image, seg) -> list[str]:
        from kraken import rpred

        texts: list[str] = []
        for record in rpred.rpred(self._model, image, seg):
            texts.append(record.prediction)
        return texts

    def configure_torch(self) -> None:
        os.environ["KMP_WARNINGS"] = "FALSE"
        n = min(self._settings.torch_threads, os.cpu_count() or 1)
        torch.set_num_threads(n)
        if not self._settings.torch_mkldnn_enabled:
            torch.backends.mkldnn.enabled = False

    def reload_from_path(self, path: Path) -> None:
        logger.info("Hot-reloading model from %s", path)
        with open(os.devnull, "w") as _dn, redirect_stderr(_dn):
            from kraken.lib import models as kmodels
            new_model = kmodels.load_any(str(path))

        new_executor = ThreadPoolExecutor(max_workers=self._settings.torch_threads)
        old_executor = self._executor
        self._model = new_model
        self._executor = new_executor
        old_executor.shutdown(wait=False)

        self._loaded = True
        self._load_metadata()
        logger.info(
            "Model hot-reloaded: %s (%s)",
            self._metadata.get("name", path.stem),
            self._metadata.get("language", "unknown"),
        )

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def model_path(self) -> Optional[str]:
        return str(self._settings.model_path) if self._loaded else None

    @property
    def name(self) -> str:
        return self._metadata.get("name", self._settings.model_path.stem)

    @property
    def metadata(self) -> dict[str, Any]:
        return dict(self._metadata)
