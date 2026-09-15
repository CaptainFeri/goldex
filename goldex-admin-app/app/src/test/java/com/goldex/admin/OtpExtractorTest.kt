package com.goldex.admin

import com.goldex.admin.otp.OtpExtractor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Reading the code out of a real inbox.
 *
 * Every message here is the shape an Iranian gateway actually sends. The ones
 * that must yield nothing matter more than the ones that must yield a code: a
 * missed code is a second tap, a wrong code is a spent attempt.
 */
class OtpExtractorTest {

    @Test
    fun `reads a code a message announces`() {
        assertEquals("48213", OtpExtractor.extract("کد ورود شما به زریار: 48213"))
    }

    @Test
    fun `reads Persian digits`() {
        assertEquals("48213", OtpExtractor.extract("کد تایید: ۴۸۲۱۳"))
    }

    @Test
    fun `reads Arabic-Indic digits`() {
        assertEquals("48213", OtpExtractor.extract("رمز عبور یکبار مصرف ٤٨٢١٣"))
    }

    @Test
    fun `reads an English message`() {
        assertEquals("903214", OtpExtractor.extract("Your verification code is 903214"))
    }

    @Test
    fun `takes the code and not the amount beside it`() {
        // A gateway that sends both in one message is the case the old
        // first-match reader got wrong.
        assertEquals(
            "55127",
            OtpExtractor.extract("مبلغ 4500000 ریال بلوکه شد. کد تایید برداشت: 55127"),
        )
    }

    @Test
    fun `ignores a grouped amount`() {
        assertNull(OtpExtractor.extract("واریز 12,4500 ریال به حساب شما انجام شد"))
    }

    @Test
    fun `ignores a balance message with no code in it`() {
        assertNull(OtpExtractor.extract("موجودی حساب شما 8420000 ریال است"))
    }

    @Test
    fun `ignores a message with no digits at all`() {
        assertNull(OtpExtractor.extract("سلام، حساب شما فعال شد"))
        assertNull(OtpExtractor.extract(""))
        assertNull(OtpExtractor.extract(null))
    }

    @Test
    fun `ignores numbers too short or too long to be a code`() {
        assertNull(OtpExtractor.extract("شماره 123"))
        assertNull(OtpExtractor.extract("شناسه 1234567890123"))
    }

    @Test
    fun `does not read a sender's phone number as a code`() {
        assertNull(OtpExtractor.extract("تماس با پشتیبانی: 09121234567"))
    }

    @Test
    fun `takes a lone number in an unlabelled message`() {
        // Nothing here says "code", but there is only one number to be wrong
        // about, and gateways do send bare codes.
        assertEquals("48213", OtpExtractor.extract("48213"))
    }

    @Test
    fun `refuses to guess between two unlabelled numbers`() {
        assertNull(OtpExtractor.extract("48213 91002"))
    }

    @Test
    fun `reads a code that trails its label`() {
        assertEquals("48213", OtpExtractor.extract("48213 کد ورود شماست"))
    }

    @Test
    fun `reads a code at the end of a sentence`() {
        assertEquals("48213", OtpExtractor.extract("کد تایید شما 48213."))
    }

    @Test
    fun `prefers the five-digit code this platform sends`() {
        assertEquals(
            "48213",
            OtpExtractor.extract("سفارش 8842011 ثبت شد. کد تایید 48213"),
        )
    }

    @Test
    fun `normalizes digits without touching the rest of the message`() {
        assertEquals("کد: 1234", OtpExtractor.normalizeDigits("کد: ۱۲۳۴"))
    }
}
