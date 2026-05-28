#!/usr/bin/env bash
set -e

echo "=== 1. Para worker temporariamente ==="
sudo systemctl stop vistomap-worker

echo
echo "=== 2. Cria /opt/vistomap-worker-clean com apenas Python files ==="
sudo mkdir -p /opt/vistomap-worker-clean
# Move só os arquivos do worker
for f in worker.py config.py database.py dropdown_resolver.py file_manager.py pdf_generator.py requirements.txt .env env.local; do
  if [ -f /opt/vistomap-worker/$f ]; then
    sudo cp -a /opt/vistomap-worker/$f /opt/vistomap-worker-clean/
  fi
done
sudo cp -a /opt/vistomap-worker/venv /opt/vistomap-worker-clean/ 2>/dev/null || true
sudo chown -R zabbmap:zabbmap /opt/vistomap-worker-clean
ls -la /opt/vistomap-worker-clean

echo
echo "=== 3. Move resto (repo) pra /opt/vistomap ==="
# Apaga os arquivos do worker do /opt/vistomap-worker/ (resto = repo)
for f in worker.py config.py database.py dropdown_resolver.py file_manager.py pdf_generator.py requirements.txt .env env.local; do
  sudo rm -f /opt/vistomap-worker/$f
done
sudo rm -rf /opt/vistomap-worker/venv /opt/vistomap-worker/__pycache__

# Renomeia: vistomap-worker (= repo agora) -> vistomap. clean -> vistomap-worker.
sudo mv /opt/vistomap-worker /opt/vistomap
sudo mv /opt/vistomap-worker-clean /opt/vistomap-worker

sudo chown -R zabbmap:zabbmap /opt/vistomap

echo
echo "=== 4. Verifica estrutura ==="
ls /opt/ | grep vistomap
echo "/opt/vistomap (repo):"
ls /opt/vistomap | head -10
echo "/opt/vistomap-worker:"
ls /opt/vistomap-worker

echo
echo "=== 5. Verifica git no /opt/vistomap ==="
cd /opt/vistomap
git status 2>&1 | head -3

echo
echo "=== 6. Reinicia worker ==="
sudo systemctl start vistomap-worker
sleep 3
sudo systemctl status vistomap-worker --no-pager | head -10
sudo journalctl -u vistomap-worker --no-pager -n 5
