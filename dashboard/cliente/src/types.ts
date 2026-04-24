export interface Tenant {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'pro' | 'premium'
  status: 'trial' | 'active' | 'past_due' | 'cancelled'
  created_at: string
  trial_ends_at?: string
  trial_confirmed?: boolean
  trial_days_left?: number | null
}

export interface Metrics {
  conversations_24h: number
  conversations_7d: number
  conversations_total: number
  unique_contacts_7d: number
  agendamentos_7d: number
  agendamentos_total: number
  escalacoes_7d: number
}

export interface Conversation {
  id: string
  contact: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface NavItem {
  label: string
  path: string
  icon: string
}
