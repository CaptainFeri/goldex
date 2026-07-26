import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("download-models")

logger.info("Downloading EasyOCR models for Persian (fa)...")

import easyocr
reader = easyocr.Reader(['fa'], gpu=False)

logger.info("EasyOCR models downloaded successfully.")
