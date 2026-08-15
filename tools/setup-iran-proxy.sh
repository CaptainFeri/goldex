#!/usr/bin/env bash
#
# setup-iran-proxy.sh
# -------------------
# Installs/configured a squid HTTPS proxy on an Iranian server so that
# goldex-cbp and goldex-pricing-engine (running on a server in Turkey) can
# reach Iranian-only providers/gateways via an Iranian egress IP.
#
# Auth is DISABLED; access is restricted by IP allowlist of the caller
# (the Turkey server's public egress IP). Only HTTPS CONNECT (port 443) is
# permitted, which is all the modules need (HTTPS REST + WSS/WebSocket).
#
# USAGE (run as root ON the Iranian server, or via:
#   ssh root@91.212.174.157 'bash -s' < setup-iran-proxy.sh
#
# Edit TURKEY_EGRESS_IP before running. Find it from the Turkey server with:
#   curl -s https://api.ipify.org
#
set -euo pipefail

# >>> CHANGE THIS to the Turkey server's public egress IP <<<
TURKEY_EGRESS_IP="${TURKEY_EGRESS_IP:-CHANGE_ME}"

SQUID_PORT="${SQUID_PORT:-29180}"

if [ "$TURKEY_EGRESS_IP" = "CHANGE_ME" ]; then
  echo "ERROR: set TURKEY_EGRESS_IP to the Turkey server's public IP (curl -s https://api.ipify.org)." >&2
  exit 1
fi

echo "==> Installing squid..."
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y squid
elif command -v yum >/dev/null 2>&1; then
  yum install -y squid
else
  echo "ERROR: unsupported package manager" >&2
  exit 1
fi

CONF="/etc/squid/squid.conf"
[ -f "$CONF" ] && cp "$CONF" "$CONF.bak.$(date +%s)"

echo "==> Writing squid config ($CONF, port $SQUID_PORT)..."
cat > "$CONF" <<EOF
# Only the Turkey server's egress IP may use this proxy.
acl allowed_clients src $TURKEY_EGRESS_IP
# HTTPS/WSS are tunnelled via the CONNECT method, always to port 443.
acl SSL_ports port 443
acl CONNECT method CONNECT

# Deny everyone else first, then allow our client.
http_access deny !allowed_clients
http_access allow CONNECT SSL_ports
http_access allow allowed_clients
http_access deny all

# Listen on the public interface, no auth (IP-allowlisted instead).
http_port $SQUID_PORT

cache deny all
forwarded_for off
via off

access_log /var/log/squid/access.log squid
coredump_dir /var/spool/squid
refresh_pattern ^i: 0    1440  10080
refresh_pattern .       0    1440  10080
EOF

echo "==> Starting squid..."
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable squid >/dev/null 2>&1 || true
  systemctl restart squid
else
  service squid restart || service squid3 restart || true
fi

sleep 2

echo "==> Opening port $SQUID_PORT in firewall (if present)..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow "$SQUID_PORT/tcp" || true
elif command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$SQUID_PORT/tcp" || true
  firewall-cmd --reload || true
elif command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport "$SQUID_PORT" -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -p tcp --dport "$SQUID_PORT" -j ACCEPT
fi

echo "==> Done. Proxy ready at $TURKEY_EGRESS_IP's host:$SQUID_PORT (allowing $TURKEY_EGRESS_IP)."
echo "==> Verify from the Turkey server with:"
echo "      curl -x http://$(hostname -I | awk '{print $1}'):$SQUID_PORT https://api.afroghnegaremana.ir -o /dev/null -w '%{http_code}\n'"
echo "    Expect: 200 (or a redirect 3xx), NOT a connection error."
