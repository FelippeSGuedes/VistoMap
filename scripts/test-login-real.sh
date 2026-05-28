#!/usr/bin/env bash
# Teste real login com JSON via arquivo
cat > /tmp/login.json << 'JSON'
{"login":"x_inexistente","senha":"x"}
JSON

echo "=== POST /painel/api/auth/login ==="
curl -sS -k --max-time 10 -X POST \
  https://zabbmap.nansen.com.br/painel/api/auth/login \
  -H "Content-Type: application/json" \
  -d @/tmp/login.json
echo
echo

echo "=== logs painel ==="
docker logs vistomap-painel --tail 15 2>&1 | tail -10
