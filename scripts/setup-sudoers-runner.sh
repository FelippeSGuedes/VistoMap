#!/usr/bin/env bash
set -e

PASS=$(echo "N2whZEt6OEBScHU=" | base64 -d)   # !! ATENCAO: senha do zabbmap

echo "=== Cria sudoers fragment ==="
sudo tee /etc/sudoers.d/vistomap-runner > /dev/null << 'SUDO'
# Permissoes mínimas pro GH Actions runner deployar VistoMap sem prompt.
# Cada Cmnd_Alias agrupa comandos com argumentos exatos pra evitar escalation.

Cmnd_Alias VM_RSYNC = /usr/bin/rsync -a --delete --exclude=.git */ /opt/vistomap/
Cmnd_Alias VM_CHOWN = /usr/bin/chown -R zabbmap\:zabbmap /opt/vistomap, /usr/bin/chown -R zabbmap\:zabbmap /opt/vistomap/
Cmnd_Alias VM_SYSCTL = /usr/bin/systemctl restart vistomap-worker, /usr/bin/systemctl status vistomap-worker, /usr/bin/systemctl reload nginx

zabbmap ALL=(ALL) NOPASSWD: VM_RSYNC, VM_CHOWN, VM_SYSCTL
SUDO

# Valida sintaxe
sudo visudo -cf /etc/sudoers.d/vistomap-runner

echo "=== Testa cada comando ==="
sudo -n systemctl status vistomap-worker --no-pager > /dev/null && echo "systemctl status: OK" || echo "systemctl status: FAIL"
sudo -n /usr/bin/chown -R zabbmap:zabbmap /opt/vistomap/ && echo "chown: OK" || echo "chown: FAIL"
echo "(rsync e systemctl restart sao testados pelo deploy real)"

echo
echo "=== Conteudo final ==="
sudo cat /etc/sudoers.d/vistomap-runner
