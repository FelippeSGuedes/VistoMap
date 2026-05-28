#!/usr/bin/env bash
PASS=$(echo "ISFOQG4kM24=" | base64 -d)
echo "=== ls runner dir ==="
echo "$PASS" | sudo -S -p "" ls -la /var/www/actions-runner/ 2>&1 | tail -25
echo
echo "=== .runner config ==="
echo "$PASS" | sudo -S -p "" cat /var/www/actions-runner/.runner 2>&1
echo
echo "=== systemd actions ==="
echo "$PASS" | sudo -S -p "" ls /etc/systemd/system/ 2>&1 | grep -i action
echo
echo "=== procura processo Runner.Listener ==="
echo "$PASS" | sudo -S -p "" ps aux 2>&1 | grep -iE "Runner.Listener|run.sh|runsvc" | grep -v grep
