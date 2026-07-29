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
import com.goldex.smsforwarder.data.local.PreferencesManager
import com.goldex.smsforwarder.data.model.ProviderType
import com.goldex.smsforwarder.databinding.ActivityMainBinding
import com.google.android.material.tabs.TabLayout

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: PreferencesManager
    private var providerAuthController: ProviderAuthController? = null

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

        setupSmsForwarderTab()
        setupProviderAuthTab()
        setupTabs()

        loadSmsSettings()
        loadProviderAuthSettings()

        requestNotificationPermission()
    }

    override fun onDestroy() {
        providerAuthController?.stop()
        super.onDestroy()
    }

    override fun onBackPressed() {
        if (binding.providerWebView.visibility == View.VISIBLE) {
            closeProviderPanel()
            return
        }
        super.onBackPressed()
    }

    private fun setupTabs() {
        binding.tabLayout.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab) {
                when (tab.position) {
                    0 -> {
                        binding.smsForwarderPage.visibility = View.VISIBLE
                        binding.providerAuthPage.visibility = View.GONE
                        providerAuthController?.stop()
                        closeProviderPanel()
                    }
                    1 -> {
                        binding.smsForwarderPage.visibility = View.GONE
                        binding.providerAuthPage.visibility = View.VISIBLE
                    }
                }
            }

            override fun onTabUnselected(tab: TabLayout.Tab) {}
            override fun onTabReselected(tab: TabLayout.Tab) {}
        })
    }

    private fun setupSmsForwarderTab() {
        binding.saveButton.setOnClickListener { saveSmsSettings() }
    }

    private fun loadSmsSettings() {
        binding.targetUrlEditText.setText(prefs.targetUrl)
        binding.keywordEditText.setText(prefs.keyword)
        binding.enabledSwitch.isChecked = prefs.isEnabled
        updateSmsStatus()
    }

    private fun saveSmsSettings() {
        val url = binding.targetUrlEditText.text.toString().trim()
        val keyword = binding.keywordEditText.text.toString().trim()

        if (url.isBlank()) {
            Toast.makeText(this, "Please enter a target URL", Toast.LENGTH_SHORT).show()
            return
        }

        prefs.targetUrl = url
        prefs.keyword = keyword
        prefs.isEnabled = binding.enabledSwitch.isChecked

        Toast.makeText(this, "Settings saved", Toast.LENGTH_SHORT).show()
        updateSmsStatus()
    }

    private fun updateSmsStatus() {
        binding.statusText.text = if (prefs.isEnabled && prefs.targetUrl.isNotBlank()) {
            val kw = prefs.keyword.ifBlank { "all messages" }
            "Active — forwarding messages containing \"$kw\""
        } else {
            "Inactive — enable and configure above"
        }
    }

    private fun setupProviderAuthTab() {
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

    private fun loadProviderAuthSettings() {
        binding.phoneEditText.setText(prefs.phone)
        binding.loginUrlEditText.setText(prefs.loginUrl)
        binding.backendUrlEditText.setText(prefs.backendUrl)

        val type = try {
            ProviderType.valueOf(prefs.providerType)
        } catch (e: Exception) {
            ProviderType.ZARYAR
        }
        when (type) {
            ProviderType.ZARYAR -> binding.providerTypeZaryar.isChecked = true
            ProviderType.TALAAB -> binding.providerTypeTalaab.isChecked = true
        }

        updateAuthStatus("Ready")
    }

    private fun launchProviderPanel() {
        val phone = binding.phoneEditText.text.toString().trim()
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

        binding.providerAuthConfigForm.visibility = View.GONE
        binding.providerWebView.visibility = View.VISIBLE

        providerAuthController?.stop()
        providerAuthController = ProviderAuthController(
            context = this,
            webView = binding.providerWebView,
            statusLog = binding.authStatusLog
        )
        providerAuthController!!.start(type, loginUrl, phone, backendUrl)

        Toast.makeText(this, "Notification: enable access in Settings → Notification access", Toast.LENGTH_LONG).show()
        updateAuthStatus("Panel launched — complete login in the WebView")
    }

    private fun closeProviderPanel() {
        providerAuthController?.stop()
        providerAuthController = null
        binding.providerWebView.visibility = View.GONE
        binding.providerAuthConfigForm.visibility = View.VISIBLE
        binding.launchPanelButton.text = "Launch Provider Panel"
    }

    private fun updateAuthStatus(message: String) {
        binding.authStatusLog.text = message
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
