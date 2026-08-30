from prometheus_client import Counter, Gauge, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

inference_duration = Histogram(
    "ocr_inference_duration_ms",
    "OCR inference duration in milliseconds",
    buckets=[50, 100, 250, 500, 1000, 2000, 5000, 10000, 30000],
)

inference_total = Counter(
    "ocr_inference_total",
    "Total OCR inferences",
    ["status"],
)

model_info = Gauge(
    "ocr_model_info",
    "Model metadata (1 = loaded)",
    ["model_name", "model_language"],
)

feedback_total = Counter(
    "ocr_feedback_total",
    "Feedback samples collected",
)

training_state = Gauge(
    "ocr_training_state",
    "Training state: 0=idle, 1=training, 2=completed, 3=failed",
)

training_samples = Gauge(
    "ocr_training_samples",
    "Number of samples used in last training",
)


def metrics_endpoint() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
