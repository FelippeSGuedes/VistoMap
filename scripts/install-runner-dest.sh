#!/usr/bin/env bash
set -e

TOKEN="BXNNJH436WMLARNVWMDWBMDKC4WZC"

echo "=== 1. Cria dir + download ==="
sudo mkdir -p /opt/actions-runner
sudo chown zabbmap:zabbmap /opt/actions-runner
cd /opt/actions-runner

if [ ! -f run.sh ]; then
  curl -fsSL -o actions-runner.tar.gz \
    https://github.com/actions/runner/releases/download/v2.334.0/actions-runner-linux-x64-2.334.0.tar.gz
  tar xzf actions-runner.tar.gz
  rm -f actions-runner.tar.gz
fi
ls -la | head -10

echo
echo "=== 2. Instala deps do runner (.NET) ==="
sudo bash ./bin/installdependencies.sh 2>&1 | tail -5

echo
echo "=== 3. Configura runner com label gioc ==="
./config.sh \
  --url https://github.com/FelippeSGuedes/VistoMap \
  --token "$TOKEN" \
  --name "srvnsnzabbmap" \
  --labels "gioc,linux,x64" \
  --work _work \
  --unattended \
  --replace

echo
echo "=== 4. Instala como service ==="
sudo ./svc.sh install zabbmap
sudo ./svc.sh start
sleep 3
sudo ./svc.sh status

echo
echo "=== 5. Logs service ==="
SVC=$(sudo systemctl list-units --type=service --plain --no-legend 2>&1 | grep -iE "actions.runner" | awk '{print $1}' | head -1)
echo "Service: $SVC"
sudo journalctl -u "$SVC" --no-pager -n 10
