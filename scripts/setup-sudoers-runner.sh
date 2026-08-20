#!/usr/bin/env bash
set -e

PASS=$(echo "N2whZEt6OEBScHU=" | base64 -d)   # !! ATENCAO: senha do zabbmap

# O fragmento real em producao (gioc-runner) se chama /etc/sudoers.d/zabbmap
# (nao "vistomap-runner" como uma versao antiga deste script criava) e usa
# allowlist por BINARIO INTEIRO, sem restringir argumento por Cmnd_Alias —
# convencao mais simples que a tentada antes, mas e a que esta realmente
# aplicada, entao o script segue ela pra "reaplicar = reproduz o que existe".
#
# grep/tee/nginx foram adicionados 2026-08-20: o fix do secure_link_md5
# (commit 9d57ad8) passou a exigir os 3 no step "Deploy nginx config", mas
# ninguem tinha atualizado esse allowlist junto — todo deploy desde entao
# falhava ali com "sudo: I'm sorry zabbmap. I'm afraid I can't do that".
echo "=== Cria sudoers fragment ==="
sudo tee /etc/sudoers.d/zabbmap > /dev/null << 'SUDO'
zabbmap ALL=(ALL) NOPASSWD: /usr/bin/rsync, /usr/bin/chown, /usr/bin/docker, /usr/bin/systemctl, /usr/bin/grep, /usr/bin/tee, /usr/sbin/nginx
SUDO
sudo chmod 440 /etc/sudoers.d/zabbmap

# Valida sintaxe
sudo visudo -cf /etc/sudoers.d/zabbmap

echo "=== Testa cada comando ==="
sudo -n systemctl status vistomap-worker --no-pager > /dev/null && echo "systemctl status: OK" || echo "systemctl status: FAIL"
sudo -n /usr/bin/chown -R zabbmap:zabbmap /opt/vistomap/ && echo "chown: OK" || echo "chown: FAIL"
sudo -n /usr/bin/grep -oP '^UPLOADS_SECURE_LINK_SECRET=\K.*' /etc/vistomap/.env.local > /dev/null && echo "grep secret: OK" || echo "grep secret: FAIL"
sudo -n /usr/sbin/nginx -t > /dev/null 2>&1 && echo "nginx -t: OK" || echo "nginx -t: FAIL"
echo "(rsync, tee, docker e systemctl restart sao testados pelo deploy real)"

echo
echo "=== Conteudo final ==="
sudo cat /etc/sudoers.d/zabbmap
