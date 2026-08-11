# goldex-sms-forwarder — Android OTP Forwarder

Android app (Kotlin, Jetpack) that listens for SMS/OTP notifications and forwards captured codes to the pricing-engine (provider OTP activation). Uses a `NotificationListenerService` and Retrofit to the pricing engine API.

## Architecture

```mermaid
flowchart TD
    APP[SmsForwarderApp] --> UI[MainActivity + ProviderListAdapter<br/>provider list with active/inactive status]
    APP --> NL[OtpNotificationListener<br/>NotificationListenerService]
    APP --> RETRO[RetrofitClient + PricingEngineApi]
    APP --> PREFS[PreferencesManager<br/>local session/state]
    UI --> AUTH[ProviderAuthController<br/>send-otp / verify-otp]
    AUTH --> RETRO
    NL --> BROADCAST[Intent ACTION_OTP_CAPTURED<br/>otp_code + title + text]
    RETRO --> PE[goldex-pricing-engine<br/>/api/v1/providers/**]
```

## OTP capture → forward flow

```mermaid
sequenceDiagram
    participant S as Provider SMS/notification
    participant NL as OtpNotificationListener
    participant B as Broadcast receiver
    participant A as ProviderAuthController
    participant RETRO as PricingEngineApi
    participant PE as pricing-engine

    S-->>NL: onNotificationPosted
    NL->>NL: extractOtp regex (4-6 digits)
    alt otp found
        NL->>B: broadcast OTP_CAPTURED (code)
        B->>A: forward code to active provider session
        A->>RETRO: sendOtp / verifyOtp (provider id)
        RETRO->>PE: POST /providers/:id/send-otp etc.
    end
```

> The listener parses the notification `title + text + bigText`, regex-extracts a 4–6 digit code, broadcasts it, and the UI/auth controller forwards it to the pricing engine to complete provider activation.
