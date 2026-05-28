#!/usr/bin/env bash
for d in mapa tecnicos revisitas auditoria vistorias historico login; do
  STATUS=$(curl -sSI -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3002/painel/$d 2>/dev/null)
  PAGE=$(docker exec vistomap-painel sh -c "wc -c < .next/server/app/painel/$d/page.js 2>/dev/null || echo 0")
  CRM=$(docker exec vistomap-painel sh -c "wc -c < .next/server/app/painel/$d/page_client-reference-manifest.js 2>/dev/null || echo 0")
  printf "%-15s %s  page.js=%s  crm=%s\n" "$d" "$STATUS" "$PAGE" "$CRM"
done
