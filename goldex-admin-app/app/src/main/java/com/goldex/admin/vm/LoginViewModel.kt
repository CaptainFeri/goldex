package com.goldex.admin.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.goldex.admin.data.AdminRepository
import com.goldex.admin.data.ApiError
import com.goldex.admin.data.SessionStore
import com.goldex.admin.otp.OtpBus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Signing in, which is two steps: a password, then a code texted to the admin.
 *
 * The code is texted to this handset — that is the whole reason the app is on
 * it — so it is filled in from the same reader that serves provider activation,
 * and the operator normally only types the password.
 */
class LoginViewModel(
    private val repo: AdminRepository,
    private val store: SessionStore,
) : ViewModel() {

    enum class Step { CREDENTIALS, CODE }

    data class State(
        val step: Step = Step.CREDENTIALS,
        val baseUrl: String = "",
        val phone: String = "",
        val password: String = "",
        val code: String = "",
        val busy: Boolean = false,
        val error: String? = null,
        val notice: String? = null,
        /** True when the token will be stored unencrypted, which an operator should know. */
        val storageUnencrypted: Boolean = false,
    )

    private val _state = MutableStateFlow(
        State(
            baseUrl = store.baseUrl,
            phone = store.adminPhone.orEmpty(),
            storageUnencrypted = !store.encrypted,
        ),
    )
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        // A code that arrives while the code step is open is almost certainly
        // this login's. Filling it in is a convenience, not an action: it is
        // still the operator who submits it.
        viewModelScope.launch {
            OtpBus.latest.collect { captured ->
                val current = _state.value
                if (captured != null && current.step == Step.CODE && current.code.isBlank()) {
                    _state.value = current.copy(code = captured.code)
                }
            }
        }
    }

    fun onBaseUrl(value: String) = update { it.copy(baseUrl = value, error = null) }
    fun onPhone(value: String) = update { it.copy(phone = value.filter(Char::isDigit), error = null) }
    fun onPassword(value: String) = update { it.copy(password = value, error = null) }
    fun onCode(value: String) = update { it.copy(code = value.filter(Char::isDigit).take(5), error = null) }

    fun back() = update { it.copy(step = Step.CREDENTIALS, code = "", error = null, notice = null) }

    fun requestCode() {
        val s = _state.value
        if (!PHONE.matches(s.phone)) return fail("شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.")
        if (s.password.length < 6) return fail("رمز عبور حداقل ۶ نویسه است.")

        // Saved before the call: a wrong address is the most common failure
        // here, and the operator should not have to retype it to try again.
        store.baseUrl = s.baseUrl

        run(onFail = { _state.value = _state.value.copy(error = it) }) {
            repo.requestLoginOtp(s.phone, s.password)
            store.adminPhone = s.phone
            _state.value = _state.value.copy(
                step = Step.CODE,
                busy = false,
                notice = "کد ورود به ${s.phone} پیامک شد.",
            )
        }
    }

    fun submitCode(onSignedIn: () -> Unit) {
        val s = _state.value
        if (s.code.length != 5) return fail("کد ورود ۵ رقمی است.")
        run(onFail = { _state.value = _state.value.copy(error = it) }) {
            repo.completeLogin(s.phone, s.code)
            OtpBus.consume(s.code)
            _state.value = _state.value.copy(busy = false, password = "", code = "")
            onSignedIn()
        }
    }

    private fun fail(message: String) {
        _state.value = _state.value.copy(error = message)
    }

    private fun run(onFail: (String) -> Unit, block: suspend () -> Unit) {
        _state.value = _state.value.copy(busy = true, error = null, notice = null)
        viewModelScope.launch {
            try {
                block()
            } catch (e: Throwable) {
                _state.value = _state.value.copy(busy = false)
                onFail(ApiError.describe(e))
            }
        }
    }

    private fun update(block: (State) -> State) {
        _state.value = block(_state.value)
    }

    private companion object {
        val PHONE = Regex("^09[0-9]{9}$")
    }
}
