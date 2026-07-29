package com.goldex.smsforwarder.ui

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import com.goldex.smsforwarder.data.local.PreferencesManager
import com.goldex.smsforwarder.data.model.ProviderAuthResult
import com.goldex.smsforwarder.data.model.ProviderType
import com.goldex.smsforwarder.data.model.UpdateProviderRequest
import com.goldex.smsforwarder.data.network.RetrofitClient
import com.goldex.smsforwarder.receiver.OtpNotificationListener
import com.goldex.smsforwarder.service.AuthForwardService
import com.google.gson.Gson
import com.google.gson.JsonParser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class ProviderAuthController(
    private val context: Context,
    private val webView: WebView,
    private val statusLog: TextView
) {

    private val prefs = PreferencesManager(context)
    private val gson = Gson()
    private val scope = CoroutineScope(Dispatchers.IO)
    private var providerType: ProviderType = ProviderType.ZARYAR
    private var providerName: String = ""
    private var selectedProviderId: String = ""
    private var pricingEngineUrl: String = ""

    private val otpReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val otp = OtpNotificationListener.getOtpFromIntent(intent) ?: return
            val title = OtpNotificationListener.getNotificationTitle(intent) ?: ""
            val text = OtpNotificationListener.getNotificationText(intent) ?: ""

            val content = "$title $text"
            val name = providerName.trim()

            if (name.isNotBlank() && !content.contains(name, ignoreCase = true)) {
                Log.d(TAG, "OTP notification ignored — provider name '$name' not found")
                return
            }

            onOtpCaptured(otp)
        }
    }

    fun start(
        providerType: ProviderType,
        providerName: String,
        loginUrl: String,
        phone: String,
        backendUrl: String,
        providerId: String = "",
        engineUrl: String = ""
    ) {
        this.providerType = providerType
        this.providerName = providerName
        this.selectedProviderId = providerId
        this.pricingEngineUrl = engineUrl

        prefs.providerType = providerType.name
        prefs.providerName = providerName
        prefs.phone = phone
        prefs.loginUrl = loginUrl
        prefs.backendUrl = backendUrl
        prefs.selectedProviderId = providerId

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(otpReceiver, OtpNotificationListener.createOtpCapturedFilter(),
                Context.RECEIVER_NOT_EXPORTED
            )
        } else {
            context.registerReceiver(otpReceiver, OtpNotificationListener.createOtpCapturedFilter())
        }

        setupWebView()
        webView.loadUrl(loginUrl)
        log("Loading provider panel: $loginUrl")
    }

    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                safeBrowsingEnabled = false
            }
        }

        webView.addJavascriptInterface(WebViewBridge(), "Android")

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                injectInterceptor(view)
                log("Page loaded: $url")
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                return false
            }
        }
    }

    private fun injectInterceptor(view: WebView) {
        try {
            val js = context.assets.open("auth_interceptor.js")
                .bufferedReader()
                .use { it.readText() }
            view.evaluateJavascript(js, null)
            log("Auth interceptor injected")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to inject interceptor", e)
        }
    }

    private fun onOtpCaptured(otp: String) {
        log("OTP captured from notification: $otp")
        val js = """
            (function() {
                var inputs = document.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"]');
                for (var i = 0; i < inputs.length; i++) {
                    if (inputs[i].value.length === 0 || inputs[i].value.length <= 6) {
                        inputs[i].value = '$otp';
                        inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
                        inputs[i].dispatchEvent(new Event('change', { bubbles: true }));
                        return '$otp filled into ' + inputs[i].name || inputs[i].id;
                    }
                }
                return 'no empty input found';
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    fun stop() {
        try {
            context.unregisterReceiver(otpReceiver)
        } catch (e: Exception) {}
        webView.stopLoading()
    }

    private fun log(message: String) {
        Log.d(TAG, message)
        val current = statusLog.text.toString()
        val newLog = if (current.isEmpty() || current == "Ready") message else "$current\n$message"
        statusLog.text = newLog
    }

    private fun parseAuthData(rawUrl: String, jsonBody: String) {
        log("Auth data captured from: $rawUrl")
        val result = when (providerType) {
            ProviderType.ZARYAR -> parseZaryarAuth(jsonBody)
            ProviderType.TALAAB -> parseTalaabAuth(jsonBody)
        }
        log("Parsed auth: token=${result.token.take(20)}... uId=${result.uId}")

        updateProviderCredentials(result)
        forwardToBackend(result)
    }

    private fun updateProviderCredentials(result: ProviderAuthResult) {
        if (selectedProviderId.isBlank() || pricingEngineUrl.isBlank()) {
            log("No provider selected or engine URL — skipping credentials update")
            return
        }

        scope.launch {
            try {
                val authMap = mutableMapOf(
                    "token" to result.token,
                    "uId" to result.uId,
                    "sessionId" to result.sessionId,
                    "shopkeeperId" to result.shopkeeperId,
                    "roleType" to result.roleType
                )

                val request = UpdateProviderRequest(auth = authMap, active = true)
                val response = RetrofitClient.pricingEngineApi(engineUrl = pricingEngineUrl)
                    .updateProvider(selectedProviderId, request)

                val msg = if (response.isSuccessful) {
                    "✓ Credentials updated on pricing engine"
                } else {
                    "✗ Failed to update credentials: ${response.code()}"
                }
                webView.post { log(msg) }
            } catch (e: Exception) {
                webView.post { log("✗ Error updating credentials: ${e.message}") }
            }
        }
    }

    private fun forwardToBackend(result: ProviderAuthResult) {
        val backendUrl = prefs.backendUrl
        if (backendUrl.isBlank()) {
            log("No backend URL configured — skipping forward")
            return
        }
        log("Forwarding auth data to: $backendUrl")
        val intent = Intent(context, AuthForwardService::class.java).apply {
            putExtra(AuthForwardService.EXTRA_AUTH_JSON, gson.toJson(result))
            putExtra(AuthForwardService.EXTRA_BACKEND_URL, backendUrl)
        }
        context.startForegroundService(intent)
    }

    private fun parseZaryarAuth(jsonBody: String): ProviderAuthResult {
        return try {
            val root = JsonParser.parseString(jsonBody).asJsonObject
            val data = root.getAsJsonObject("Data")
            val user = data?.getAsJsonObject("user")
            if (user != null) {
                ProviderAuthResult(
                    token = user.get("token")?.asString ?: "",
                    uId = user.get("uId")?.asString ?: "",
                    sessionId = user.get("sessionId")?.asString ?: "",
                    shopkeeperId = user.get("shopkeeperId")?.asString ?: "",
                    roleType = user.get("roleType")?.asString ?: "0",
                    rawResponse = jsonBody
                )
            } else {
                ProviderAuthResult(
                    token = root.get("token")?.asString ?: "",
                    uId = root.get("uId")?.asString ?: "",
                    sessionId = root.get("sessionId")?.asString ?: "",
                    shopkeeperId = root.get("shopkeeperId")?.asString ?: "",
                    roleType = root.get("roleType")?.asString ?: "0",
                    rawResponse = jsonBody
                )
            }
        } catch (e: Exception) {
            ProviderAuthResult(rawResponse = jsonBody)
        }
    }

    private fun parseTalaabAuth(jsonBody: String): ProviderAuthResult {
        return try {
            val root = JsonParser.parseString(jsonBody).asJsonObject
            val data = root.getAsJsonObject("data")
            val token = data?.get("token")?.asString ?: root.get("token")?.asString ?: ""
            ProviderAuthResult(token = token, rawResponse = jsonBody)
        } catch (e: Exception) {
            ProviderAuthResult(rawResponse = jsonBody)
        }
    }

    inner class WebViewBridge {
        @JavascriptInterface
        fun onAuthData(url: String, body: String) {
            Log.d(TAG, "Bridge received data from: $url")
            webView.post { parseAuthData(url, body) }
        }
    }

    companion object {
        private const val TAG = "ProviderAuth"
    }
}
