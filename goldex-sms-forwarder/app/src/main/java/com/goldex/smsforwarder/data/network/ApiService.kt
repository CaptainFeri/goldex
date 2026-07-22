package com.goldex.smsforwarder.data.network

import com.goldex.smsforwarder.data.model.SmsData
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Url

interface ApiService {
    @POST
    suspend fun forwardSms(@Url url: String, @Body smsData: SmsData): Response<Unit>
}
