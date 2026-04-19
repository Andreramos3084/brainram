# Scraper Engine — Substituto do Apify

## Stack
- **Node.js 20** + TypeScript
- **Playwright** (browser real + stealth) — scraping Google Maps + Instagram
- **Hono** — API REST leve
- **BullMQ + Redis** — fila de jobs assíncronos
- **Postgres** (Supabase remoto OU local via Docker) — persistência
- **Cheerio** — parse de HTML de sites

## Por que Playwright vs HTTP puro
Google Maps carrega resultados via JS. Sem browser = HTML vazio.
Playwright + stealth plugin contorna detecção básica. Volume médio (500-2000 leads/dia) passa tranquilo sem proxies.

## Componentes

```
┌────────────────┐     ┌──────────────┐     ┌─────────────┐
│  API (Hono)    │────▶│  Queue       │────▶│  Workers    │
│  POST /scrape  │     │  BullMQ      │     │  Playwright │
└────────────────┘     └──────────────┘     └─────────────┘
        │                                           │
        ▼                                           ▼
┌────────────────┐                         ┌──────────────┐
│  Supabase      │◀────────────────────────│  Storage     │
│  leads_raw     │                         │  Layer       │
└────────────────┘                         └──────────────┘
```

## Scrapers incluídos

| Scraper | Input | Output |
|---------|-------|--------|
| `google-maps` | query + cidade + limite | nome, tel, endereço, site, rating, reviews, mapsUrl |
| `instagram` | handle ou url | bio, seguidores, posts_30d, última_atividade |
| `website-signals` | url | tem_agendamento_online, tecnologia, pixel_fb, formulário |
| `facebook-ads-library` | nome empresa | anúncios ativos (sinal de que investe em marketing) |

## API Endpoints

```
POST /v1/scrape/google-maps
  body: { query, city, limit, jobId? }
  → 202 { jobId }

GET  /v1/job/:jobId
  → { status, progress, result? }

POST /v1/enrich
  body: { leads: [...] }
  → 202 { jobId }

GET  /v1/health
  → { ok, queue_size, uptime }
```

## Deploy Hostinger VPS

- **Plano recomendado:** KVM 2 (R$49/mo) — 2 vCPU, 8GB RAM, 100GB SSD
- Ubuntu 22.04 + Docker + docker-compose
- Nginx reverse proxy + Let's Encrypt
- Subdomínio: `api.dfy-ia.com.br`
- Auto-restart via systemd
- Backup diário Postgres → Supabase Storage

## Anti-bot
- Stealth plugin ativo
- User-agent rotativo (pool de 20)
- Viewport randômico
- Delays humanos (clicks, scrolls, typing)
- Retry com backoff exponencial
- Se detectar captcha → marca job como `needs_manual` e alerta

## Custo
- VPS Hostinger: R$49/mês
- Domínio: já tem
- Proxies: opcional, só se escalar >2k leads/dia
- **Total: R$49/mês** (vs R$180 Apify)

## Capacidade
- 1 worker Playwright = ~300-500 leads/hora (Google Maps)
- 2-3 workers concorrentes = 1k-1.5k leads/hora
- Instagram enrichment: 1000/hora (mais leve)
