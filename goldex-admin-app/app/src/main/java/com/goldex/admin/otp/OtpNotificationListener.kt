package com.goldex.admin.otp

import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat

/**
 * The indirect reader: whatever the messaging app put on screen.
 *
 * This exists because the direct one is not always allowed to run — some
 * handsets withhold SMS delivery from a sideloaded app, and a code that arrives
 * over RCS or through a carrier's own app never reaches the SMS broadcast at
 * all. Whatever shows the message shows a notification, and this reads that.
 *
 * Its own notifications are ignored; a service that read the code back out of
 * the alert it posted about the code would loop.
 */
class OtpNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return
        val extras = sbn.notification?.extras ?: return
        val text = listOfNotNull(
            extras.getCharSequence(NotificationCompat.EXTRA_TITLE)?.toString(),
            extras.getCharSequence(NotificationCompat.EXTRA_TEXT)?.toString(),
            extras.getCharSequence(NotificationCompat.EXTRA_BIG_TEXT)?.toString(),
        ).joinToString(" ")
        OtpIntake.accept(applicationContext, text, CapturedOtp.Source.NOTIFICATION)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) = Unit

    companion object {
        /**
         * Whether the operator has granted notification access.
         *
         * There is no permission dialog for this one — it is a settings screen
         * the operator has to visit — so the app has to be able to say whether
         * it is on rather than assume.
         */
        fun isEnabled(context: Context): Boolean {
            val flat = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners",
            ) ?: return false
            val me = ComponentName(context, OtpNotificationListener::class.java)
            return flat.split(":").any {
                val parsed = ComponentName.unflattenFromString(it)
                parsed?.packageName == me.packageName && parsed.className == me.className
            }
        }
    }
}
