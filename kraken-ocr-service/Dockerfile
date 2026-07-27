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
    pip install --user -r requirements.txt


FROM python:3.10-slim AS runner

WORKDIR /app

ENV OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    DNNL_PRIMITIVE_CACHE_CAPACITY=0 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

RUN groupadd -r ocr --gid 1001 && \
    useradd -r -g ocr --uid 1001 -m ocr && \
    mkdir -p /models && \
    chown -R ocr:ocr /app /models

COPY --chown=ocr:ocr app/ ./app/
COPY --chown=ocr:ocr data_model/ ./data_model/

USER ocr

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--limit-concurrency", "4"]
