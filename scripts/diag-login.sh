#!/usr/bin/env bash
echo "=== Logs container painel ==="
docker logs vistomap-painel --tail 50 2>&1
echo
echo "=== Tenta POST login fake ==="
curl -sS -k --max-time 8 -X POST \
  https://zabbmap.nansen.com.br/painel/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"test","senha":"test"}' 2>&1
echo
echo
echo "=== Logs apos POST ==="
docker logs vistomap-painel --tail 15 2>&1
echo
echo "=== Tenta DB conn de dentro do container painel ==="
docker exec vistomap-painel sh -c 'node -e "const m=require(\"mysql2/promise\");(async()=>{const c=await m.createConnection({host:process.env.GLPI_DB_HOST,port:+process.env.GLPI_DB_PORT,user:process.env.GLPI_DB_USER,password:process.env.GLPI_DB_PASSWORD,database:process.env.GLPI_DB_NAME});const[r]=await c.execute(\"SELECT 1 AS ok\");console.log(JSON.stringify(r));await c.end();})().catch(e=>console.error(\"ERR\",e.message))"' 2>&1
echo
echo "=== Env do container painel ==="
docker exec vistomap-painel env | grep -E "GLPI_DB|BASE_PATH" | sort
