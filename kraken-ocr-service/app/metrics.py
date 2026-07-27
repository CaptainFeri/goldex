from prometheus_client import Counter, Gauge, Histogram
from prometheus_fastapi_instrumentator import Instrumentator

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

_instrumentator: Instrumentator | None = None


def setup_metrics(app):
    global _instrumentator
    _instrumentator = Instrumentator(
        should_group_status_codes=False,
        should_ignore_untrained_endpoints=True,
        latency_histogram_buckets=(50, 100, 250, 500, 1000, 2000, 5000, 10000, 30000),
    )
    _instrumentator.instrument(app).expose(app, endpoint="/metrics")


def get_instrumentator() -> Instrumentator | None:
    return _instrumentator
