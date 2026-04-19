# DFY-IA Scraper Engine

Substitui Apify. Roda 24/7 numa VPS Hostinger.

## Quick start (local dev)

```bash
cd scraper-engine
cp .env.example .env
docker compose up -d redis
npm install
npm run dev             # API em :3030
npm run dev:worker      # Worker em outro terminal
```

Testar:
```bash
curl -X POST http://localhost:3030/v1/scrape/google-maps \
  -H "x-api-key: $SCRAPER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "clínica odontológica", "city": "Campinas", "limit": 20}'
# → {"jobId":"1"}

curl http://localhost:3030/v1/job/scrape/1 -H "x-api-key: $SCRAPER_API_KEY"
# → {"state":"active","progress":{"current":8,"total":20},...}
```

## Deploy Hostinger (produção)

1. Comprar VPS KVM 2 (R$49/mo) Ubuntu 22.04
2. Apontar DNS `api.dfy-ia.com.br` → IP da VPS
3. SSH root e rodar:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/.../deploy/hostinger-setup.sh | bash
   ```
4. Aplicar schema no Supabase:
   ```bash
   psql $SUPABASE_DB_URL < deploy/supabase-schema.sql
   ```
5. Copiar código pra VPS (git clone ou rsync):
   ```bash
   rsync -avz --exclude node_modules ./ dfyia@VPS_IP:/home/dfyia/scraper-engine/
   ```
6. Na VPS, preencher `.env` e subir:
   ```bash
   cd /home/dfyia/scraper-engine
   docker compose up -d --build
   ```
7. SSL:
   ```bash
   certbot --nginx -d api.dfy-ia.com.br
   ```

## Integrar com pipeline principal

Em `prospeccao/scripts/1-scrape.ts`, trocar Apify por chamada ao engine:

```ts
const res = await fetch(`${process.env.SCRAPER_URL}/v1/scrape/google-maps`, {
  method: 'POST',
  headers: { 'x-api-key': process.env.SCRAPER_API_KEY!, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, city, limit }),
});
const { jobId } = await res.json();
// poll status até complete, depois GET /v1/leads?query=...
```

## Monitoramento

- `GET /v1/health` — status filas + uptime
- Docker logs: `docker compose logs -f worker`
- Bull Board (UI): adicionar `@bull-board/api` depois, porta 3031

## Escalar

Aumentar workers:
```yaml
# docker-compose.yml
worker:
  deploy:
    replicas: 4  # era 2
```
e `docker compose up -d --scale worker=4`
