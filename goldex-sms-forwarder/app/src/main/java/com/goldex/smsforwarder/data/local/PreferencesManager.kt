package com.goldex.smsforwarder.data.local

import android.content.Context
import android.content.SharedPreferences

class PreferencesManager(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var targetUrl: String
        get() = prefs.getString(KEY_TARGET_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_TARGET_URL, value).apply()

    var keyword: String
        get() = prefs.getString(KEY_KEYWORD, "") ?: ""
        set(value) = prefs.edit().putString(KEY_KEYWORD, value).apply()

    var isEnabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

    companion object {
        private const val PREFS_NAME = "sms_forwarder_prefs"
        private const val KEY_TARGET_URL = "target_url"
        private const val KEY_KEYWORD = "keyword"
        private const val KEY_ENABLED = "enabled"
    }
}
