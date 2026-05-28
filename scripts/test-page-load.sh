#!/usr/bin/env bash
echo "=== Carrega mapa/page.js ==="
docker exec vistomap-painel node -e "try { const m = require('./.next/server/app/painel/mapa/page.js'); console.log('OK', Object.keys(m).join(',')); } catch(e) { console.log('ERR', e.message); }"
echo
echo "=== Carrega historico/page.js (que funciona) ==="
docker exec vistomap-painel node -e "try { const m = require('./.next/server/app/painel/historico/page.js'); console.log('OK', Object.keys(m).join(',')); } catch(e) { console.log('ERR', e.message); }"
echo
echo "=== Carrega tecnicos/page.js ==="
docker exec vistomap-painel node -e "try { const m = require('./.next/server/app/painel/tecnicos/page.js'); console.log('OK', Object.keys(m).join(',')); } catch(e) { console.log('ERR', e.message); }"
echo
echo "=== Listar arquivos no painel build ==="
docker exec vistomap-painel ls -la .next/server/app/painel/
