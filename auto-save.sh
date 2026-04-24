#!/bin/bash
# auto-save.sh — backup automático do working directory a cada N minutos
#
# Uso:
#   bash auto-save.sh start   # inicia background
#   bash auto-save.sh stop    # para
#   bash auto-save.sh status  # verifica se está rodando
#   bash auto-save.sh once    # executa 1x imediato

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$PROJECT_DIR/.auto-save.pid"
INTERVAL_MINUTES="${AUTO_SAVE_INTERVAL:-10}"
BRANCH="${AUTO_SAVE_BRANCH:-auto-save}"

cd "$PROJECT_DIR" || exit 1

create_branch_if_needed() {
  if ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    git checkout -b "$BRANCH" 2>/dev/null || git branch "$BRANCH"
  fi
}

do_save() {
  # Só salva se houver mudanças (staged ou unstaged)
  if git diff --quiet && git diff --cached --quiet; then
    return 0
  fi

  # Garante que a branch auto-save existe
  create_branch_if_needed

  # Stash + checkout + pop + commit na branch auto-save
  git stash push -m "auto-save-stash-$(date +%s)" --include-untracked >/dev/null 2>&1
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git checkout "$BRANCH" >/dev/null 2>&1
  git stash pop >/dev/null 2>&1 || true
  git add -A
  git commit -m "wip: auto-save $(date '+%Y-%m-%d %H:%M:%S')" >/dev/null 2>&1
  git checkout "$CURRENT_BRANCH" >/dev/null 2>&1
  echo "💾 Auto-save feito em [$BRANCH] às $(date '+%H:%M:%S')"
}

loop_save() {
  while true; do
    do_save
    sleep "$((INTERVAL_MINUTES * 60))"
  done
}

case "${1:-start}" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "Auto-save já está rodando (PID: $(cat "$PIDFILE"))"
      exit 0
    fi
    nohup bash "$0" loop >"$PROJECT_DIR/.auto-save.log" 2>&1 &
    echo $! > "$PIDFILE"
    echo "✅ Auto-save iniciado (a cada ${INTERVAL_MINUTES}min, branch: $BRANCH)"
    echo "   PID: $(cat "$PIDFILE")"
    echo "   Log: $PROJECT_DIR/.auto-save.log"
    ;;
  loop)
    loop_save
    ;;
  stop)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      kill "$(cat "$PIDFILE")" && rm -f "$PIDFILE"
      echo "🛑 Auto-save parado"
    else
      echo "Auto-save não está rodando"
      rm -f "$PIDFILE"
    fi
    ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "✅ Auto-save rodando (PID: $(cat "$PIDFILE"), a cada ${INTERVAL_MINUTES}min)"
      echo "   Últimos saves:"
      git log "$BRANCH" --oneline -3 2>/dev/null || echo "   (branch $BRANCH ainda vazia)"
    else
      echo "⏸ Auto-save parado"
    fi
    ;;
  once)
    do_save
    ;;
  *)
    echo "Uso: bash auto-save.sh {start|stop|status|once}"
    ;;
esac
