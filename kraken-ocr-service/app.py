import base64
import io
import logging
import os
import sys
import urllib.request
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("kraken-ocr")

MODEL_DIR = Path("/models")
MODEL_PATH = MODEL_DIR / "arabic_best.mlmodel"
MODEL_URL = "https://zenodo.org/api/records/7050296/files/arabic_best.mlmodel/content"

def download_model() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Downloading model from {MODEL_URL} ...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    logger.info("Model downloaded.")

if not MODEL_PATH.exists():
    download_model()

logger.info(f"Loading Kraken model from {MODEL_PATH}")
from kraken.lib import models as kmodels
model = kmodels.load_any(str(MODEL_PATH))
logger.info("Kraken OCR ready.")

app = FastAPI(title="KrakenOCR API")

MIN_DIM = 1000

def upscale(img: Image.Image) -> Image.Image:
    w, h = img.size
    if w >= MIN_DIM and h >= MIN_DIM:
        return img
    scale = max(MIN_DIM / w, MIN_DIM / h)
    return img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

def reverse_text(text: str) -> str:
    return ' '.join(w[::-1] for w in text.split())

class OcrPayload(BaseModel):
    base64_image: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ocr")
def extract_text(payload: OcrPayload):
    try:
        img_data = base64.b64decode(payload.base64_image)
        img = upscale(Image.open(io.BytesIO(img_data)))

        from kraken import binarization, pageseg, rpred
        bw = binarization.nlbin(img)
        seg = pageseg.segment(bw)

        texts = []
        for record in rpred.rpred(model, bw, seg):
            texts.append(reverse_text(record.prediction))

        return {"success": True, "texts": texts}
    except Exception as e:
        logger.error(f"OCR error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
