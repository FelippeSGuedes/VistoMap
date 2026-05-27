#!/usr/bin/env bash
set -e
NGINX_SITE=/etc/nginx/sites-enabled/parana-network
SNIPPET=/tmp/nginx-vistomap.conf

# Backup
sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak-$(date +%F-%H%M)"
ls -la /etc/nginx/sites-enabled/

# Insere snippet antes de 'location / {' usando python
# Sempre RECRIA (se ja tem snippet antigo, substitui)
sudo python3 - "$NGINX_SITE" "$SNIPPET" << 'PYEOF'
import sys, re
path, snippet_path = sys.argv[1], sys.argv[2]
content = open(path).read()
snippet = open(snippet_path).read()
marker = '    location / {'
# Remove bloco antigo se existir (entre marcador inicio/fim)
content = re.sub(
    r'\n*\s*# === VistoMap (App|Painel|Postes|.*?) ===.*?(?=\n\s*location / \{|\n\s*#\s*===)',
    '',
    content,
    flags=re.DOTALL,
)
# Insere novo snippet
new = content.replace(marker, snippet + '\n' + marker)
open(path, 'w').write(new)
print('snippet inserido (substituido se ja existia)')
PYEOF

echo
echo "=== nginx -t ==="
sudo nginx -t

echo
echo "=== reload ==="
sudo systemctl reload nginx
echo OK
