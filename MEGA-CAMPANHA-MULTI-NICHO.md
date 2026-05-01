# 🚀 Mega Campanha Multi-Nicho BrainRam

## Status (2026-05-01)

### ✅ WhatsApp — Disparado
- **24 leads** multi-nicho via instância `brainram.com.br`
- Nichos: Laboratório (7), Centro de Imagem (5), Estética (5), Cardiologia (4), Quiropraxia (3)
- Delay: 2-4 min entre mensagens
- Processo rodando em background

### ⏳ Email — Bloqueado (Resend modo testing)
- **8 leads** com email prontos para envio
- Bloqueio: Resend só permite enviar para o próprio email do dono da conta
- **Solução necessária:** verificar domínio no Resend ou usar API key de produção

---

## Leads de Email Prontos (8)

| Nicho | Nome | Email |
|-------|------|-------|
| Laboratório | Laboratório Geraldo Lustosa | contabilidade@lustosa.com.br |
| Laboratório | Vicenlab Análises Clínicas | contabil@lcalab.com.br |
| Centro de Imagem | Diagmed - Clínica da Mulher | comercial@diagmed.com.br |
| Centro de Imagem | Clínica Tomocenter | contato@tomocenter.com.br |
| Centro de Imagem | Primamed | sac@primamed.com.br |
| Centro de Imagem | Hospital XV | contato@hospitalxv.com.br |
| Centro de Imagem | Hospital Vita (Batel) | batel@hospitalvita.com.br |
| Estética | Giuliana Milena Estetica Facial | giulianamilena@hotmail.com |

---

## Como resolver o Email

### Opção 1: Verificar domínio no Resend (recomendada)
1. Acesse https://resend.com/domains
2. Adicione seu domínio (ex: brainram.com.br)
3. Configure os registros DNS indicados
4. Aguarde verificação (~5 min)
5. Atualize `FROM_EMAIL` no .env

### Opção 2: API key de produção
1. No dashboard do Resend, vá em API Keys
2. Crie uma nova key de produção
3. Substitua no .env

### Opção 3: Usar SMTP do Hostinger
Se tiver email no Hostinger, adicione ao .env:
```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=seu-email@dominio.com
SMTP_PASS=sua-senha
```

---

## Scripts de Envio

### WhatsApp (já rodando)
```bash
tail -f /tmp/whatsapp-multi.log
```

### Email (quando Resend for ativado)
```bash
bash /tmp/send-email-multi.sh --send
```

---

## Próximos Passos

1. ✅ Monitorar respostas do WhatsApp
2. ⏳ Resolver email e disparar para os 8 leads
3. ⏳ Gerar mais leads multi-nicho (meta: 200+ leads)
4. ⏳ Aquecer número WhatsApp por 7-14 dias antes de escalar
