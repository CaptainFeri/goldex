package com.goldex.smsforwarder.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.goldex.smsforwarder.data.local.PreferencesManager
import com.goldex.smsforwarder.data.model.ProviderDto
import com.goldex.smsforwarder.data.model.ProviderType
import com.goldex.smsforwarder.data.network.RetrofitClient
import com.goldex.smsforwarder.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: PreferencesManager
    private var providerAuthController: ProviderAuthController? = null
    private var providerListAdapter: ProviderListAdapter? = null
    private var allProviders: List<ProviderDto> = emptyList()
    private val scope = CoroutineScope(Dispatchers.IO)

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            Toast.makeText(this, "Notification permission granted", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = PreferencesManager(this)

        setupListScreen()
        setupConfigScreen()
        loadPricingEngineUrl()

        requestNotificationPermission()
    }

    override fun onDestroy() {
        providerAuthController?.stop()
        super.onDestroy()
    }

    override fun onBackPressed() {
        if (binding.configScreen.visibility == View.VISIBLE) {
            if (binding.providerWebView.visibility == View.VISIBLE) {
                closeProviderPanel()
            } else {
                showListScreen()
            }
            return
        }
        super.onBackPressed()
    }

    private fun setupListScreen() {
        binding.pricingEngineUrlEditText.setText(prefs.pricingEngineUrl)

        binding.refreshProvidersButton.setOnClickListener {
            loadProviders()
        }

        binding.swipeRefresh.setOnRefreshListener {
            loadProviders()
        }

        binding.providerList.layoutManager = LinearLayoutManager(this)
        providerListAdapter = ProviderListAdapter { provider ->
            onProviderSelected(provider)
        }
        binding.providerList.adapter = providerListAdapter

        binding.topAppBar.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                com.goldex.smsforwarder.R.id.action_settings -> {
                    Toast.makeText(this, "Goldex Provider Auth v1.0", Toast.LENGTH_SHORT).show()
                    true
                }
                else -> false
            }
        }

        if (prefs.pricingEngineUrl.isNotBlank()) {
            loadProviders()
        }
    }

    private fun setupConfigScreen() {
        binding.configToolbar.setNavigationOnClickListener {
            if (binding.providerWebView.visibility == View.VISIBLE) {
                closeProviderPanel()
            } else {
                showListScreen()
            }
        }

        binding.providerTypeRadioGroup.setOnCheckedChangeListener { _, checkedId ->
            val type = if (checkedId == binding.providerTypeTalaab.id) {
                ProviderType.TALAAB
            } else {
                ProviderType.ZARYAR
            }
            prefs.providerType = type.name
        }

        binding.launchPanelButton.setOnClickListener { launchProviderPanel() }
    }

    private fun loadPricingEngineUrl() {
        val url = prefs.pricingEngineUrl
        if (url.isNotBlank()) {
            binding.pricingEngineUrlEditText.setText(url)
        }
    }

    private fun loadProviders() {
        val engineUrl = binding.pricingEngineUrlEditText.text.toString().trim()
        if (engineUrl.isBlank()) {
            Toast.makeText(this, "Please enter the Pricing Engine URL", Toast.LENGTH_SHORT).show()
            return
        }

        prefs.pricingEngineUrl = engineUrl
        showLoading(true)

        scope.launch {
            try {
                val api = RetrofitClient.pricingEngineApi(engineUrl)
                val response = api.listProviders()
                withContext(Dispatchers.Main) {
                    showLoading(false)
                    binding.swipeRefresh.isRefreshing = false
                    if (response.isSuccessful) {
                        allProviders = response.body() ?: emptyList()
                        providerListAdapter?.submitList(allProviders)
                        binding.providerList.visibility = View.VISIBLE
                        binding.emptyListText.visibility =
                            if (allProviders.isEmpty()) View.VISIBLE else View.GONE
                    } else {
                        showError("Error ${response.code()}: ${response.message()}")
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showLoading(false)
                    binding.swipeRefresh.isRefreshing = false
                    showError("Connection failed: ${e.message}")
                }
            }
        }
    }

    private fun onProviderSelected(provider: ProviderDto) {
        binding.configToolbar.title = provider.key

        binding.phoneEditText.setText(provider.phone ?: "")
        binding.providerNameEditText.setText(provider.key)
        binding.loginUrlEditText.setText(provider.apiBaseUrl ?: provider.baseUrl ?: "")
        binding.backendUrlEditText.setText(prefs.backendUrl)

        val type = if (provider.category == "talaab") ProviderType.TALAAB else ProviderType.ZARYAR
        when (type) {
            ProviderType.ZARYAR -> binding.providerTypeZaryar.isChecked = true
            ProviderType.TALAAB -> binding.providerTypeTalaab.isChecked = true
        }
        prefs.providerType = type.name

        binding.authStatusLog.text = "Ready"
        showConfigScreen()
    }

    private fun launchProviderPanel() {
        val phone = binding.phoneEditText.text.toString().trim()
        val providerName = binding.providerNameEditText.text.toString().trim()
        val loginUrl = binding.loginUrlEditText.text.toString().trim()
        val backendUrl = binding.backendUrlEditText.text.toString().trim()

        if (phone.isBlank()) {
            Toast.makeText(this, "Please enter a phone number", Toast.LENGTH_SHORT).show()
            return
        }
        if (loginUrl.isBlank()) {
            Toast.makeText(this, "Please enter the provider panel URL", Toast.LENGTH_SHORT).show()
            return
        }

        val type = if (binding.providerTypeZaryar.isChecked) ProviderType.ZARYAR else ProviderType.TALAAB
        val engineUrl = prefs.pricingEngineUrl

        val selectedProviderId = allProviders.firstOrNull {
            it.key == providerName || it.phone == phone
        }?.id ?: ""

        binding.configFormContainer.visibility = View.GONE
        binding.providerWebView.visibility = View.VISIBLE

        providerAuthController?.stop()
        providerAuthController = ProviderAuthController(
            context = this,
            webView = binding.providerWebView,
            statusLog = binding.authStatusLog
        )
        providerAuthController!!.start(
            providerType = type,
            providerName = providerName,
            loginUrl = loginUrl,
            phone = phone,
            backendUrl = backendUrl,
            providerId = selectedProviderId,
            engineUrl = engineUrl
        )

        Toast.makeText(
            this,
            "Notification: enable access in Settings → Notification access",
            Toast.LENGTH_LONG
        ).show()
        updateStatus("Panel launched — complete login in the WebView")
    }

    private fun closeProviderPanel() {
        providerAuthController?.stop()
        providerAuthController = null
        binding.providerWebView.visibility = View.GONE
        binding.configFormContainer.visibility = View.VISIBLE
        binding.launchPanelButton.text = "Launch Provider Panel"
    }

    private fun showListScreen() {
        binding.configScreen.visibility = View.GONE
        binding.providerListScreen.visibility = View.VISIBLE
    }

    private fun showConfigScreen() {
        binding.providerListScreen.visibility = View.GONE
        binding.configScreen.visibility = View.VISIBLE
    }

    private fun updateStatus(message: String) {
        binding.authStatusLog.text = message
    }

    private fun showLoading(loading: Boolean) {
        binding.loadingIndicator.visibility = if (loading) View.VISIBLE else View.GONE
        binding.providerList.visibility = if (loading) View.GONE else View.VISIBLE
        binding.emptyListText.visibility = View.GONE
    }

    private fun showError(message: String) {
        binding.emptyListText.text = message
        binding.emptyListText.visibility = View.VISIBLE
        binding.providerList.visibility = View.GONE
        binding.loadingIndicator.visibility = View.GONE
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}
