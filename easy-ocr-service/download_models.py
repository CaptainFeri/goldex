import logging
import easyocr

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("download-models")

logger.info("Downloading EasyOCR models for Persian (fa)...")
reader = easyocr.Reader(['fa'], gpu=False)
logger.info("EasyOCR models downloaded successfully.")
