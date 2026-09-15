package com.goldex.admin.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * The slice of the admin API this app drives.
 *
 * Paths are relative to `<base>/api/v1/`, which is where the backend's global
 * prefix and default version put everything.
 */
interface AdminApi {

    @POST("admin/auth/send-otp")
    suspend fun sendLoginOtp(@Body body: SendOtpRequest): Envelope<Map<String, Any?>>

    @POST("admin/auth/verify-otp")
    suspend fun verifyLoginOtp(@Body body: VerifyOtpRequest): Envelope<LoginResult>

    @GET("admin/providers")
    suspend fun providers(): Envelope<List<Provider>>

    @GET("admin/providers/proxy-status")
    suspend fun proxyStatus(): Envelope<ProxyStatus>

    @POST("admin/providers/{id}/send-otp")
    suspend fun sendProviderOtp(
        @Path("id") id: String,
        @Body body: SendProviderOtpRequest,
    ): Envelope<CommandAck>

    @POST("admin/providers/{id}/verify-otp")
    suspend fun verifyProviderOtp(
        @Path("id") id: String,
        @Body body: VerifyProviderOtpRequest,
    ): Envelope<CommandAck>

    @POST("admin/providers/{id}/set-auth")
    suspend fun setProviderAuth(
        @Path("id") id: String,
        @Body body: SetAuthRequest,
    ): Envelope<CommandAck>

    @POST("admin/providers/{id}/toggle-active")
    suspend fun toggleProvider(@Path("id") id: String): Envelope<CommandAck>

    @GET("admin/providers/awaiting-otp")
    suspend fun awaitingOtp(): Envelope<AwaitingOtp>

    @POST("admin/providers/relay-otp")
    suspend fun relayOtp(@Body body: RelayOtpRequest): Envelope<CommandAck>

    @GET("admin/providers/{id}/relayed-otp")
    suspend fun relayedOtp(@Path("id") id: String): Envelope<RelayedOtp>

    @GET("admin/dashboard/kpis")
    suspend fun kpis(): Envelope<DashboardKpis>

    @GET("admin/dashboard/series")
    suspend fun series(
        @Query("metric") metric: String,
        @Query("filter") filter: String? = null,
    ): Envelope<DashboardSeries>

    @GET("admin/dashboard/distribution")
    suspend fun distribution(
        @Query("metric") metric: String,
        @Query("filter") filter: String? = null,
    ): Envelope<DashboardDistribution>

    @GET("admin/dashboard/health")
    suspend fun health(
        @Query("metric") metric: String,
        @Query("filter") filter: String? = null,
    ): Envelope<DashboardHealth>

    @GET("admin/dashboard/activity")
    suspend fun activity(
        @Query("metric") metric: String,
        @Query("limit") limit: Int = 8,
    ): Envelope<List<DashboardActivityItem>>
}
