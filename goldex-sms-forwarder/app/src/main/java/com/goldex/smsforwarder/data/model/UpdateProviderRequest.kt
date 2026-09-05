package com.goldex.smsforwarder.data.model

data class UpdateProviderRequest(
    val auth: Map<String, String> = emptyMap(),
    val active: Boolean = true
)
