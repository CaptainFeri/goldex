package com.goldex.admin.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.goldex.admin.vm.LoginViewModel

/**
 * Two steps, one screen.
 *
 * The old app had no sign-in at all: it held the address of a service and wrote
 * to it. This one carries an admin token, so it asks for the password and the
 * code the same way the panel does, and the server address is on the first step
 * because a wrong one is indistinguishable from a wrong password until it is
 * visible.
 */
@Composable
fun LoginScreen(vm: LoginViewModel, onSignedIn: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()

    Box(Modifier.fillMaxSize().imePadding()) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(24.dp))
            Icon(
                Icons.Filled.Lock,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(44.dp),
            )
            Spacer(Modifier.height(12.dp))
            Text("کنسول مدیریت گلدکس", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(6.dp))
            Text(
                if (state.step == LoginViewModel.Step.CREDENTIALS) {
                    "با همان حساب پنل مدیریت وارد شوید."
                } else {
                    "کد ۵ رقمی ارسال‌شده را وارد کنید."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(28.dp))

            when (state.step) {
                LoginViewModel.Step.CREDENTIALS -> {
                    OutlinedTextField(
                        value = state.baseUrl,
                        onValueChange = vm::onBaseUrl,
                        label = { Text("آدرس سرور") },
                        supportingText = { Text("مثال: http://192.168.1.10:3000") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = state.phone,
                        onValueChange = vm::onPhone,
                        label = { Text("شماره موبایل") },
                        placeholder = { Text("09123456789") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = state.password,
                        onValueChange = vm::onPassword,
                        label = { Text("رمز عبور") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(20.dp))
                    Button(
                        onClick = vm::requestCode,
                        enabled = !state.busy,
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                    ) {
                        if (state.busy) {
                            CircularProgressIndicator(
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(18.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        } else {
                            Text("دریافت کد ورود")
                        }
                    }
                }

                LoginViewModel.Step.CODE -> {
                    OutlinedTextField(
                        value = state.code,
                        onValueChange = vm::onCode,
                        label = { Text("کد ورود") },
                        supportingText = {
                            Text("اگر دسترسی خواندن پیامک داده باشید، کد خودکار پر می‌شود.")
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(20.dp))
                    Button(
                        onClick = { vm.submitCode(onSignedIn) },
                        enabled = !state.busy,
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                    ) {
                        if (state.busy) {
                            CircularProgressIndicator(
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(18.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        } else {
                            Text("ورود")
                        }
                    }
                    TextButton(onClick = vm::back, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Filled.ArrowForward, contentDescription = null)
                        Spacer(Modifier.size(6.dp))
                        Text("تغییر شماره یا آدرس سرور")
                    }
                }
            }

            state.notice?.let {
                Spacer(Modifier.height(14.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
            }
            state.error?.let {
                Spacer(Modifier.height(14.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }
            if (state.storageUnencrypted) {
                Spacer(Modifier.height(20.dp))
                Text(
                    "هشدار: این دستگاه امکان ذخیره‌سازی رمزنگاری‌شده ندارد و توکن به صورت عادی " +
                        "نگهداری می‌شود.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(Modifier.height(24.dp))
        }
        Column(
            Modifier.align(Alignment.BottomCenter).padding(16.dp),
            verticalArrangement = Arrangement.Bottom,
        ) {
            Text(
                "گلدکس — کنسول مدیریت تأمین‌کنندگان",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
