import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

export default function Home() {
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to default client dashboard slug
    // Change 'demo' to the actual default tenant slug when available
    navigate('/dashboard/demo', { replace: true })
  }, [navigate])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      color: 'var(--text-secondary)',
      fontSize: 14
    }}>
      Redirecionando...
    </div>
  )
}
