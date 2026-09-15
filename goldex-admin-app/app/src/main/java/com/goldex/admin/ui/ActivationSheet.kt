package com.goldex.admin.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.goldex.admin.data.Provider
import com.goldex.admin.otp.CapturedOtp
import com.goldex.admin.vm.ProvidersViewModel

/**
 * Activating one provider, by whichever of the two routes it supports.
 *
 * The code route is the one this app exists for: the provider texts the number
 * registered with it, that SIM is in this handset, and the code fills itself in
 * — and is forwarded to the backend at the same time, so an operator at the
 * panel across town can finish there instead. The session route is for
 * providers whose login this app cannot drive, and takes whatever the panel's
 * browser or the site's own storage gave the operator.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivationSheet(
    provider: Provider,
    state: ProvidersViewModel.Activation,
    vm: ProvidersViewModel,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    // A provider that has no OTP endpoints configured cannot be activated that
    // way at all, so the sheet opens on the route that will work.
    var tab by remember(provider.key) { mutableIntStateOf(if (provider.canActivateByOtp) 0 else 1) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            Text(provider.displayName, style = MaterialTheme.typography.headlineSmall)
            Text(
                provider.key,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))

            provider.webPanelUrl?.takeIf { it.isNotBlank() }?.let {
                KeyValue("پنل تأمین‌کننده", it)
            }
            provider.apiBaseUrl?.takeIf { it.isNotBlank() }?.let { KeyValue("آدرس API", it) }
            KeyValue("عبور از پروکسی", if (provider.useProxy) "بله" else "خیر")

            Spacer(Modifier.height(14.dp))
            TabRow(selectedTabIndex = tab) {
                Tab(
                    selected = tab == 0,
                    onClick = { tab = 0 },
                    enabled = provider.canActivateByOtp,
                    text = { Text("کد پیامکی") },
                )
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("نشست دستی") })
            }
            Spacer(Modifier.height(16.dp))

            when (tab) {
                0 -> OtpRoute(provider, state, vm)
                else -> TokenRoute(state, vm)
            }

            state.message?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, style = MaterialTheme.typography.bodySmall)
            }
            state.error?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun OtpRoute(
    provider: Provider,
    state: ProvidersViewModel.Activation,
    vm: ProvidersViewModel,
) {
    if (!provider.canActivateByOtp) {
        EmptyNote("برای این تأمین‌کننده آدرس ارسال یا تأیید کد تعریف نشده است.")
        return
    }

    OutlinedTextField(
        value = state.phone,
        onValueChange = vm::onActivationPhone,
        label = { Text("شماره ثبت‌شده نزد تأمین‌کننده") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(10.dp))
    OutlinedButton(
        onClick = vm::sendCode,
        enabled = !state.busy,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(if (state.codeSent) "ارسال دوباره‌ی کد" else "ارسال کد")
    }

    Spacer(Modifier.height(14.dp))
    OutlinedTextField(
        value = state.code,
        onValueChange = vm::onActivationCode,
        label = { Text("کد دریافتی") },
        supportingText = {
            Text(
                when (state.captured?.source) {
                    CapturedOtp.Source.SMS -> "از پیامک دریافتی این گوشی خوانده شد."
                    CapturedOtp.Source.NOTIFICATION -> "از اعلان این گوشی خوانده شد."
                    null -> "پس از رسیدن پیامک، کد خودکار پر می‌شود."
                },
            )
        },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.fillMaxWidth(),
    )

    // The reader can pick the wrong number out of a message that held two. The
    // message it read is shown so the operator can see that it did not.
    state.captured?.message?.takeIf { it.isNotBlank() }?.let {
        Spacer(Modifier.height(6.dp))
        Text(
            it,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    Spacer(Modifier.height(16.dp))
    Button(
        onClick = vm::verifyCode,
        enabled = !state.busy && state.code.isNotBlank(),
        modifier = Modifier.fillMaxWidth().height(50.dp),
    ) {
        Busy(state.busy, "تأیید و فعال‌سازی")
    }
    Spacer(Modifier.height(8.dp))
    Text(
        "کدی که به این گوشی می‌رسد به‌صورت خودکار برای پنل مدیریت هم ارسال می‌شود.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun TokenRoute(state: ProvidersViewModel.Activation, vm: ProvidersViewModel) {
    OutlinedTextField(
        value = state.token,
        onValueChange = vm::onActivationToken,
        label = { Text("توکن یا JSON نشست") },
        supportingText = {
            Text("می‌توانید فقط توکن، یا کل خروجی نشست را به شکل JSON وارد کنید.")
        },
        minLines = 4,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(16.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(
            onClick = vm::submitToken,
            enabled = !state.busy && state.token.isNotBlank(),
            modifier = Modifier.weight(1f).height(50.dp),
        ) {
            Busy(state.busy, "ثبت نشست و فعال‌سازی")
        }
    }
}

@Composable
private fun Busy(busy: Boolean, label: String) {
    if (busy) {
        CircularProgressIndicator(
            strokeWidth = 2.dp,
            modifier = Modifier.size(18.dp),
            color = MaterialTheme.colorScheme.onPrimary,
        )
    } else {
        Text(label)
    }
}
