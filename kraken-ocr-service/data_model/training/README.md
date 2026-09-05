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

## Bootstrap training (Docker)

Bootstrap training is **disabled by default** (`OCR_TRAIN_ON_START=0`). On
startup the entrypoint uses an existing trained model at `$OCR_MODEL_PATH`, and
if none exists it falls back to the **bundled Arabic base model**
(`arabic_best.mlmodel`, copied into the `kraken_models` volume) so the service
always boots with a usable OCR model.

Why disabled by default: the bundled model architecture (a PAW-style 3-layer
bidirectional LSTM, 4.1M params) is designed for GPUs. On a CPU host every
training step costs ~40s (a full epoch over the 4,499-line training set takes
many hours), so an on-boot fine-tune never finishes within the 1h timeout and
the container restarts in an endless retrain loop.

To opt in (only on a machine where you accept the cost, ideally with a GPU):

- `OCR_TRAIN_ON_START=1` trains on first start when no model exists yet
  (tune with `OCR_TRAIN_EPOCHS` default 10, `OCR_TRAIN_BATCH_SIZE` default 8,
  `OCR_TRAIN_DEVICE` default cpu, `OCR_TRAIN_THREADS` to cap OpenMP
  threads/data workers).
- Multi-worker training needs shared memory: the compose file sets
  `shm_size: 1g` on `ocr-worker`. With Docker's default 64MB `/dev/shm`,
  PyTorch DataLoader workers crash with `Bus error` /
  `No space left on device`.
- Once a trained `persian_best.mlmodel` exists in the volume, startup skips
  training and the service boots immediately.

## Training manually (outside Docker)

From the `kraken-ocr-service` directory (budget accordingly: on CPU this
architecture takes hours per epoch — prefer a GPU host or a few epochs max):

```bash
# Fine-tune from the bundled Arabic base model
python -m training.pipeline \
    --data-dir data_model/training/data \
    --base-model data_model/arabic_best.mlmodel \
    --output data_model/persian_best.mlmodel \
    --epochs 3 \
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
