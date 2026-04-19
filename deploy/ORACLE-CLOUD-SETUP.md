# Oracle Cloud Always Free — Setup

Você ganha **forever free**: 4 ARM cores + 24GB RAM + 200GB disk + 10TB egress/mês.
Isso cobre 100% da operação DFY-IA (scraper engine + Evolution API + Redis + Postgres se quiser).

## Passo 1 — Criar conta

1. https://www.oracle.com/cloud/free/
2. Cadastrar com cartão internacional (só validação, não cobra)
3. Escolher região: **São Paulo (sa-saopaulo-1)** — latência BR

## Passo 2 — Criar VM Always Free

1. Console → Compute → Instances → **Create Instance**
2. Nome: `dfy-ia-engine`
3. **Image:** Canonical Ubuntu 22.04 **(ARM compatível)**
4. **Shape:** "Virtual machine" → **Change shape** → categoria "Ampere" → `VM.Standard.A1.Flex`
   - OCPUs: **4**
   - Memory: **24 GB**
   - **Always Free eligible: ✓**
5. **Networking:** criar nova VCN, subnet pública, atribuir IPv4 público
6. **SSH keys:** gerar par novo OU adicionar chave pública existente
7. Create

> Se aparecer "Out of capacity" — tenta de novo em outro horário. Oracle limita free tier por região/zona, pode demorar alguns minutos.

## Passo 3 — Abrir portas no Security List

Console → Networking → Virtual Cloud Networks → sua VCN → Security Lists → Default:

Adicionar **Ingress Rules**:
- Source: `0.0.0.0/0`, Protocol: TCP, Port: **80**
- Source: `0.0.0.0/0`, Protocol: TCP, Port: **443**
- (SSH porta 22 já está aberta por padrão)

## Passo 4 — SSH + setup base

```bash
ssh -i ~/.ssh/sua-chave ubuntu@IP_DA_VM

# System
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw nginx certbot python3-certbot-nginx htop

# Firewall — Oracle VM bloqueia por padrão no iptables, liberar:
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save || sudo apt install -y iptables-persistent

# Docker (multi-arch, funciona ARM)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
```

## Passo 5 — Clonar projeto + subir

```bash
cd ~
# Do seu dev box:
# rsync -avz --exclude node_modules "/home/guest/Área de trabalho/dfy-ia/scraper-engine/" ubuntu@IP_VM:/home/ubuntu/scraper-engine/

cd scraper-engine
cp .env.example .env
nano .env   # preencher Supabase keys + SCRAPER_API_KEY gerado random

docker compose up -d --build
docker compose logs -f
```

## Passo 6 — DNS + SSL

**Opção A: DNS direto (mais simples, IP fixo da Oracle é estático)**
1. Hostinger → DNS Zone de `dfy-ia.com.br`
2. Adicionar A record: `api` → `IP_DA_VM`
3. Aguardar 5-10min propagar
4. Na VM:
```bash
sudo certbot --nginx -d api.dfy-ia.com.br --non-interactive --agree-tos -m seu@email.com
```

**Opção B: Cloudflare Tunnel (grátis, sem expor IP)**
Ver `deploy/cloudflare-tunnel.md`

## Passo 7 — Nginx reverse proxy

```bash
sudo tee /etc/nginx/sites-available/scraper > /dev/null <<'EOF'
server {
    listen 80;
    server_name api.dfy-ia.com.br;

    location / {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/scraper /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Passo 8 — Evolution API também na mesma VM (grátis)

Sobra MUITA capacidade. Rodar Evolution API aqui também:

```bash
cd ~
git clone https://github.com/EvolutionAPI/evolution-api
cd evolution-api
cp .env.example .env
# Configurar: AUTHENTICATION_API_KEY, DATABASE (Postgres self-hosted ou Supabase), REDIS_URI
docker compose up -d
```

DNS: `evolution.dfy-ia.com.br` → mesmo IP. Outro bloco Nginx na porta 8080.

## Resultado

- **Custo:** R$ 0/mês
- **Poder:** 4 cores + 24GB RAM — suficiente para 10x a operação atual
- **Uptime:** Oracle SLA 99.95%
- **Backup:** snapshot manual mensal (grátis até 5 snapshots)

## Limitações Always Free (honestas)
- **Shutdown por inatividade:** se VM ficar 7 dias sem uso de CPU, Oracle pode suspender. Workaround: cron que pinga Redis a cada hora.
- **Billing lock:** se upgradar conta pra pago, precisa configurar budget pra não pagar sem querer.
- **Sem IP estático reservado grátis** (tem 2 free reserved IPs — usar os dois).

## Cron anti-shutdown (rodar na VM)

```bash
crontab -e
# Adicionar:
*/15 * * * * curl -sf http://127.0.0.1:3030/v1/health > /dev/null
```
