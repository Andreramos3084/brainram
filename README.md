# DFY-IA — Runbook

## Dia 1 — setup (fazer uma única vez)

```bash
cd "/home/guest/Área de trabalho/dfy-ia"
cp .env.example .env      # preencher chaves
cd landing && vercel --prod --token $VERCEL_TOKEN
cd ../mcp-server && bun install && bun run build
cd ../prospeccao && bun install
```

**Domínio sugerido:** `dfy-ia.com.br` ou `ia-atende.com.br`

**Adicionar MCP ao Claude Code:**
```bash
claude mcp add dfy-ia -- node "/home/guest/Área de trabalho/dfy-ia/mcp-server/dist/server.js"
```

## Dia a dia (30-60min)

### 1. Prospectar (roda de manhã)
```bash
cd prospeccao
bash run.sh "clínica odontológica" "Campinas" 100
```
Gera: `data/leads-scored-campinas-YYYY-MM-DD.json`

### 2. Revisar top 20 (5min)
```bash
bun run scripts/review.ts data/leads-scored-campinas-*.json
# Ou use MCP: "liste os top 20 leads de hoje"
```

### 3. Disparar (live)
```bash
bun run scripts/4-send.ts data/leads-scored-campinas-*.json --send
```

### 4. Responder quem engajou
- Quem pergunta preço → mande vídeo de 2min
- Quem quer call → link Calendly
- Objeções → rebate com prova social

## Semana 1
- Seg: scrape 100 clínicas, enviar 50 melhores
- Ter: analisar respostas, ajustar mensagem cold
- Qua: escalar pra 100 envios/dia
- Qui: primeira call (esperado: 2-3)
- Sex: revisar funil, duplicar se funcionando

## Métricas-alvo
- Envios/dia: 100-150 (3 números)
- Taxa resposta: >2%
- Calls/semana: 5-10
- Fechamentos/semana: 1-2
- MRR mês 3: R$7k+

## Fluxo de cliente novo
1. Pagou (MP/Stripe webhook)
2. Recebe link Tally (formulário 15min)
3. Edge function `onboard-client` roda
4. QR code chega em 5min
5. Cliente escaneia WhatsApp
6. IA ativa em produção
7. Call semana 1 (ajuste fino)
