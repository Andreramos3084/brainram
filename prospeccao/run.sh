#!/usr/bin/env bash
# Pipeline completo de prospecção — rodar uma vez por dia
set -euo pipefail

cd "$(dirname "$0")"

QUERY="${1:-clínica odontológica}"
CITY="${2:-Campinas}"
LIMIT="${3:-100}"
SEND_FLAG="${4:-}"

DATE=$(date +%Y-%m-%d)
SLUG=$(echo "$CITY" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

RAW="data/leads-raw-${SLUG}-${DATE}.json"
ENR="data/leads-enriched-${SLUG}-${DATE}.json"
SCR="data/leads-scored-${SLUG}-${DATE}.json"

echo "=== Pipeline DFY-IA ==="
echo "Nicho: $QUERY | Cidade: $CITY | Limite: $LIMIT"
echo

echo "🔍 [1/4] Scraping..."
bun run scripts/1-scrape-v2.ts "$QUERY" "$CITY" "$LIMIT"

echo
echo "🔬 [2/4] Enriquecimento..."
bun run scripts/2-enrich.ts "$RAW"

echo
echo "🎯 [3/4] Scoring..."
bun run scripts/3-score-pplx-v2.ts "$RAW"

echo
echo "📤 [4/4] Envio ${SEND_FLAG:-(dry-run)}..."
bun run scripts/4-send.ts "$SCR" $SEND_FLAG

echo
echo "✅ Pipeline completo."
