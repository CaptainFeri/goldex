package com.goldex.smsforwarder.ui

import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.goldex.smsforwarder.R
import com.goldex.smsforwarder.data.model.ProviderDto
import com.google.android.material.card.MaterialCardView
import com.google.android.material.chip.Chip

class ProviderListAdapter(
    private val onProviderClick: (ProviderDto) -> Unit
) : ListAdapter<ProviderDto, ProviderListAdapter.ViewHolder>(DiffCallback) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val card = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_provider_card, parent, false) as MaterialCardView
        return ViewHolder(card)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position), onProviderClick)
    }

    class ViewHolder(private val card: MaterialCardView) : RecyclerView.ViewHolder(card) {
        private val context = card.context

        fun bind(provider: ProviderDto, onClick: (ProviderDto) -> Unit) {
            card.findViewById<TextView>(R.id.providerKey).text = provider.key
            card.findViewById<Chip>(R.id.categoryChip).apply {
                text = provider.category.replaceFirstChar { it.uppercase() }
                setChipBackgroundColorResource(
                    if (provider.category == "zaryar") R.color.md_theme_primary_container
                    else R.color.md_theme_secondary_container
                )
            }
            card.findViewById<TextView>(R.id.providerPhone).text =
                provider.phone ?: "No phone"

            val activeIcon = card.findViewById<TextView>(R.id.activeIndicator)
            val activeText = card.findViewById<TextView>(R.id.activeText)
            if (provider.active) {
                activeIcon.setText(R.string.active_icon)
                activeIcon.setTextColor(ContextCompat.getColor(context, R.color.active_green))
                activeText.text = "Active"
                activeText.setTextColor(ContextCompat.getColor(context, R.color.active_green))
            } else {
                activeIcon.setText(R.string.inactive_icon)
                activeIcon.setTextColor(ContextCompat.getColor(context, R.color.inactive_gray))
                activeText.text = "Inactive"
                activeText.setTextColor(ContextCompat.getColor(context, R.color.inactive_gray))
            }

            card.setOnClickListener { onClick(provider) }
        }
    }

    object DiffCallback : DiffUtil.ItemCallback<ProviderDto>() {
        override fun areItemsTheSame(old: ProviderDto, new: ProviderDto): Boolean =
            old.id == new.id

        override fun areContentsTheSame(old: ProviderDto, new: ProviderDto): Boolean =
            old == new
    }
}
