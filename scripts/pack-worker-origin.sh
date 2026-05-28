#!/usr/bin/env bash
# Roda no origem como glpi. Empacota worker (sem venv, sem cache).
PASS=$(echo "ISFOQG4kM24=" | base64 -d)
cd /opt/vistomap
echo "$PASS" | sudo -S -p "" tar czf /home/glpi/backup-migracao/worker.tar.gz \
  --exclude=venv \
  --exclude=__pycache__ \
  --exclude='*.pyc' \
  -C /opt vistomap
echo "$PASS" | sudo -S -p "" chown glpi:glpi /home/glpi/backup-migracao/worker.tar.gz
ls -lh /home/glpi/backup-migracao/worker.tar.gz
echo "Conteudo:"
tar tzf /home/glpi/backup-migracao/worker.tar.gz | head -20
