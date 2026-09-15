package com.goldex.admin.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.goldex.admin.data.AdminRepository
import com.goldex.admin.data.ApiError
import com.goldex.admin.data.DashboardActivityItem
import com.goldex.admin.data.DashboardDistribution
import com.goldex.admin.data.DashboardHealth
import com.goldex.admin.data.DashboardKpi
import com.goldex.admin.data.DashboardSeries
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The system dashboard.
 *
 * Every panel below the cards is a function of the selected card, which is how
 * the backend models it: one parameterised set of endpoints rather than one per
 * page. Selecting a card therefore reloads the chart, the split, the health
 * strip and the feed together, and they are fetched in parallel because they
 * are four independent queries against the same selection.
 */
class DashboardViewModel(private val repo: AdminRepository) : ViewModel() {

    data class State(
        val cards: List<DashboardKpi> = emptyList(),
        val selected: String? = null,
        val filter: String? = null,
        val series: DashboardSeries? = null,
        val distribution: DashboardDistribution? = null,
        val health: DashboardHealth? = null,
        val activity: List<DashboardActivityItem> = emptyList(),
        val loadingCards: Boolean = true,
        val loadingDetail: Boolean = false,
        val generatedAt: String? = null,
        val error: String? = null,
    ) {
        val selectedCard: DashboardKpi? get() = cards.firstOrNull { it.metric == selected }
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = _state.value.copy(loadingCards = true, error = null)
        viewModelScope.launch {
            try {
                val kpis = repo.kpis()
                val selected = _state.value.selected
                    ?.takeIf { current -> kpis.cards.any { it.metric == current } }
                    ?: kpis.cards.firstOrNull()?.metric
                _state.value = _state.value.copy(
                    cards = kpis.cards,
                    generatedAt = kpis.generatedAt,
                    selected = selected,
                    loadingCards = false,
                )
                selected?.let { loadDetail(it, _state.value.filter) }
            } catch (e: Throwable) {
                _state.value = _state.value.copy(loadingCards = false, error = ApiError.describe(e))
            }
        }
    }

    fun select(metric: String) {
        if (_state.value.selected == metric) return
        // The filter belongs to the card that offered it; carrying a warehouse
        // over to the withdrawals card would ask for something that does not
        // exist there.
        _state.value = _state.value.copy(selected = metric, filter = null)
        viewModelScope.launch { loadDetail(metric, null) }
    }

    fun filterBy(value: String?) {
        val metric = _state.value.selected ?: return
        _state.value = _state.value.copy(filter = value)
        viewModelScope.launch { loadDetail(metric, value) }
    }

    /**
     * One failed panel must not blank the other three: a dashboard that shows
     * the chart and says the feed is unavailable is more use than one that
     * shows nothing because the feed timed out.
     */
    private suspend fun loadDetail(metric: String, filter: String?) {
        _state.value = _state.value.copy(loadingDetail = true, error = null)
        coroutineScope {
            val series = async { runCatching { repo.series(metric, filter) }.getOrNull() }
            val distribution = async { runCatching { repo.distribution(metric, filter) }.getOrNull() }
            val health = async { runCatching { repo.health(metric, filter) }.getOrNull() }
            val activity = async { runCatching { repo.activity(metric) }.getOrDefault(emptyList()) }

            _state.value = _state.value.copy(
                series = series.await(),
                distribution = distribution.await(),
                health = health.await(),
                activity = activity.await(),
                loadingDetail = false,
            )
        }
    }
}
