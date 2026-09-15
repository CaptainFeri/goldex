package com.goldex.admin.otp

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.goldex.admin.Goldex
import com.goldex.admin.data.ApiError
import retrofit2.HttpException
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Getting the code to the backend, with nobody holding the phone.
 *
 * The point of the app on the operator's desk is that activation can be driven
 * from the panel across town: the code lands here and has to be there seconds
 * later. That cannot depend on a screen being open, so it runs as work rather
 * than in a view model, and survives the app being closed or the process being
 * killed between the message arriving and the network coming back.
 */
class OtpRelayWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val code = inputData.getString(KEY_CODE) ?: return Result.success()
        val message = inputData.getString(KEY_MESSAGE)
        val store = Goldex.session(applicationContext)

        val repo = Goldex.repository(applicationContext)
        // Either credential will do. The handset's own is the one that makes
        // this work at three in the morning with nobody signed in; an admin
        // session is the fallback for a phone nobody has enrolled yet.
        if (!store.isEnrolled && store.token.value.isNullOrBlank()) {
            return skip("this handset is not enrolled and nobody is signed in")
        }

        /*
         * Whose code this is. Normally this app asked for it and knows. When
         * the activation was started at the panel instead, it does not — the
         * message names no provider — so the backend is asked what it is
         * waiting for.
         *
         * A null answer ends it here: nothing is expecting a code, so this is
         * one of the ordinary messages that arrive on any phone, and it does
         * not leave the handset.
         */
        val providerKey = store.pendingProviderKey ?: try {
            repo.awaitingProviderKey()
        } catch (e: IOException) {
            return if (runAttemptCount < MAX_ATTEMPTS) Result.retry() else Result.failure()
        } catch (e: Exception) {
            Log.w(TAG, "could not ask what is awaiting a code", e)
            return Result.failure()
        } ?: return skip("no activation is awaiting a code")

        return try {
            repo.relayOtp(providerKey, code, message)
            Log.i(TAG, "relayed a code for $providerKey")
            Result.success()
        } catch (e: IOException) {
            // The box is unreachable right now. The code is good for a few
            // minutes, which is what the backoff below is sized against.
            if (runAttemptCount < MAX_ATTEMPTS) Result.retry() else Result.failure()
        } catch (e: HttpException) {
            // The backend refused it — a stale token, a provider it does not
            // know. Retrying would refuse it again.
            Log.w(TAG, "relay refused: ${ApiError.describe(e)}")
            Result.failure()
        } catch (e: Exception) {
            Log.w(TAG, "relay failed", e)
            Result.failure()
        }
    }

    private fun skip(why: String): Result {
        Log.d(TAG, "not relaying: $why")
        return Result.success()
    }

    companion object {
        private const val TAG = "OtpRelay"
        private const val KEY_CODE = "code"
        private const val KEY_MESSAGE = "message"
        private const val MAX_ATTEMPTS = 4

        fun enqueue(context: Context, code: String, message: String?) {
            val request = OneTimeWorkRequestBuilder<OtpRelayWorker>()
                .setInputData(
                    Data.Builder()
                        .putString(KEY_CODE, code)
                        .putString(KEY_MESSAGE, message)
                        .build(),
                )
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.LINEAR, 10, TimeUnit.SECONDS)
                .build()

            // One relay at a time, newest wins: a code that never got through
            // is worthless the moment a newer one arrives, so a pending attempt
            // is replaced rather than queued behind.
            WorkManager.getInstance(context)
                .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request)
        }

        private const val WORK_NAME = "otp-relay"
    }
}
