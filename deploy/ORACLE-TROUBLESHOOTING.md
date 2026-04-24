# Oracle Cloud — "Out of Capacity" / Servidor não responde

É o problema mais comum do Always Free. Oracle limita muito a região SP.

## Soluções (ordem de tentativa)

### 1. Tentar outra Availability Domain
No painel Compute → Create Instance, depois de escolher shape Ampere A1:
- Trocar o "Availability Domain" (SA-SAOPAULO-1-AD-1 / -2 / -3)
- Às vezes AD-2 ou AD-3 têm capacity quando AD-1 não tem

### 2. Mudar de região (recomendado se SP travar)
Regiões com capacity Ampere MUITO mais estável:
- **us-ashburn-1** (Virginia) — latência Brasil ~130ms (aceitável)
- **us-phoenix-1** — latência ~160ms
- **eu-frankfurt-1** — latência ~200ms

Para trocar:
1. Menu Oracle → "Manage regions" → Subscribe
2. Aguarda ~5min a região ser habilitada
3. Troca pro header da região no canto superior direito
4. Cria VM lá

Impacto real: **latência maior só nos webhooks WhatsApp** (+150ms). Scraping e IA não sentem.

### 3. Script de retry (enquanto espera capacity)
Oracle libera capacity em intervalos aleatórios. Script que tenta criar VM a cada 15min:

```bash
# Roda no seu desktop, usando oci CLI
while true; do
  oci compute instance launch \
    --availability-domain "SA-SAOPAULO-1-AD-1" \
    --compartment-id $COMPARTMENT \
    --shape "VM.Standard.A1.Flex" \
    --shape-config '{"ocpus": 4, "memoryInGBs": 24}' \
    --image-id $UBUNTU_IMAGE \
    --subnet-id $SUBNET \
    --ssh-authorized-keys-file ~/.ssh/oracle.pub \
    --display-name dfy-ia-engine 2>&1 | grep -q "Out of" && { echo "$(date): no capacity"; sleep 900; } || { echo "✅ created"; break; }
done
```

Pode também usar: https://github.com/hitrov/oci-arm-host-capacity (bot pronto)

### 4. Alternativas free enquanto Oracle não resolve

#### a) Google Cloud Always Free — e2-micro (menor, mas imediato)
- **1 e2-micro** forever free: 2 vCPU (shared) + 1GB RAM + 30GB disk
- Regiões US (us-west1/us-central1/us-east1)
- Cabe: scraper engine OU Evolution API — **não os dois juntos**
- Setup: `cloud.google.com/free` → Compute Engine → Create → e2-micro → regiões free

#### b) Fly.io free tier
- 3 VMs shared-cpu-1x 256MB grátis
- Ideal pra API + worker leves
- Mas Playwright consome muito → precisaria upgrade
- Bom pra Evolution API (mais leve)

#### c) Desktop ligado 24/7 (transicional)
Se você tem uma máquina em casa ligada:
- Expor via Cloudflare Tunnel (grátis)
- Roda exatamente como se fosse VPS
- Bom pras primeiras semanas até Oracle resolver

#### d) VPS Hostinger KVM 1 (R$29/mês)
Já que você tem Hostinger Business:
- Mais barato que VPS tradicional
- 2 vCPU + 4GB RAM (suficiente pro MVP)
- R$29 × 12 = R$348/ano vs R$0 do Oracle
- Pode pagar 2-3 meses enquanto Oracle libera, depois migrar

### 5. Pragmatismo: começar LOCAL

**Enquanto Oracle / alternativa não sobe:**
1. Rodar tudo no seu desktop
2. Cloudflare Tunnel grátis exposição
3. Disparar os primeiros 50-100 outbounds dessa forma
4. Fechar 2-3 clientes (R$ 4-6k)
5. Com esse caixa, migrar pra infra definitiva sem pressão

Comando pra rodar local (já tudo preparado):
```bash
cd "/home/guest/Área de trabalho/dfy-ia"
./bootstrap.sh
# em outro terminal
cd scraper-engine && bun run dev
# em outro
cd scraper-engine && bun run dev:worker
# Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3030
```

## Minha recomendação

**Agora:**
1. Subscreve `us-ashburn-1` na Oracle (provisiona em 5min, capacity quase sempre disponível)
2. Cria VM lá
3. Latência de 130ms não impacta nada do nosso caso de uso

**Se também der OOC em us-ashburn:**
4. Roda local com Cloudflare Tunnel
5. Em paralelo deixa rodando o script de retry pra SP
6. Migra quando capacity liberar
