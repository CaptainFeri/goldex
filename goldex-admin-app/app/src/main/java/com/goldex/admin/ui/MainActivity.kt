package com.goldex.admin.ui

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.runtime.CompositionLocalProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.goldex.admin.Goldex
import com.goldex.admin.autologin.AutoLoginService
import com.goldex.admin.ui.theme.GoldexAdminTheme
import com.goldex.admin.vm.DashboardViewModel
import com.goldex.admin.vm.LoginViewModel
import com.goldex.admin.vm.ProvidersViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            GoldexAdminTheme {
                // The whole app is Persian, so it is laid out right-to-left
                // regardless of the handset's own locale — an operator's phone
                // is as often English as not.
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.background,
                    ) {
                        App()
                    }
                }
            }
        }
    }
}

private enum class Tab(val label: String, val icon: ImageVector) {
    DASHBOARD("داشبورد", Icons.Filled.Dashboard),
    PROVIDERS("تأمین‌کنندگان", Icons.Filled.Storage),
    SETTINGS("تنظیمات", Icons.Filled.Settings),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun App() {
    val context = LocalContext.current
    val store = remember { Goldex.session(context) }
    val repo = remember { Goldex.repository(context) }
    val token by store.token.collectAsStateWithLifecycle()

    // Asked for once, on the way in: the app posts nothing itself, but the
    // reader that catches codes from notifications is refused on Android 13+
    // unless notifications are allowed at all.
    val askPost = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            askPost.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        // The service does not survive the process being killed, and the boot
        // receiver only fires on a reboot. Opening the app is the third way a
        // handset that is supposed to be working gets back to working.
        if (store.autoLoginEnabled && store.isEnrolled) {
            AutoLoginService.start(context)
        }
    }

    if (token.isNullOrBlank()) {
        val vm: LoginViewModel = viewModel(factory = factory { LoginViewModel(repo, store) })
        // Nothing to do on success: the token is state, and this screen is what
        // is shown while there is not one.
        LoginScreen(vm = vm, onSignedIn = {})
        return
    }

    var tab by remember { mutableStateOf(Tab.PROVIDERS) }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(tab.label) })
        },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { entry ->
                    NavigationBarItem(
                        selected = tab == entry,
                        onClick = { tab = entry },
                        icon = { Icon(entry.icon, contentDescription = entry.label) },
                        label = { Text(entry.label) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (tab) {
                Tab.DASHBOARD -> {
                    val vm: DashboardViewModel = viewModel(factory = factory { DashboardViewModel(repo) })
                    DashboardScreen(vm)
                }

                Tab.PROVIDERS -> {
                    val vm: ProvidersViewModel = viewModel(factory = factory { ProvidersViewModel(repo) })
                    ProvidersScreen(vm)
                }

                Tab.SETTINGS -> SettingsScreen(store = store, onSignOut = { repo.signOut() })
            }
        }
    }
}

/**
 * The app has three view models and one dependency between them; a factory
 * written out once is less machinery than a framework to avoid writing it.
 */
private fun <T : ViewModel> factory(build: () -> T) = object : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <V : ViewModel> create(modelClass: Class<V>): V = build() as V
}
