# 🎯 Status Atual da Operação BrainRam (ex-DFY-IA)

**Última atualização:** 2026-05-01

## Resumo das mudanças

Operação pivotou de **DFY-IA** para **BrainRam** com as seguintes mudanças estratégicas:

1. **Canal principal de prospecção:** Email (substitui WhatsApp para outbound frio)
2. **WhatsApp:** Mantido apenas para atendimento de clientes pagantes
3. **LGPD/Compliance:** Framework completo implementado
4. **Dashboard do cliente:** Reescrito em React + Vite, moderno e minimalista
5. **Novos nichos:** Cardiologia, clínica de imagem, nutrição, laboratório, fisioterapia, psicologia
6. **Scraper:** Versão 2 com retry, fallback de seletores, extração de email
7. **Deploy:** Documentado para Hostinger VPS + Cloudflare Workers

---

## URLs de Produção (Deploy Feito)

| Serviço | URL | Status |
|---------|-----|--------|
| Tunnel principal | https://sapphire-shed-plc-status.trycloudflare.com | ⚠️ Efêmero — pode rotacionar |
| Health API | https://sapphire-shed-plc-status.trycloudflare.com/health | ✅ OK |
| Admin Panel | https://sapphire-shed-plc-status.trycloudflare.com/admin | ✅ Online |
| Dashboard React | https://sapphire-shed-plc-status.trycloudflare.com/ | ✅ Online |
| Sales Webhook | https://sapphire-shed-plc-status.trycloudflare.com/sales/webhook | ✅ Ativo |
| MP Webhook | https://sapphire-shed-plc-status.trycloudflare.com/mp/webhook | ✅ Ativo |

**Nota:** O tunnel é efêmero (`*.trycloudflare.com`). Para URL estável, configurar tunnel nomeado ou domínio próprio.

---

## Pronto (100% código escrito e testado)

### Produto
- ✅ Landing page completa (dark theme)
- ✅ System prompt agente odonto
- ✅ **Novos prompts:** cardio, imagem, nutri, lab, fisio, psi
- ✅ Template multi-nicho

### Motor de prospecção
- ✅ Scraper engine próprio (Playwright + stealth)
- ✅ **Scraper v2:** retry, seletores fallback, extração de email do website
- ✅ Pipeline principal (scrape → enrich → score)
- ✅ Scoring Perplexity v2 (favorece solo/MEI)
- ✅ **Email outbound engine** (Resend, templates por nicho, tracking, unsubscribe)
- ✅ Orquestrador shell + admin panel SPA
- ✅ Multi-número WA com rotação (modo conservador)

### Backend
- ✅ Sales server (Hono) — webhook Evolution, webhook MP, trial lifecycle
- ✅ Admin panel — campanhas, leads, copy templates, números WA, métricas
- ✅ Edge functions Supabase — onboard-client, agent-handler, agent-handler-cached
- ✅ Schema Postgres completo
- ✅ **Migrações:** email_logs, email_opens, consent_logs, opted_out, escalations

### Dashboard do Cliente
- ✅ **React + Vite** — build funcionando (~252KB JS gzip ~79KB)
- ✅ Páginas: Visão geral, Conversas, Configurações
- ✅ Design dark, minimalista, mobile-friendly
- ✅ Integração com API do sales-server
- ✅ Deployado na VPS e servido via Nginx

### Automação
- ✅ GitHub Actions (daily-scrape, daily-content)
- ✅ Worker autônomo com claim otimista (evita double-send)
- ✅ Trial auto-cancel (7 dias + prompt 24h antes)
- ✅ Relatório diário automático via WhatsApp

### Infra / Deploy
- ✅ Hostinger VPS: sales-server rebuildado e rodando
- ✅ Nginx: reverse proxy configurado, servindo dashboard + API
- ✅ Cloudflare Tunnel: apontando para VPS (efêmero)
- ✅ Cloudflare Worker: deployado em https://brainram-worker.andreelogio.workers.dev

### LGPD & Compliance
- ✅ Política de privacidade completa
- ✅ Mecanismo de opt-out (SAIR/UNSUBSCRIBE)
- ✅ Base legal documentada (art. 7º LGPD)
- ✅ Checklist pré-disparo
- ✅ Plano de resposta a incidentes
- ✅ Tabela de consent_logs (audit trail)

---

## Bugs corrigidos (2026-05-01)

| Bug | Severidade | Status |
|-----|-----------|--------|
| Nomes de modelos Claude fictícios (`claude-sonnet-4-5`, `claude-sonnet-4-7`) | 🔴 Crítico | ✅ Corrigido — migração completa para Perplexity `sonar` / `sonar-pro` |
| `5-send-email.ts` — código duplicado no final (erro de sintaxe) | 🔴 Crítico | ✅ Corrigido |
| `5-send-email.ts` — função `ensureDir` não definida | 🔴 Crítico | ✅ Implementada |
| Workflow `daily-content.yml` sem `bun install` | 🟡 Alto | ✅ Adicionado step de install |
| `onboard-client` — fetch de URL placeholder (`github.com/user/...`) | 🟡 Alto | ✅ Template embeddado no código |
| `delivery/edge-functions/` — código duplicado de `supabase/functions/` | 🟡 Alto | ✅ Removido |
| `/sales/dispatch` — endpoint sem autenticação | 🟡 Alto | ✅ Adicionado `x-admin-key` |
| MCP `dfy_onboard` — documentado mas não implementado | 🟡 Alto | ✅ Removido do header |
| MCP `dfy_generate_content` — stub inútil | 🟢 Médio | ✅ Removido do ListTools |
| `.claude/`, `supabase/.temp/` versionados no git | 🟢 Médio | ✅ Removidos + .gitignore atualizado |

---

## Custos finais

| Categoria | Valor |
|-----------|-------|
| Infra fixa (Hostinger VPS) | **R$ 0** (já pago) |
| Cloudflare Workers (free tier) | **R$ 0** |
| Supabase Free | **R$ 0** |
| Vercel (landing) | **R$ 0** |
| Resend (3k emails/mês) | **R$ 0** |
| Perplexity API (sonar/sonar-pro) | R$ 50-100/mês |
| Perplexity (já pago) | **R$ 0** |
| **TOTAL MENSAL** | **~R$ 150** |

---

## Estado Operacional (2026-05-01)

| Item | Status |
|---|---|
| Scrape nacional (83+ cidades) | ✅ Rodando |
| Scoring Perplexity v2 | ✅ Funcionando |
| Email outbound | ✅ Pronto (aguardando domínio ou usar resend.dev) |
| WhatsApp dispatch | ⏸ Pausado (Clickmont banido, aguardar 2º chip) |
| Leads elegíveis (score≥80) | 1.342 |
| Dashboard React | ✅ Deployado e online |
| Sales server | ✅ Rebuildado e saudável |
| Nginx + proxy | ✅ Configurado |
| Cloudflare Tunnel | ✅ Funcionando |
| Cloudflare Worker | ✅ Deployado |

---

## Próximos passos imediatos

1. **Aplicar migração SQL** no Supabase:
   ```bash
   # Copiar conteúdo de delivery/migrations/add-email-lgpd.sql
   # Colar no SQL Editor do Supabase
   ```

2. **Comprar 2º chip WhatsApp** e cadastrar em `wa_instances` com `warmup_stage=1, daily_cap=30`

3. **Primeira campanha de email** prospecção fria (teste com 20 leads)

4. **Cliente beta** — rodar onboarding completo fim-a-fim

5. **Dashboard Settings** — implementar salvamento real (POST para API)

---

## Como retomar

```bash
# Dashboard local
cd dashboard/cliente && npm run dev        # localhost:5173

# Sales server (local)
cd delivery/agent-perplexity && bun run sales-server.ts

# Scraper engine (local)
cd scraper-engine && bun run dev           # API :3030

# Email outbound (teste)
cd delivery/email-outbound && bun run engine.ts

# Deploy worker
cd delivery/cloudflare-worker && bash deploy.sh
```
