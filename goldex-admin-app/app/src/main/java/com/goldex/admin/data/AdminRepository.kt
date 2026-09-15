package com.goldex.admin.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Every call the app makes, with the envelope already off.
 *
 * Screens deal in providers and cards, not in `Envelope<List<Provider>>`, and
 * nothing above this line touches Retrofit. Calls are moved off the main thread
 * here rather than at each call site.
 */
class AdminRepository(
    private val client: ApiClient,
    private val store: SessionStore,
) {

    // ── signing in ────────────────────────────────────────────────────────────

    /** Step one: the password, which causes a code to be texted to the admin. */
    suspend fun requestLoginOtp(phone: String, password: String) = io {
        client.api().sendLoginOtp(SendOtpRequest(phone = phone, password = password))
    }

    /** Step two: the code, which yields the token everything else is made with. */
    suspend fun completeLogin(phone: String, otp: String): AdminIdentity? = io {
        val result = client.api().verifyLoginOtp(VerifyOtpRequest(phone = phone, otp = otp)).data
        store.signIn(result.accessToken, result.admin)
        result.admin
    }

    fun signOut() = store.signOut()

    // ── providers ─────────────────────────────────────────────────────────────

    suspend fun providers(): List<Provider> = io { client.api().providers().data }

    /** Whether the engine has an outbound proxy at all; null when it has not said. */
    suspend fun proxyConfigured(): Boolean? = io { client.api().proxyStatus().data.configured }

    /**
     * Ask the provider to text an activation code.
     *
     * The provider it is for is remembered before the call rather than after,
     * because on a fast network the message can arrive while the response is
     * still in flight, and a code that lands with no provider recorded is a
     * code the relay has to throw away.
     */
    suspend fun sendProviderOtp(provider: Provider, phone: String): String? = io {
        val id = requireId(provider)
        store.pendingProviderKey = provider.key
        try {
            client.api().sendProviderOtp(id, SendProviderOtpRequest(phone)).data.message
        } catch (e: Throwable) {
            store.pendingProviderKey = null
            throw e
        }
    }

    suspend fun verifyProviderOtp(provider: Provider, otp: String): String? = io {
        val id = requireId(provider)
        val ack = client.api().verifyProviderOtp(id, VerifyProviderOtpRequest(otp)).data.message
        if (store.pendingProviderKey == provider.key) store.pendingProviderKey = null
        ack
    }

    suspend fun setProviderAuth(provider: Provider, auth: Map<String, Any?>): String? = io {
        client.api().setProviderAuth(requireId(provider), SetAuthRequest(auth)).data.message
    }

    suspend fun toggleProvider(provider: Provider): String? = io {
        client.api().toggleProvider(requireId(provider)).data.message
    }

    /** The last code relayed for this provider, if one still stands. */
    suspend fun relayedOtp(provider: Provider): RelayedOtp? = io {
        client.api().relayedOtp(requireId(provider)).data
    }

    /** Hand a code read off this handset to the backend, for the panel to use. */
    suspend fun relayOtp(providerKey: String, code: String, message: String?) = io {
        client.api().relayOtp(RelayOtpRequest(providerKey, code, message))
    }

    // ── dashboard ─────────────────────────────────────────────────────────────

    suspend fun kpis(): DashboardKpis = io { client.api().kpis().data }

    suspend fun series(metric: String, filter: String?): DashboardSeries =
        io { client.api().series(metric, filter).data }

    suspend fun distribution(metric: String, filter: String?): DashboardDistribution =
        io { client.api().distribution(metric, filter).data }

    suspend fun health(metric: String, filter: String?): DashboardHealth =
        io { client.api().health(metric, filter).data }

    suspend fun activity(metric: String): List<DashboardActivityItem> =
        io { client.api().activity(metric).data }

    /**
     * A provider the mirror listed without an id cannot be addressed: every
     * activation route is `/admin/providers/:id/…`. Saying so here is the
     * difference between a clear message and a 400 from a UUID pipe.
     */
    private fun requireId(provider: Provider): String =
        provider.id ?: throw IllegalStateException(
            "تأمین‌کننده «${provider.displayName}» هنوز در پنل ثبت نشده است. " +
                "ابتدا از پنل مدیریت همگام‌سازی کنید.",
        )

    private suspend fun <T> io(block: suspend () -> T): T = withContext(Dispatchers.IO) { block() }
}
