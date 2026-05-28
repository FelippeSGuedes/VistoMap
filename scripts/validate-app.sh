#!/usr/bin/env bash
echo "=== /app/login HTML ==="
curl -sS -k --max-time 8 https://zabbmap.nansen.com.br/app/login > /tmp/a.html
echo "Size: $(wc -c < /tmp/a.html)"

echo
echo "=== img/video src ==="
grep -oE '<(img|video)[^>]+src="[^"]+"' /tmp/a.html | head -5

echo
echo "=== assets _next ==="
grep -oE '/app/_next/static/[^"]+' /tmp/a.html | head -3

echo
echo "=== Testa assets ==="
for url in $(grep -oE 'src="/app/[^"]+\.(png|PNG|jpg|svg|mp4|woff2)"' /tmp/a.html | grep -oE '"/app/[^"]+' | tr -d '"' | sort -u); do
  S=$(curl -sSI -k --max-time 5 "https://zabbmap.nansen.com.br$url" | head -1 | awk '{print $2}')
  echo "  $S  $url"
done

echo
echo "=== /app login API ==="
curl -sS -k --max-time 8 -X POST \
  https://zabbmap.nansen.com.br/app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"x","senha":"x"}'
