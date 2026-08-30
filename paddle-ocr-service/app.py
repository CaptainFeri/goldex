import base64
import io
import logging
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from paddleocr import PaddleOCR
from PIL import Image

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("paddle-ocr")

app = FastAPI(title="PaddleOCR API")

logger.info("Loading PaddleOCR (arabic)...")
engine = PaddleOCR(use_angle_cls=True, lang='arabic', show_log=False)
logger.info("PaddleOCR ready.")

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
        img_array = np.array(img.convert('RGB'))
        result = engine.ocr(img_array, cls=True)
        texts = []
        if result and result[0]:
            for line in result[0]:
                texts.append(reverse_text(line[1][0]))
        return {"success": True, "texts": texts}
    except Exception as e:
        logger.error(f"OCR error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
