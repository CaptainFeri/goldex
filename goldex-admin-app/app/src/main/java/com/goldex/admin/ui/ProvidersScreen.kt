package com.goldex.admin.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.goldex.admin.data.Provider
import com.goldex.admin.vm.ProvidersViewModel

/**
 * Which providers are on, and turning on the ones that are not.
 *
 * A provider is the platform's source of prices: one that is off is a price the
 * desk cannot quote, so what this list has to say first is which are off. They
 * sort to the top for that reason, and the activation sheet opens from the row
 * rather than from a screen behind it.
 */
@Composable
fun ProvidersScreen(vm: ProvidersViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()

    if (state.loading && state.providers.isEmpty()) {
        Loading()
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${state.activeCount} از ${state.providers.size} تأمین‌کننده فعال است",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { vm.refresh() }, enabled = !state.refreshing) {
                    Text(if (state.refreshing) "در حال به‌روزرسانی…" else "به‌روزرسانی")
                }
            }
        }

        // Whether the engine has a proxy at all decides whether a provider's
        // "use proxy" setting means anything, and an operator activating a
        // provider that needs one should know before, not after.
        state.proxyConfigured?.let { configured ->
            if (!configured) {
                item {
                    Text(
                        "موتور قیمت‌گذاری پروکسی خروجی ندارد؛ تأمین‌کننده‌هایی که به آن نیاز دارند" +
                            " فعال نخواهند شد.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }

        item {
            OutlinedTextField(
                value = state.query,
                onValueChange = vm::onQuery,
                label = { Text("جستجو") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        state.error?.let {
            item { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
        }
        state.message?.let {
            item { Text(it, style = MaterialTheme.typography.bodySmall) }
        }

        if (state.visible.isEmpty()) {
            item { EmptyNote("تأمین‌کننده‌ای یافت نشد.") }
        } else {
            items(state.visible, key = { it.key }) { provider ->
                ProviderRow(
                    provider = provider,
                    onOpen = { vm.openActivation(provider) },
                    onToggle = { vm.toggle(provider) },
                )
            }
        }

        item { Spacer(Modifier.height(48.dp)) }
    }

    state.activating?.let { provider ->
        ActivationSheet(
            provider = provider,
            state = state.activation,
            vm = vm,
            onDismiss = vm::closeActivation,
        )
    }
}

@Composable
private fun ProviderRow(provider: Provider, onOpen: () -> Unit, onToggle: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(
            Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StatusDot(active = provider.active)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(provider.displayName, style = MaterialTheme.typography.titleMedium)
                Text(
                    provider.key + (provider.category?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Pill(
                        text = if (provider.active) "فعال" else "غیرفعال",
                        color = if (provider.active) Color(0xFF6FBF8B) else MaterialTheme.colorScheme.outline,
                    )
                    provider.status?.takeIf { it.isNotBlank() }?.let {
                        Pill(text = it, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (provider.useProxy) {
                        Pill(text = "پروکسی", color = MaterialTheme.colorScheme.primary)
                    }
                    if (provider.id == null) {
                        Pill(text = "ثبت‌نشده", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
            Switch(
                checked = provider.active,
                onCheckedChange = { onToggle() },
                // Nothing here can address a provider the mirror has no id for.
                enabled = provider.id != null,
            )
        }
    }
}
