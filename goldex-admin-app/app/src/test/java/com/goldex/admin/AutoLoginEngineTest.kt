package com.goldex.admin

import com.goldex.admin.autologin.AutoLoginEngine
import com.goldex.admin.autologin.AutoLoginGateway
import com.goldex.admin.autologin.AutoLoginOutcome
import com.goldex.admin.autologin.CodeSource
import com.goldex.admin.data.LoginCandidate
import com.goldex.admin.data.LoginLease
import com.goldex.admin.otp.CapturedOtp
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Logging a provider back in with nobody holding the phone.
 *
 * Every branch in here is a way to spend somebody else's SMS quota wrongly, so
 * what these mostly check is that a failed attempt gives the provider back and
 * that nothing asks for a code it has no use for.
 */
class AutoLoginEngineTest {

    private fun candidate(
        key: String = "zaryar",
        eligible: Boolean = true,
        reason: String? = null,
        id: String? = "p-1",
        phone: String? = "09123456789",
    ) = LoginCandidate(
        id = id,
        key = key,
        persianName = null,
        phone = phone,
        status = "auth_expired",
        eligible = eligible,
        reason = reason,
        attempts = 0,
        cooldownUntil = null,
        leasedBy = null,
    )

    /** Records what was asked of the server, which is the thing that costs. */
    private class FakeGateway(
        var candidates: List<LoginCandidate> = emptyList(),
        var lease: LoginLease = LoginLease("later", "09123456789"),
        var failOn: String? = null,
    ) : AutoLoginGateway {
        val calls = mutableListOf<String>()
        var releasedWith: String? = null
        var releasedReason: String? = null

        private fun maybeFail(step: String) {
            calls += step
            if (failOn == step) throw IllegalStateException("$step refused")
        }

        override suspend fun candidates(): List<LoginCandidate> {
            maybeFail("candidates")
            return candidates
        }

        override suspend fun claim(providerId: String): LoginLease {
            maybeFail("claim")
            return lease
        }

        override suspend fun sendOtp(providerId: String, phone: String) = maybeFail("sendOtp")

        override suspend fun verifyOtp(providerId: String, code: String) = maybeFail("verifyOtp")

        override suspend fun release(providerId: String, outcome: String, reason: String?) {
            releasedWith = outcome
            releasedReason = reason
            maybeFail("release")
        }
    }

    private class FakeCodes(private val code: String?, private val at: Long = 0) : CodeSource {
        var askedSince: Long = -1
        override suspend fun awaitCode(since: Long, timeoutMs: Long): CapturedOtp? {
            askedSince = since
            return code?.let { CapturedOtp(it, "کد ورود: $it", CapturedOtp.Source.SMS, at) }
        }
    }

    private fun engine(gateway: FakeGateway, codes: FakeCodes, now: Long = 1_000L) =
        AutoLoginEngine(gateway, codes, now = { now })

    @Test
    fun `does nothing when no provider needs a login`() = runBlocking {
        val gateway = FakeGateway(candidates = emptyList())
        assertEquals(AutoLoginOutcome.Idle, engine(gateway, FakeCodes("48213")).runOnce())
        // Nothing was claimed and no code was asked for.
        assertEquals(listOf("candidates"), gateway.calls)
    }

    @Test
    fun `logs a waiting provider back in`() = runBlocking {
        val gateway = FakeGateway(candidates = listOf(candidate()))
        val outcome = engine(gateway, FakeCodes("48213")).runOnce()

        assertEquals(AutoLoginOutcome.Activated("zaryar"), outcome)
        assertEquals(listOf("candidates", "claim", "sendOtp", "verifyOtp"), gateway.calls)
    }

    /**
     * The server releases the claim as part of a successful verify. Releasing
     * again would fail against a claim that no longer exists, and would count a
     * failure against a login that worked.
     */
    @Test
    fun `does not release again after a successful verify`() = runBlocking {
        val gateway = FakeGateway(candidates = listOf(candidate()))
        engine(gateway, FakeCodes("48213")).runOnce()
        assertEquals(null, gateway.releasedWith)
    }

    @Test
    fun `leaves a provider alone while the server says it is not eligible`() = runBlocking {
        val gateway = FakeGateway(
            candidates = listOf(candidate(eligible = false, reason = "Waiting until 14:20")),
        )
        val outcome = engine(gateway, FakeCodes("48213")).runOnce()

        assertTrue(outcome is AutoLoginOutcome.Held)
        assertEquals("Waiting until 14:20", (outcome as AutoLoginOutcome.Held).reason)
        // The important part: no claim, and above all no code requested.
        assertEquals(listOf("candidates"), gateway.calls)
    }

    @Test
    fun `takes the first eligible provider and leaves the rest for the next pass`() = runBlocking {
        // One handset, one message at a time: two activations at once would put
        // two codes on this phone seconds apart with no way to tell them apart.
        val gateway = FakeGateway(
            candidates = listOf(
                candidate(key = "held", eligible = false, reason = "cooldown"),
                candidate(key = "talaab", id = "p-2"),
            ),
        )
        val outcome = engine(gateway, FakeCodes("48213")).runOnce()

        assertEquals(AutoLoginOutcome.Activated("talaab"), outcome)
        assertEquals(1, gateway.calls.count { it == "sendOtp" })
    }

    @Test
    fun `gives the provider back when no code arrives`() = runBlocking {
        val gateway = FakeGateway(candidates = listOf(candidate()))
        val outcome = engine(gateway, FakeCodes(null)).runOnce()

        assertTrue(outcome is AutoLoginOutcome.Failed)
        assertEquals("no code arrived", (outcome as AutoLoginOutcome.Failed).reason)
        assertEquals("failure", gateway.releasedWith)
    }

    @Test
    fun `gives the provider back when the code is refused`() = runBlocking {
        val gateway = FakeGateway(candidates = listOf(candidate()), failOn = "verifyOtp")
        val outcome = engine(gateway, FakeCodes("48213")).runOnce()

        assertTrue(outcome is AutoLoginOutcome.Failed)
        assertEquals("failure", gateway.releasedWith)
    }

    @Test
    fun `gives the provider back when it refuses to send a code`() = runBlocking {
        val gateway = FakeGateway(candidates = listOf(candidate()), failOn = "sendOtp")
        val outcome = engine(gateway, FakeCodes("48213")).runOnce()

        assertTrue(outcome is AutoLoginOutcome.Failed)
        assertEquals("failure", gateway.releasedWith)
    }

    /**
     * Losing the race for a claim is ordinary, not an error: another device got
     * there first and it is now that device's problem.
     */
    @Test
    fun `stands down when another device claimed it first`() = runBlocking {
        val gateway = FakeGateway(candidates = listOf(candidate()), failOn = "claim")
        val outcome = engine(gateway, FakeCodes("48213")).runOnce()

        assertTrue(outcome is AutoLoginOutcome.Held)
        assertTrue(gateway.calls.none { it == "sendOtp" })
    }

    @Test
    fun `reports the server being unreachable without touching anything`() = runBlocking {
        val gateway = FakeGateway(failOn = "candidates")
        val outcome = engine(gateway, FakeCodes("48213")).runOnce()

        assertTrue(outcome is AutoLoginOutcome.Unreachable)
        assertEquals(listOf("candidates"), gateway.calls)
    }

    @Test
    fun `will not ask for a code it has no number to receive`() = runBlocking {
        val gateway = FakeGateway(
            candidates = listOf(candidate(phone = null)),
            lease = LoginLease("later", null),
        )
        val outcome = engine(gateway, FakeCodes("48213")).runOnce()

        assertTrue(outcome is AutoLoginOutcome.Failed)
        assertTrue(gateway.calls.none { it == "sendOtp" })
        assertEquals("failure", gateway.releasedWith)
    }

    /**
     * The window starts before the request is sent. On a fast network the
     * message can arrive while the response is still in flight, and a code that
     * landed "before" the attempt began would be thrown away as stale.
     */
    @Test
    fun `accepts a code that arrives while the request is still in flight`() = runBlocking {
        val gateway = FakeGateway(candidates = listOf(candidate()))
        val codes = FakeCodes("48213")
        engine(gateway, codes, now = 5_000L).runOnce()
        assertEquals(5_000L, codes.askedSince)
    }

    /**
     * A failure to hand the claim back must not replace the reason the attempt
     * failed. The claim expires on its own three minutes later, which is a
     * smaller problem than losing the diagnosis.
     */
    @Test
    fun `keeps the real failure when giving the provider back also fails`() = runBlocking {
        val gateway = FakeGateway(candidates = listOf(candidate()), failOn = "release")
        val outcome = engine(gateway, FakeCodes(null)).runOnce()

        assertTrue(outcome is AutoLoginOutcome.Failed)
        assertEquals("no code arrived", (outcome as AutoLoginOutcome.Failed).reason)
    }

    /**
     * The record of an unattended failure is the only account anyone will have
     * of it, so the handset says what went wrong in its own words rather than
     * leaving the server to guess from an outcome flag.
     */
    @Test
    fun `says why it failed when giving the provider back`() = runBlocking {
        val gateway = FakeGateway(candidates = listOf(candidate()))
        engine(gateway, FakeCodes(null)).runOnce()
        assertEquals("no code arrived", gateway.releasedReason)
    }

    @Test
    fun `carries the provider's own words when the code is refused`() = runBlocking {
        val gateway = FakeGateway(candidates = listOf(candidate()), failOn = "verifyOtp")
        engine(gateway, FakeCodes("48213")).runOnce()
        assertEquals("verifyOtp refused", gateway.releasedReason)
    }
}
