package com.goldex.smsforwarder.data.model

import com.google.gson.annotations.SerializedName

data class ProviderAuthResult(
    val token: String = "",
    val uId: String = "",
    val sessionId: String = "",
    val shopkeeperId: String = "",
    val roleType: String = "0",
    val rawResponse: String = ""
)
