import type { ReactNode } from 'react'

interface Props {
  label: string
  value: string | number
  icon: ReactNode
  trend?: { value: number; positive: boolean }
}

export default function MetricCard({ label, value, icon, trend }: Props) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
        <div style={{ color: 'var(--primary)' }}>{icon}</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
      {trend && (
        <div style={{
          fontSize: 12,
          color: trend.positive ? 'var(--primary-light)' : 'var(--danger)',
          fontWeight: 500,
        }}>
          {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}% vs. semana anterior
        </div>
      )}
    </div>
  )
}
