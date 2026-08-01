#!/bin/sh
set -e

model_path="${OCR_MODEL_PATH:-/models/persian_best.mlmodel}"
base_model="${OCR_BASE_MODEL:-/app/data_model/arabic_best.mlmodel}"
data_dir="${OCR_TRAIN_DATA_DIR:-/app/data_model/training/data}"
train_on_start="${OCR_TRAIN_ON_START:-0}"
epochs="${OCR_TRAIN_EPOCHS:-10}"
batch_size="${OCR_TRAIN_BATCH_SIZE:-8}"
device="${OCR_TRAIN_DEVICE:-cpu}"
threads="${OCR_TRAIN_THREADS:-}"

if [ "$train_on_start" = "1" ]; then
    if [ -f "$model_path" ]; then
        echo "[bootstrap] trained model already present at $model_path, skipping training"
    else
        echo "[bootstrap] model not found at $model_path"
        echo "[bootstrap] training with bundled samples from $data_dir (epochs=$epochs, batch=$batch_size, device=$device, threads=${threads:-auto})..."
        threads_args=""
        if [ -n "$threads" ]; then
            threads_args="--threads $threads"
        fi
        # shellcheck disable=SC2086
        python -m training.pipeline \
            --data-dir "$data_dir" \
            --base-model "$base_model" \
            --output "$model_path" \
            --epochs "$epochs" \
            --batch-size "$batch_size" \
            --val-split 0.1 \
            --device "$device" \
            $threads_args
        echo "[bootstrap] training complete: $model_path"
    fi
else
    echo "[bootstrap] OCR_TRAIN_ON_START=0, skipping bootstrap training"
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
