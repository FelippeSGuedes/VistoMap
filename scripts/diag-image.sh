#!/usr/bin/env bash
echo "=== HTML pagina painel/login - imgs ==="
curl -sS -k --max-time 8 https://zabbmap.nansen.com.br/painel/login \
  | grep -oE 'src="[^"]+"' | head -8

echo
echo "=== Tenta /_next/image com diferentes urls ==="
for q in "%2Flogin_painel.png" "%2Fpainel%2Flogin_painel.png"; do
  url="https://zabbmap.nansen.com.br/painel/_next/image?url=$q&w=1920&q=92"
  echo "--- $url"
  curl -sSI -k --max-time 5 "$url" | head -2
done

echo
echo "=== /painel/login_painel.png direct ==="
curl -sSI -k --max-time 5 "https://zabbmap.nansen.com.br/painel/login_painel.png" | head -2
