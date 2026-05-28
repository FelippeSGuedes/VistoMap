#!/usr/bin/env bash
echo "=== Containers ==="
docker ps --filter name=vistomap --format "{{.Names}}: {{.Status}}"

echo
echo "=== Fetch /painel/login ==="
curl -sS -k --max-time 8 https://zabbmap.nansen.com.br/painel/login > /tmp/page.html
echo "Size: $(wc -c < /tmp/page.html)"

echo
echo "--- Contem 'CENTRAL' (painel admin) ou 'Operacional' (tecnico)? ---"
echo "CENTRAL OPERACIONAL: $(grep -c 'CENTRAL OPERACIONAL' /tmp/page.html)"
echo "Bem-vindo de volta: $(grep -c 'Bem-vindo de volta' /tmp/page.html)"
echo "logo_video.mp4 (tecnico): $(grep -c 'logo_video.mp4' /tmp/page.html)"

echo
echo "--- assets _next/static ---"
grep -oE '/_next/static/[^"]+' /tmp/page.html | head -5
grep -oE '/painel/_next/static/[^"]+' /tmp/page.html | head -5

echo
echo "--- img tags ---"
grep -oE '<img[^>]+>' /tmp/page.html | head -5

echo
echo "--- login_painel urls ---"
grep -oE 'login_painel[^"]+' /tmp/page.html | head -5

echo
echo "=== Testa assets fetch ==="
ASSET=$(grep -oE '/_next/static/[^"]+\.js' /tmp/page.html | head -1)
echo "Sem prefix: $ASSET"
[ -n "$ASSET" ] && curl -sSI -k --max-time 5 "https://zabbmap.nansen.com.br$ASSET" | head -1

ASSET2=$(grep -oE '/painel/_next/static/[^"]+\.js' /tmp/page.html | head -1)
echo "Com prefix: $ASSET2"
[ -n "$ASSET2" ] && curl -sSI -k --max-time 5 "https://zabbmap.nansen.com.br$ASSET2" | head -1

echo
echo "=== ENV containers ==="
docker exec vistomap-painel printenv NEXT_PUBLIC_USE_BASE_PATH NEXT_PUBLIC_BASE_PATH
echo "---"
docker exec vistomap-tecnico printenv NEXT_PUBLIC_USE_BASE_PATH NEXT_PUBLIC_BASE_PATH

echo
echo "=== Direto do container painel (sem nginx) ==="
echo "URL /painel/login direto:"
curl -sS --max-time 5 http://127.0.0.1:3002/painel/login | head -c 500
echo
echo "URL /login direto (sem prefix):"
curl -sS --max-time 5 http://127.0.0.1:3002/login | head -c 200
