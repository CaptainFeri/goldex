package com.goldex.smsforwarder.data.local

import android.content.Context
import android.content.SharedPreferences

class PreferencesManager(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var pricingEngineUrl: String
        get() = prefs.getString(KEY_PRICING_ENGINE_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_PRICING_ENGINE_URL, value).apply()

    var providerType: String
        get() = prefs.getString(KEY_PROVIDER_TYPE, "ZARYAR") ?: "ZARYAR"
        set(value) = prefs.edit().putString(KEY_PROVIDER_TYPE, value).apply()

    var phone: String
        get() = prefs.getString(KEY_PHONE, "") ?: ""
        set(value) = prefs.edit().putString(KEY_PHONE, value).apply()

    var providerName: String
        get() = prefs.getString(KEY_PROVIDER_NAME, "") ?: ""
        set(value) = prefs.edit().putString(KEY_PROVIDER_NAME, value).apply()

    var loginUrl: String
        get() = prefs.getString(KEY_LOGIN_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_LOGIN_URL, value).apply()

    var backendUrl: String
        get() = prefs.getString(KEY_BACKEND_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_BACKEND_URL, value).apply()

    var selectedProviderId: String
        get() = prefs.getString(KEY_SELECTED_PROVIDER_ID, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SELECTED_PROVIDER_ID, value).apply()

    companion object {
        private const val PREFS_NAME = "sms_forwarder_prefs"
        private const val KEY_PRICING_ENGINE_URL = "pricing_engine_url"
        private const val KEY_PROVIDER_TYPE = "provider_type"
        private const val KEY_PHONE = "phone"
        private const val KEY_PROVIDER_NAME = "provider_name"
        private const val KEY_LOGIN_URL = "login_url"
        private const val KEY_BACKEND_URL = "backend_url"
        private const val KEY_SELECTED_PROVIDER_ID = "selected_provider_id"
    }
}
