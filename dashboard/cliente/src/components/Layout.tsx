import { Outlet, NavLink, useParams } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, Settings, Brain } from 'lucide-react'
import { useTenant } from '../hooks/useTenant'

export default function Layout() {
  const { slug } = useParams()
  const { tenant, loading } = useTenant()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Carregando...</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: 260,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 50,
      }}>
        <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Brain size={24} color="var(--primary)" />
            <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>BrainRam</span>
          </div>
          {tenant && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              {tenant.name}
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NavLink to={`/dashboard/${slug}`} end style={({ isActive }) => navStyle(isActive)}>
            <LayoutDashboard size={18} />
            <span>Visão geral</span>
          </NavLink>
          <NavLink to={`/dashboard/${slug}/conversas`} style={({ isActive }) => navStyle(isActive)}>
            <MessageSquare size={18} />
            <span>Conversas</span>
          </NavLink>
          <NavLink to={`/dashboard/${slug}/configuracoes`} style={({ isActive }) => navStyle(isActive)}>
            <Settings size={18} />
            <span>Configurações</span>
          </NavLink>
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
          Suporte: <a href="https://wa.me/5519998760212" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>wa.me/5519998760212</a>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, marginLeft: 260, padding: 32, maxWidth: 1200 }}>
        <Outlet />
      </main>
    </div>
  )
}

function navStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 14,
    fontWeight: 500,
    color: isActive ? 'var(--primary-light)' : 'var(--text-secondary)',
    background: isActive ? 'rgba(34, 197, 94, 0.08)' : 'transparent',
    transition: 'all 0.15s',
    textDecoration: 'none',
  }
}
