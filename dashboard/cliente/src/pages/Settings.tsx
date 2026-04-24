import { useState } from 'react'
import { useTenant } from '../hooks/useTenant'
import { Save, AlertTriangle } from 'lucide-react'

export default function Settings() {
  const { tenant } = useTenant()
  const [saved, setSaved] = useState(false)

  if (!tenant) return null

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Configurações</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
        <Section title="Dados da clínica">
          <Field label="Nome do negócio" defaultValue={tenant.name} />
          <Field label="Segmento" defaultValue="clínica odontológica" />
          <Field label="Telefone comercial" defaultValue="" placeholder="5519999999999" />
          <Field label="Email" defaultValue="" placeholder="contato@clinica.com.br" />
        </Section>

        <Section title="Atendente IA">
          <Field label="Nome do atendente virtual" defaultValue="" placeholder="ex: Ana" />
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Tom de voz</label>
            <select style={{ width: '100%' }}>
              <option>Casual e acolhedor</option>
              <option>Formal e profissional</option>
              <option>Direto e eficiente</option>
            </select>
          </div>
        </Section>

        <Section title="Integrações">
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.15)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />
            <span style={{ fontSize: 14 }}>Google Calendar conectado</span>
          </div>
          <div style={{
            background: 'var(--surface-hover)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-secondary)' }} />
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Evolution API — número do WhatsApp</span>
          </div>
        </Section>

        <Section title="Perigo">
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.15)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <AlertTriangle size={16} color="var(--danger)" />
            <span style={{ fontSize: 14 }}>Cancelar assinatura</span>
          </div>
        </Section>

        <button
          onClick={handleSave}
          style={{
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--primary)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            fontSize: 14,
            marginTop: 8,
          }}
        >
          <Save size={16} />
          {saved ? 'Salvo!' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 24,
    }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, defaultValue, placeholder }: { label: string; defaultValue: string; placeholder?: string }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>{label}</label>
      <input defaultValue={defaultValue} placeholder={placeholder} style={{ width: '100%' }} />
    </div>
  )
}
