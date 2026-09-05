from typing import Optional

from pydantic import BaseModel, Field


class OCRRequest(BaseModel):
    base64_image: str = Field(..., description="Base64-encoded image data")
    options: Optional[dict] = None


class OCRResponse(BaseModel):
    success: bool
    texts: Optional[list[str]] = None
    error: Optional[str] = None
    processing_time_ms: Optional[float] = None


class OCRBatchRequest(BaseModel):
    images: list[str] = Field(..., max_length=50)


class OCRBatchResponse(BaseModel):
    results: list[OCRResponse]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: Optional[str] = None
    model_language: Optional[str] = None
    model_path: Optional[str] = None


class ReadyResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: Optional[str] = None
    model_language: Optional[str] = None
    model_path: Optional[str] = None


class ErrorResponse(BaseModel):
    detail: str


class OCRJobMessage(BaseModel):
    job_id: str
    image_base64: str
    options: dict = {}
    correlation_id: Optional[str] = None


class OCRResultMessage(BaseModel):
    job_id: str
    success: bool
    texts: Optional[list[str]] = None
    error: Optional[str] = None
    processing_time_ms: Optional[float] = None
    correlation_id: Optional[str] = None


class OCRFeedbackRequest(BaseModel):
    image_base64: str
    original_texts: list[str]
    corrected_texts: list[str]
    job_id: Optional[str] = None


class OCRFeedbackResponse(BaseModel):
    success: bool
    message: str
    sample_id: str


class TrainStatusResponse(BaseModel):
    state: str
    started_at: Optional[float] = None
    last_train_at: Optional[float] = None
    last_result: Optional[dict] = None
    error: Optional[str] = None
    sample_count: int = 0
    available_samples: int = 0


class TrainTriggerResponse(BaseModel):
    status: str
