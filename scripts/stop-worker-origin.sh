#!/usr/bin/env bash
PASS=$(echo "ISFOQG4kM24=" | base64 -d)

echo "=== Status atual ==="
echo "$PASS" | sudo -S -p "" systemctl is-active vistomap-worker 2>&1
echo "$PASS" | sudo -S -p "" systemctl is-enabled vistomap-worker 2>&1

echo
echo "=== Para + desativa ==="
echo "$PASS" | sudo -S -p "" systemctl stop vistomap-worker
echo "$PASS" | sudo -S -p "" systemctl disable vistomap-worker

echo
echo "=== Confirma ==="
echo "$PASS" | sudo -S -p "" systemctl is-active vistomap-worker 2>&1
echo "$PASS" | sudo -S -p "" systemctl is-enabled vistomap-worker 2>&1

echo
echo "Worker origem parado. Se quiser reativar:"
echo "  sudo systemctl enable --now vistomap-worker"

echo
echo "=== Containers VistoMap origem (pode parar tambem?) ==="
docker ps --format "{{.Names}}: {{.Status}}"
echo
echo "Pra parar containers VistoMap do origem (mantem PostGIS pra backup):"
echo "  docker stop vistomap vistomap-postes-api"
echo
echo "Pra parar TUDO origem:"
echo "  docker stop vistomap vistomap-postes-api vistomap-postgis"
