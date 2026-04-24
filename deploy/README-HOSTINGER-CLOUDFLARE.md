# Deploy BrainRam — Hostinger VPS + Cloudflare Workers

## Arquitetura

```
[Internet]
    │
    ├─→ Cloudflare Workers (tracking pixel, unsubscribe, edge caching)
    │
    ├─→ Cloudflare Tunnel (evolution.dfy-ia.com.br → VPS Hostinger)
    │
    └─→ VPS Hostinger (187.127.25.184)
         ├─ Docker: sales-server (porta 8080)
         ├─ Docker: scraper-engine API (porta 3030)
         ├─ Docker: Redis (porta 6379)
         └─ Nginx reverse proxy
```

## VPS Hostinger — Setup

### 1. Conectar
```bash
ssh root@187.127.25.184
```

### 2. Instalar dependências
```bash
apt update && apt install -y docker.io docker-compose nginx certbot python3-certbot-nginx
systemctl enable docker
```

### 3. Criar diretórios
```bash
mkdir -p /opt/brainram/{sales,scraper,redis}
mkdir -p /opt/brainram/dashboard
```

### 4. Copiar código
```bash
# Do seu local:
scp -r delivery/agent-perplexity/* root@187.127.25.184:/opt/brainram/sales/
scp -r scraper-engine/* root@187.127.25.184:/opt/brainram/scraper/
scp -r dashboard/cliente/dist/* root@187.127.25.184:/opt/brainram/dashboard/
```

### 5. Docker Compose — Sales Server
Crie `/opt/brainram/sales/docker-compose.yml`:
```yaml
version: '3.8'
services:
  sales:
    build: .
    ports:
      - "127.0.0.1:8080:8080"
    env_file: .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 6. Nginx — Reverse Proxy
Crie `/etc/nginx/sites-available/brainram`:
```nginx
server {
    listen 80;
    server_name app.brainram.com.br;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    server_name dashboard.brainram.com.br;
    root /opt/brainram/dashboard;
    index index.html;
    try_files $uri $uri/ /index.html;
}
```

```bash
ln -s /etc/nginx/sites-available/brainram /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 7. SSL (Cloudflare ou Let's Encrypt)
Opção A — Cloudflare (recomendado):
- Configure DNS A `app.brainram.com.br` → `187.127.25.184`
- Ative proxy (nuvem laranja) no Cloudflare
- SSL/TLS mode: Full (strict)

Opção B — Let's Encrypt:
```bash
certbot --nginx -d app.brainram.com.br -d dashboard.brainram.com.br
```

### 8. Deploy
```bash
cd /opt/brainram/sales && docker compose up -d --build
```

---

## Cloudflare Workers — Setup

### 1. Instalar Wrangler
```bash
npm install -g wrangler
```

### 2. Autenticar
```bash
wrangler login
```

### 3. Criar worker
```bash
cd delivery/cloudflare-worker
wrangler init brainram-worker --yes
# Copiar index.ts para src/index.ts
```

### 4. Configurar secrets
```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
```

### 5. Deploy
```bash
wrangler deploy
```

### 6. Rotear domínio
No Cloudflare Dashboard:
- Workers & Pages → Add route
- `brainram.com.br/track/*` → `brainram-worker`
- `brainram.com.br/unsubscribe` → `brainram-worker`

---

## Dashboard do Cliente — Deploy

### 1. Build local
```bash
cd dashboard/cliente
npm install
npm run build
```

### 2. Copiar para VPS
```bash
scp -r dist/* root@187.127.25.184:/opt/brainram/dashboard/
```

### 3. Ou deploy no Cloudflare Pages (alternativa)
```bash
cd dashboard/cliente
wrangler pages deploy dist --project-name=brainram-dashboard
```

---

## Cron Jobs (GitHub Actions ou VPS cron)

### Campaign tick (disparo de prospecção)
```bash
# VPS cron — editar com: crontab -e
0 9,14 * * 1-5 curl -X POST https://app.brainram.com.br/cron/campaign-tick -H "x-admin-key: SUA_CHAVE"
0 11 * * 1-5 curl -X POST https://app.brainram.com.br/admin/trial-check -H "x-admin-key: SUA_CHAVE"
0 18 * * 1-5 curl -X POST https://app.brainram.com.br/admin/daily-report -H "x-admin-key: SUA_CHAVE"
```

### GitHub Actions (alternativa zero-custo)
Usar `.github/workflows/daily-dispatch.yml` com `workflow_dispatch` + `schedule`.

---

## Variáveis de Ambiente (.env no VPS)

```bash
# === APIs ===
ANTHROPIC_API_KEY=sk-ant-...
PERPLEXITY_KEY=pplx-...
MP_ACCESS_TOKEN=APP_USR-...

# === Supabase ===
SUPABASE_URL=https://nlcmhqevxpdttuhamjsj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# === Evolution (via Cloudflare Tunnel) ===
EVOLUTION_URL=https://cunninghagfish-evolution.cloudfy.live
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=Clickmont

# === Email (Resend) ===
RESEND_API_KEY=re_...
FROM_EMAIL=André Ramos <onboarding@resend.dev>
REPLY_TO=andre@brainram.com.br

# === Scraper ===
SCRAPER_URL=http://localhost:3030
SCRAPER_API_KEY=...

# === Admin ===
ADMIN_KEY=brainram-admin
ADMIN_PHONE=5519998760212

# === Demo ===
DEMO_VIDEO_URL=https://...
```

---

## Comandos Úteis

```bash
# Ver logs do sales server
docker logs -f brainram-sales-1

# Restart
cd /opt/brainram/sales && docker compose restart

# Backup do banco (Supabase faz automaticamente)
# PITR disponível no painel do Supabase

# Monitoramento básico
htop
docker stats
```

---

## Troubleshooting

| Problema | Causa provável | Solução |
|----------|---------------|---------|
| Worker não responde | Route não configurada | Verificar rotas no Cloudflare Dashboard |
| Email não chega | Resend sem domínio verificado | Usar `onboarding@resend.dev` temporariamente |
| Scraper lento | Google Maps bloqueando | Reduzir limit, aumentar delay, usar proxy |
| Número WA banido | Volume alto | Pausar, aquecer novo número, migrar leads para email |
| Dashboard 404 | Nginx config | Verificar `try_files $uri $uri/ /index.html` |
