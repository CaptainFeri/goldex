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

        setupProviderAuth()
        loadSettings()

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

    private fun setupProviderAuth() {
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

    private fun loadSettings() {
        binding.phoneEditText.setText(prefs.phone)
        binding.providerNameEditText.setText(prefs.providerName)
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

        updateStatus("Ready")
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

        binding.providerAuthConfigForm.visibility = View.GONE
        binding.providerWebView.visibility = View.VISIBLE

        providerAuthController?.stop()
        providerAuthController = ProviderAuthController(
            context = this,
            webView = binding.providerWebView,
            statusLog = binding.authStatusLog
        )
        providerAuthController!!.start(type, providerName, loginUrl, phone, backendUrl)

        Toast.makeText(this, "Notification: enable access in Settings → Notification access", Toast.LENGTH_LONG).show()
        updateStatus("Panel launched — complete login in the WebView")
    }

    private fun closeProviderPanel() {
        providerAuthController?.stop()
        providerAuthController = null
        binding.providerWebView.visibility = View.GONE
        binding.providerAuthConfigForm.visibility = View.VISIBLE
        binding.launchPanelButton.text = "Launch Provider Panel"
        updateStatus("Ready")
    }

    private fun updateStatus(message: String) {
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
