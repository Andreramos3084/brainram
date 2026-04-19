# 🎯 Status Atual da Operação DFY-IA

**Última atualização:** 2026-04-19

## Pronto (100% código escrito)

### Produto
- ✅ Landing page completa (dark theme, seções hero/problema/demo/como funciona/preços/FAQ/CTA) — `landing/index.html`
- ✅ System prompt agente odonto com 4 exemplos + regras duras — `produto/agentes/clinica-odonto-full.md`
- ✅ Template multi-nicho (odonto/imobiliária/autoescola) — `produto/agentes/template-base.md`

### Motor de prospecção
- ✅ **Scraper engine próprio** (substitui Apify, corta R$180/mês)
  - Google Maps (Playwright + stealth) — `scraper-engine/src/scrapers/google-maps.ts`
  - Instagram (dados públicos) — `scraper-engine/src/scrapers/instagram.ts`
  - Website signals (detecta WhatsApp/booking/pixels) — `scraper-engine/src/scrapers/website-signals.ts`
  - API Hono + BullMQ — `scraper-engine/src/api/server.ts`
  - Worker async — `scraper-engine/src/queue/worker.ts`
  - Docker Compose multi-arch (ARM/x64) — `scraper-engine/docker-compose.yml`
- ✅ Pipeline principal (consome engine próprio) — `prospeccao/scripts/1-scrape-v2.ts`
- ✅ Enriquecimento com Perplexity — `prospeccao/scripts/2-enrich.ts`
- ✅ Scoring Sonnet (original) + **Haiku (10x barato)** + **Batch API (50% off)**
  - `prospeccao/scripts/3-score.ts` / `3-score-haiku.ts` / `3-score-batch.ts`
- ✅ Sender Evolution API com rate-limit + rotação de números — `prospeccao/scripts/4-send.ts`
- ✅ Orquestrador shell — `prospeccao/run.sh`

### Backend (Supabase edge functions)
- ✅ `onboard-client` — cria tenant + Evolution instance + gera prompt com Claude
- ✅ `agent-handler` — versão base
- ✅ `agent-handler-cached` — **com prompt caching (corta 90% do custo)**
- ✅ Schema Postgres — `scraper-engine/deploy/supabase-schema.sql`

### Automação (crons grátis)
- ✅ GitHub Actions `daily-scrape.yml` — prospecção automática seg-sex 7h BRT
- ✅ GitHub Actions `daily-content.yml` — conteúdo Instagram diário 8h BRT
- ✅ Content factory — `marketing/scripts/generate-daily.ts`
- ✅ Asset uploader Supabase Storage — `marketing/scripts/upload-assets.ts`

### MCP Server
- ✅ Claude Code MCP com 5 tools (prospect, send, list, metrics, content) — `mcp-server/src/server.ts`

### Deploy / Infra (zero custo)
- ✅ Oracle Cloud Always Free setup — `deploy/ORACLE-CLOUD-SETUP.md`
- ✅ Cloudflare Tunnel (SSL grátis + sem IP exposto) — `deploy/CLOUDFLARE-TUNNEL.md`
- ✅ Checklist completo 90min setup — `deploy/FREE-CHECKLIST.md`
- ✅ Hostinger VPS fallback — `scraper-engine/deploy/hostinger-setup.sh`
- ✅ Bootstrap local em 1 comando — `bootstrap.sh`
- ✅ Upstash Redis alternative — `scraper-engine/src/queue/queue-upstash.ts`

### Docs
- ✅ Master plan estratégico — `MASTER-PLAN.md`
- ✅ ICP clínica odonto detalhado — `ops/icp-clinica-odonto.md`
- ✅ Pipeline prospecção — `prospeccao/pipeline.md`
- ✅ Onboarding flow — `delivery/onboarding-flow.md`
- ✅ Content factory — `marketing/content-factory.md`
- ✅ Modelo financeiro — `financeiro/modelo-receita.md`
- ✅ Análise zero-cost — `ZERO-COST.md`
- ✅ Runbook — `README.md`

---

## Custos finais

| Categoria | Valor |
|-----------|-------|
| Infra fixa | **R$ 0/mês** |
| Claude API (otimizado) | R$ 100-180/mês (uso real com cache + Haiku + Batch) |
| One-time | ~R$ 45 (3 chips WhatsApp) |
| **TOTAL 1º mês** | **~R$ 150** |

vs. R$ 975/mês da stack paga original. **Economia: R$ 825/mês = R$ 9.900/ano.**

---

## Próximos passos do André (único trabalho humano pra ir ao ar)

### Hoje/amanhã (1h30)
1. ⏳ Criar conta Oracle Cloud Always Free → VM Ampere A1 em São Paulo
2. ⏳ Criar conta Cloudflare (free) → adicionar domínio
3. ⏳ Criar repo privado no GitHub → push deste projeto
4. ⏳ Seguir `deploy/FREE-CHECKLIST.md` passo a passo

### Esta semana
5. ⏳ Comprar 3 chips pré-pagos + cadastrar em 3 WhatsApp Business
6. ⏳ Rodar `bootstrap.sh` localmente pra validar com 20 leads teste
7. ⏳ Deploy landing no Vercel: `cd landing && vercel --prod`
8. ⏳ Primeiro disparo real (50 mensagens) — terça ou quarta

### Meta de ROI
- Mês 1: 5 clientes fechados = R$ 9.985 setup + R$ 1.985 MRR = **R$ 11.970**
- Infra custou R$ 150. Margem: 98%+

---

## Como retomar em sessão futura

Na próxima vez que abrir o Claude Code, o contexto tá em:
- `/home/guest/.claude/projects/.../memory/project_dfy_ia.md` (memória automática)
- `/home/guest/Área de trabalho/dfy-ia/STATUS.md` (este arquivo)
- `/home/guest/Área de trabalho/dfy-ia/MASTER-PLAN.md` (plano estratégico)

Qualquer sessão nova: "continue no DFY-IA" → já contextualizo a partir dos memory files.
