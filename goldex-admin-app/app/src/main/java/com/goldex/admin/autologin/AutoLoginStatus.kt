package com.goldex.admin.autologin

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * What the unattended service is doing, for whoever eventually looks.
 *
 * A handset working on its own fails silently by nature: the notification says
 * it is running, and nothing else would say what it has actually managed. This
 * is that, kept in memory — it describes the current process, and a process
 * that has restarted has nothing to report yet, which is itself worth seeing.
 */
object AutoLoginStatus {

    data class Snapshot(
        val running: Boolean = false,
        /** One line, in Persian, describing the last pass. */
        val lastOutcome: String = "هنوز اجرا نشده",
        val lastRunAt: Long? = null,
        val activations: Int = 0,
        val failures: Int = 0,
    )

    private val _state = MutableStateFlow(Snapshot())
    val state: StateFlow<Snapshot> = _state.asStateFlow()

    fun running(running: Boolean) {
        _state.value = _state.value.copy(running = running)
    }

    fun record(outcome: AutoLoginOutcome) {
        val current = _state.value
        _state.value = current.copy(
            lastOutcome = describe(outcome),
            lastRunAt = System.currentTimeMillis(),
            activations = current.activations + if (outcome is AutoLoginOutcome.Activated) 1 else 0,
            failures = current.failures + if (outcome is AutoLoginOutcome.Failed) 1 else 0,
        )
    }

    fun describe(outcome: AutoLoginOutcome): String = when (outcome) {
        is AutoLoginOutcome.Idle -> "همه تأمین‌کننده‌ها سالم‌اند"
        is AutoLoginOutcome.Held -> "«${outcome.provider}» فعلاً قابل تلاش نیست: ${outcome.reason}"
        is AutoLoginOutcome.Activated -> "«${outcome.provider}» دوباره وارد شد"
        is AutoLoginOutcome.Failed -> "ورود «${outcome.provider}» ناموفق: ${outcome.reason}"
        is AutoLoginOutcome.Unreachable -> "سرور در دسترس نیست: ${outcome.reason}"
    }
}
