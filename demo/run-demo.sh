#!/usr/bin/env bash
#
# Remote Queue — Product Demo Launcher
#
# Uso:
#   chmod +x run-demo.sh
#   ./run-demo.sh             # Modo headed (navegador visível)
#   ./run-demo.sh --headless  # Modo headless (sem janela, para CI/gravação)
#
# Pré-requisitos:
#   1. Docker stack rodando:  docker compose up -d
#   2. Node.js instalado
#   3. Libs do Chromium:      sudo npx playwright install-deps chromium
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Parse args
HEADLESS="false"
if [[ "${1:-}" == "--headless" ]]; then
    HEADLESS="true"
fi

echo "╔══════════════════════════════════════════╗"
echo "║   Remote Queue — Product Demo            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

if [[ "$HEADLESS" == "true" ]]; then
    echo "  Modo: HEADLESS (sem janela)"
else
    echo "  Modo: HEADED (navegador visível)"
fi
echo ""

# 1. Check Docker stack
echo "→ Verificando se o backend está rodando..."
if ! curl -sf http://localhost:8001/ > /dev/null 2>&1; then
    echo "  ⚠ Backend não encontrado em localhost:8001"
    echo "  Execute: docker compose up -d"
    echo "  Aguarde ~15s e tente novamente."
    exit 1
fi
echo "  ✓ Backend OK"

if ! curl -sf http://localhost:3000/ > /dev/null 2>&1; then
    echo "  ⚠ Frontend não encontrado em localhost:3000"
    echo "  Execute: docker compose up -d"
    exit 1
fi
echo "  ✓ Frontend OK"
echo ""

# 2. Install deps if needed
if [ ! -d "node_modules" ]; then
    echo "→ Instalando dependências..."
    npm install
    echo ""
fi

# 3. Ensure browser is installed
echo "→ Verificando browser Chromium..."
npx playwright install chromium 2>/dev/null || true
echo ""

# 4. Run demo
echo "→ Iniciando demonstração..."
if [[ "$HEADLESS" == "false" ]]; then
    echo "  O navegador vai abrir na sua tela."
    echo "  Sente e assista — a demo é automática!"
fi
echo ""

DEMO_HEADLESS="$HEADLESS" npx playwright test --config=playwright.config.ts

echo ""
echo "✓ Demo finalizada! Artefatos salvos em test-results/"
