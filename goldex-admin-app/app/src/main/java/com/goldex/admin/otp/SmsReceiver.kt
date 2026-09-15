package com.goldex.admin.otp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * The direct reader: the message itself, as the radio delivered it.
 *
 * A long code split across two SMS parts arrives as two messages from the same
 * sender, so the parts are joined before anything is read out of them.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val body = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            ?.joinToString(separator = "") { it.displayMessageBody.orEmpty() }
            ?: return
        OtpIntake.accept(context, body, CapturedOtp.Source.SMS)
    }
}
