import logging
import os
import time
from contextlib import redirect_stderr
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.image import (
    decode_base64,
    open_image,
    resize_image,
    save_feedback_sample,
    validate_image,
)
from app.metrics import metrics_endpoint
from app.schemas import (
    HealthResponse,
    OCRBatchRequest,
    OCRBatchResponse,
    OCRFeedbackRequest,
    OCRFeedbackResponse,
    OCRRequest,
    OCRResponse,
    ReadyResponse,
    TrainStatusResponse,
    TrainTriggerResponse,
)

logger = logging.getLogger("kraken-ocr")

router = APIRouter()


def _get_model(request: Request):
    return request.app.state.model


def _get_settings(request: Request):
    return request.app.state.settings


@router.get("/health", response_model=HealthResponse)
def health(model=Depends(_get_model)):
    return HealthResponse(
        status="ok",
        model_loaded=model.is_loaded,
        model_name=model.name if model.is_loaded else None,
        model_language=model.metadata.get("language") if model.is_loaded else None,
        model_path=model.model_path,
    )


@router.get("/ready", response_model=ReadyResponse)
def ready(model=Depends(_get_model)):
    if not model.is_loaded:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return ReadyResponse(
        status="ready",
        model_loaded=True,
        model_name=model.name,
        model_language=model.metadata.get("language"),
        model_path=model.model_path,
    )


@router.get("/metrics")
def metrics():
    return metrics_endpoint()


@router.post("/ocr", response_model=OCRResponse)
async def ocr(
    payload: OCRRequest,
    model=Depends(_get_model),
    settings=Depends(_get_settings),
):
    start = time.monotonic()
    try:
        img_data = decode_base64(payload.base64_image)
        img = open_image(img_data)
        validate_image(img, settings.max_image_size_mb)
        img = resize_image(img, settings.min_dim, settings.max_dim)

        with open(os.devnull, "w") as _dn, redirect_stderr(_dn):
            from kraken import binarization, pageseg

            bw = binarization.nlbin(img)
            seg = pageseg.segment(bw)

        texts = await model.predict(bw, seg)

        elapsed = (time.monotonic() - start) * 1000
        return OCRResponse(
            success=True, texts=texts, processing_time_ms=round(elapsed, 2)
        )
    except Exception as e:
        elapsed = (time.monotonic() - start) * 1000
        logger.error("OCR error: %s", e, exc_info=True)
        return OCRResponse(
            success=False, error=str(e), processing_time_ms=round(elapsed, 2)
        )


@router.post("/ocr/batch", response_model=OCRBatchResponse)
async def ocr_batch(
    payload: OCRBatchRequest,
    model=Depends(_get_model),
    settings=Depends(_get_settings),
):
    results: list[OCRResponse] = []
    for img_b64 in payload.images:
        req = OCRRequest(base64_image=img_b64)
        result = await ocr(req, model, settings)
        results.append(result)
    return OCRBatchResponse(results=results)


@router.post("/ocr/feedback", response_model=OCRFeedbackResponse)
def feedback(
    payload: OCRFeedbackRequest,
    settings=Depends(_get_settings),
):
    if not settings.feedback_enabled:
        return OCRFeedbackResponse(
            success=False,
            message="Feedback collection is disabled",
            sample_id="",
        )
    try:
        img_data = decode_base64(payload.image_base64)
        sample_id = save_feedback_sample(
            settings.feedback_data_dir,
            img_data,
            payload.original_texts,
            payload.corrected_texts,
        )
        logger.info(
            "Feedback saved: sample_id=%s corrections=%d",
            sample_id,
            len(payload.corrected_texts),
        )
        return OCRFeedbackResponse(
            success=True,
            message=f"Feedback saved as {sample_id}",
            sample_id=sample_id,
        )
    except Exception as e:
        logger.error("Feedback error: %s", e, exc_info=True)
        return OCRFeedbackResponse(
            success=False,
            message=str(e),
            sample_id="",
        )


def _get_trainer(request: Request):
    return request.app.state.trainer


@router.get("/train/status", response_model=TrainStatusResponse)
def train_status(trainer=Depends(_get_trainer)):
    return TrainStatusResponse(**trainer.get_status())


@router.post("/train/trigger", response_model=TrainTriggerResponse)
async def train_trigger(trainer=Depends(_get_trainer)):
    return TrainTriggerResponse(**await trainer.trigger())
