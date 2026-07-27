import base64
import io
import uuid
from pathlib import Path
from typing import Tuple

from PIL import Image


def decode_base64(data: str) -> bytes:
    return base64.b64decode(data)


def open_image(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def validate_image(img: Image.Image, max_size_mb: int = 10) -> None:
    if img.mode not in ("L", "RGB", "RGBA"):
        raise ValueError(f"Unsupported image mode: {img.mode}")
    if img.width * img.height > max_size_mb * 1024 * 1024:
        raise ValueError(
            f"Image too large (max {max_size_mb}MB equivalent)"
        )


def resize_image(
    img: Image.Image, min_dim: int = 800, max_dim: int = 2000
) -> Image.Image:
    w, h = img.size
    if w < min_dim or h < min_dim:
        scale = max(min_dim / w, min_dim / h)
        return img.resize(
            (int(w * scale), int(h * scale)), Image.LANCZOS
        )
    if w > max_dim or h > max_dim:
        scale = min(max_dim / w, max_dim / h)
        return img.resize(
            (int(w * scale), int(h * scale)), Image.LANCZOS
        )
    return img


def save_feedback_sample(
    data_dir: Path,
    image_data: bytes,
    original_texts: list[str],
    corrected_texts: list[str],
) -> str:
    sample_id = uuid.uuid4().hex[:12]
    sample_dir = data_dir / sample_id
    sample_dir.mkdir(parents=True, exist_ok=True)

    img_path = sample_dir / "image.png"
    img_path.write_bytes(image_data)

    (sample_dir / "original.txt").write_text(
        "\n".join(original_texts), encoding="utf-8"
    )
    (sample_dir / "corrected.txt").write_text(
        "\n".join(corrected_texts), encoding="utf-8"
    )

    return sample_id
