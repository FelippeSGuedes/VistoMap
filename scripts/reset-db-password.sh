#!/usr/bin/env bash
# Reset senha do user glpi_gioc no MariaDB destino
PASS=$(echo "ISFOQG4kM24=" | base64 -d)   # !!N@n$3n

echo "=== Hash atual no MariaDB ==="
sudo mysql -e "SELECT user, host, password FROM mysql.user WHERE user='glpi_gioc';"

echo
echo "=== Reset senha p/ ambos @localhost e @% ==="
sudo mysql << SQL
ALTER USER 'glpi_gioc'@'localhost' IDENTIFIED BY '$PASS';
ALTER USER 'glpi_gioc'@'%' IDENTIFIED BY '$PASS';
FLUSH PRIVILEGES;
SQL

echo
echo "=== Hash apos reset ==="
sudo mysql -e "SELECT user, host, password FROM mysql.user WHERE user='glpi_gioc';"

echo
echo "=== Testa conexao de localhost TCP (host docker) ==="
mysql -h 127.0.0.1 -P 3307 -u glpi_gioc -p"$PASS" glpi_gioc -e "SELECT COUNT(*) FROM glpi_users;" 2>&1

echo
echo "=== Testa de dentro do container (172.20.0.x) ==="
docker exec vistomap-painel sh -c "curl -sS --max-time 5 http://127.0.0.1:3000/painel/api/auth/login -X POST -H 'Content-Type: application/json' --data '{\"login\":\"x\",\"senha\":\"x\"}'" 2>&1
echo
docker logs vistomap-painel --tail 5 2>&1
