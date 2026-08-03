# Goldex Server — Diagnostics & Recovery Commands

Run these on the **server** (Linux, SSH). All Phase 1 commands are **read-only**.

---

## Phase 1 — Diagnostics (read-only)

### 1. Did postgres restart at ~03:57? Check uptime & restart count

```bash
docker ps -a --format "table {{.Names}}\t{{.Status}}"
docker inspect goldex-postgres --format "{{.State.StartedAt}}  restarts={{.RestartCount}}"
```

### 2. What password does the postgres container have in its env?

```bash
docker inspect goldex-postgres --format "{{range .Config.Env}}{{println .}}{{end}}" | grep -i postgres
```

### 3. THE decisive test — try authenticating with the .env password (postgres/postgres)

```bash
docker exec goldex-postgres env PGPASSWORD=postgres psql -U postgres -h 127.0.0.1 -d GOLDEX-DB -c "SELECT 1"
```

- **SUCCESS** (`SELECT 1` returns a row) → password is fine, the problem is elsewhere.
- **FAILS with "password authentication failed"** → the cluster password on disk differs from `.env`. Continue to step 4 to see if the data dir was wiped/re-created.

### 4. Was the postgres data dir re-initialized recently?

```bash
docker exec goldex-postgres ls -la /var/lib/postgresql/data | head -5
docker volume inspect postgres_data | grep CreatedAt
```

- If `PG_VERSION` (or `postgresql.conf`) dates are from today/03:57 → the volume was re-created (data was lost).
- If they are old → the cluster is the original one, and the password was changed some other way (e.g. ALTER USER via pgAdmin).

### 5. What could be recreating/changing things on the host?

```bash
docker ps -a | grep -iE "watchtower|portainer|deploy|jenkins|runner|updater"
crontab -l 2>/dev/null
systemctl list-timers --no-pager 2>/dev/null | head -15
journalctl -u docker --since "2026-08-02 20:00" --no-pager 2>/dev/null | grep -iE "postgres|start|kill" | head -40
dmesg -T 2>/dev/null | grep -iE "oom|killed" | tail -10
```

### 6. Memory pressure (OOM kills can restart/recreate containers)

```bash
free -h
docker stats --no-stream
```

### 7. DNS check (EAI_AGAIN for api.telegram.org / wallet.kaino.ir)

```bash
cat /etc/resolv.conf
nslookup api.telegram.org
nslookup wallet.kaino.ir
```

---

## Phase 2 — Recovery (only after confirming the password mismatch)

### 1. Reset the cluster password to match `.env` (uses local socket, no password needed)

```bash
docker exec goldex-postgres psql -U postgres -c "ALTER USER postgres PASSWORD 'postgres';"
```

### 2. Restart the app containers so they reconnect cleanly

```bash
docker restart goldex-pricing-engine goldex-cbp goldex-telegram-bot goldex-backend
```

### 3. telegram_monitoring — session was revoked (AUTH_KEY_UNREGISTERED), must re-login

```bash
docker exec telegram-monitoring rm -f /app/sessions/*
docker restart telegram-monitoring
```

Then check logs to confirm the new session logged in:

```bash
docker logs telegram-monitoring --tail 30
```

---

## Phase 3 — Verify

```bash
docker exec goldex-postgres env PGPASSWORD=postgres psql -U postgres -h 127.0.0.1 -d GOLDEX-DB -c "SELECT 1"
docker logs goldex-pricing-engine --tail 30
docker logs goldex-telegram-bot --tail 30
```
