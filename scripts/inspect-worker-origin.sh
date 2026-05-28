#!/usr/bin/env bash
# Roda no origem como glpi user
PASS=$(echo "ISFOQG4kM24=" | base64 -d)

echo "=== Systemd unit ==="
echo "$PASS" | sudo -S -p "" cat /etc/systemd/system/vistomap-worker.service 2>&1
echo
echo "=== .env worker ==="
echo "$PASS" | sudo -S -p "" cat /opt/vistomap/.env 2>&1
echo
echo "=== env.local ==="
echo "$PASS" | sudo -S -p "" cat /opt/vistomap/env.local 2>&1
echo
echo "=== Logs ultimas 8 linhas ==="
echo "$PASS" | sudo -S -p "" journalctl -u vistomap-worker --no-pager -n 8 2>&1
