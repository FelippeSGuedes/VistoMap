#!/usr/bin/env bash
echo "=== Fetch /painel/login ==="
curl -sS -k --max-time 8 https://zabbmap.nansen.com.br/painel/login > /tmp/p.html
echo "Size: $(wc -c < /tmp/p.html)"

echo
echo "=== img src tags ==="
grep -oE '<img[^>]+src="[^"]+"' /tmp/p.html | head -10

echo
echo "=== TESTA cada imagem refer no HTML ==="
for url in $(grep -oE 'src="[^"]+\.(png|PNG|jpg|svg|mp4)"' /tmp/p.html | grep -oE '"/[^"]+' | tr -d '"' | sort -u); do
  STATUS=$(curl -sSI -k --max-time 5 "https://zabbmap.nansen.com.br$url" | head -1 | awk '{print $2}')
  echo "  $STATUS  $url"
done

echo
echo "=== Conteudo de pagina (sinais de PAINEL) ==="
echo "CENTRAL OPERACIONAL: $(grep -c 'CENTRAL OPERACIONAL' /tmp/p.html)"
echo "Bem-vindo de volta: $(grep -c 'Bem-vindo de volta' /tmp/p.html)"
echo "Usuário GIOC: $(grep -c 'Usu' /tmp/p.html)"

echo
echo "=== Test login API ==="
curl -sS -k --max-time 8 -X POST \
  https://zabbmap.nansen.com.br/painel/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"x","senha":"x"}'
