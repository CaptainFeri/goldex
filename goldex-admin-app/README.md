# goldex-admin-app

An operator's handset console for Goldex: the state of the system, the state of
every price provider, and activation of a provider from the phone the provider
texts its code to.

## Why it exists

A provider is activated by signing in to it. Most of them sign you in by texting
a code to the number registered with them, and that SIM is in somebody's phone —
not in the server, and not at the panel. So either an operator reads the code
down the phone to whoever is at the panel, or the phone itself finishes the job.

This app is the phone finishing the job. It reads the code off the handset,
fills it in, and posts it to the backend at the same time, so activation can be
completed here **or** at the panel — whichever is in front of a person at the
time.

## What it does

- **Sign in** with the same admin account as the panel: phone and password, then
  the five-digit code, which fills itself in because it arrives on this handset.
- **Dashboard** — the platform's own cards, chart, share split, health strip and
  activity feed, selected by the same metric filter the panel uses.
- **Providers** — every provider with its live status, off ones first, and a
  switch for each.
- **Activation**, two routes per provider:
  - *code*: ask the provider to text a code, the code is read and filled in, and
    verification activates the provider;
  - *session*: paste a token, or the whole session as JSON, as captured from the
    provider's own web panel.
- **Relay** — a code read on this handset is posted to
  `POST /api/v1/admin/providers/relay-otp` and stands for five minutes, which is
  what lets the panel finish an activation this app started.

  It works the other way too. An activation begun at the panel leaves this
  handset with nothing to go on — the message names no provider — so the app
  asks `GET /admin/providers/awaiting-otp` which activation is waiting. A null
  answer is also the answer to "should this be sent at all": when nothing is
  expecting a code, nothing leaves the phone, which is what keeps every other
  message on it off the wire.

## Reading the code

Two readers, because neither is reliable alone:

| Reader | Permission | When it works |
| --- | --- | --- |
| SMS | `RECEIVE_SMS`, asked for in Settings | The message is delivered to apps |
| Notification | Notification access, granted in system settings | Anything that shows the message, including RCS and carrier apps |

Whichever fires, the message goes through one extractor
(`otp/OtpExtractor.kt`), which scores the numbers in it rather than taking the
first: a number a message introduces as a code wins, an amount or a card number
is discarded, and a message that names no code at all yields one only when there
is a single number in it to be wrong about. That logic is covered by unit tests
(`app/src/test/.../OtpExtractorTest.kt`) — they are the thing to run after
touching it, because a wrong code spends an activation attempt.

Both readers are optional. Without either, codes are typed in by hand and
nothing is relayed; Settings says which is missing.

## Configuration

The backend address is a setting, not a build constant — the same APK is pointed
at a laptop, a staging box, or production. It is on the sign-in screen and in
Settings, and defaults to `goldexBaseUrl` if one was given at build time:

```
./gradlew assembleDebug -PgoldexBaseUrl=http://192.168.1.10:3000/
```

Cleartext HTTP is permitted, because the backend is usually reached on the
operator's own network; an `https://` address is unaffected by that.

The admin token is kept in hardware-backed encrypted preferences. Where the
keystore is unusable the app falls back to plain preferences and says so, on the
sign-in screen and in Settings, rather than failing to start.

## Building

```
./gradlew test           # the extractor's tests
./gradlew assembleDebug  # app/build/outputs/apk/debug/app-debug.apk
```

Needs JDK 17 and Android SDK 35. CI builds the APK on every push to
`goldex-admin-app/**` and attaches it to the run; pushes to `main` also publish
it as the `admin-app-latest` release, which an operator can install from the
handset.
