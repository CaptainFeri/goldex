package com.goldex.admin

import com.goldex.admin.autologin.AutoLoginEngine
import com.goldex.admin.autologin.AutoLoginGateway
import com.goldex.admin.autologin.AutoLoginOutcome
import com.goldex.admin.autologin.OtpBusCodeSource
import com.goldex.admin.data.LoginCandidate
import com.goldex.admin.data.LoginLease
import com.goldex.admin.otp.CapturedOtp
import com.goldex.admin.otp.OtpBus
import com.goldex.admin.otp.OtpExtractor
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The seam between reading a message and acting on it.
 *
 * The engine's own tests hand it a code directly, and the extractor's tests
 * never see the engine. What neither covers is the path between them, which is
 * where the rule that matters unattended actually lives: a number the message
 * did not call a code must not reach the provider, and a code from an earlier
 * attempt must not answer this one.
 */
class CodeToEngineTest {

    @Before
    fun clearBus() {
        // The bus is a singleton, as it is in the app: one handset, one inbox.
        OtpBus.consume(OtpBus.latest.value?.code ?: "")
    }

    private class RecordingGateway : AutoLoginGateway {
        var verifiedWith: String? = null
        var released: String? = null

        override suspend fun candidates() = listOf(
            LoginCandidate(
                id = "p-1",
                key = "zaryar",
                persianName = null,
                phone = "09123456789",
                status = "auth_expired",
                eligible = true,
                reason = null,
                attempts = 0,
                cooldownUntil = null,
                leasedBy = null,
            ),
        )

        override suspend fun claim(providerId: String) = LoginLease("later", "09123456789")
        override suspend fun sendOtp(providerId: String, phone: String) = Unit
        override suspend fun verifyOtp(providerId: String, code: String) {
            verifiedWith = code
        }

        override suspend fun release(providerId: String, outcome: String, reason: String?) {
            released = reason
        }
    }

    /** Puts a message through the same reading the app does, then onto the bus. */
    private fun receive(message: String) {
        val code = OtpExtractor.extract(message) ?: return
        OtpBus.publish(
            CapturedOtp(
                code = code,
                message = message,
                source = CapturedOtp.Source.SMS,
                labelled = OtpExtractor.extract(message, requireLabel = true) == code,
            ),
        )
    }

    private fun engine(gateway: AutoLoginGateway) =
        AutoLoginEngine(gateway, OtpBusCodeSource(), codeTimeoutMs = 500)

    @Test
    fun `a code the message announces reaches the provider`() = runBlocking {
        val gateway = RecordingGateway()
        val run = async { engine(gateway).runOnce() }

        delay(50)
        receive("کد ورود شما به زریار: 48213")

        assertEquals(AutoLoginOutcome.Activated("zaryar"), run.await())
        assertEquals("48213", gateway.verifiedWith)
    }

    /**
     * The rule the whole unattended mode rests on. With nobody watching, a
     * number lifted out of a delivery notification would be sent to the
     * provider and spend the attempt.
     */
    @Test
    fun `a number the message never called a code does not`() = runBlocking {
        val gateway = RecordingGateway()
        val run = async { engine(gateway).runOnce() }

        delay(50)
        receive("48213")

        val outcome = run.await()
        assertTrue(outcome is AutoLoginOutcome.Failed)
        assertEquals(null, gateway.verifiedWith)
        assertEquals("no code arrived", gateway.released)
    }

    @Test
    fun `an amount in an unrelated message does not`() = runBlocking {
        val gateway = RecordingGateway()
        val run = async { engine(gateway).runOnce() }

        delay(50)
        receive("موجودی حساب شما 8420000 ریال است")

        assertTrue(run.await() is AutoLoginOutcome.Failed)
        assertEquals(null, gateway.verifiedWith)
    }

    /**
     * A code already sitting on the bus when the attempt starts belongs to the
     * previous one — the provider's earlier message, or another service's.
     */
    @Test
    fun `a code that arrived before this attempt does not`() = runBlocking {
        receive("کد ورود شما: 11111")
        delay(20)

        val gateway = RecordingGateway()
        val outcome = engine(gateway).runOnce()

        assertTrue(outcome is AutoLoginOutcome.Failed)
        assertEquals(null, gateway.verifiedWith)
    }

    /**
     * Consumed once. A second attempt minutes later must not be answered by
     * the code the first one already spent.
     */
    @Test
    fun `a code is not used twice`() = runBlocking {
        val first = RecordingGateway()
        val run = async { engine(first).runOnce() }
        delay(50)
        receive("کد ورود شما: 48213")
        run.await()
        assertEquals("48213", first.verifiedWith)

        val second = RecordingGateway()
        assertTrue(engine(second).runOnce() is AutoLoginOutcome.Failed)
        assertEquals(null, second.verifiedWith)
    }
}
