package com.goldex.admin.otp

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The last code this handset read, for whoever is looking at the screen.
 *
 * A broadcast receiver and a notification listener both run outside any screen,
 * and either can fire while the activation sheet is open. This carries the code
 * from them to the sheet within the process; getting it to the backend is a
 * separate path (`OtpRelayWorker`), because that has to work when no screen is
 * open at all.
 *
 * The same code arriving twice — the message showing up as both an SMS and a
 * notification — is published once.
 */
object OtpBus {

    private val _latest = MutableStateFlow<CapturedOtp?>(null)
    val latest: StateFlow<CapturedOtp?> = _latest.asStateFlow()

    /** @return false when this is the same code arriving a second way. */
    fun publish(captured: CapturedOtp): Boolean {
        val previous = _latest.value
        if (previous != null &&
            previous.code == captured.code &&
            captured.at - previous.at < DUPLICATE_WINDOW_MS
        ) {
            return false
        }
        _latest.value = captured
        return true
    }

    /** Called once the code has been used, so a later screen does not refill it. */
    fun consume(code: String) {
        if (_latest.value?.code == code) _latest.value = null
    }

    private const val DUPLICATE_WINDOW_MS = 30_000L
}
