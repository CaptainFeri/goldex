# SMS Forwarder — Android

Listens to incoming SMS messages, checks if the message contains a specific keyword, and forwards matching messages to a target URL via HTTP POST.

## How it works

```
SMS arrives → SmsReceiver checks for keyword → if match → SmsForwardService sends POST to your URL
```

## Configuration

Open the app and set:

| Field | Description | Example |
|-------|-------------|---------|
| **Target URL** | Where matching SMS will be POSTed | `https://api.example.com/sms` |
| **Keyword** | Case-insensitive keyword to match | `otp`, `verification` |
| **Enabled** | Toggle monitoring on/off | |

Leave keyword empty to forward **all** SMS messages.

### POST body (JSON)

```json
{
  "sender": "+1234567890",
  "message": "Your OTP code is 482916",
  "timestamp": 1721654321,
  "keyword_matched": "otp"
}
```

## Build the APK

### Option 1 — GitHub Actions (recommended)

Push to `main`. Go to **Actions** tab → select **Build APK** → download the artifact.

### Option 2 — Manual (Android Studio)

Open `goldex-sms-forwarder/` in Android Studio, then **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## Requirements

- Android 8.0+ (API 26)
- Permission: `RECEIVE_SMS`, `INTERNET`, `POST_NOTIFICATIONS`
- On Android 14+, must be set as default SMS app

## Permissions

| Permission | Purpose |
|------------|---------|
| `RECEIVE_SMS` | Listen for incoming SMS |
| `INTERNET` | Send HTTP POST to target URL |
| `FOREGROUND_SERVICE` | Run SMS forwarding in background |
| `POST_NOTIFICATIONS` | Show notification while forwarding (Android 13+) |
