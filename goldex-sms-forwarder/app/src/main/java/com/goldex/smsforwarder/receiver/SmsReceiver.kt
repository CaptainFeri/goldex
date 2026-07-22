package com.goldex.smsforwarder.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.goldex.smsforwarder.data.local.PreferencesManager
import com.goldex.smsforwarder.service.SmsForwardService

class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val prefs = PreferencesManager(context)
        if (!prefs.isEnabled) return

        val targetUrl = prefs.targetUrl
        if (targetUrl.isBlank()) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        val sender = messages.firstOrNull()?.originatingAddress ?: "unknown"
        val fullBody = messages.joinToString("") { it.messageBody ?: "" }

        val keyword = prefs.keyword
        if (keyword.isNotBlank() && !fullBody.contains(keyword, ignoreCase = true)) return

        val matchedKeyword = if (keyword.isNotBlank()) keyword else "(all messages)"

        Log.d(TAG, "Matched SMS from $sender: $fullBody")

        val serviceIntent = Intent(context, SmsForwardService::class.java).apply {
            putExtra(SmsForwardService.EXTRA_SENDER, sender)
            putExtra(SmsForwardService.EXTRA_MESSAGE, fullBody)
            putExtra(SmsForwardService.EXTRA_TIMESTAMP, System.currentTimeMillis() / 1000)
            putExtra(SmsForwardService.EXTRA_KEYWORD, matchedKeyword)
            putExtra(SmsForwardService.EXTRA_TARGET_URL, targetUrl)
        }
        context.startForegroundService(serviceIntent)
    }

    companion object {
        private const val TAG = "SmsReceiver"
    }
}
