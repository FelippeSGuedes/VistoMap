#!/usr/bin/env bash
# Para GH Actions runner no origem
PASS=$(echo "ISFOQG4kM24=" | base64 -d)

echo "=== Servicos runner ==="
echo "$PASS" | sudo -S -p "" systemctl list-units --type=service --all 2>&1 | grep -iE "actions.runner|runner" | head -5
echo
echo "=== Encontra service ==="
SVC=$(echo "$PASS" | sudo -S -p "" systemctl list-units --type=service --all --no-legend --plain 2>&1 | grep -iE "actions.runner" | awk '{print $1}' | head -1)
echo "Service: $SVC"
if [ -n "$SVC" ]; then
  echo "$PASS" | sudo -S -p "" systemctl stop "$SVC"
  echo "$PASS" | sudo -S -p "" systemctl disable "$SVC"
  echo "Stopped + disabled"
  echo "$PASS" | sudo -S -p "" systemctl is-active "$SVC" 2>&1
fi
