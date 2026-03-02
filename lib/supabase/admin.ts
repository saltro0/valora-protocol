import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

let adminInstance: ReturnType<typeof createClient<Database>> | null = null

export function getAdminSupabase() {
  if (adminInstance) return adminInstance

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations')
  }

  adminInstance = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  return adminInstance
}

export const DB = {
  ACCOUNTS: 'dca_accounts',
  RATE_LIMITS: 'dca_rate_limits',
  AUDIT_LOG: 'dca_audit_log',
  DCA_POSITIONS: 'dca_positions',
  DCA_EXECUTIONS: 'dca_executions',
} as const
