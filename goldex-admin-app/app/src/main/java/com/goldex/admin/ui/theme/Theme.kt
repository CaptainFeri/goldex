package com.goldex.admin.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

/**
 * Gold on near-black, which is the desk this app sits on.
 *
 * Dark is the default rather than the alternative: the app is used beside a
 * trading screen, and a white sheet at a gold desk at six in the morning is the
 * thing an operator turns the brightness down to escape.
 */
private val Gold = Color(0xFFE8B45C)
private val GoldBright = Color(0xFFF5D48A)
private val Ink = Color(0xFF12100E)
private val Slate = Color(0xFF1C1813)

private val DarkScheme = darkColorScheme(
    primary = Gold,
    onPrimary = Ink,
    primaryContainer = Color(0xFF3A2E17),
    onPrimaryContainer = GoldBright,
    secondary = Color(0xFF8FB8A8),
    onSecondary = Ink,
    background = Ink,
    onBackground = Color(0xFFEDE6DA),
    surface = Slate,
    onSurface = Color(0xFFEDE6DA),
    surfaceVariant = Color(0xFF262019),
    onSurfaceVariant = Color(0xFFB9AE9D),
    outline = Color(0xFF4A4034),
    error = Color(0xFFE07A6B),
    onError = Ink,
)

private val LightScheme = lightColorScheme(
    primary = Color(0xFF8A6A20),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFBE9C4),
    onPrimaryContainer = Color(0xFF3A2E17),
    secondary = Color(0xFF3F6B5C),
    background = Color(0xFFFBF8F3),
    onBackground = Color(0xFF1B1813),
    surface = Color.White,
    onSurface = Color(0xFF1B1813),
    surfaceVariant = Color(0xFFF1EADC),
    onSurfaceVariant = Color(0xFF5A5246),
    outline = Color(0xFFCFC3AE),
)

private val AppTypography = Typography(
    headlineSmall = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 22.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 19.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun GoldexAdminTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val scheme = if (darkTheme) DarkScheme else LightScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = scheme.background.toArgb()
            window.navigationBarColor = scheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }
    MaterialTheme(colorScheme = scheme, typography = AppTypography, content = content)
}
