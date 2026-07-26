FROM python:3.10-slim

WORKDIR /app

ENV OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    DNNL_PRIMITIVE_CACHE_CAPACITY=0

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
