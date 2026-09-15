package com.goldex.admin

import android.app.Application
import android.content.Context
import com.goldex.admin.data.AdminRepository
import com.goldex.admin.data.ApiClient
import com.goldex.admin.data.SessionStore

class GoldexAdminApp : Application()

/**
 * The app's three long-lived objects.
 *
 * A code can arrive while no screen exists — a broadcast receiver and a worker
 * both need the session and the API — so these cannot hang off an activity, and
 * the app is too small for a dependency-injection framework to earn its
 * configuration. They are built once, from the application context, and handed
 * out from here.
 */
object Goldex {

    @Volatile private var store: SessionStore? = null
    @Volatile private var client: ApiClient? = null
    @Volatile private var repo: AdminRepository? = null

    fun session(context: Context): SessionStore =
        store ?: synchronized(this) {
            store ?: SessionStore(context.applicationContext).also { store = it }
        }

    fun repository(context: Context): AdminRepository =
        repo ?: synchronized(this) {
            repo ?: run {
                val session = session(context)
                val api = client ?: ApiClient(session).also { client = it }
                AdminRepository(api, session).also { repo = it }
            }
        }
}
