package com.goldex.smsforwarder.data.model

import com.google.gson.annotations.SerializedName

data class ProviderDto(
    val id: String = "",
    val key: String = "",
    val category: String = "",
    val baseUrl: String? = null,
    val apiBaseUrl: String? = null,
    val phone: String? = null,
    val persianName: String? = null,
    val webPanelUrl: String? = null,
    val sendOtpUrl: String? = null,
    val verifyCodeUrl: String? = null,
    val active: Boolean = false,
    val createdAt: String? = null,
    val updatedAt: String? = null
)
