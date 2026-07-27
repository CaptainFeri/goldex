from app.schemas import OCRRequest, OCRResponse, OCRBatchRequest, HealthResponse


def test_ocr_request_valid():
    req = OCRRequest(base64_image="dGVzdA==")
    assert req.base64_image == "dGVzdA=="
    assert req.options is None


def test_ocr_response_success():
    resp = OCRResponse(
        success=True, texts=["hello", "world"], processing_time_ms=12.34
    )
    assert resp.success is True
    assert resp.texts == ["hello", "world"]
    assert resp.processing_time_ms == 12.34


def test_ocr_response_error():
    resp = OCRResponse(success=False, error="bad image")
    assert resp.success is False
    assert resp.error == "bad image"


def test_ocr_batch_request():
    req = OCRBatchRequest(images=["aGVsbG8=", "d29ybGQ="])
    assert len(req.images) == 2


def test_health_response():
    resp = HealthResponse(status="ok", model_loaded=True, model_path="/models/test.mlmodel")
    assert resp.status == "ok"
    assert resp.model_loaded is True
