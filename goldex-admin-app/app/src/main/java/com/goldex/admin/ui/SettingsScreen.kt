package com.goldex.admin.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import android.net.Uri
import android.os.PowerManager
import com.goldex.admin.autologin.AutoLoginService
import com.goldex.admin.autologin.AutoLoginStatus
import com.goldex.admin.data.SessionStore

/**
 * Where the app is pointed, what it is allowed to read, and signing out.
 *
 * The two readers are shown as what they are — granted or not, with the way to
 * grant them — because an operator whose codes are not filling themselves in
 * needs to see which of the two is missing, not be told to check their settings.
 */
@Composable
fun SettingsScreen(store: SessionStore, onSignOut: () -> Unit) {
    val context = LocalContext.current
    var baseUrl by remember { mutableStateOf(store.baseUrl) }
    var saved by remember { mutableStateOf(false) }
    var deviceToken by remember { mutableStateOf(store.deviceToken.orEmpty()) }
    var enrolled by remember { mutableStateOf(store.isEnrolled) }
    var autoLogin by remember { mutableStateOf(store.autoLoginEnabled) }
    var batteryExempt by remember { mutableStateOf(isBatteryExempt(context)) }
    val autoStatus by AutoLoginStatus.state.collectAsStateWithLifecycle()

    // Both grants are made outside this screen — one in a system dialog, one in
    // a settings app — so they are re-read every time the screen comes back
    // rather than when it was first drawn.
    var smsGranted by remember { mutableStateOf(hasSmsPermission(context)) }
    var listenerGranted by remember {
        mutableStateOf(com.goldex.admin.otp.OtpNotificationListener.isEnabled(context))
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                smsGranted = hasSmsPermission(context)
                listenerGranted = com.goldex.admin.otp.OtpNotificationListener.isEnabled(context)
                batteryExempt = isBatteryExempt(context)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val askSms = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> smsGranted = granted }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            SectionCard(title = "سرور") {
                OutlinedTextField(
                    value = baseUrl,
                    onValueChange = { baseUrl = it; saved = false },
                    label = { Text("آدرس سرور") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Button(
                    onClick = { store.baseUrl = baseUrl; baseUrl = store.baseUrl; saved = true },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("ذخیره") }
                if (saved) {
                    Spacer(Modifier.height(8.dp))
                    Text("ذخیره شد.", style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        item {
            SectionCard(title = "اعتبارنامه‌ی این دستگاه") {
                Text(
                    "بدون این، اپ فقط وقتی کار می‌کند که کسی وارد شده باشد. با آن، این گوشی " +
                        "با اعتبارنامه‌ی محدود خودش کار می‌کند — بدون دسترسی ادمین و قابل ابطال " +
                        "از پنل.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(10.dp))
                if (enrolled) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Pill("ثبت‌شده", Color(0xFF6FBF8B))
                        Spacer(Modifier.weight(1f))
                        OutlinedButton(onClick = {
                            store.forgetDevice()
                            deviceToken = ""
                            enrolled = false
                        }) { Text("حذف اعتبارنامه") }
                    }
                    Spacer(Modifier.height(8.dp))
                    // Removing it here does not withdraw the trust; only the
                    // panel can do that, and saying so is the difference
                    // between a revoked credential and one merely forgotten.
                    Text(
                        "حذف از این گوشی، اعتبارنامه را باطل نمی‌کند. ابطال باید از پنل انجام شود.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    OutlinedTextField(
                        value = deviceToken,
                        onValueChange = { deviceToken = it },
                        label = { Text("توکن دستگاه") },
                        supportingText = {
                            Text("از پنل مدیریت › تأمین‌کنندگان › دستگاه‌های ورود خودکار")
                        },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = {
                            store.deviceToken = deviceToken
                            enrolled = store.isEnrolled
                        },
                        enabled = deviceToken.trim().startsWith("gxd_"),
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("ثبت دستگاه") }
                }
            }
        }

        item {
            SectionCard(title = "خواندن کد فعال‌سازی") {
                PermissionRow(
                    label = "خواندن پیامک",
                    description = "کد را مستقیم از پیامک دریافتی می‌خواند.",
                    granted = smsGranted,
                    onGrant = { askSms.launch(Manifest.permission.RECEIVE_SMS) },
                )
                Spacer(Modifier.height(10.dp))
                PermissionRow(
                    label = "دسترسی به اعلان‌ها",
                    description = "وقتی پیامک در اختیار برنامه قرار نگیرد، کد از اعلان خوانده می‌شود.",
                    granted = listenerGranted,
                    onGrant = {
                        context.startActivity(
                            Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS),
                        )
                    },
                )
                if (!smsGranted && !listenerGranted) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "بدون هیچ‌کدام از این دو، کد باید دستی وارد شود و برای پنل هم ارسال نمی‌شود.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }

        item {
            SectionCard(title = "ورود خودکار") {
                Text(
                    "وقتی نشست یک تأمین‌کننده منقضی شود، این گوشی خودش وارد می‌شود: کد را " +
                        "می‌خواهد، از پیامک می‌خواند و ورود را کامل می‌کند. سقف تلاش و فاصله‌ی " +
                        "بین تلاش‌ها را سرور تعیین می‌کند، نه این گوشی.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("فعال باشد", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            if (autoStatus.running) "سرویس در حال اجراست" else "سرویس متوقف است",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(
                        checked = autoLogin,
                        // Without a credential there is nothing to act with, and
                        // an operator flipping a switch that cannot do anything
                        // learns nothing from it.
                        enabled = enrolled,
                        onCheckedChange = { on ->
                            autoLogin = on
                            store.autoLoginEnabled = on
                            if (on) AutoLoginService.start(context) else AutoLoginService.stop(context)
                        },
                    )
                }

                if (!enrolled) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "ابتدا اعتبارنامه‌ی دستگاه را ثبت کنید.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                if (autoLogin) {
                    Spacer(Modifier.height(12.dp))
                    KeyValue("آخرین نتیجه", autoStatus.lastOutcome)
                    KeyValue("ورود موفق", autoStatus.activations.toString())
                    KeyValue("تلاش ناموفق", autoStatus.failures.toString())

                    /*
                     * Without this exemption Android will eventually stop the
                     * service on most handsets, and it stops it silently — the
                     * operator sees an app that says it is enabled and a
                     * provider that stays down.
                     */
                    if (!batteryExempt) {
                        Spacer(Modifier.height(12.dp))
                        Text(
                            "برای اینکه سیستم این سرویس را نخواباند، بهینه‌سازی باتری باید برای " +
                                "این برنامه خاموش شود.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = { requestBatteryExemption(context) },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("خاموش کردن بهینه‌سازی باتری") }
                    }
                }
            }
        }

        item {
            SectionCard(title = "حساب") {
                KeyValue("شماره", store.adminPhone ?: "—")
                KeyValue("نقش", store.adminRole ?: "—")
                KeyValue(
                    "ذخیره‌سازی توکن",
                    if (store.encrypted) "رمزنگاری‌شده" else "بدون رمزنگاری (کلیدساز در دسترس نیست)",
                )
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) {
                    Text("خروج از حساب")
                }
            }
        }
    }
}

@Composable
private fun PermissionRow(
    label: String,
    description: String,
    granted: Boolean,
    onGrant: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(
                description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (granted) {
            Pill("فعال", Color(0xFF6FBF8B))
        } else {
            OutlinedButton(onClick = onGrant) { Text("فعال‌سازی") }
        }
    }
}

private fun hasSmsPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) ==
        PackageManager.PERMISSION_GRANTED

private fun isBatteryExempt(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
    return power.isIgnoringBatteryOptimizations(context.packageName)
}

/**
 * Asks the system to stop putting this app to sleep.
 *
 * Some builds refuse the direct request, so a failure falls back to the
 * settings screen rather than doing nothing visible.
 */
private fun requestBatteryExemption(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val direct = Intent(
        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:" + context.packageName),
    )
    try {
        context.startActivity(direct)
    } catch (e: Exception) {
        context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }
}
