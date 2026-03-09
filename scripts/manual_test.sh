#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

TIMEOUT_SECONDS=60
POLL_INTERVAL=2
BACKEND_URL="http://localhost:8001"
FRONTEND_URL="http://localhost:3000"

# -------------------------------------------------------------------
# 1. Tear down any existing state (volumes included for clean slate)
# -------------------------------------------------------------------
log_info "Parando containers existentes e removendo volumes..."
docker compose -f "$PROJECT_ROOT/docker-compose.yml" down -v --remove-orphans 2>/dev/null || true
log_ok "Ambiente anterior limpo."

# -------------------------------------------------------------------
# 2. Build and start everything from scratch
# -------------------------------------------------------------------
log_info "Construindo e subindo containers (build fresh)..."
docker compose -f "$PROJECT_ROOT/docker-compose.yml" up --build -d --remove-orphans

log_ok "Containers iniciados."

# -------------------------------------------------------------------
# 3. Wait for services to be healthy
# -------------------------------------------------------------------
wait_for_service() {
    local service_name="$1"
    local url="$2"
    local elapsed=0

    log_info "Aguardando $service_name ($url)..."

    while [ $elapsed -lt $TIMEOUT_SECONDS ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            log_ok "$service_name pronto! (${elapsed}s)"
            return 0
        fi
        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
    done

    log_error "$service_name não respondeu em ${TIMEOUT_SECONDS}s"
    log_warn "Logs do serviço:"
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" logs --tail=20
    exit 1
}

wait_for_service "Backend API" "$BACKEND_URL/"

# -------------------------------------------------------------------
# 4. Seed test data
# -------------------------------------------------------------------
log_info "Executando seed de dados de teste..."

TEST_EMAIL="admin@b2b.com"
TEST_PASSWORD="password123"

SEED_RESPONSE=$(curl -sf -X POST "$BACKEND_URL/api/v1/test/seed-b2b" \
    -H "Content-Type: application/json" \
    -d "{\"tenant_name\": \"Test Company\", \"email\": \"$TEST_EMAIL\", \"password\": \"$TEST_PASSWORD\"}" 2>&1) || {
    log_warn "Falha ao executar seed. Continuando..."
    SEED_RESPONSE=""
}

if [[ "$SEED_RESPONSE" == *"already_exists"* ]]; then
    log_ok "Seed: Usuário de teste já existe."
elif [[ "$SEED_RESPONSE" == *"created"* ]]; then
    log_ok "Seed: Usuário de teste criado com sucesso."
else
    log_warn "Seed: Falha ou resposta inesperada: $SEED_RESPONSE"
fi

# -------------------------------------------------------------------
# 5. Print summary
# -------------------------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Ambiente de testes pronto!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Backend API:  ${CYAN}$BACKEND_URL${NC}"
echo -e "  Frontend:     ${CYAN}$FRONTEND_URL${NC}"
echo -e "  API Docs:     ${CYAN}$BACKEND_URL/docs${NC}"
echo ""
echo -e "  ${YELLOW}Credenciais de Teste B2B:${NC}"
echo -e "  Email:    ${CYAN}$TEST_EMAIL${NC}"
echo -e "  Password: ${CYAN}$TEST_PASSWORD${NC}"
echo ""
echo -e "  ${YELLOW}Para parar:${NC} docker compose down -v"
echo -e "  ${YELLOW}Ver logs:${NC}  docker compose logs -f backend"
echo ""
