# syntax=docker/dockerfile:1.4
FROM python:3.10-slim AS builder

WORKDIR /build

ENV PIP_DEFAULT_TIMEOUT=300 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt


FROM python:3.10-slim AS runner

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    OCR_TRAIN_ON_START=0 \
    OCR_MODEL_PATH=/models/persian_best.mlmodel \
    OCR_BASE_MODEL=/app/data_model/arabic_best.mlmodel \
    OCR_TRAIN_DATA_DIR=/app/data_model/training/data \
    OCR_TRAIN_EPOCHS=10 \
    OCR_TRAIN_BATCH_SIZE=8 \
    OCR_TRAIN_DEVICE=cpu

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local /usr/local

RUN groupadd -r ocr --gid 1001 && \
    useradd -r -g ocr --uid 1001 -m ocr && \
    mkdir -p /models /data/feedback && \
    chown -R ocr:ocr /app /models /data

COPY --chown=ocr:ocr app/ ./app/
COPY --chown=ocr:ocr training/ ./training/
COPY --chown=ocr:ocr data_model/ ./data_model/
COPY --chown=ocr:ocr --chmod=+x docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER ocr

# start-period covers the one-time bootstrap training on first boot
HEALTHCHECK --interval=15s --timeout=5s --start-period=21600s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
