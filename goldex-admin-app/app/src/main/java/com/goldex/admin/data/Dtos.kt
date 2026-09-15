package com.goldex.admin.data

import com.google.gson.annotations.SerializedName

/**
 * Every backend response is wrapped.
 *
 * A global interceptor on the API puts the payload under `data`, so nothing is
 * ever read off the top level. Keeping the envelope explicit here means a
 * response shape change shows up as a compile error rather than a null field.
 */
data class Envelope<T>(val data: T)

// ── auth ──────────────────────────────────────────────────────────────────────

data class SendOtpRequest(val phone: String, val password: String)

data class VerifyOtpRequest(val phone: String, val otp: String)

data class AdminIdentity(
    val id: String?,
    val phone: String?,
    val email: String?,
    val role: String?,
)

data class LoginResult(
    @SerializedName("access_token") val accessToken: String,
    val admin: AdminIdentity?,
)

// ── providers ─────────────────────────────────────────────────────────────────

/**
 * A provider as the admin mirror lists it.
 *
 * `id` is nullable on purpose: a provider that exists only in the pricing
 * engine is adopted into the mirror when it is listed, but a deployment that
 * has not reconciled yet can still hand back a row without one. Everything that
 * addresses a provider by id has to check first.
 */
data class Provider(
    val id: String?,
    val key: String,
    val category: String?,
    val persianName: String?,
    val baseUrl: String?,
    val apiBaseUrl: String?,
    val webPanelUrl: String?,
    val phone: String?,
    val sendOtpUrl: String?,
    val verifyCodeUrl: String?,
    val useProxy: Boolean = true,
    val active: Boolean = false,
    val status: String?,
    val lastStatusChangeAt: String?,
) {
    val displayName: String get() = persianName?.takeIf { it.isNotBlank() } ?: key

    /** Whether activation can be driven from here at all. */
    val canActivateByOtp: Boolean
        get() = !sendOtpUrl.isNullOrBlank() && !verifyCodeUrl.isNullOrBlank()
}

data class CommandAck(val message: String?)

data class ProxyStatus(val configured: Boolean?)

data class SetAuthRequest(val auth: Map<String, Any?>)

data class SendProviderOtpRequest(val phone: String)

data class VerifyProviderOtpRequest(val otp: String)

data class RelayOtpRequest(
    /** Null when this handset did not start the activation; the backend attributes it. */
    val providerKey: String?,
    val code: String,
    val message: String?,
)

data class AwaitingOtp(val providerKey: String?, val since: String?)

/**
 * A provider the engine says has stopped accepting its session.
 *
 * `reason` is carried beside `eligible` because it is the whole answer: "no,
 * waiting until 14:20" and "no, it has no phone number stored" both mean no,
 * and they call for completely different actions.
 */
data class LoginCandidate(
    val id: String?,
    val key: String,
    val persianName: String?,
    val phone: String?,
    val status: String?,
    val eligible: Boolean = false,
    val reason: String?,
    val attempts: Int = 0,
    val cooldownUntil: String?,
    val leasedBy: String?,
)

data class LoginLease(val leaseExpiresAt: String?, val phone: String?)

data class ReleaseLoginRequest(val outcome: String, val reason: String?)

data class RelayedOtp(
    val code: String?,
    val receivedAt: String?,
    val message: String?,
)

// ── dashboard ─────────────────────────────────────────────────────────────────

data class DashboardStat(
    val label: String,
    val value: String,
    val unit: String?,
    val hint: String?,
)

data class DashboardFilterOption(val value: String, val label: String)

data class DashboardKpi(
    val metric: String,
    val label: String,
    val stats: List<DashboardStat> = emptyList(),
    val filterLabel: String?,
    val filters: List<DashboardFilterOption> = emptyList(),
    val activeFilter: String?,
    val deltaPercent: Double?,
)

data class DashboardKpis(val cards: List<DashboardKpi> = emptyList(), val generatedAt: String?)

data class DashboardSeriesPoint(
    val month: Int,
    val label: String,
    val primary: String,
    val secondary: String,
)

data class DashboardSeries(
    val year: Int,
    val primaryLabel: String,
    val secondaryLabel: String,
    val unit: String?,
    val points: List<DashboardSeriesPoint> = emptyList(),
)

data class DashboardSlice(val label: String, val value: String, val percent: Double)

data class DashboardDistribution(val title: String, val slices: List<DashboardSlice> = emptyList())

data class DashboardActivityItem(
    val id: String,
    val title: String,
    val description: String,
    val severity: String,
    val at: String?,
)

data class DashboardHealthRow(
    val label: String,
    val percent: Double,
    val variant: String,
    val count: Int,
)

data class DashboardHealth(
    val title: String,
    val windowDays: Int,
    val rows: List<DashboardHealthRow> = emptyList(),
    val measures: List<DashboardStat> = emptyList(),
)
