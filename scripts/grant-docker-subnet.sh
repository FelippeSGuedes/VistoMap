#!/usr/bin/env bash
PASS=$(echo "ISFOQG4kM24=" | base64 -d)

echo "=== Subnets docker ==="
docker network ls
ip addr show docker0 2>&1 | grep inet
docker inspect vistomap_vistomap-net 2>&1 | grep -E "Subnet|IPAddress" | head -5

echo
echo "=== bind-address atual MariaDB ==="
sudo cat /etc/mysql/mariadb.conf.d/50-server.cnf 2>/dev/null | grep -E "bind-address|skip-name-resolve|skip-networking" || true
sudo cat /etc/mysql/my.cnf 2>/dev/null | grep -E "bind-address|skip-name-resolve|skip-networking" || true

echo
echo "=== Cria grants explicitos pra subnet docker ==="
sudo mysql << SQL
-- Subnets comuns de bridges docker
CREATE USER IF NOT EXISTS 'glpi_gioc'@'172.17.%' IDENTIFIED BY '$PASS';
CREATE USER IF NOT EXISTS 'glpi_gioc'@'172.18.%' IDENTIFIED BY '$PASS';
CREATE USER IF NOT EXISTS 'glpi_gioc'@'172.19.%' IDENTIFIED BY '$PASS';
CREATE USER IF NOT EXISTS 'glpi_gioc'@'172.20.%' IDENTIFIED BY '$PASS';
CREATE USER IF NOT EXISTS 'glpi_gioc'@'172.21.%' IDENTIFIED BY '$PASS';
CREATE USER IF NOT EXISTS 'glpi_gioc'@'172.22.%' IDENTIFIED BY '$PASS';
CREATE USER IF NOT EXISTS 'glpi_gioc'@'172.23.%' IDENTIFIED BY '$PASS';
GRANT ALL PRIVILEGES ON glpi_gioc.* TO 'glpi_gioc'@'172.17.%';
GRANT ALL PRIVILEGES ON glpi_gioc.* TO 'glpi_gioc'@'172.18.%';
GRANT ALL PRIVILEGES ON glpi_gioc.* TO 'glpi_gioc'@'172.19.%';
GRANT ALL PRIVILEGES ON glpi_gioc.* TO 'glpi_gioc'@'172.20.%';
GRANT ALL PRIVILEGES ON glpi_gioc.* TO 'glpi_gioc'@'172.21.%';
GRANT ALL PRIVILEGES ON glpi_gioc.* TO 'glpi_gioc'@'172.22.%';
GRANT ALL PRIVILEGES ON glpi_gioc.* TO 'glpi_gioc'@'172.23.%';
-- Reset @ % tb pra mesma senha
ALTER USER 'glpi_gioc'@'%' IDENTIFIED BY '$PASS';
ALTER USER 'glpi_gioc'@'localhost' IDENTIFIED BY '$PASS';
FLUSH PRIVILEGES;
SQL

echo
echo "=== Grants atuais ==="
sudo mysql -e "SELECT user, host FROM mysql.user WHERE user='glpi_gioc';"

echo
echo "=== Testa login fake (espera 401) ==="
curl -sS -k --max-time 10 -X POST \
  https://zabbmap.nansen.com.br/painel/api/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"login":"x","senha":"x"}'
echo
echo
docker logs vistomap-painel --tail 5 2>&1
