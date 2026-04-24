import { Clock, CheckCircle } from 'lucide-react'
import type { Tenant } from '../types'

interface Props {
  tenant: Tenant
}

export default function TrialBanner({ tenant }: Props) {
  if (tenant.status !== 'trial') return null

  const confirmed = tenant.trial_confirmed
  const days = tenant.trial_days_left ?? 0

  return (
    <div style={{
      background: confirmed ? 'rgba(34, 197, 94, 0.08)' : 'rgba(59, 130, 246, 0.08)',
      border: `1px solid ${confirmed ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
      borderRadius: 'var(--radius)',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginBottom: 24,
    }}>
      {confirmed ? (
        <CheckCircle size={22} color="var(--primary)" />
      ) : (
        <Clock size={22} color="var(--info)" />
      )}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          {confirmed
            ? 'Trial confirmado'
            : days > 0
              ? `Faltam ${days} dias no seu período de teste`
              : 'Seu teste terminou'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
          {confirmed
            ? 'Sua assinatura está ativa. Qualquer dúvida, chame no WhatsApp.'
            : days > 0
              ? 'Responda CONTINUAR no WhatsApp do atendente para manter a assinatura.'
              : 'Entre em contato para reativar.'}
        </div>
      </div>
    </div>
  )
}
