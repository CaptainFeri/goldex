# Training Data

The `data/` directory contains **pre-generated** Persian text line samples
(shaped with HarfBuzz/FreeType from Vazirmatn and other fonts, with random
degradations). Each image has a matching `.gt.txt` ground-truth file with the
same base name:

```
data/
├── sample_000001.png
├── sample_000001.gt.txt    # contains: "متن فارسی نمونه"
├── sample_000002.png
├── sample_000002.gt.txt
└── ...
```

A `data_manifest.jsonl` next to `data/` logs every sample's text, font, size
and augmentation params.

The generator is intentionally **not** part of this repository; regenerate a
dataset elsewhere with the same naming convention if you need more samples.

## One-time bootstrap training (Docker)

The ocr-worker image bundles these samples and, on first start, trains the
Persian model automatically if the trained model is missing:

- The compose file sets `OCR_TRAIN_ON_START=1` and
  `OCR_MODEL_PATH=/models/persian_best.mlmodel` (persisted in the
  `kraken_models` volume).
- On first `docker compose up`, the entrypoint (`docker-entrypoint.sh`)
  checks `$OCR_MODEL_PATH`; if the file is absent it runs
  `training.pipeline` against `data/`, then starts uvicorn.
- On subsequent starts the trained model already exists and training is
  skipped, so the service boots immediately.
- Tune with env vars: `OCR_TRAIN_EPOCHS` (default 10),
  `OCR_TRAIN_BATCH_SIZE` (default 8), `OCR_TRAIN_DEVICE` (default cpu),
  `OCR_TRAIN_THREADS` (default: all available CPU cores; pass e.g. `4` to cap
  OpenMP threads/data workers).
- Set `OCR_TRAIN_ON_START=0` to never bootstrap (falls back to downloading
  the base Arabic model).

## Training manually (outside Docker)

From the `kraken-ocr-service` directory:

```bash
# Fine-tune from the bundled Arabic base model
python -m training.pipeline \
    --data-dir data_model/training/data \
    --base-model data_model/arabic_best.mlmodel \
    --output data_model/persian_best.mlmodel \
    --epochs 50 \
    --batch-size 8 \
    --val-split 0.1 \
    --device cpu

# Evaluate on a test set
python -m training.pipeline \
    --data-dir <test_dir> \
    --model data_model/persian_best.mlmodel \
    --test-only
```

## Recommended Dataset Size

| Task | Min Samples | Recommended |
|------|-------------|-------------|
| Fine-tune existing model | 200 lines | 1,000+ lines |
| Train from scratch | 5,000 lines | 50,000+ lines |
