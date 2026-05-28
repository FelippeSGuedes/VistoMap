#!/usr/bin/env bash
docker exec vistomap-painel cat .next/prerender-manifest.json > /tmp/prerender.json
echo "=== Rotas painel prerendered ==="
python3 -c "
import json
d = json.load(open('/tmp/prerender.json'))
for k, v in d.get('routes', {}).items():
    if 'painel' in k:
        print(k, '->', 'srcRoute=' + str(v.get('srcRoute')), 'dataRoute=' + str(v.get('dataRoute')))
print()
print('=== Dynamic routes ===')
for k, v in d.get('dynamicRoutes', {}).items():
    print(k)
print()
print('=== App routes em routes-manifest ===')
"

docker exec vistomap-painel cat .next/routes-manifest.json > /tmp/routes.json
python3 -c "
import json
d = json.load(open('/tmp/routes.json'))
for r in d.get('staticRoutes', []):
    if 'painel' in r.get('page', ''):
        print('STATIC:', r['page'])
for r in d.get('dynamicRoutes', []):
    if 'painel' in r.get('page', ''):
        print('DYNAMIC:', r['page'])
"
