package com.goldex.admin.data

import com.goldex.admin.BuildConfig
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * One API instance per backend address.
 *
 * The address is a setting rather than a build constant — the same APK is
 * pointed at a laptop, a staging box and production — so the client is rebuilt
 * when it changes and cached while it does not. The token is read through the
 * store on every request instead of being baked into the client, so signing in
 * and out does not require rebuilding anything.
 */
class ApiClient(private val store: SessionStore) {

    private var cachedFor: String? = null
    private var cached: AdminApi? = null
    private var deviceCachedFor: String? = null
    private var deviceCached: DeviceApi? = null

    @Synchronized
    fun api(): AdminApi {
        val base = baseUrl()
        cached?.let { if (cachedFor == base) return it }
        return build(base) { store.token.value }
            .create(AdminApi::class.java)
            .also {
                cachedFor = base
                cached = it
            }
    }

    /**
     * The same backend under this handset's own credential.
     *
     * A separate client rather than a header swapped per call: the two
     * credentials authorise different things, and one that could be chosen per
     * request is one that can be chosen wrongly.
     */
    @Synchronized
    fun deviceApi(): DeviceApi {
        val base = baseUrl()
        deviceCached?.let { if (deviceCachedFor == base) return it }
        return build(base) { store.deviceToken }
            .create(DeviceApi::class.java)
            .also {
                deviceCachedFor = base
                deviceCached = it
            }
    }

    private fun baseUrl() = SessionStore.normalizeBaseUrl(store.baseUrl) + API_PREFIX

    private fun build(base: String, token: () -> String?): Retrofit {
        val auth = Interceptor { chain ->
            val request = chain.request().newBuilder().apply {
                header("Accept", "application/json")
                token()?.let { header("Authorization", "Bearer $it") }
            }.build()
            chain.proceed(request)
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(auth)
            .apply {
                if (BuildConfig.DEBUG) {
                    addInterceptor(
                        HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BASIC),
                    )
                }
            }
            // A handset on a phone network reaching an operator's own box: slow
            // is normal, hanging is not.
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(base)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    companion object {
        /** The backend's global prefix and default version. */
        const val API_PREFIX = "api/v1/"
    }
}
