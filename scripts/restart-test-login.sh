#!/usr/bin/env bash
docker compose -f /opt/vistomap/docker-compose.gioc.yml \
  --env-file /etc/vistomap/.env.local \
  restart vistomap-tecnico vistomap-painel
sleep 6
docker ps --filter name=vistomap --format "{{.Names}}: {{.Status}}"
echo
echo "=== Login fake (espera 401 se DB ok) ==="
curl -sS -k --max-time 10 -X POST \
  https://zabbmap.nansen.com.br/painel/api/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"login":"nao_existe","senha":"x"}'
echo
echo
echo "=== Logs apos POST ==="
docker logs vistomap-painel --tail 12 2>&1
echo
echo "=== Restart worker ==="
sudo systemctl restart vistomap-worker
sleep 2
sudo journalctl -u vistomap-worker --no-pager -n 5
