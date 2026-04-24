#!/usr/bin/env bash
# Deploy do Cloudflare Worker BrainRam
# Pré-requisito: wrangler autenticado (npx wrangler login)
set -euo pipefail

cd "$(dirname "$0")"

echo "🚀 Deploy BrainRam Cloudflare Worker"
echo ""

# Verifica se wrangler está autenticado
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "❌ Wrangler não autenticado."
  echo "   Rode primeiro: npx wrangler login"
  exit 1
fi

# Configura secrets
echo "🔐 Configurando secrets..."
npx wrangler secret put SUPABASE_URL <<< "https://nlcmhqevxpdttuhamjsj.supabase.co"
npx wrangler secret put SUPABASE_ANON_KEY <<< "$(grep SUPABASE_ANON_KEY ../../.env | cut -d= -f2)"

# Deploy
echo ""
echo "📤 Deploy..."
npx wrangler deploy

echo ""
echo "✅ Worker deployado!"
echo ""
echo "Configure as rotas no Cloudflare Dashboard:"
echo "  - brainram.com.br/track/*  → brainram-worker"
echo "  - brainram.com.br/unsubscribe → brainram-worker"
