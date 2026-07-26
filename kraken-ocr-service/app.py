import base64
import io
import logging
import os
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("kraken-ocr")

ARABIC_MODEL_DOI = "10.5281/zenodo.7050295"
KNOWN_MODEL_PATH = "/models/arabic.mlmodel"

def _resolve_model() -> str:
    if os.path.exists(KNOWN_MODEL_PATH):
        return KNOWN_MODEL_PATH
    htrmopo = Path.home() / ".local" / "share" / "htrmopo"
    if htrmopo.exists():
        for mlmodel in htrmopo.rglob("*.mlmodel"):
            return str(mlmodel)
    logger.info("Model not found. Downloading via kraken get ...")
    os.makedirs(htrmopo, exist_ok=True)
    subprocess.run([sys.executable, "-m", "kraken", "get", ARABIC_MODEL_DOI], check=True)
    for mlmodel in htrmopo.rglob("*.mlmodel"):
        return str(mlmodel)
    raise FileNotFoundError("Could not locate or download a Kraken Arabic model")

model_path = _resolve_model()
logger.info(f"Loading Kraken model from {model_path}")

from kraken.lib import models as kmodels
model = kmodels.load_any(model_path)
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
