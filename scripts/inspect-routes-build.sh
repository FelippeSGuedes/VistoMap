#!/usr/bin/env bash
echo "=== arquivos painel/mapa (404) ==="
docker exec vistomap-painel ls -la .next/server/app/painel/mapa
echo
echo "=== arquivos painel/vistorias (200) ==="
docker exec vistomap-painel ls -la .next/server/app/painel/vistorias
echo
echo "=== prerender-manifest ==="
docker exec vistomap-painel sh -c 'cat .next/prerender-manifest.json' | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(k) for k in sorted(d.get("routes",{}).keys()) if "painel" in k]'
echo
echo "=== app-paths-manifest ==="
docker exec vistomap-painel sh -c 'cat .next/server/app-paths-manifest.json' 2>&1 | head -50
