# DFY-IA / BrainRam — Infra & Integrações

Documento de referência dos serviços externos, endpoints e variáveis usadas pelo sistema.
**Valores reais ficam em `/home/guest/Área de trabalho/dfy-ia/.env` (não commitado).**

---

## 1. Perplexity (scoring de leads)

- **Uso:** modelo `sonar` pra classificar lead como MEI/solo (score 80-100) vs franquia/rede (penalizado).
- **Script:** `prospeccao/scripts/3-score-pplx-v2.ts`
- **Endpoint:** `https://api.perplexity.ai/chat/completions`
- **Env:**
  - `PERPLEXITY_KEY` — Bearer token (`pplx-...`)
- **Custo típico:** ~$0.005/lead scorado.
- **Prompt:** favorece Dr./Dra. (nome de pessoa), penaliza OralSin / Sorridents / OdontoCompany / franquias.

---

## 2. Evolution API (WhatsApp) — via Cloudflare Tunnel

- **Host público:** `https://cunninghagfish-evolution.cloudfy.live`
  - Cloudflare tunnel (cloudflared) apontando pra Evolution self-hosted.
  - URL estável enquanto o túnel nomeado existir. **NÃO confundir com** `*.trycloudflare.com` (URLs efêmeras que rotacionam — não usar em produção).
- **Instâncias (tabela `wa_instances`):**
  - `Clickmont` — número 5511-5128-0116, chip maduro (warmup_stage 3, cap 150/d).
    - **Status atual:** DESCONECTADO (device_removed / 401 conflict em 2026-04-22 16:06Z). Provável soft-ban por volume.
- **Endpoints usados:**
  - `POST /message/sendText/{instance}` — texto
  - `POST /message/sendMedia/{instance}` — vídeo demo (mediatype=video)
  - `GET /instance/connect/{instance}` — pede QR pra reconectar
  - `GET /instance/connectionState/{instance}` — checa status
  - `GET /instance/fetchInstances` — lista tudo
- **Env:**
  - `EVOLUTION_URL` (fallback global, usado se `wa_instances` vazio)
  - `EVOLUTION_API_KEY` (apikey no header)
  - `EVOLUTION_INSTANCES` (csv, opcional)
- **Envio:** rotação automática pela instância com menor `daily_sent`, delay 45-120s entre msgs, reset diário do contador.

---

## 3. Supabase (DB + Auth)

- **Projeto:** `nlcmhqevxpdttuhamjsj` (region sa-east-1).
- **URL:** `https://nlcmhqevxpdttuhamjsj.supabase.co`
- **Tabelas principais:**
  - `leads` — prospects com score, phone, city, sent_at, replied_at, raw (jsonb)
  - `campaigns` — segmentação (niche, cities, score_cut, daily_cap, channels, copy_wa_id)
  - `campaign_runs` — log de cada tick por campanha
  - `copy_templates` — body/subject com `{name}`, `{city}`, `{niche}`
  - `wa_instances` — multi-número com rotação
  - `prospect_jobs` — fila de scrape pro scraper engine
  - `system_flags` — `dispatch_paused`, `worker_lock`
- **Env:**
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY` (front)
  - `SUPABASE_SERVICE_ROLE_KEY` (worker/admin — nunca expor)

---

## 4. Scraper (Google Maps via Apify/VPS)

- **Host:** VPS Hostinger (187.127.25.184) com SSH tunnel local `:3030 → scraper`.
- **Env:**
  - `SCRAPER_URL` (ex: `http://localhost:3030` ou URL pública)
  - `SCRAPER_API_KEY`
- **Endpoint interno:** `POST /v1/scrape/google-maps` `{query, city, limit}`
- **Pipelines:**
  - `prospeccao/scripts/1-scrape-multicity.ts` — scrape N cidades
  - `prospeccao/scripts/pipeline-national.sh` — scrape → score v2 → import
  - `prospeccao/scripts/pipeline-niches.sh` — 4 nichos × 15 capitais × 30 leads

---

## 5. Resend (email — INATIVO)

- **Motivo inativo:** domínio `brainram.com.br` não está registrado (RDAP 404). Email travado até domínio existir.
- **Env:**
  - `RESEND_API_KEY` (`re_...`)
  - `FROM_EMAIL` (ex: `BrainRam <contato@brainram.com.br>`)
  - `REPLY_TO`
- Quando domínio estiver ativo: verificar DNS no Resend, remover pause.

---

## 6. Cloudflare

- **Uso atual:** DNS + tunnel pro Evolution (`cloudfy.live`).
- **Zone API:** verificada — o token tem acesso a 0 zones (conta sem domínios ativos no momento).
- **Env:**
  - `CF_API_TOKEN` (cfut_... User API Token) — só usar pra scripts de DNS se/quando houver domínio.

---

## 7. Mercado Pago (billing SaaS)

- **Uso:** cobrança R$297/R$497 mensal, 7 dias de trial.
- **Env:**
  - `MP_ACCESS_TOKEN` (produção)
  - `MP_PUBLIC_KEY`
- **Plans:** `mp-plans.json` (snapshot dos preapproval_plan_id)
- **Trial autocancel:** `delivery/migration-trial-autocancel.sql`

---

## 8. Anthropic (atendente IA — Claude)

- **Uso:** Claude 4.5 Sonnet no atendente de WhatsApp (pós-venda, responder leads convertidos).
- **Env:**
  - `ANTHROPIC_API_KEY` (`sk-ant-...`)

---

## 9. Redis / Upstash

- **Uso:** rate limiting + dedupe de mensagens de entrada.
- **Env:**
  - `REDIS_URL` (rediss://...)
  - `UPSTASH_MGMT_KEY` (opcional — console API)

---

## 10. Vercel (landing + painel admin frontend)

- **Env:**
  - `VERCEL_TOKEN`
- Deploy via `vercel --prod --token $VERCEL_TOKEN` em `landing/`.

---

## Admin Panel / Worker

- **Path:** `delivery/agent-perplexity/admin.ts` + `sales-server.ts`
- **Container:** `dfy-sales` em VPS Hostinger (`187.127.25.184:8080`).
- **Admin UI:** `http://187.127.25.184:8080/admin` — cookie `ADMIN_KEY=brainram-admin`.
- **Tick cron:** horário comercial BRT (9-12, 14-18, seg-sex), worker_lock TTL 30min.
- **Claim otimista:** `UPDATE leads SET sent_at=now() WHERE id=? AND sent_at IS NULL` — evita double-send.
- **Deploy:**
  ```bash
  cd delivery/agent-perplexity
  scp admin.ts sales-server.ts root@187.127.25.184:/opt/dfy-sales/
  ssh root@187.127.25.184 "cd /opt/dfy-sales && docker compose up -d --build"
  ```

---

## Estado Operacional (2026-04-22)

| Item | Status |
|---|---|
| Scrape nacional odonto (83 cid) | ✅ Rodando |
| Scrape 4 nichos (estética/vet/fisio/psi) | ⏳ Em fila |
| Clickmont WA | ❌ Banido/device_removed — aguardar 2º chip |
| Dispatch worker | ⏸ Pausado (`system_flags.dispatch_paused=true`) |
| Double-send bug | ✅ Corrigido (lock + claim otimista) |
| Email channel | ❌ Bloqueado (sem domínio) |
| Campanhas ativas | 6 (1 estética + 5 odonto regional) |
| Leads elegíveis (score≥80, não enviados) | 1.342 |
| Leads enviados hoje antes do ban | 53 |

---

## Próximos passos

1. Receber 2º chip WhatsApp → cadastrar em `wa_instances` com `warmup_stage=1, daily_cap=30`.
2. Aquecer 7-14 dias antes de escalar.
3. Registrar domínio `brainram.com.br` pra reativar canal email.
4. Rescan QR do Clickmont se não for ban definitivo.
