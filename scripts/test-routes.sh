#!/usr/bin/env bash
echo "=== Rotas painel via nginx HTTPS ==="
for r in /painel/login /painel/vistorias /painel/mapa /painel/tecnicos /painel/revisitas /painel/historico /painel/auditoria /painel; do
  S=$(curl -sSI -k --max-time 5 "https://zabbmap.nansen.com.br$r" 2>&1 | head -1)
  printf "  %-30s %s\n" "$r" "$S"
done

echo
echo "=== Direto container painel ==="
for r in /painel/login /painel/vistorias /painel/mapa /painel/tecnicos /painel; do
  S=$(curl -sSI --max-time 5 "http://127.0.0.1:3002$r" 2>&1 | head -1)
  printf "  %-30s %s\n" "$r" "$S"
done

echo
echo "=== Build painel - pages encontradas ==="
docker exec vistomap-painel find .next/server/app/painel -name page.js 2>&1
