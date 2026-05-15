# Proxy reverso — roteamento `/postes` para Fastify

A regra é manter **mesma origem** no navegador (sem CORS pain):
- `/` e `/api/*` → container `vistomap` (Next.js) :3000
- `/postes/*` → container `vistomap-postes-api` (Fastify) :3001

## Caddy (recomendado — auto-HTTPS via Let's Encrypt)

```caddy
vistomap.seudominio.com.br {
    encode gzip zstd
    request_body {
        max_size 100MB
    }

    # Fastify — postes (PostGIS)
    handle /postes/* {
        reverse_proxy localhost:3001 {
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
        }
    }

    # Next.js — tudo o resto
    handle {
        reverse_proxy localhost:3000 {
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
        }
    }
}
```

## Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name vistomap.seudominio.com.br;

    ssl_certificate     /etc/letsencrypt/live/vistomap.seudominio.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vistomap.seudominio.com.br/privkey.pem;

    client_max_body_size 100M;
    proxy_request_buffering off;
    proxy_read_timeout 300s;

    # Fastify — postes
    location /postes/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Next.js — tudo o resto
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 80;
    server_name vistomap.seudominio.com.br;
    return 301 https://$host$request_uri;
}
```
