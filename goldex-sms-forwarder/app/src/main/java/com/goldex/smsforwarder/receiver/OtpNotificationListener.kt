package com.goldex.smsforwarder.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import java.util.regex.Pattern

class OtpNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return

        val notification = sbn.notification
        val extras = notification.extras ?: return

        val title = extras.getString(NotificationCompat.EXTRA_TITLE, "") ?: ""
        val text = extras.getString(NotificationCompat.EXTRA_TEXT, "") ?: ""
        val bigText = extras.getString(NotificationCompat.EXTRA_BIG_TEXT, "") ?: ""

        val content = "$title $text $bigText"

        val otp = extractOtp(content)
        if (otp != null) {
            Log.d(TAG, "OTP captured from notification: $otp")
            val intent = Intent(ACTION_OTP_CAPTURED).apply {
                putExtra(EXTRA_OTP_CODE, otp)
                putExtra(EXTRA_NOTIFICATION_TITLE, title)
                putExtra(EXTRA_NOTIFICATION_TEXT, "$text $bigText")
            }
            sendBroadcast(intent)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {}

    private fun extractOtp(text: String): String? {
        val matcher = OTP_PATTERN.matcher(text)
        return if (matcher.find()) matcher.group(1) else null
    }

    companion object {
        private const val TAG = "OtpNotificationListener"
        private const val ACTION_OTP_CAPTURED = "com.goldex.smsforwarder.OTP_CAPTURED"
        private const val EXTRA_OTP_CODE = "otp_code"
        private const val EXTRA_NOTIFICATION_TITLE = "notification_title"
        private const val EXTRA_NOTIFICATION_TEXT = "notification_text"

        val OTP_PATTERN: Pattern = Pattern.compile("\\b(\\d{4,6})\\b")

        fun createOtpCapturedFilter(): IntentFilter {
            return IntentFilter(ACTION_OTP_CAPTURED)
        }

        fun getOtpFromIntent(intent: Intent): String? {
            return intent.getStringExtra(EXTRA_OTP_CODE)
        }

        fun getNotificationTitle(intent: Intent): String? {
            return intent.getStringExtra(EXTRA_NOTIFICATION_TITLE)
        }

        fun getNotificationText(intent: Intent): String? {
            return intent.getStringExtra(EXTRA_NOTIFICATION_TEXT)
        }
    }
}
