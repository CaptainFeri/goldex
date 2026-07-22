package com.goldex.smsforwarder.data.model

import com.google.gson.annotations.SerializedName

data class SmsData(
    val sender: String,
    val message: String,
    val timestamp: Long,
    @SerializedName("keyword_matched")
    val keywordMatched: String
)
