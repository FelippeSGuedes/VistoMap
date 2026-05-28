#!/usr/bin/env bash
PASS=$(echo "ISFOQG4kM24=" | base64 -d)
SVC="actions.runner.FelippeSGuedes-VistoMap.glpi.service"

echo "=== status atual ==="
echo "$PASS" | sudo -S -p "" systemctl is-active "$SVC" 2>&1
echo "$PASS" | sudo -S -p "" systemctl is-enabled "$SVC" 2>&1

echo
echo "=== stop ==="
echo "$PASS" | sudo -S -p "" systemctl stop "$SVC"
echo "$PASS" | sudo -S -p "" systemctl disable "$SVC"

echo
echo "=== confirmacao ==="
echo "$PASS" | sudo -S -p "" systemctl is-active "$SVC" 2>&1
echo "$PASS" | sudo -S -p "" systemctl is-enabled "$SVC" 2>&1
echo
echo "Runner parado. Aparece offline no GH mas registro mantido."
echo "Pra remover de vez: cd /var/www/actions-runner && sudo -u glpi ./config.sh remove --token TOKEN_DO_GH"
