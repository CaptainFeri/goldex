package com.goldex.admin.otp

import android.content.Context
import android.util.Log

/**
 * What happens to a code the moment it is read, wherever it was read from.
 *
 * Both readers land here so there is one answer to "and then what": publish it
 * to any open screen, and hand it to the relay so the panel can use it even
 * when this app is closed and nobody is holding the phone.
 */
object OtpIntake {

    fun accept(context: Context, text: String?, source: CapturedOtp.Source) {
        val code = OtpExtractor.extract(text) ?: return
        val body = OtpExtractor.normalizeDigits(text.orEmpty()).trim()
        // Decided once, here, rather than re-read downstream: the message is
        // what the judgement is made from and this is the last place it exists.
        val labelled = OtpExtractor.extract(text, requireLabel = true) == code
        Log.d(TAG, "captured a ${code.length}-digit code from $source")
        // The same message often reaches both readers. The bus knows whether it
        // has seen this code already, and there is no point posting it twice.
        val isNew = OtpBus.publish(
            CapturedOtp(code = code, message = body, source = source, labelled = labelled),
        )
        if (isNew) OtpRelayWorker.enqueue(context, code, body)
    }

    private const val TAG = "OtpIntake"
}
