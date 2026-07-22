package com.goldex.smsforwarder.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.goldex.smsforwarder.data.model.SmsData
import com.goldex.smsforwarder.data.network.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsForwardService : Service() {

    private val scope = CoroutineScope(Dispatchers.IO)
    private val notificationManager by lazy {
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val sender = intent?.getStringExtra(EXTRA_SENDER) ?: return START_NOT_STICKY
        val message = intent?.getStringExtra(EXTRA_MESSAGE) ?: return START_NOT_STICKY
        val timestamp =
            intent?.getLongExtra(EXTRA_TIMESTAMP, System.currentTimeMillis() / 1000)
                ?: System.currentTimeMillis() / 1000
        val keyword = intent?.getStringExtra(EXTRA_KEYWORD) ?: ""
        val targetUrl = intent?.getStringExtra(EXTRA_TARGET_URL) ?: return START_NOT_STICKY

        startForeground(NOTIFICATION_ID, buildNotification(sender, message))

        scope.launch {
            try {
                val smsData = SmsData(
                    sender = sender,
                    message = message,
                    timestamp = timestamp,
                    keywordMatched = keyword
                )
                val response = RetrofitClient.apiService.forwardSms(targetUrl, smsData)
                Log.d(TAG, "Forwarded — status: ${response.code()} ${response.message()}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to forward SMS", e)
            } finally {
                stopSelf()
            }
        }

        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SMS Forward Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows status while forwarding SMS messages"
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(sender: String, message: String): Notification {
        val truncated = if (message.length > 100) message.take(100) + "..." else message
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Forwarding SMS from $sender")
            .setContentText(truncated)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "SmsForwardService"
        private const val CHANNEL_ID = "sms_forward_channel"
        private const val NOTIFICATION_ID = 1001

        const val EXTRA_SENDER = "extra_sender"
        const val EXTRA_MESSAGE = "extra_message"
        const val EXTRA_TIMESTAMP = "extra_timestamp"
        const val EXTRA_KEYWORD = "extra_keyword"
        const val EXTRA_TARGET_URL = "extra_target_url"
    }
}
