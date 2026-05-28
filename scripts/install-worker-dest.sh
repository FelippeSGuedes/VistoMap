#!/usr/bin/env bash
set -e

PASS_GLPI=$(echo "ISFOQG4kM24=" | base64 -d)   # !!N@n$3n

echo "=== 1. Verifica Python 3.12+ ==="
which python3
python3 --version
which python3-venv 2>/dev/null || {
  echo "Instalando python3-venv..."
  sudo apt-get install -y python3-venv python3-dev libpango1.0-0 libpangoft2-1.0-0 2>&1 | tail -3
}

echo
echo "=== 2. Extrai worker para /opt/vistomap-worker ==="
sudo mkdir -p /opt/vistomap-worker
sudo tar xzf /home/zabbmap/migracao/worker.tar.gz -C /opt/
sudo mv /opt/vistomap /opt/vistomap-worker-tmp 2>/dev/null || true
# Renomeia se necessario (worker.tar.gz extrai como vistomap/)
if [ -d /opt/vistomap-worker-tmp ]; then
  sudo rsync -a /opt/vistomap-worker-tmp/ /opt/vistomap-worker/
  sudo rm -rf /opt/vistomap-worker-tmp
fi
sudo chown -R zabbmap:zabbmap /opt/vistomap-worker
ls -la /opt/vistomap-worker/

echo
echo "=== 3. Cria venv + instala deps ==="
cd /opt/vistomap-worker
python3 -m venv venv
./venv/bin/pip install --upgrade pip setuptools wheel 2>&1 | tail -3
./venv/bin/pip install -r requirements.txt 2>&1 | tail -5

echo
echo "=== 4. Ajusta .env para destino ==="
# Reescreve .env apontando pro DB destino
cat > /opt/vistomap-worker/.env << EOF
# ─── Banco GLPI GIOC (destino) ────────────────────────────────────────────────
DB_HOST=127.0.0.1
DB_USER=glpi_gioc
DB_PASSWORD=${PASS_GLPI}
DB_NAME=glpi_gioc
DB_PORT=3307

# ─── Diretorios do plugin (mesmo path do origem) ──────────────────────────────
PLUGIN_BASE=/var/www/html/glpi/plugins/vistomapprojetos
TEMPLATES_DIR=/var/www/html/glpi/plugins/vistomapprojetos/templates
UPLOADS_DIR=/var/www/html/glpi/plugins/vistomapprojetos/uploads
FILES_DIR=/var/www/html/glpi/plugins/vistomapprojetos/files
APPROVED_DIR=/var/www/html/glpi/plugins/vistomapprojetos/ProjetosAprovados
LOGS_DIR=/var/www/html/glpi/plugins/vistomapprojetos/logs
LOG_FILE=/var/www/html/glpi/plugins/vistomapprojetos/logs/worker.log

# ─── Lock ─────────────────────────────────────────────────────────────────────
LOCK_FILE=/tmp/vistomap_worker.lock
EOF
chmod 600 /opt/vistomap-worker/.env
echo ".env ajustado"

echo
echo "=== 5. Cria diretorios do plugin se faltarem ==="
sudo mkdir -p /var/www/html/glpi/plugins/vistomapprojetos/{uploads,files,templates,ProjetosAprovados,logs}
sudo chown -R www-data:www-data /var/www/html/glpi/plugins/vistomapprojetos
sudo chmod -R 775 /var/www/html/glpi/plugins/vistomapprojetos
# Worker (rodando como zabbmap) precisa escrever em logs/ + ler/escrever em uploads/files/approved
sudo usermod -a -G www-data zabbmap 2>/dev/null || true
sudo chmod 777 /var/www/html/glpi/plugins/vistomapprojetos/logs
sudo chmod 777 /var/www/html/glpi/plugins/vistomapprojetos/ProjetosAprovados

echo
echo "=== 6. Cria systemd unit ==="
sudo tee /etc/systemd/system/vistomap-worker.service > /dev/null << UNIT
[Unit]
Description=VistoMap Worker (PDF generator) - GIOC
After=network.target mariadb.service

[Service]
User=zabbmap
WorkingDirectory=/opt/vistomap-worker
ExecStart=/opt/vistomap-worker/venv/bin/python /opt/vistomap-worker/worker.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
echo "unit criada"

echo
echo "=== 7. Start + enable ==="
sudo systemctl enable vistomap-worker
sudo systemctl start vistomap-worker
sleep 3
sudo systemctl status vistomap-worker --no-pager -l | head -15

echo
echo "=== 8. Logs (10 linhas) ==="
sudo journalctl -u vistomap-worker --no-pager -n 10
