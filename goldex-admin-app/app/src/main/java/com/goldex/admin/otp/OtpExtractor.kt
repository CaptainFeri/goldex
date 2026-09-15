package com.goldex.admin.otp

/**
 * Reading the activation code out of a text message.
 *
 * The old forwarder took the first run of four to six digits it saw, which is
 * wrong often enough to matter: a transaction alert quotes an amount, a balance
 * message quotes a card's last digits, and a code sent a minute later is then
 * rejected because the wrong number was already spent against it. Providers
 * here are Iranian, so messages are Persian, sometimes with Persian-Indic
 * digits, and frequently carry both a code and an amount.
 *
 * So candidates are scored rather than taken: a number introduced by a word
 * meaning "code" wins, a number that is money or a phone number is discarded,
 * and a message that names no code at all yields one only when there is a
 * single candidate to be wrong about.
 */
object OtpExtractor {

    /** What a code is introduced by. */
    private val CODE_WORDS = listOf(
        "کد", "رمز", "کدتایید", "کد تایید", "کد تأیید", "کد ورود", "کد فعال",
        "یکبار مصرف", "یک‌بار مصرف", "یکبارمصرف", "احراز",
        "code", "otp", "pin", "verification", "verify", "password", "passcode",
    )

    /** What a number is, when it is not a code. */
    private val MONEY_WORDS = listOf(
        "ریال", "تومان", "مبلغ", "موجودی", "بدهی", "بستانکار", "واریز", "برداشت",
        "کارت", "حساب", "شبا", "پیگیری", "rial", "toman", "amount", "balance",
    )

    private val DIGIT_RUN = Regex("(?<![0-9])[0-9]{4,8}(?![0-9])")

    /**
     * The code in this message, or null when nothing in it is one.
     *
     * @param text the message body, as received.
     */
    fun extract(text: String?): String? {
        if (text.isNullOrBlank()) return null
        val normalized = normalizeDigits(text)
        val lower = normalized.lowercase()

        val candidates = DIGIT_RUN.findAll(normalized)
            .map { it.value to it.range.first }
            .filterNot { (value, at) -> isMoney(normalized, lower, value, at) }
            .toList()
        if (candidates.isEmpty()) return null

        val labelled = candidates
            .map { (value, at) -> Triple(value, labelScore(lower, value, at), shapeScore(value)) }
            .filter { it.second > 0 }
            .sortedWith(compareByDescending<Triple<String, Int, Int>> { it.second }.thenByDescending { it.third })

        labelled.firstOrNull()?.let { return it.first }

        // Nothing in the message says "code". Returning a number anyway is a
        // guess; it is only a safe one when the message holds exactly one — a
        // bare code is a real message shape, choosing between two is not.
        return candidates.singleOrNull()?.first
    }

    /**
     * Persian and Arabic-Indic digits are digits.
     *
     * Iranian gateways send either, and some send both in one message — the
     * code in ASCII and the date in Persian. Everything downstream works on
     * ASCII, and the code is posted to the backend as ASCII, so this is the
     * first thing done to any message.
     */
    fun normalizeDigits(text: String): String {
        val out = StringBuilder(text.length)
        for (ch in text) {
            out.append(
                when (ch) {
                    in '۰'..'۹' -> '0' + (ch - '۰') // Persian
                    in '٠'..'٩' -> '0' + (ch - '٠') // Arabic-Indic
                    else -> ch
                },
            )
        }
        return out.toString()
    }

    /**
     * How strongly the message says this number is a code.
     *
     * Zero means it does not say so at all, which is decided separately from
     * how code-shaped the number looks: a five-digit number in a message about
     * something else is still a number in a message about something else.
     */
    private fun labelScore(lower: String, value: String, at: Int): Int {
        val before = lower.substring(maxOf(0, at - NEAR), at)
        val after = lower.substring(
            minOf(lower.length, at + value.length),
            minOf(lower.length, at + value.length + NEAR),
        )

        // A code word before the number is how a code is announced; one after
        // it ("۴۸۲۱۳ کد ورود شماست") says the same thing in the other order,
        // but less certainly.
        return when {
            CODE_WORDS.any { before.contains(it) } -> 2
            CODE_WORDS.any { after.contains(it) } -> 1
            else -> 0
        }
    }

    /**
     * How code-shaped the number is, used only to choose between numbers the
     * message labels equally.
     *
     * Five digits is what this platform sends, and four to six is what gateways
     * send generally. Seven or eight is more often an order or account number
     * that survived the money filter.
     */
    private fun shapeScore(value: String): Int = when (value.length) {
        5 -> 2
        4, 6 -> 1
        else -> 0
    }

    /**
     * Whether this number is an amount, a card, or otherwise not a code.
     *
     * Grouping separators are the strongest signal — no gateway groups a code —
     * and a currency word next to the number is the next strongest.
     */
    private fun isMoney(text: String, lower: String, value: String, at: Int): Boolean {
        val charBefore = text.getOrNull(at - 1)
        val charAfter = text.getOrNull(at + value.length)
        if (charBefore in GROUPING || charAfter in GROUPING) return true

        val before = lower.substring(maxOf(0, at - NEAR), at)
        val after = lower.substring(
            minOf(lower.length, at + value.length),
            minOf(lower.length, at + value.length + NEAR),
        )
        // A currency word right after the number is what it is denominated in.
        // The same word further off is just the message's subject.
        if (MONEY_WORDS.any { after.trimStart().startsWith(it) }) return true
        return MONEY_WORDS.any { before.takeLast(CLOSE).contains(it) } &&
            CODE_WORDS.none { before.contains(it) }
    }

    /** How far from a number a word still describes it. */
    private const val NEAR = 24

    /** How close a word has to be to claim the number outright. */
    private const val CLOSE = 8

    /**
     * A full stop is not one of these: a code at the end of a sentence is
     * followed by one, and treating that as grouping would discard every
     * message that ends politely.
     */
    private val GROUPING = setOf(',', '\u066C')
}
