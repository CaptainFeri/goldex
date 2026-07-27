import asyncio
import json
import logging
import os
import time
from contextlib import redirect_stderr

import aio_pika
from pydantic import ValidationError

from app.image import decode_base64, open_image, resize_image, validate_image
from app.schemas import OCRJobMessage, OCRResultMessage

logger = logging.getLogger("kraken-ocr")


class OCRWorker:
    def __init__(self, settings, model) -> None:
        self._settings = settings
        self._model = model
        self._connection: aio_pika.RobustConnection | None = None
        self._channel: aio_pika.Channel | None = None
        self._exchange: aio_pika.Exchange | None = None
        self._consumer_tag: str | None = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        logger.info("Connecting to RabbitMQ at %s ...", self._settings.rabbitmq_url)
        self._connection = await aio_pika.connect_robust(
            self._settings.rabbitmq_url,
            timeout=self._settings.inference_timeout_sec,
        )
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=self._settings.prefetch_count)

        queue = await self._channel.declare_queue(
            self._settings.ocr_request_queue,
            durable=True,
        )

        self._exchange = await self._channel.declare_exchange(
            self._settings.ocr_result_exchange,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )

        self._consumer_tag = await queue.consume(self._on_message)
        logger.info(
            "Consuming from queue '%s', publishing results to exchange '%s'",
            self._settings.ocr_request_queue,
            self._settings.ocr_result_exchange,
        )
        await self._stop_event.wait()

    async def stop(self) -> None:
        logger.info("Stopping OCR worker ...")
        self._stop_event.set()
        if self._consumer_tag and self._channel:
            await self._channel.cancel(self._consumer_tag)
        if self._connection:
            await self._connection.close()
        logger.info("OCR worker stopped")

    async def _on_message(self, message: aio_pika.IncomingMessage) -> None:
        async with message.process(requeue=True):
            try:
                body = json.loads(message.body.decode())
                job = OCRJobMessage(**body)
            except (json.JSONDecodeError, ValidationError) as e:
                logger.error("Invalid job message: %s", e)
                return

            try:
                result = await self._process_job(job)
                await self._publish_result(result)
            except Exception as e:
                logger.error("Job %s failed: %s", job.job_id, e, exc_info=True)
                result = OCRResultMessage(
                    job_id=job.job_id,
                    success=False,
                    error=str(e),
                    correlation_id=job.correlation_id,
                )
                await self._publish_result(result)

    async def _process_job(self, job: OCRJobMessage) -> OCRResultMessage:
        start = time.monotonic()
        try:
            img_data = decode_base64(job.image_base64)
            img = open_image(img_data)
            validate_image(img, self._settings.max_image_size_mb)
            img = resize_image(img, self._settings.min_dim, self._settings.max_dim)

            with open(os.devnull, "w") as _dn, redirect_stderr(_dn):
                from kraken import binarization, pageseg

                bw = binarization.nlbin(img)
                seg = pageseg.segment(bw)

            texts = await self._model.predict(bw, seg)

            elapsed = (time.monotonic() - start) * 1000
            return OCRResultMessage(
                job_id=job.job_id,
                success=True,
                texts=texts,
                processing_time_ms=round(elapsed, 2),
                correlation_id=job.correlation_id,
            )
        except Exception as e:
            elapsed = (time.monotonic() - start) * 1000
            logger.error("Processing error for job %s: %s", job.job_id, e, exc_info=True)
            return OCRResultMessage(
                job_id=job.job_id,
                success=False,
                error=str(e),
                processing_time_ms=round(elapsed, 2),
                correlation_id=job.correlation_id,
            )

    async def _publish_result(self, result: OCRResultMessage) -> None:
        await self._exchange.publish(
            aio_pika.Message(
                body=result.model_dump_json().encode(),
                content_type="application/json",
                correlation_id=result.correlation_id or result.job_id,
            ),
            routing_key=self._settings.ocr_result_routing_key,
        )
