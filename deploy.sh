#!/usr/bin/env bash
set -euo pipefail

VPS="root@72.60.159.6"
APP_DIR="/opt/remote_queue"

echo "==> Building images..."
docker compose -f docker-compose.prod.yml build

echo "==> Saving images (this may take a moment)..."
docker save rq_backend:latest  | gzip > /tmp/rq_backend.tar.gz
docker save rq_frontend:latest | gzip > /tmp/rq_frontend.tar.gz

echo "==> Uploading images to VPS..."
scp /tmp/rq_backend.tar.gz /tmp/rq_frontend.tar.gz "$VPS:/tmp/"
rm /tmp/rq_backend.tar.gz /tmp/rq_frontend.tar.gz

echo "==> Loading images on VPS..."
ssh "$VPS" "
  docker load < /tmp/rq_backend.tar.gz &&
  docker load < /tmp/rq_frontend.tar.gz &&
  rm /tmp/rq_backend.tar.gz /tmp/rq_frontend.tar.gz
"

echo "==> Uploading compose file..."
ssh "$VPS" "mkdir -p $APP_DIR"
scp docker-compose.prod.yml "$VPS:$APP_DIR/"

if [ -f .env.prod ]; then
  echo "==> Uploading .env.prod..."
  scp .env.prod "$VPS:$APP_DIR/.env"
else
  echo ""
  echo "!! AVISO: .env.prod não encontrado localmente."
  echo "!! Verifique se $APP_DIR/.env existe na VPS antes de continuar."
  echo ""
fi

echo "==> Starting services..."
ssh "$VPS" "cd $APP_DIR && docker compose -f docker-compose.prod.yml up -d"

echo ""
echo "=============================================="
echo "  Deploy concluído! https://queue.whale-sss.cloud"
echo "=============================================="
echo ""
echo "Para criar o superadmin, execute:"
echo "  ssh $VPS \"cd $APP_DIR && docker compose -f docker-compose.prod.yml exec backend python scripts/create_admin.py --email SEU@EMAIL.COM --password SENHA_FORTE\""
