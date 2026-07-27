import asyncio
import logging
import os
import warnings
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings

settings = Settings()
logger = logging.getLogger("kraken-ocr")


def _configure_logging() -> None:
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    fmt = (
        "%(asctime)s %(levelname)s %(name)s %(message)s"
        if not settings.log_json
        else '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}'
    )
    logging.basicConfig(level=level, format=fmt)
    logging.getLogger("kraken-ocr").setLevel(level)


def _suppress_noisy_warnings() -> None:
    os.environ["KMP_WARNINGS"] = "FALSE"
    warnings.filterwarnings("ignore", message="Using legacy polygon extractor")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _configure_logging()
    _suppress_noisy_warnings()

    from app.model import KrakenModel

    model = KrakenModel(settings)
    model.configure_torch()
    model.load()

    app.state.model = model
    app.state.settings = settings

    if settings.feedback_enabled:
        settings.feedback_data_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Feedback data directory: %s", settings.feedback_data_dir)

    from app.trainer import SelfTrainer

    trainer = SelfTrainer(settings, model)
    app.state.trainer = trainer
    logger.info("Self-trainer initialized")

    worker_task = None
    try:
        from app.worker import OCRWorker

        worker = OCRWorker(settings, model)
        worker_task = asyncio.create_task(worker.start())
        app.state.worker = worker
        logger.info("RabbitMQ OCR worker started.")
    except ImportError:
        logger.warning("aio-pika not installed; RabbitMQ worker disabled")

    logger.info("Kraken OCR ready.")
    yield
    logger.info("Shutting down Kraken OCR service.")

    if worker_task is not None:
        worker = getattr(app.state, "worker", None)
        if worker:
            await worker.stop()
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass


def create_app() -> FastAPI:
    app = FastAPI(title="KrakenOCR API", version="2.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from app.middleware import setup_middleware, setup_rate_limiter

    setup_middleware(app, timeout_sec=settings.inference_timeout_sec)
    setup_rate_limiter(app, default_limit=settings.rate_limit)

    from app.router import router

    app.include_router(router)

    try:
        from app.metrics import setup_metrics

        setup_metrics(app)
    except ImportError:
        logger.info("prometheus-fastapi-instrumentator not installed; skipping metrics")

    return app


app = create_app()
