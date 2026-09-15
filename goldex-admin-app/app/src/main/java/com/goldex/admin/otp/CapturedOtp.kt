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
    /**
     * Whether the message said this number was a code, rather than the reader
     * concluding it from there being only one number in it.
     *
     * With an operator at the screen the weaker reading is worth showing —
     * they can check it against the message displayed beside it. Unattended
     * there is nobody to check, so only this kind is acted on.
     */
    val labelled: Boolean = false,
) {
    enum class Source { SMS, NOTIFICATION }
}
