package com.goldex.admin.autologin

import com.goldex.admin.data.LoginCandidate
import com.goldex.admin.data.LoginLease
import com.goldex.admin.otp.CapturedOtp

/**
 * What the engine needs from the server, and nothing about how it gets there.
 *
 * Retrofit, the device credential and the base URL are all on the other side
 * of this. What is left is the sequence itself, which is the part worth being
 * able to test: every branch here is a way to spend somebody's SMS quota
 * wrongly, and none of them are reachable in a unit test through a real HTTP
 * client.
 */
interface AutoLoginGateway {
    suspend fun candidates(): List<LoginCandidate>
    suspend fun claim(providerId: String): LoginLease
    suspend fun sendOtp(providerId: String, phone: String)
    suspend fun verifyOtp(providerId: String, code: String)
    suspend fun release(providerId: String, outcome: String)
}

/** Where a code read off this handset comes from. */
interface CodeSource {
    /**
     * @param since ignore anything captured before this instant — a code from
     *   the previous attempt is not an answer to this one.
     * @return the code, or null if none arrived in time.
     */
    suspend fun awaitCode(since: Long, timeoutMs: Long): CapturedOtp?
}

/** What one pass of the engine did, in a form a notification can show. */
sealed interface AutoLoginOutcome {
    /** Nothing was waiting for a login. */
    data object Idle : AutoLoginOutcome

    /** Something was waiting, but nothing may act on it yet. */
    data class Held(val provider: String, val reason: String) : AutoLoginOutcome

    data class Activated(val provider: String) : AutoLoginOutcome

    data class Failed(val provider: String, val reason: String) : AutoLoginOutcome

    /** The server could not be reached or refused the whole exchange. */
    data class Unreachable(val reason: String) : AutoLoginOutcome
}

/**
 * Logging one provider back in, unattended.
 *
 * One provider per pass, deliberately. Two activations at once would have two
 * codes arriving on one handset within seconds of each other and no way to
 * tell which belongs to which — and the cost of being wrong is that both are
 * spent. Providers that are also waiting are picked up on the next pass, which
 * is seconds away.
 *
 * Nothing here decides how often it may run or when to give up on a provider.
 * Those limits are the server's, because a handset that reboots forgets and two
 * handsets never knew about each other; this asks and obeys.
 */
class AutoLoginEngine(
    private val gateway: AutoLoginGateway,
    private val codes: CodeSource,
    private val now: () -> Long = System::currentTimeMillis,
    private val codeTimeoutMs: Long = DEFAULT_CODE_TIMEOUT_MS,
    private val onEvent: (String) -> Unit = {},
) {

    suspend fun runOnce(): AutoLoginOutcome {
        val candidates = try {
            gateway.candidates()
        } catch (e: Exception) {
            return AutoLoginOutcome.Unreachable(e.message ?: "could not ask what needs a login")
        }
        if (candidates.isEmpty()) return AutoLoginOutcome.Idle

        val target = candidates.firstOrNull { it.eligible && it.id != null }
            ?: return candidates.first().let {
                // Not an error: a provider in a cooldown, or one another device
                // is already trying, is a provider being dealt with.
                AutoLoginOutcome.Held(it.label, it.reason ?: "not eligible yet")
            }

        return attempt(target)
    }

    private suspend fun attempt(target: LoginCandidate): AutoLoginOutcome {
        val id = target.id ?: return AutoLoginOutcome.Failed(target.label, "provider has no id")

        val lease: LoginLease = try {
            gateway.claim(id)
        } catch (e: Exception) {
            // Losing the race for a claim is ordinary. Another device got there
            // first, and it is now that device's problem.
            return AutoLoginOutcome.Held(target.label, e.message ?: "could not claim it")
        }

        val phone = lease.phone ?: target.phone
        if (phone.isNullOrBlank()) {
            gateway.releaseQuietly(id, "failure")
            return AutoLoginOutcome.Failed(target.label, "no phone number to send a code to")
        }

        // Read before the request, not after: on a fast network the message can
        // arrive while the response is still in flight, and a code that landed
        // "before" the attempt started would then be ignored as stale.
        val askedAt = now()
        try {
            gateway.sendOtp(id, phone)
        } catch (e: Exception) {
            gateway.releaseQuietly(id, "failure")
            return AutoLoginOutcome.Failed(target.label, e.message ?: "the provider refused to send a code")
        }
        onEvent("asked ${target.label} for a code")

        val captured = codes.awaitCode(askedAt, codeTimeoutMs)
        if (captured == null) {
            // The message never came, or came without saying it was a code.
            // Either way this attempt is over; the backoff the server set when
            // it granted the claim decides when another may start.
            gateway.releaseQuietly(id, "failure")
            return AutoLoginOutcome.Failed(target.label, "no code arrived")
        }

        return try {
            gateway.verifyOtp(id, captured.code)
            // The server releases the claim as part of a successful verify, so
            // releasing again here would fail on a claim that no longer exists.
            onEvent("logged ${target.label} back in")
            AutoLoginOutcome.Activated(target.label)
        } catch (e: Exception) {
            gateway.releaseQuietly(id, "failure")
            AutoLoginOutcome.Failed(target.label, e.message ?: "the code was refused")
        }
    }

    /**
     * Giving the claim back must not replace the failure that caused it.
     *
     * If the release itself fails the provider stays claimed for the three
     * minutes of its lease and then frees itself, which is a smaller problem
     * than losing the reason the attempt failed.
     */
    private suspend fun AutoLoginGateway.releaseQuietly(id: String, outcome: String) {
        try {
            release(id, outcome)
        } catch (e: Exception) {
            onEvent("could not release $id: ${e.message}")
        }
    }

    private val LoginCandidate.label: String
        get() = persianName?.takeIf { it.isNotBlank() } ?: key

    companion object {
        /**
         * How long to wait for the message.
         *
         * Iranian gateways deliver in seconds; two minutes is the point past
         * which the code is more likely lost than late, and it leaves a minute
         * of the three-minute claim to give it back in.
         */
        const val DEFAULT_CODE_TIMEOUT_MS = 120_000L
    }
}
