package com.goldex.smsforwarder.data.network

import com.goldex.smsforwarder.data.model.ProviderAuthResult
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Url

interface AuthForwardApi {
    @POST
    suspend fun forwardAuthData(@Url url: String, @Body authResult: ProviderAuthResult): Response<Unit>
}
