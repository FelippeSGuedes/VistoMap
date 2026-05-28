#!/usr/bin/env bash
# Fix da senha do .env.local no destino — sem expansion de shell
set -e

# Senha em base64 pra evitar expansion
PASS=$(echo "ISFOQG4kM24=" | base64 -d)

echo "Senha length: ${#PASS}"
echo "Senha decoded (mascarada): ${PASS:0:2}***${PASS: -2}"

echo
echo "=== Backup .env.local atual ==="
sudo cp /etc/vistomap/.env.local /etc/vistomap/.env.local.bak-$(date +%F-%H%M)
sudo ls -la /etc/vistomap/

echo
echo "=== Substitui SO a linha GLPI_DB_PASSWORD ==="
# Usa Python pra escapar a senha corretamente
sudo python3 - "$PASS" << 'PYEOF'
import sys
pwd = sys.argv[1]
path = '/etc/vistomap/.env.local'
with open(path) as f:
    lines = f.readlines()
new = []
for line in lines:
    if line.startswith('GLPI_DB_PASSWORD='):
        new.append(f'GLPI_DB_PASSWORD={pwd}\n')
    else:
        new.append(line)
with open(path, 'w') as f:
    f.writelines(new)
print("OK")
PYEOF

echo
echo "=== Verifica nova senha (mascarada) ==="
sudo grep '^GLPI_DB_PASSWORD' /etc/vistomap/.env.local | sed -E 's/^(GLPI_DB_PASSWORD=).{2}.*(.{2})$/\1\2[len=NEW]/'

echo
echo "=== Testa conexao com novo password (cmd direto via Python) ==="
sudo python3 - "$PASS" << 'PYEOF'
import sys, pymysql
try:
    c = pymysql.connect(host='127.0.0.1', port=3307, user='glpi_gioc', password=sys.argv[1], database='glpi_gioc')
    with c.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM glpi_users")
        print("USERS =", cur.fetchone()[0])
    c.close()
    print("DB CONN OK")
except Exception as e:
    print("DB CONN FAIL:", e)
PYEOF

echo
echo "=== Restart containers Next pra recarregar env ==="
docker compose -f /opt/vistomap/docker-compose.gioc.yml --env-file /etc/vistomap/.env.local restart vistomap-tecnico vistomap-painel 2>&1 | tail -3
sleep 5
docker ps --filter name=vistomap --format "{{.Names}}: {{.Status}}"

echo
echo "=== Re-testa login fake ==="
curl -sS -k --max-time 8 -X POST \
  https://zabbmap.nansen.com.br/painel/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"nao_existe","senha":"x"}'
echo
echo "(Se vier 401 'Credenciais invalidas' ou 'Usuario nao autorizado' = DB OK, senha errada esperada)"
echo "(Se vier 500 'Erro interno' = DB ainda falha)"
