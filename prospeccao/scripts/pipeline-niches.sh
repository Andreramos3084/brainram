#!/bin/bash
# Após odonto terminar, scrape 4 nichos novos em top 15 cidades, 30 leads cada.
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$PATH"
export $(cat ../.env | grep -E "^(SCRAPER|PERPLEXITY|SUPABASE)" | xargs)

LOG=/tmp/brainram-scrape/niches.log
exec > >(tee -a "$LOG") 2>&1

WAIT_PID=$1
echo "==> [$(date)] aguardando odonto (pid $WAIT_PID)..."
while kill -0 "$WAIT_PID" 2>/dev/null; do sleep 60; done
echo "==> [$(date)] odonto done. iniciando nichos."

export CITIES="São Paulo,Rio de Janeiro,Belo Horizonte,Brasília,Curitiba,Porto Alegre,Salvador,Recife,Fortaleza,Goiânia,Manaus,Campinas,Florianópolis,Vitória,Uberlândia"

for niche in "clínica de estética" "clínica veterinária" "fisioterapia" "psicólogo"; do
  echo "==> scrape $niche"
  bun run scripts/1-scrape-multicity.ts "$niche" 30 || echo "erro em $niche"
  LATEST=$(ls -t data/leads-raw-multicity-*.json | head -1)
  echo "==> score v2 $LATEST"
  bun run scripts/3-score-pplx-v2.ts "$LATEST"
  SCORED="${LATEST%.json}-v2.json"
  echo "==> import $SCORED"
  bun run scripts/6-import-to-supabase.ts "$SCORED"
done

echo "==> [$(date)] TUDO DONE"
EVO_URL=$(grep EVOLUTION_URL ../.env | cut -d= -f2-)
EVO_KEY=$(grep EVOLUTION_API_KEY ../.env | cut -d= -f2-)
curl -sS -X POST "$EVO_URL/message/sendText/Clickmont" -H "Content-Type: application/json" -H "apikey: $EVO_KEY" \
  -d '{"number":"5519998760212","text":"✅ BrainRam: scrape nacional (odonto+4 nichos) concluído. 9 campanhas prontas no painel pra ativar."}' > /dev/null 2>&1 || true
