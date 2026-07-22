package com.goldex.smsforwarder.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.goldex.smsforwarder.data.local.PreferencesManager
import com.goldex.smsforwarder.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: PreferencesManager

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

        loadSettings()

        binding.saveButton.setOnClickListener { saveSettings() }

        requestNotificationPermission()
    }

    private fun loadSettings() {
        binding.targetUrlEditText.setText(prefs.targetUrl)
        binding.keywordEditText.setText(prefs.keyword)
        binding.enabledSwitch.isChecked = prefs.isEnabled
        updateStatus()
    }

    private fun saveSettings() {
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
        updateStatus()
    }

    private fun updateStatus() {
        binding.statusText.text = if (prefs.isEnabled && prefs.targetUrl.isNotBlank()) {
            val kw = prefs.keyword.ifBlank { "all messages" }
            "Active — forwarding messages containing \"$kw\""
        } else {
            "Inactive — enable and configure above"
        }
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
