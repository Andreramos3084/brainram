import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MessageSquare, Search } from 'lucide-react'
import type { Conversation } from '../types'

const API_BASE = import.meta.env.VITE_API_URL || ''

export default function Conversations() {
  const { slug } = useParams<{ slug: string }>()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!slug) return
    fetch(`${API_BASE}/dashboard/${slug}/api/conversations?limit=100`)
      .then(r => r.json())
      .then(data => setConversations(data.items || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [slug])

  const grouped = conversations.reduce((acc, c) => {
    if (!acc[c.contact]) acc[c.contact] = []
    acc[c.contact].push(c)
    return acc
  }, {} as Record<string, Conversation[]>)

  const contacts = Object.keys(grouped).filter(contact =>
    contact.includes(search) || grouped[contact].some(c => c.content.toLowerCase().includes(search.toLowerCase()))
  )

  if (loading) return <div style={{ color: 'var(--text-secondary)' }}>Carregando...</div>

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Conversas</h1>

      <div style={{ position: 'relative', marginBottom: 24, maxWidth: 400 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input
          placeholder="Buscar por contato ou mensagem..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', paddingLeft: 38 }}
        />
      </div>

      {contacts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <MessageSquare size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div>Nenhuma conversa encontrada.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {contacts.map(contact => {
          const msgs = grouped[contact].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          const last = msgs[msgs.length - 1]
          return (
            <div key={contact} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{contact}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {new Date(last.created_at).toLocaleString('pt-BR')}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {msgs.slice(-3).map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === 'assistant' ? 'flex-start' : 'flex-end',
                    background: m.role === 'assistant' ? 'rgba(34,197,94,0.08)' : 'var(--surface-hover)',
                    border: `1px solid ${m.role === 'assistant' ? 'rgba(34,197,94,0.15)' : 'var(--border)'}`,
                    borderRadius: 10,
                    padding: '10px 14px',
                    maxWidth: '80%',
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}>
                    {m.content}
                  </div>
                ))}
              </div>
              {msgs.length > 3 && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, textAlign: 'center' }}>
                  +{msgs.length - 3} mensagens anteriores
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
