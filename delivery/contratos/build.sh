#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

DATE=$(date +%d/%m/%Y)

build_plan() {
  local key="$1"
  local name="$2"
  local price="$3"
  local scope_file="scope-${key}.html"
  local out_html="contrato-${key}.html"
  local out_pdf="contrato-${key}.pdf"

  python3 <<PY
import pathlib
tpl = pathlib.Path('template.html').read_text(encoding='utf-8')
scope = pathlib.Path('${scope_file}').read_text(encoding='utf-8')
out = (tpl
  .replace('{{PLAN_NAME}}', '${name}')
  .replace('{{PRICE}}', '${price}')
  .replace('{{SCOPE_TABLE}}', scope)
  .replace('{{DATE}}', '${DATE}'))
pathlib.Path('${out_html}').write_text(out, encoding='utf-8')
PY

  google-chrome --headless=new --disable-gpu --no-sandbox \
    --print-to-pdf="$out_pdf" --no-pdf-header-footer \
    "file://$(pwd)/$out_html" 2>/dev/null
  echo "✓ $out_pdf"
}

build_plan starter  STARTER  297
build_plan pro      PRO      397
build_plan premium  PREMIUM  497
