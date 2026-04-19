# Cloudflare Tunnel — Expor VM sem IP público / SSL automático grátis

Alternativa ao Nginx+Certbot. Mais seguro (não expõe portas 80/443 direto) e evita dor de cabeça com SSL.

## Por que usar

- SSL automático gerenciado pela Cloudflare
- Proteção DDoS grátis
- Não precisa firewall/portas abertas (VM fica 100% privada)
- Funciona mesmo se IP da VM mudar

## Setup (15 min)

### 1. Mover domínio para Cloudflare (grátis)

1. cloudflare.com → criar conta → Add site `dfy-ia.com.br`
2. Escolher **Free plan**
3. Cloudflare vai dar 2 nameservers — ir no Hostinger e mudar os NS do domínio para eles
4. Aguardar propagação (10-60min)

### 2. Instalar cloudflared na Oracle VM

```bash
# ARM64
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Login (abre browser, autentica com Cloudflare)
cloudflared tunnel login
```

### 3. Criar tunnel

```bash
cloudflared tunnel create dfy-ia-engine
# Salva credencial em ~/.cloudflared/<TUNNEL_ID>.json
```

### 4. Config `~/.cloudflared/config.yml`

```yaml
tunnel: dfy-ia-engine
credentials-file: /home/ubuntu/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: api.dfy-ia.com.br
    service: http://localhost:3030
  - hostname: evolution.dfy-ia.com.br
    service: http://localhost:8080
  - hostname: app.dfy-ia.com.br
    service: http://localhost:3000
  - service: http_status:404
```

### 5. Rotas DNS

```bash
cloudflared tunnel route dns dfy-ia-engine api.dfy-ia.com.br
cloudflared tunnel route dns dfy-ia-engine evolution.dfy-ia.com.br
cloudflared tunnel route dns dfy-ia-engine app.dfy-ia.com.br
```

### 6. Rodar como serviço

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

Pronto. `https://api.dfy-ia.com.br` já tá no ar com SSL automático.

## Bonus: proteger admin endpoints com Cloudflare Access (grátis até 50 usuários)

Console Cloudflare → Zero Trust → Access → Applications → Add:
- Domain: `api.dfy-ia.com.br/v1/*`
- Auth: Google OAuth ou magic link
- Only: seu email

Isso bloqueia acesso externo mesmo que alguém descubra a API key.
