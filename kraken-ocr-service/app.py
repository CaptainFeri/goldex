import base64
import io
import logging
from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image
from kraken import binarization, pageseg, rpred
from kraken.lib import vgsl

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("kraken-ocr")

app = FastAPI(title="KrakenOCR API")

logger.info("Loading Kraken Arabic model...")
model = vgsl.TorchVGSLModel.load_model('arabic')
logger.info("Kraken OCR ready.")

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

        bw = binarization.nlbin(img)
        seg = pageseg.segment(bw)

        texts = []
        for record in rpred.rpred(model, bw, seg):
            texts.append(reverse_text(record.prediction))

        return {"success": True, "texts": texts}
    except Exception as e:
        logger.error(f"OCR error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
