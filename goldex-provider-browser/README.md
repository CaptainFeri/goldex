# goldex-provider-browser

A browser an admin drives from the admin panel, to sign in to a provider whose
login the pricing engine cannot drive itself.

## Why it exists

Activating a provider normally means the engine calling its `sendOtpUrl` and
`verifyCodeUrl` — a phone number in, a token out. That only works when the
provider's login really is that exchange. Behind a captcha or a second factor
there is nothing to drive, and Zaryar's verify body already carries a
`CaptchaToken` field.

So a person does the login instead, in a real browser, and the credentials are
read from outside the page rather than by injecting a script into it. Nothing
is injected, so nothing breaks when the provider redesigns.

They are read from two places, because providers differ:

- **the network layer** — the login response itself, for a provider that
  answers with the session;
- **the page's own storage** — `localStorage` and `sessionStorage`, polled
  while the session is open, for a single-page app that keeps the session there
  and nowhere else. Watching responses alone would see that login succeed and
  catch nothing.

Whichever sees it first wins, and the poll stops once something is captured.

## How it fits

```
admin panel ──socket──> goldex-backend ──socket+http──> goldex-provider-browser
                            (admin JWT)   (service token)         (Chromium)
```

The backend authenticates the admin and relays in both directions. This service
publishes no port outside the docker network — it is never reached directly.

## Security

This is a remote-controlled browser **inside the server network**. Without a
limit on where it may go it is a request forgery tool with a human at the
controls. Two rules, and every request must pass both:

1. **The internal network is unreachable.** Loopback, private ranges,
   link-local (including the cloud metadata endpoint) and single-label docker
   service names are refused — even if a provider's own configuration names
   one.
2. **Only the provider's hosts.** Built from the URLs that provider was
   configured with, plus their subdomains. Everything else is aborted.

Beyond that: one session per provider, a ten-minute TTL, a fresh non-persistent
browser context per session that is destroyed on close, and a shared service
token on both the HTTP routes and the socket handshake.

## Configuration

| Variable | Purpose |
|----------|---------|
| `BROWSER_SERVICE_TOKEN` | Shared secret the backend presents. **Without it every request is refused.** |
| `PROXY_HOST` / `PROXY_PORT` / `PROXY_USERNAME` / `PROXY_PASSWORD` | Outbound proxy, used when the provider's `useProxy` is on |
| `CHROMIUM_EXECUTABLE_PATH` | Optional — use a host-provided Chromium instead of the image's |
| `PORT` | Listen port (default 3000) |

## Tests

```bash
npm test
```

The session tests launch a real browser to confirm that a screencast produces
frames and that a CDP input event lands in the page. They skip themselves when
no browser is available.
