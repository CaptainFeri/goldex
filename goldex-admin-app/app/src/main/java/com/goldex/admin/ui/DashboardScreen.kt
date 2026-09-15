package com.goldex.admin.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.goldex.admin.data.DashboardKpi
import com.goldex.admin.data.DashboardSeries
import com.goldex.admin.vm.DashboardViewModel

/**
 * The system at a glance.
 *
 * The cards are the filter: whichever is selected decides what the chart, the
 * split, the health strip and the feed below are about. That is how the backend
 * models the dashboard, and following it means this screen adds no view of the
 * platform that the panel does not also have.
 */
@Composable
fun DashboardScreen(vm: DashboardViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()

    if (state.loadingCards && state.cards.isEmpty()) {
        Loading()
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        state.error?.let { error ->
            item {
                Text(
                    error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }

        item {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                state.cards.forEach { card ->
                    KpiCard(
                        card = card,
                        selected = card.metric == state.selected,
                        onClick = { vm.select(card.metric) },
                    )
                }
            }
        }

        val card = state.selectedCard
        if (card != null && card.filters.isNotEmpty()) {
            item {
                Column {
                    Text(
                        card.filterLabel ?: "فیلتر",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(6.dp))
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FilterChip("همه", state.filter == null) { vm.filterBy(null) }
                        card.filters.forEach { option ->
                            FilterChip(option.label, state.filter == option.value) {
                                vm.filterBy(option.value)
                            }
                        }
                    }
                }
            }
        }

        item {
            val series = state.series
            SectionCard(
                title = series?.let { "روند ${it.year}" } ?: "روند سالانه",
                trailing = { if (state.loadingDetail) Loading(Modifier.width(48.dp)) },
            ) {
                if (series == null || series.points.isEmpty()) {
                    EmptyNote("داده‌ای برای نمایش نیست.")
                } else {
                    SeriesChart(series)
                }
            }
        }

        item {
            val distribution = state.distribution
            SectionCard(title = distribution?.title ?: "سهم‌ها") {
                if (distribution == null || distribution.slices.isEmpty()) {
                    EmptyNote("داده‌ای برای نمایش نیست.")
                } else {
                    distribution.slices.forEach { slice ->
                        PercentRow(
                            label = slice.label,
                            value = "${format(slice.percent)}٪",
                            percent = slice.percent,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }

        item {
            val health = state.health
            SectionCard(title = health?.title ?: "سلامت") {
                if (health == null) {
                    EmptyNote("داده‌ای برای نمایش نیست.")
                } else {
                    Text(
                        "بازه: ${health.windowDays} روز گذشته",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    health.rows.forEach { row ->
                        PercentRow(
                            label = "${row.label} (${row.count})",
                            value = "${format(row.percent)}٪",
                            percent = row.percent,
                            color = severityColor(row.variant),
                        )
                    }
                    if (health.measures.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        health.measures.forEach { stat ->
                            KeyValue(
                                stat.label,
                                listOfNotNull(stat.value, stat.unit).joinToString(" "),
                            )
                        }
                    }
                }
            }
        }

        item { Text("رویدادهای اخیر", style = MaterialTheme.typography.titleMedium) }

        if (state.activity.isEmpty()) {
            item { EmptyNote("رویدادی ثبت نشده است.") }
        } else {
            items(state.activity, key = { it.id }) { event ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 6.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(
                        Modifier
                            .padding(top = 6.dp)
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(severityColor(event.severity)),
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(event.title, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            event.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        state.generatedAt?.let {
            item {
                Text(
                    "به‌روزرسانی: $it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    AssistChip(
        onClick = onClick,
        label = { Text(label) },
        colors = AssistChipDefaults.assistChipColors(
            containerColor = if (selected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                Color.Transparent
            },
            labelColor = if (selected) {
                MaterialTheme.colorScheme.onPrimaryContainer
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
        ),
    )
}

@Composable
private fun KpiCard(card: DashboardKpi, selected: Boolean, onClick: () -> Unit) {
    Card(
        modifier = Modifier.width(200.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surface
            },
        ),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(
                card.label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            val headline = card.stats.firstOrNull()
            Text(
                headline?.value ?: "—",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            headline?.unit?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            card.deltaPercent?.let { delta ->
                Spacer(Modifier.height(6.dp))
                val rising = delta >= 0
                Pill(
                    text = (if (rising) "▲ " else "▼ ") + "${format(kotlin.math.abs(delta))}٪",
                    color = if (rising) Color(0xFF6FBF8B) else MaterialTheme.colorScheme.error,
                )
            }
            card.stats.drop(1).take(2).forEach { stat ->
                Spacer(Modifier.height(4.dp))
                KeyValue(stat.label, stat.value)
            }
        }
    }
}

/**
 * The year as twelve pairs of bars.
 *
 * A charting library for one chart is a dependency with an upgrade treadmill
 * attached; twelve months of two values is a row of rectangles. Both series are
 * scaled against the same maximum, because two axes on one chart is how a
 * smaller series is made to look like a larger one.
 */
@Composable
private fun SeriesChart(series: DashboardSeries) {
    val values = series.points.flatMap {
        listOf(it.primary.toDoubleOrNull() ?: 0.0, it.secondary.toDoubleOrNull() ?: 0.0)
    }
    val max = values.maxOrNull() ?: 0.0

    Column {
        Row(
            Modifier.fillMaxWidth().height(140.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            series.points.forEach { point ->
                Column(
                    Modifier.weight(1f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Bottom,
                ) {
                    Row(
                        Modifier.height(110.dp),
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        Bar(point.primary.toDoubleOrNull() ?: 0.0, max, MaterialTheme.colorScheme.primary)
                        Bar(point.secondary.toDoubleOrNull() ?: 0.0, max, MaterialTheme.colorScheme.secondary)
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(point.label, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Legend(series.primaryLabel, MaterialTheme.colorScheme.primary)
            Legend(series.secondaryLabel, MaterialTheme.colorScheme.secondary)
            series.unit?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun Bar(value: Double, max: Double, color: Color) {
    // A month with no activity draws as a sliver rather than nothing, so an
    // empty month still reads as a month.
    val fraction = if (max <= 0.0) 0f else (value / max).coerceIn(0.0, 1.0).toFloat()
    Box(
        Modifier
            .width(6.dp)
            .height((4 + 106 * fraction).dp)
            .clip(RoundedCornerShape(3.dp))
            .background(color),
    )
}

@Composable
private fun Legend(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(5.dp))
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun format(value: Double): String =
    if (value % 1.0 == 0.0) value.toInt().toString() else String.format("%.1f", value)
