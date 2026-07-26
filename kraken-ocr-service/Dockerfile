FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the Arabic model via kraken get using its Zenodo DOI
RUN kraken get 10.5281/zenodo.7050295 && \
    mkdir -p /models && \
    find /root/.local/share/htrmopo -name '*.mlmodel' -exec cp {} /models/arabic.mlmodel \;

COPY . .

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
