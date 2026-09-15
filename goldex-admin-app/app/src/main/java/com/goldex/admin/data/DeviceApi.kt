package com.goldex.admin.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * What this handset may do on its own credential.
 *
 * A deliberately short list, and it is short on the server too — these are a
 * separate controller behind a separate guard, not a subset of the admin API.
 * Everything here works with nobody signed in on the phone, which is the point
 * of the credential: an admin session belongs to a person and expires with
 * them, and a handset left on a desk has neither.
 */
interface DeviceApi {

    @GET("device/providers")
    suspend fun providers(): Envelope<List<Provider>>

    @GET("device/providers/needs-login")
    suspend fun needsLogin(): Envelope<List<LoginCandidate>>

    @GET("device/providers/awaiting-otp")
    suspend fun awaitingOtp(): Envelope<AwaitingOtp>

    @POST("device/providers/{id}/login-lease")
    suspend fun claimLogin(@Path("id") id: String): Envelope<LoginLease>

    @POST("device/providers/{id}/login-lease/release")
    suspend fun releaseLogin(
        @Path("id") id: String,
        @Body body: ReleaseLoginRequest,
    ): Envelope<CommandAck>

    @POST("device/providers/{id}/send-otp")
    suspend fun sendOtp(
        @Path("id") id: String,
        @Body body: SendProviderOtpRequest,
    ): Envelope<CommandAck>

    @POST("device/providers/{id}/verify-otp")
    suspend fun verifyOtp(
        @Path("id") id: String,
        @Body body: VerifyProviderOtpRequest,
    ): Envelope<CommandAck>

    @POST("device/providers/relay-otp")
    suspend fun relayOtp(@Body body: RelayOtpRequest): Envelope<CommandAck>
}
