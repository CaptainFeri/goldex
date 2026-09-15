package com.goldex.admin.autologin

import com.goldex.admin.data.AdminRepository
import com.goldex.admin.data.ApiError
import com.goldex.admin.data.LoginCandidate
import com.goldex.admin.data.LoginLease

/**
 * The engine's gateway, over this handset's own credential.
 *
 * Errors are flattened to their message here rather than in the engine, so the
 * engine never has to know what an HttpException is — and so the reason a
 * provider was not logged in reads the same in a notification as it does in the
 * panel, because it is the backend's own sentence either way.
 */
class RepositoryGateway(private val repo: AdminRepository) : AutoLoginGateway {

    override suspend fun candidates(): List<LoginCandidate> = translate { repo.loginCandidates() }

    override suspend fun claim(providerId: String): LoginLease =
        translate { repo.claimLogin(providerId) }

    override suspend fun sendOtp(providerId: String, phone: String) {
        translate { repo.deviceSendOtp(providerId, phone) }
    }

    override suspend fun verifyOtp(providerId: String, code: String) {
        translate { repo.deviceVerifyOtp(providerId, code) }
    }

    override suspend fun release(providerId: String, outcome: String, reason: String?) {
        translate { repo.releaseLogin(providerId, outcome, reason) }
    }

    private suspend fun <T> translate(block: suspend () -> T): T = try {
        block()
    } catch (e: Throwable) {
        throw AutoLoginFailure(ApiError.describe(e), e)
    }
}

/** A failure already phrased for a person to read. */
class AutoLoginFailure(message: String, cause: Throwable? = null) : Exception(message, cause)
