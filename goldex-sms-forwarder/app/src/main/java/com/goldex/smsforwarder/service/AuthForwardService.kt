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
import com.goldex.smsforwarder.data.model.ProviderAuthResult
import com.goldex.smsforwarder.data.network.AuthForwardApi
import com.goldex.smsforwarder.data.network.RetrofitClient
import com.google.gson.Gson
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class AuthForwardService : Service() {

    private val scope = CoroutineScope(Dispatchers.IO)
    private val gson = Gson()
    private val notificationManager by lazy {
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val authJson = intent?.getStringExtra(EXTRA_AUTH_JSON) ?: return START_NOT_STICKY
        val backendUrl = intent?.getStringExtra(EXTRA_BACKEND_URL) ?: return START_NOT_STICKY

        val authResult: ProviderAuthResult = try {
            gson.fromJson(authJson, ProviderAuthResult::class.java)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse auth result", e)
            return START_NOT_STICKY
        }

        startForeground(NOTIFICATION_ID, buildNotification("Forwarding auth data..."))

        scope.launch {
            try {
                val response = RetrofitClient.authForwardApi.forwardAuthData(backendUrl, authResult)
                Log.d(TAG, "Auth forwarded — status: ${response.code()} ${response.message()}")
                updateNotification("Auth forwarded (${response.code()})")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to forward auth data", e)
                updateNotification("Failed: ${e.message}")
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
                "Auth Forward Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows status while forwarding provider auth data"
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Provider Auth")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val notification = buildNotification(text).apply {
            flags = flags or Notification.FLAG_AUTO_CANCEL
        }
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    companion object {
        private const val TAG = "AuthForwardService"
        private const val CHANNEL_ID = "auth_forward_channel"
        private const val NOTIFICATION_ID = 1002

        const val EXTRA_AUTH_JSON = "extra_auth_json"
        const val EXTRA_BACKEND_URL = "extra_backend_url"
    }
}
