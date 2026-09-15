package com.goldex.admin.autologin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.goldex.admin.Goldex

/**
 * Brings the service back after a restart.
 *
 * A phone left on a desk reboots — an update, a power cut, a battery that ran
 * out overnight — and nobody is there to open the app afterwards. Without this,
 * unattended means "until the next reboot".
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != "android.intent.action.QUICKBOOT_POWERON"
        ) {
            return
        }

        val store = Goldex.session(context)
        // Only if it was running before. Starting on boot something the
        // operator had switched off would be the phone deciding for itself.
        if (store.autoLoginEnabled && store.isEnrolled) {
            AutoLoginService.start(context)
        }
    }
}
