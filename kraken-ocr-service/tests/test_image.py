import io
import base64

from PIL import Image

from app.image import decode_base64, open_image, resize_image


def _make_test_image(width=400, height=300, mode="RGB"):
    img = Image.new(mode, (width, height), color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode(), img


def test_decode_base64():
    b64, _ = _make_test_image()
    data = decode_base64(b64)
    assert isinstance(data, bytes)
    assert len(data) > 0


def test_open_image():
    b64, orig = _make_test_image()
    data = decode_base64(b64)
    img = open_image(data)
    assert img.size == orig.size


def test_resize_image_small():
    _, img = _make_test_image(400, 300)
    resized = resize_image(img, min_dim=800, max_dim=2000)
    assert resized.size[0] >= 800 or resized.size[1] >= 800


def test_resize_image_large():
    _, img = _make_test_image(3000, 2000)
    resized = resize_image(img, min_dim=800, max_dim=2000)
    assert resized.size[0] <= 2000 or resized.size[1] <= 2000


def test_resize_image_within_bounds():
    _, img = _make_test_image(1000, 800)
    resized = resize_image(img, min_dim=800, max_dim=2000)
    assert resized.size == (1000, 800)
