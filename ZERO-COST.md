# 💰 Stack Zero-Cost — DFY-IA

## Comparativo brutal

| Item | Custo inicial | Custo otimizado | Economia |
|------|--------------|----------------|----------|
| Scraping | R$ 180 (Apify) | **R$ 0** (engine próprio) | -R$ 180 |
| VPS | R$ 49 (Hostinger) | **R$ 0** (Oracle Always Free) | -R$ 49 |
| Supabase | R$ 125 (Pro) | **R$ 0** (Free tier até ~200 clientes-msg/dia) | -R$ 125 |
| Vercel | R$ 100 (Pro) | **R$ 0** (Hobby) | -R$ 100 |
| n8n hosting | R$ 30 | **R$ 0** (GitHub Actions) | -R$ 30 |
| Redis | R$ 25 | **R$ 0** (Upstash Free 10k/dia OR self-host) | -R$ 25 |
| Domínio | já tem (Hostinger) | R$ 0 | - |
| Email | já tem (Hostinger Business) | R$ 0 | - |
| Perplexity | créditos + plano pago (já tem) | R$ 0 adicional | - |
| Claude API | ~R$ 400 estimado | **R$ 100-180** (caching + Haiku + Batch) | -R$ 220 |
| WhatsApp numbers | chip pré-pago R$ 15/un | ~R$ 45 one-time (3 chips) | - |
| Emails transacionais | R$ 30 | **R$ 0** (Resend Free 3k/mês) | -R$ 30 |
| **TOTAL MENSAL** | **R$ 979** | **R$ 100-180** | **-R$ 800+** |

> ~R$ 9.600/ano economizados. Equivalente a 4,8 clientes extra no lucro por ano.

## O que está pago vs gratuito

### ✅ Zero custo (infra)
- Oracle Cloud VM (4 cores ARM + 24GB RAM, forever free)
- Supabase Free (500MB DB, 2GB bandwidth, 500k edge function invocations)
- Vercel Hobby (landing)
- Cloudflare Tunnel + Pages (DNS + expose VM sem IP estático)
- GitHub Actions (2000 min/mês grátis = cron de prospecção diário)
- Upstash Redis Free (10k commands/dia)
- Resend Free (3k emails/mês)
- n8n self-hosted na Oracle VM (opcional, GitHub Actions cobre)

### 💳 Custo variável (só quando usa)
- **Claude API** — otimizado com:
  - **Prompt caching** (90% off em tokens repetidos do system prompt do agente)
  - **Haiku 3.5** para tarefas simples (scoring, classificação de resposta) — ~10x mais barato que Sonnet
  - **Batch API** para scoring (50% off, tempo de resposta < 24h)
  - **Só usar Sonnet 4.7** nas conversas reais com paciente (onde qualidade paga)

### 🎫 Já pago pelo André
- Hostinger Business (domínio + email)
- Perplexity Pro (créditos + API)
- Vercel (conta existe, token disponível)

## Thresholds de upgrade (quando sair do free tier)

| Serviço | Free limit | Quando passar para pago |
|---------|-----------|------------------------|
| Supabase Free | 500MB DB, 2GB bandwidth | ~30 clientes ativos gerando 100 msg/dia cada |
| Oracle Free | ilimitado (enquanto usar) | — (revisão anual) |
| GitHub Actions | 2000 min/mês | Só se rodar scraping >5x/dia em múltiplos nichos |
| Upstash Redis | 10k commands/dia | ~500 jobs/dia, bem acima do volume inicial |
| Resend Free | 3k emails/mês | ~100 clientes |

**Quando passar o Supabase Free:** subir pra Pro (R$125/mo) ou migrar pra Postgres self-hosted na Oracle VM (continua grátis, só dá mais trabalho).
