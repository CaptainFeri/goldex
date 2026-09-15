package com.goldex.admin.autologin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.goldex.admin.Goldex
import com.goldex.admin.R
import com.goldex.admin.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Keeps the handset working when nobody is holding it.
 *
 * A foreground service with a notification the operator cannot dismiss, which
 * is the price Android charges for running reliably — and is worth paying here:
 * the alternative, periodic work, is fifteen minutes at best and longer in
 * Doze, and a provider that is down for fifteen minutes is fifteen minutes of
 * prices the desk cannot quote.
 *
 * The notification is also the only honest indicator that the phone is alive.
 * A handset killed by a battery optimiser leaves nothing behind but a missing
 * notification, so it says what the last pass did rather than a fixed label.
 */
class AutoLoginService : Service() {

    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var loop: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(NOTIFICATION_ID, notification("در حال آماده‌سازی…"))
        AutoLoginStatus.running(true)
        if (loop == null) loop = scope.launch { work() }

        // Restarted by the system if it is killed: an unattended device that
        // stops working when memory is tight is worse than one that was never
        // started, because nothing says it stopped.
        return START_STICKY
    }

    private suspend fun work() {
        val store = Goldex.session(applicationContext)
        val engine = AutoLoginEngine(
            gateway = RepositoryGateway(Goldex.repository(applicationContext)),
            codes = OtpBusCodeSource(),
            onEvent = { Log.i(TAG, it) },
        )

        while (scope.isActive) {
            // Checked each pass rather than once at startup: a credential can
            // be revoked at the panel while this is running, and the right
            // response is to stop asking rather than to keep being refused.
            if (!store.isEnrolled) {
                update("این دستگاه ثبت نشده است")
                delay(POLL_INTERVAL_MS)
                continue
            }

            val outcome = try {
                engine.runOnce()
            } catch (e: Exception) {
                Log.w(TAG, "auto-login pass failed", e)
                AutoLoginOutcome.Unreachable(e.message ?: "خطای ناشناخته")
            }
            AutoLoginStatus.record(outcome)
            update(AutoLoginStatus.describe(outcome))

            // A pass that just activated a provider is followed immediately by
            // another, because providers usually expire together — one session
            // ending is often the whole shift ending.
            val wait = if (outcome is AutoLoginOutcome.Activated) SHORT_INTERVAL_MS else POLL_INTERVAL_MS
            delay(wait)
        }
    }

    private fun update(text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification(text))
    }

    private fun notification(text: String): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ورود خودکار تأمین‌کننده‌ها")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(open)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "ورود خودکار",
                // Low: it is a status line, not an alert. An operator who is
                // buzzed every time a provider reconnects stops reading it.
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = "وضعیت ورود خودکار تأمین‌کننده‌ها" },
        )
    }

    override fun onDestroy() {
        loop?.cancel()
        loop = null
        scope.cancel()
        AutoLoginStatus.running(false)
        super.onDestroy()
    }

    companion object {
        private const val TAG = "AutoLogin"
        private const val CHANNEL_ID = "auto-login"
        private const val NOTIFICATION_ID = 4101
        const val ACTION_STOP = "com.goldex.admin.STOP_AUTO_LOGIN"

        /**
         * How often to ask what needs a login.
         *
         * The server's own limits decide when anything may actually be tried,
         * so this only sets how quickly a newly-expired session is noticed. A
         * minute costs little on a phone that is plugged in, which is what a
         * device left to do this is.
         */
        private const val POLL_INTERVAL_MS = 60_000L
        private const val SHORT_INTERVAL_MS = 5_000L

        fun start(context: Context) {
            val intent = Intent(context, AutoLoginService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, AutoLoginService::class.java))
        }
    }
}
