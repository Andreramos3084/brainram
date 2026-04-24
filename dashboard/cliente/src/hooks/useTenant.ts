import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Tenant, Metrics } from '../types'

const API_BASE = import.meta.env.VITE_API_URL || ''

export function useTenant() {
  const { slug } = useParams<{ slug: string }>()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    fetch(`${API_BASE}/dashboard/${slug}/api`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setTenant(data.tenant)
          setMetrics(data.metrics)
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [slug])

  return { slug, tenant, metrics, loading, error }
}
