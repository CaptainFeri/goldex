package com.goldex.smsforwarder.data.network

import com.goldex.smsforwarder.data.model.ProviderDto
import com.goldex.smsforwarder.data.model.UpdateProviderRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path

interface PricingEngineApi {

    @GET("providers")
    suspend fun listProviders(): Response<List<ProviderDto>>

    @PATCH("providers/{id}")
    suspend fun updateProvider(
        @Path("id") id: String,
        @Body body: UpdateProviderRequest
    ): Response<ProviderDto>
}
