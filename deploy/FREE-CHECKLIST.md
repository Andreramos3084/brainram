# ✅ Checklist de Setup Zero-Custo (ordem)

Siga nessa ordem. Total: ~90 minutos.

## Fase 1 — Contas grátis (30 min)

- [ ] **Oracle Cloud** → criar conta Always Free
  - Pedir cartão internacional (não cobra)
  - Criar VM Ampere A1 com 4 OCPUs + 24GB RAM em São Paulo
  - Salvar chave SSH e IP público
- [ ] **Cloudflare** → criar conta free
  - Adicionar domínio `dfy-ia.com.br` (ou o que vc registrar)
  - Mudar nameservers no Hostinger
- [ ] **GitHub** → repo privado `dfy-ia`
  - Push do projeto `/home/guest/Área de trabalho/dfy-ia/`
- [ ] **Upstash** → criar DB Redis free (opcional, pode usar Redis na VM)
- [ ] **Resend** → criar conta free (3k emails/mês)
  - Verificar domínio de envio
- [ ] **Supabase** → continuar com o projeto `txtwmvwuhwpykbqbvhdo` (Free tier)

## Fase 2 — Infraestrutura (30 min)

- [ ] SSH na Oracle VM, rodar `deploy/hostinger-setup.sh` (funciona Ubuntu 22.04 em qualquer cloud)
- [ ] Instalar Cloudflare Tunnel (ver `deploy/CLOUDFLARE-TUNNEL.md`)
- [ ] Criar tunnel apontando:
  - `api.dfy-ia.com.br` → localhost:3030 (scraper engine)
  - `evolution.dfy-ia.com.br` → localhost:8080 (Evolution API)
- [ ] Rodar Evolution API na mesma VM (Docker)
- [ ] Aplicar schema: `psql $SUPABASE_DB_URL < scraper-engine/deploy/supabase-schema.sql`
- [ ] Copiar `.env` completo pra VM, subir stack: `docker compose up -d --build`

## Fase 3 — GitHub Actions (10 min)

- [ ] Repo → Settings → Secrets → adicionar:
  - `SCRAPER_URL`
  - `SCRAPER_API_KEY`
  - `PERPLEXITY_KEY`
  - `EVOLUTION_URL`, `EVOLUTION_API_KEY`
  - `ADMIN_PHONE`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Actions → Workflows → verificar `daily-scrape.yml` + `daily-content.yml`
- [ ] Rodar manual uma vez pra testar (`workflow_dispatch`)

## Fase 4 — Landing + Deploy (10 min)

- [ ] Landing já pronta em `landing/index.html`
- [ ] Deploy: `vercel --prod` (Hobby plan, grátis)
- [ ] Configurar domínio `www.dfy-ia.com.br` no Vercel
- [ ] OU mover pra Cloudflare Pages (também grátis): `wrangler pages deploy landing/`

## Fase 5 — Smoke test (10 min)

- [ ] `curl https://api.dfy-ia.com.br/v1/health` — deve retornar `ok: true`
- [ ] Rodar workflow manual no GitHub com query="clínica odontológica" city="Campinas" limit=20
- [ ] Verificar leads no Supabase table `scraper_leads`
- [ ] Revisar arquivo `leads-scored-*.json` commitado no repo
- [ ] Disparar outbound manual em 5 leads pra validar:
  ```bash
  bun run prospeccao/scripts/4-send.ts <arquivo-scored> --send
  ```

## Custos finais

- **Fixo:** R$ 0/mês
- **Variável (uso real):** ~R$ 50-100/mês Perplexity API quando tiver 20+ clientes ativos
- **One-time:** ~R$ 45 chips WhatsApp pré-pago (3 números)

## Quando considerar pagar (não antes)

1. **Supabase Pro (R$125/mo):** só quando passar de 500MB de DB ou 2GB bandwidth — acontece após ~30 clientes
2. **Apify/scraper pago:** só se precisar de proxies residenciais em volume (>2k/dia)
3. **Vercel Pro:** só se passar de 100GB bandwidth na landing

Até R$ 10k/mês de receita, a operação inteira roda em R$ 0 de infra.
