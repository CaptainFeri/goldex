import base64
import io
import logging
import os
import sys
import urllib.request
import warnings
from contextlib import redirect_stderr, contextmanager
from pathlib import Path

os.environ['KMP_WARNINGS'] = 'FALSE'

warnings.filterwarnings('ignore', message='Using legacy polygon extractor')

with open(os.devnull, 'w') as _dn, redirect_stderr(_dn):
    import torch

torch.set_num_threads(min(4, os.cpu_count() or 1))
torch.backends.mkldnn.enabled = False

from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("kraken-ocr")


@contextmanager
def _suppress_c_warnings():
    devnull = os.open(os.devnull, os.O_WRONLY)
    old_fd = os.dup(2)
    os.dup2(devnull, 2)
    os.close(devnull)
    try:
        yield
    finally:
        os.dup2(old_fd, 2)
        os.close(old_fd)

MODEL_DIR = Path("/models")
MODEL_PATH = MODEL_DIR / "arabic_best.mlmodel"
MODEL_URL = "https://zenodo.org/api/records/7050296/files/arabic_best.mlmodel/content"

def download_model() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Downloading model from {MODEL_URL} ...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    logger.info("Model downloaded.")

if not MODEL_PATH.exists():
    with _suppress_c_warnings():
        download_model()

logger.info(f"Loading Kraken model from {MODEL_PATH}")
with _suppress_c_warnings():
    from kraken import binarization, pageseg, rpred
    from kraken.lib import models as kmodels
    model = kmodels.load_any(str(MODEL_PATH))
logger.info("Kraken OCR ready.")

app = FastAPI(title="KrakenOCR API")

MIN_DIM = 800
MAX_DIM = 2000

def resize_image(img: Image.Image) -> Image.Image:
    w, h = img.size
    if w < MIN_DIM or h < MIN_DIM:
        scale = max(MIN_DIM / w, MIN_DIM / h)
        return img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    if w > MAX_DIM or h > MAX_DIM:
        scale = min(MAX_DIM / w, MAX_DIM / h)
        return img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return img

class OcrPayload(BaseModel):
    base64_image: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ocr")
def extract_text(payload: OcrPayload):
    with _suppress_c_warnings():
        try:
            img_data = base64.b64decode(payload.base64_image)
            img = resize_image(Image.open(io.BytesIO(img_data)))

            bw = binarization.nlbin(img)
            seg = pageseg.segment(bw)

            texts = []
            for record in rpred.rpred(model, bw, seg):
                texts.append(record.prediction)

            return {"success": True, "texts": texts}
        except Exception as e:
            logger.error(f"OCR error: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
