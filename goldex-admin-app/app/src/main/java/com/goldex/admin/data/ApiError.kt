package com.goldex.admin.data

import com.google.gson.JsonParser
import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException

/**
 * What to show an operator when a call fails.
 *
 * The backend's error filter already answers in the admin's own language, so
 * its `message` is preferred over anything invented here. What it cannot
 * describe is the call never arriving — a wrong address, a box that is down, a
 * handset with no data — and that is the failure an operator in the field hits
 * most, so those get a message that says which of them it was.
 */
object ApiError {

    fun describe(t: Throwable): String = when (t) {
        is HttpException -> fromResponse(t)
        is SocketTimeoutException -> "سرور پاسخ نداد. اتصال یا آدرس سرور را بررسی کنید."
        is IOException -> "اتصال به سرور برقرار نشد. آدرس سرور و شبکه را بررسی کنید."
        else -> t.message ?: "خطای ناشناخته"
    }

    /** True when the session is gone and the operator has to sign in again. */
    fun isUnauthorized(t: Throwable): Boolean = t is HttpException && t.code() == 401

    private fun fromResponse(e: HttpException): String {
        val body = runCatching { e.response()?.errorBody()?.string() }.getOrNull()
        val parsed = body?.let(::messageFrom)
        if (!parsed.isNullOrBlank()) return parsed
        return when (e.code()) {
            401 -> "نشست منقضی شده است. دوباره وارد شوید."
            403 -> "این حساب اجازه‌ی این عملیات را ندارد."
            404 -> "چنین موردی روی سرور نیست."
            else -> "خطای سرور (${e.code()})"
        }
    }

    /**
     * `message` is the filter's own line. Where validation failed there is no
     * single message, only an `errors` map of field to reason, and the first of
     * those says more than "درخواست نامعتبر" would.
     */
    internal fun messageFrom(body: String): String? = runCatching {
        val root = JsonParser.parseString(body).asJsonObject
        val message = root.get("message")?.takeIf { !it.isJsonNull }?.asString
        if (!message.isNullOrBlank() && message != "BAD_REQUEST") return@runCatching message
        val errors = root.get("errors")?.takeIf { it.isJsonObject }?.asJsonObject
        val first = errors?.entrySet()?.firstOrNull()?.value
        when {
            first == null -> message
            first.isJsonArray -> first.asJsonArray.firstOrNull()?.asString ?: message
            first.isJsonPrimitive -> first.asString
            else -> message
        }
    }.getOrNull()
}
