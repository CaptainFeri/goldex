#!/bin/sh
set -e

model_path="${OCR_MODEL_PATH:-/models/persian_best.mlmodel}"
base_model="${OCR_BASE_MODEL:-/app/data_model/arabic_best.mlmodel}"
data_dir="${OCR_TRAIN_DATA_DIR:-/app/data_model/training/data}"
train_on_start="${OCR_TRAIN_ON_START:-0}"
epochs="${OCR_TRAIN_EPOCHS:-20}"
min_epochs="${OCR_TRAIN_MIN_EPOCHS:-3}"
lag="${OCR_TRAIN_LAG:-5}"
min_delta="${OCR_TRAIN_MIN_DELTA:-0.005}"
quit_mode="${OCR_TRAIN_QUIT:-early}"
batch_size="${OCR_TRAIN_BATCH_SIZE:-8}"
device="${OCR_TRAIN_DEVICE:-cpu}"
threads="${OCR_TRAIN_THREADS:-}"
freeze_backbone="${OCR_TRAIN_FREEZE_BACKBONE:-5}"
warmup="${OCR_TRAIN_WARMUP:-600}"
timeout_sec="${OCR_TRAIN_TIMEOUT:-3600}"
stall_timeout="${OCR_TRAIN_STALL_TIMEOUT:-900}"

if [ "$train_on_start" = "1" ]; then
    if [ -f "$model_path" ]; then
        echo "[bootstrap] trained model already present at $model_path, skipping training"
    else
        echo "[bootstrap] model not found at $model_path"
        echo "[bootstrap] training with bundled samples from $data_dir (epochs<=$epochs, timeout=${timeout_sec}s, stall_timeout=${stall_timeout}s, device=$device, threads=${threads:-auto})..."
        echo "[bootstrap] WARNING: this architecture is very slow on CPU (hours per epoch); prefer a GPU host or keep this disabled"
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
            --min-epochs "$min_epochs" \
            --lag "$lag" \
            --min-delta "$min_delta" \
            --quit "$quit_mode" \
            --batch-size "$batch_size" \
            --val-split 0.1 \
            --device "$device" \
            --freeze-backbone "$freeze_backbone" \
            --warmup "$warmup" \
            --timeout "$timeout_sec" \
            --stall-timeout "$stall_timeout" \
            $threads_args
        echo "[bootstrap] training complete: $model_path"
    fi
else
    echo "[bootstrap] OCR_TRAIN_ON_START=0, skipping bootstrap training"
fi

if [ ! -f "$model_path" ]; then
    if [ -f "$base_model" ]; then
        echo "[bootstrap] no trained model at $model_path; falling back to the bundled base model $base_model"
        cp "$base_model" "$model_path"
    else
        echo "[bootstrap] WARNING: no model at $model_path and bundled base model $base_model is missing; the service will try to download its default model"
    fi
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
