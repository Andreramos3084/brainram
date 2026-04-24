#!/bin/bash
# Pipeline: aguarda scrape terminar → re-score v2 → importa pra Supabase.
# Roda após 1-scrape-multicity.ts em background.
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$PATH"
export $(cat ../.env | grep -E "^(PERPLEXITY|SUPABASE)" | xargs)

LOG=/tmp/brainram-scrape/pipeline.log
exec > >(tee -a "$LOG") 2>&1

echo "==> [$(date)] aguardando processo de scrape (pid $1) terminar..."
while kill -0 "$1" 2>/dev/null; do sleep 30; done
echo "==> [$(date)] scrape terminou"

RAW=$(ls -t data/leads-raw-multicity-*.json | head -1)
echo "==> re-score v2 em $RAW"
bun run scripts/3-score-pplx-v2.ts "$RAW"

SCORED="${RAW%.json}-v2.json"
echo "==> importando $SCORED pro Supabase"
bun run scripts/6-import-to-supabase.ts "$SCORED"

echo "==> [$(date)] pipeline DONE"
curl -sS -X POST -H "x-admin-key: brainram-admin" \
  -d "{\"number\":\"5519998760212\",\"text\":\"✅ BrainRam: scrape nacional + score v2 + import concluídos. Entra no painel pra ativar campanhas.\"}" \
  -H "Content-Type: application/json" \
  "$(grep EVOLUTION_URL ../.env | cut -d= -f2-)/message/sendText/Clickmont" \
  -H "apikey: $(grep EVOLUTION_API_KEY ../.env | cut -d= -f2-)" > /dev/null 2>&1 || true
