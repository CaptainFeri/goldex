package com.goldex.admin.autologin

import com.goldex.admin.otp.CapturedOtp
import com.goldex.admin.otp.OtpBus
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout

/**
 * The codes this handset reads, as the engine sees them.
 *
 * Two filters, both because nobody is watching. A code captured before the
 * attempt began belongs to an earlier one — the provider's previous message, or
 * an unrelated service — and a code the message did not announce as a code is
 * the reader guessing. Submitting either spends the attempt.
 */
class OtpBusCodeSource : CodeSource {

    override suspend fun awaitCode(since: Long, timeoutMs: Long): CapturedOtp? = try {
        withTimeout(timeoutMs) {
            OtpBus.latest
                .filterNotNull()
                .first { it.at >= since && it.labelled }
                .also { OtpBus.consume(it.code) }
        }
    } catch (e: TimeoutCancellationException) {
        null
    }
}
