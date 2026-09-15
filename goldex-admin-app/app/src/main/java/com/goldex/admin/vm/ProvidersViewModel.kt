package com.goldex.admin.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.goldex.admin.data.AdminRepository
import com.goldex.admin.data.ApiError
import com.goldex.admin.data.Provider
import com.goldex.admin.otp.CapturedOtp
import com.goldex.admin.otp.OtpBus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * The provider console: what is running, and turning on what is not.
 *
 * Activation has two routes because providers differ. Most will text a code to
 * the number registered with them, which is this handset — that path is
 * one tap, the code fills itself in, and the same code is forwarded so whoever
 * is at the panel can finish there instead. A provider whose login this app
 * cannot drive is activated by pasting the session captured from its own web
 * panel, which is the same thing the panel's browser does.
 */
class ProvidersViewModel(private val repo: AdminRepository) : ViewModel() {

    data class State(
        val providers: List<Provider> = emptyList(),
        val query: String = "",
        val loading: Boolean = true,
        val refreshing: Boolean = false,
        val error: String? = null,
        val message: String? = null,
        val proxyConfigured: Boolean? = null,
        /** The provider whose activation sheet is open. */
        val activating: Provider? = null,
        val activation: Activation = Activation(),
    ) {
        val visible: List<Provider>
            get() = if (query.isBlank()) providers else providers.filter {
                it.key.contains(query, ignoreCase = true) ||
                    it.displayName.contains(query, ignoreCase = true)
            }

        val activeCount: Int get() = providers.count { it.active }
    }

    data class Activation(
        val phone: String = "",
        val code: String = "",
        val token: String = "",
        val busy: Boolean = false,
        val codeSent: Boolean = false,
        val error: String? = null,
        val message: String? = null,
        /** Where a filled-in code came from, so the operator can judge it. */
        val captured: CapturedOtp? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        refresh(initial = true)
        viewModelScope.launch {
            OtpBus.latest.collect { captured ->
                val s = _state.value
                val sheet = s.activation
                // Only while a code was actually asked for: any other message on
                // this handset that happens to carry digits is not an answer to
                // a request nobody made.
                if (captured != null && s.activating != null && sheet.codeSent && sheet.code.isBlank()) {
                    _state.value = s.copy(
                        activation = sheet.copy(code = captured.code, captured = captured),
                    )
                }
            }
        }
    }

    fun onQuery(value: String) = update { it.copy(query = value) }

    fun dismissMessage() = update { it.copy(message = null, error = null) }

    fun refresh(initial: Boolean = false) {
        _state.value = _state.value.copy(
            loading = initial,
            refreshing = !initial,
            error = null,
        )
        viewModelScope.launch {
            try {
                val providers = repo.providers().sortedWith(
                    // What needs attention first: everything off, then the rest
                    // alphabetically, so the list does not reorder under a
                    // thumb each time a status changes.
                    compareBy({ it.active }, { it.displayName }),
                )
                val proxy = runCatching { repo.proxyConfigured() }.getOrNull()
                _state.value = _state.value.copy(
                    providers = providers,
                    proxyConfigured = proxy,
                    loading = false,
                    refreshing = false,
                    activating = _state.value.activating?.let { open ->
                        providers.firstOrNull { it.key == open.key } ?: open
                    },
                )
            } catch (e: Throwable) {
                _state.value = _state.value.copy(
                    loading = false,
                    refreshing = false,
                    error = ApiError.describe(e),
                )
            }
        }
    }

    // ── the activation sheet ──────────────────────────────────────────────────

    fun openActivation(provider: Provider) = update {
        it.copy(
            activating = provider,
            activation = Activation(phone = provider.phone.orEmpty()),
        )
    }

    fun closeActivation() = update { it.copy(activating = null, activation = Activation()) }

    fun onActivationPhone(value: String) = onSheet { it.copy(phone = value.filter(Char::isDigit), error = null) }
    fun onActivationCode(value: String) = onSheet { it.copy(code = value.filter(Char::isDigit).take(8), error = null) }
    fun onActivationToken(value: String) = onSheet { it.copy(token = value, error = null) }

    /** Ask the provider to text a code to the number registered with it. */
    fun sendCode() {
        val provider = _state.value.activating ?: return
        val phone = _state.value.activation.phone
        if (phone.isBlank()) return sheetError("شماره‌ای که نزد تأمین‌کننده ثبت شده را وارد کنید.")
        sheetRun {
            val ack = repo.sendProviderOtp(provider, phone)
            onSheet {
                it.copy(
                    busy = false,
                    codeSent = true,
                    code = "",
                    captured = null,
                    message = ack ?: "درخواست کد ارسال شد. پیامک تا لحظاتی دیگر می‌رسد.",
                )
            }
        }
    }

    fun verifyCode() {
        val provider = _state.value.activating ?: return
        val code = _state.value.activation.code
        if (code.length < 4) return sheetError("کد دریافتی را کامل وارد کنید.")
        sheetRun {
            val ack = repo.verifyProviderOtp(provider, code)
            OtpBus.consume(code)
            finish(ack ?: "«${provider.displayName}» فعال شد.")
        }
    }

    /**
     * Activate from a session captured by hand.
     *
     * Providers keep differently-shaped sessions — a token alone, or a token
     * with an id and a shop id beside it — so what is pasted is taken as the
     * whole session rather than picked apart here. The engine is the side that
     * has to use it and is the side that validates it.
     */
    fun submitToken() {
        val provider = _state.value.activating ?: return
        val raw = _state.value.activation.token.trim()
        if (raw.isBlank()) return sheetError("توکن یا خروجی JSON نشست را وارد کنید.")
        val auth = parseAuth(raw) ?: return sheetError("قالب واردشده خوانده نشد. توکن یا یک JSON معتبر وارد کنید.")
        val token = auth["token"]?.toString().orEmpty()
        if (token.isBlank()) return sheetError("این نشست فیلد token ندارد.")
        sheetRun {
            val ack = repo.setProviderAuth(provider, auth)
            finish(ack ?: "نشست «${provider.displayName}» ثبت شد.")
        }
    }

    fun toggle(provider: Provider) {
        viewModelScope.launch {
            try {
                val ack = repo.toggleProvider(provider)
                _state.value = _state.value.copy(message = ack ?: "وضعیت «${provider.displayName}» تغییر کرد.")
                refresh()
            } catch (e: Throwable) {
                _state.value = _state.value.copy(error = ApiError.describe(e))
            }
        }
    }

    /**
     * A session as the operator has it in front of them.
     *
     * The panel's browser hands back a JSON object; a provider's own site more
     * often shows a bare token in its storage. Both are pasted into the same
     * box, so both are accepted.
     */
    private fun parseAuth(raw: String): Map<String, Any?>? {
        if (!raw.startsWith("{")) return mapOf("token" to raw)
        return runCatching {
            val json = JSONObject(raw)
            json.keys().asSequence().associateWith { key ->
                if (json.isNull(key)) null else json.get(key)
            }
        }.getOrNull()
    }

    private suspend fun finish(message: String) {
        _state.value = _state.value.copy(
            activating = null,
            activation = Activation(),
            message = message,
        )
        refreshNow()
    }

    private suspend fun refreshNow() {
        runCatching { repo.providers() }.onSuccess { providers ->
            _state.value = _state.value.copy(
                providers = providers.sortedWith(compareBy({ it.active }, { it.displayName })),
            )
        }
    }

    private fun sheetError(message: String) = onSheet { it.copy(busy = false, error = message) }

    private fun sheetRun(block: suspend () -> Unit) {
        onSheet { it.copy(busy = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                block()
            } catch (e: Throwable) {
                sheetError(ApiError.describe(e))
            }
        }
    }

    private fun onSheet(block: (Activation) -> Activation) = update {
        it.copy(activation = block(it.activation))
    }

    private fun update(block: (State) -> State) {
        _state.value = block(_state.value)
    }
}
