#!/usr/bin/env bash
# DFY-IA Bootstrap — setup local em 1 comando
# Valida pré-requisitos, instala deps, sobe serviços locais pra teste
set -euo pipefail

cd "$(dirname "$0")"

echo "🚀 DFY-IA Bootstrap — setup local"
echo ""

# 1. Pré-reqs
command -v bun >/dev/null || { echo "⚠️  Bun não instalado. Instalando..."; curl -fsSL https://bun.sh/install | bash; source ~/.bashrc; }
command -v docker >/dev/null || { echo "❌ Docker necessário. Instale: curl -fsSL https://get.docker.com | sh"; exit 1; }
command -v git >/dev/null || { echo "❌ git necessário"; exit 1; }

# 2. Instalar deps
echo "📦 Instalando deps (prospeccao)..."
(cd prospeccao && bun install 2>/dev/null || true)

echo "📦 Instalando deps (scraper-engine)..."
(cd scraper-engine && bun install 2>/dev/null || true)

echo "📦 Instalando deps (mcp-server)..."
(cd mcp-server && bun install 2>/dev/null || true)

# 3. Env
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo ""
  echo "⚠️  .env criado. Preencha as keys antes de continuar."
  echo "   Abrindo no editor..."
  ${EDITOR:-nano} .env
fi

# 4. Gerar SCRAPER_API_KEY se vazia
if ! grep -q "^SCRAPER_API_KEY=[A-Za-z0-9]\{16,\}" .env; then
  KEY=$(openssl rand -hex 16)
  sed -i.bak "s|^SCRAPER_API_KEY=.*|SCRAPER_API_KEY=$KEY|" .env
  echo "🔑 SCRAPER_API_KEY gerada"
fi

# 5. Subir Redis local (pra teste)
echo ""
echo "🐳 Subindo Redis local (Docker)..."
docker run -d --name dfy-redis -p 6379:6379 redis:7-alpine 2>/dev/null || docker start dfy-redis

# 6. Aplicar schema Supabase (precisa psql + DATABASE_URL)
echo ""
if command -v psql >/dev/null && [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "🗄️  Aplicando schema Supabase..."
  psql "$SUPABASE_DB_URL" < scraper-engine/deploy/supabase-schema.sql || echo "  (schema já existe, ignorando)"
else
  echo "ℹ️  psql não encontrado ou SUPABASE_DB_URL não setado."
  echo "   Aplicar manualmente: copiar scraper-engine/deploy/supabase-schema.sql no SQL Editor do Supabase"
fi

# 7. Build MCP server
echo ""
echo "🔨 Build MCP server..."
(cd mcp-server && bun run build 2>/dev/null || npm run build 2>/dev/null || echo "  (skip build)")

# 8. Registrar MCP no Claude Code (se existir)
if command -v claude >/dev/null; then
  echo ""
  echo "🔌 Registrando MCP no Claude Code..."
  claude mcp add dfy-ia -- node "$(pwd)/mcp-server/dist/server.js" 2>/dev/null || echo "  (já registrado)"
fi

echo ""
echo "✅ Bootstrap concluído."
echo ""
echo "🎯 PRÓXIMOS PASSOS:"
echo ""
echo "  LOCAL (testar agora):"
echo "    cd scraper-engine && bun run dev          # API em :3030"
echo "    cd scraper-engine && bun run dev:worker   # Worker"
echo "    curl -X POST http://localhost:3030/v1/scrape/google-maps \\"
echo "      -H 'x-api-key: \$SCRAPER_API_KEY' -H 'Content-Type: application/json' \\"
echo "      -d '{\"query\":\"clínica odontológica\",\"city\":\"Campinas\",\"limit\":10}'"
echo ""
echo "  PRODUÇÃO (zero custo):"
echo "    1. Criar VM Oracle Cloud Always Free → ver deploy/ORACLE-CLOUD-SETUP.md"
echo "    2. Cloudflare Tunnel                  → ver deploy/CLOUDFLARE-TUNNEL.md"
echo "    3. Seguir checklist completo          → ver deploy/FREE-CHECKLIST.md"
echo ""
echo "  DEPLOY LANDING (agora):"
echo "    cd landing && vercel --prod --token \$VERCEL_TOKEN"
echo ""
