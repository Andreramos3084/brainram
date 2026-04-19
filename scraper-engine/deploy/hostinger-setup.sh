#!/usr/bin/env bash
# Setup inicial VPS Hostinger Ubuntu 22.04
# Rodar como root logo depois de criar a VPS.
set -euo pipefail

echo "=== DFY-IA Scraper Engine — Hostinger VPS Setup ==="

# 1. Update
apt update && apt upgrade -y

# 2. Essentials
apt install -y curl git ufw nginx certbot python3-certbot-nginx htop

# 3. Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker --now

# 4. Docker Compose plugin (já vem com get.docker.com recente)
docker compose version || apt install -y docker-compose-plugin

# 5. Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# 6. Criar user da app
useradd -m -s /bin/bash dfyia || true
usermod -aG docker dfyia

# 7. Clonar projeto (ajustar URL do repo)
su - dfyia -c '
  mkdir -p /home/dfyia/scraper-engine
  cd /home/dfyia/scraper-engine
  # git clone YOUR_REPO .
  # ou rsync do seu dev box pra cá
'

# 8. Nginx reverse proxy
cat > /etc/nginx/sites-available/scraper <<'EOF'
server {
    listen 80;
    server_name api.dfy-ia.com.br;

    location / {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/scraper /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 9. SSL (rodar DEPOIS de apontar DNS A → IP da VPS)
echo ""
echo "=== PRÓXIMO PASSO MANUAL ==="
echo "1. Apontar DNS A 'api.dfy-ia.com.br' → $(curl -s ifconfig.me)"
echo "2. Aguardar propagação (~5min), aí rodar:"
echo "   certbot --nginx -d api.dfy-ia.com.br --non-interactive --agree-tos -m andre@dfy-ia.com.br"
echo ""
echo "3. Subir o stack:"
echo "   cd /home/dfyia/scraper-engine && cp .env.example .env && nano .env"
echo "   docker compose up -d --build"
echo ""
echo "=== Setup base concluído ==="
