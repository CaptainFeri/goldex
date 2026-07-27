from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_path: Path = Path("/models/arabic_best.mlmodel")
    model_url: str = (
        "https://zenodo.org/api/records/7050296/files/arabic_best.mlmodel/content"
    )
    model_dir: Path = Path("/models")

    min_dim: int = 800
    max_dim: int = 2000
    max_image_size_mb: int = 10

    torch_threads: int = 4
    torch_mkldnn_enabled: bool = False
    inference_timeout_sec: int = 30

    log_level: str = "INFO"
    log_json: bool = False

    model_name: str = "arabic_best"

    feedback_enabled: bool = True
    feedback_data_dir: Path = Path("/data/feedback")

    train_enabled: bool = True
    train_epochs: int = 20
    train_batch_size: int = 4
    train_device: str = "cpu"
    train_timeout: int = 3600
    train_min_samples: int = 5
    train_auto: bool = False
    train_auto_interval_min: int = 60
    train_auto_threshold: int = 20

    provider: str = "kraken"
    timeout: int = 120000

    rate_limit: str = "60/minute"

    rabbitmq_url: str = "amqp://guest:guest@rabbitmq:5672/"
    ocr_request_queue: str = "ocr_requests"
    ocr_result_exchange: str = "ocr_results"
    ocr_result_routing_key: str = "ocr.result"
    prefetch_count: int = 1

    class Config:
        env_prefix = "OCR_"
        env_file = ".env"
        extra = "ignore"
