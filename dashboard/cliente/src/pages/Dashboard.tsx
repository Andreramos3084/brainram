import { MessageSquare, Users, Calendar, AlertTriangle } from 'lucide-react'
import MetricCard from '../components/MetricCard'
import TrialBanner from '../components/TrialBanner'
import { useTenant } from '../hooks/useTenant'

export default function Dashboard() {
  const { tenant, metrics, loading, error } = useTenant()

  if (loading) return <div style={{ color: 'var(--text-secondary)' }}>Carregando...</div>
  if (error || !tenant) return <div style={{ color: 'var(--danger)' }}>Erro ao carregar dados.</div>

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{tenant.name}</h1>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Plano {tenant.plan} · {tenant.status === 'trial' ? 'Teste grátis' : tenant.status === 'active' ? 'Ativo' : tenant.status}
        </div>
      </div>

      <TrialBanner tenant={tenant} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 32,
      }}>
        <MetricCard
          label="Conversas 24h"
          value={metrics?.conversations_24h ?? 0}
          icon={<MessageSquare size={20} />}
        />
        <MetricCard
          label="Conversas 7 dias"
          value={metrics?.conversations_7d ?? 0}
          icon={<MessageSquare size={20} />}
        />
        <MetricCard
          label="Contatos únicos (7d)"
          value={metrics?.unique_contacts_7d ?? 0}
          icon={<Users size={20} />}
        />
        <MetricCard
          label="Agendamentos (7d)"
          value={metrics?.agendamentos_7d ?? 0}
          icon={<Calendar size={20} />}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 16,
      }}>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 24,
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Resumo da semana</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Row label="Total de conversas" value={metrics?.conversations_total ?? 0} />
            <Row label="Agendamentos totais" value={metrics?.agendamentos_total ?? 0} />
            <Row label="Escalados para humano (7d)" value={metrics?.escalacoes_7d ?? 0} />
          </div>
        </div>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 24,
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Status do atendente</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: tenant.status === 'active' || tenant.status === 'trial' ? 'var(--primary)' : 'var(--danger)',
            }} />
            <span style={{ fontSize: 14 }}>
              {tenant.status === 'active' || tenant.status === 'trial' ? 'Atendente online e respondendo' : 'Atendente inativo'}
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            O atendente de IA responde automaticamente no WhatsApp da sua clínica.
            Conversas complexas são escaladas para você via WhatsApp.
          </p>
        </div>
      </div>

      {metrics && metrics.escalacoes_7d > 5 && (
        <div style={{
          marginTop: 16,
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <AlertTriangle size={20} color="var(--warning)" />
          <div style={{ fontSize: 14, color: 'var(--text)' }}>
            {metrics.escalacoes_7d} conversas foram escaladas para atendimento humano esta semana.
            Recomendamos revisar o agente para melhorar a autonomia.
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{value}</span>
    </div>
  )
}
