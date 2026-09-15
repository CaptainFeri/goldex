package com.goldex.admin.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import com.goldex.admin.BuildConfig

/**
 * What survives the app being closed.
 *
 * An admin token is a credential to the whole platform, so it is kept in
 * hardware-backed encrypted preferences rather than plain ones. Where the
 * keystore is unusable — a handset with a broken provider, or a restore onto a
 * device whose key is gone — the store falls back to plain preferences rather
 * than crashing on launch, and says so, so an operator can decide whether that
 * is acceptable on that device.
 */
class SessionStore(context: Context) {

    private val prefs: SharedPreferences
    /** True when the token is being kept unencrypted because the keystore failed. */
    val encrypted: Boolean

    init {
        var usable: SharedPreferences? = null
        try {
            val key = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            usable = EncryptedSharedPreferences.create(
                context,
                "goldex-admin-session",
                key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (e: Exception) {
            Log.w(TAG, "keystore unavailable, falling back to plain preferences", e)
        }
        encrypted = usable != null
        prefs = usable ?: context.getSharedPreferences("goldex-admin-session-plain", Context.MODE_PRIVATE)
    }

    private val _token = MutableStateFlow(prefs.getString(KEY_TOKEN, null))

    /** The admin bearer token, or null when nobody is signed in. */
    val token: StateFlow<String?> = _token.asStateFlow()

    var baseUrl: String
        get() = prefs.getString(KEY_BASE_URL, null) ?: BuildConfig.DEFAULT_BASE_URL
        set(value) = prefs.edit().putString(KEY_BASE_URL, normalizeBaseUrl(value)).apply()

    var adminPhone: String?
        get() = prefs.getString(KEY_PHONE, null)
        set(value) = prefs.edit().putString(KEY_PHONE, value).apply()

    var adminRole: String?
        get() = prefs.getString(KEY_ROLE, null)
        set(value) = prefs.edit().putString(KEY_ROLE, value).apply()

    /**
     * The credential this handset was enrolled with.
     *
     * Separate from the admin token on purpose. The admin token is a person's
     * session — it belongs to whoever signed in, expires with their login, and
     * opens the whole platform. This one belongs to the phone, opens four
     * endpoints, and is what lets the handset keep working when nobody is
     * signed in on it, which is the entire point of leaving it on a desk.
     */
    var deviceToken: String?
        get() = prefs.getString(KEY_DEVICE_TOKEN, null)?.takeIf { it.isNotBlank() }
        set(value) = prefs.edit().putString(KEY_DEVICE_TOKEN, value?.trim()).apply()

    /** Whether this handset has been enrolled to act on its own. */
    val isEnrolled: Boolean get() = deviceToken != null

    /**
     * Which provider the next incoming code belongs to.
     *
     * Set when an activation code is requested and cleared when it is used. A
     * code read off the SIM carries no indication of what it is for, so without
     * this the relay would have to guess — and relaying a Zaryar code as a
     * Talaab one would burn both attempts.
     */
    var pendingProviderKey: String?
        get() = prefs.getString(KEY_PENDING, null)
        set(value) = prefs.edit().putString(KEY_PENDING, value).apply()

    fun signIn(token: String, identity: AdminIdentity?) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_PHONE, identity?.phone)
            .putString(KEY_ROLE, identity?.role)
            .apply()
        _token.value = token
    }

    /**
     * The person signs out; the handset stays enrolled.
     *
     * The device credential is deliberately kept: it was issued to this phone,
     * not to whoever happened to be signed in on it, and clearing it here would
     * mean a handset stopped doing its unattended work the moment someone
     * tidied up after using the console.
     */
    fun signOut() {
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_ROLE)
            .remove(KEY_PENDING)
            .apply()
        _token.value = null
    }

    /** Undo enrolment on this handset. The credential must also be revoked at the panel. */
    fun forgetDevice() {
        prefs.edit().remove(KEY_DEVICE_TOKEN).apply()
    }

    companion object {
        private const val TAG = "SessionStore"
        private const val KEY_TOKEN = "token"
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_PHONE = "phone"
        private const val KEY_ROLE = "role"
        private const val KEY_PENDING = "pending_provider"
        private const val KEY_DEVICE_TOKEN = "device_token"

        /**
         * Retrofit refuses a base URL without a trailing slash, and an operator
         * typing one in will not add it. A bare host is assumed to be http,
         * since that is what an address typed by hand normally is here.
         */
        fun normalizeBaseUrl(raw: String): String {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) return BuildConfig.DEFAULT_BASE_URL
            val withScheme =
                if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed
                else "http://$trimmed"
            return if (withScheme.endsWith("/")) withScheme else "$withScheme/"
        }
    }
}
