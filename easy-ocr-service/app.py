import base64
import io
import logging
import re

import cv2
import numpy as np
import easyocr
from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("easy-ocr")

app = FastAPI(title="EasyOCR API")

logger.info("Loading EasyOCR (Persian)...")
reader = easyocr.Reader(['fa'], gpu=False)
logger.info("EasyOCR ready.")

PERSIAN_DEPOSIT_KEYWORDS = [
    'واریز', 'دریافت', 'افزایش', 'اعتبار', 'برداشت شده',
    'سپرده', 'پذیرفتن', 'دریافت پول', 'وام', 'قرض',
]
PERSIAN_WITHDRAW_KEYWORDS = [
    'برداشت', 'پرداخت', 'کاهش', 'خارج', 'انتقال',
    'هزینه', 'تخفیف', 'انتقال خروجی', 'صورت حساب',
]

PERSIAN_DIGITS = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
}


def preprocess_image(img_array: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    denoised = cv2.fastNlMeansDenoising(enhanced, None, h=10,
                                         templateWindowSize=7,
                                         searchWindowSize=21)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    processed = cv2.morphologyEx(denoised, cv2.MORPH_CLOSE, kernel)
    return processed


def convert_persian_numbers(text: str) -> str:
    for persian, english in PERSIAN_DIGITS.items():
        text = text.replace(persian, english)
    return text


def classify_transaction(text: str) -> str:
    deposit_score = sum(1 for kw in PERSIAN_DEPOSIT_KEYWORDS if kw in text)
    withdraw_score = sum(1 for kw in PERSIAN_WITHDRAW_KEYWORDS if kw in text)
    if deposit_score > withdraw_score:
        return 'deposit'
    elif withdraw_score > deposit_score:
        return 'withdraw'
    return 'unknown'


def extract_amounts(text: str):
    normalized = convert_persian_numbers(text)
    amounts = re.findall(r'\d+(?:,\d{3})*(?:\.\d{2})?', normalized)
    if amounts:
        max_amount = max(amounts, key=lambda x: int(x.replace(',', '')))
        return max_amount, amounts
    return None, []


def reverse_text(text: str) -> str:
    return ' '.join(w[::-1] for w in text.split())


class OcrPayload(BaseModel):
    base64_image: str
    language: str = 'fa'
    detect_orientation: bool = False


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr")
def extract_text(payload: OcrPayload):
    try:
        img_data = base64.b64decode(payload.base64_image)
        img = Image.open(io.BytesIO(img_data)).convert('RGB')
        img_array = np.array(img)

        processed = preprocess_image(img_array)
        processed_rgb = cv2.cvtColor(processed, cv2.COLOR_GRAY2RGB)

        results = reader.readtext(processed_rgb, detail=1)
        texts = [reverse_text(text) for (_, text, conf) in results if conf > 0.3]

        full_text = ' '.join(texts)
        transaction_type = classify_transaction(full_text)
        amount, all_amounts = extract_amounts(full_text)

        return {
            "success": True,
            "texts": texts,
            "metadata": {
                "provider": "easyocr",
                "language": payload.language,
                "lines_detected": len(texts),
                "transaction_type": transaction_type,
                "amount": amount,
                "all_amounts": all_amounts,
            },
        }
    except Exception as e:
        logger.error(f"OCR error: {e}", exc_info=True)
        return {"success": False, "texts": [], "error": str(e)}
