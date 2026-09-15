package com.goldex.admin.otp

/**
 * A code read off this handset.
 *
 * `message` is kept beside the code because the reader can be wrong: a message
 * that quoted both a code and an order number gives the operator something to
 * check the filled-in field against, rather than a bare five digits to trust.
 */
data class CapturedOtp(
    val code: String,
    val message: String,
    val source: Source,
    val at: Long = System.currentTimeMillis(),
) {
    enum class Source { SMS, NOTIFICATION }
}
