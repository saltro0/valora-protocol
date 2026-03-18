import { getAdminSupabase, DB } from '@/lib/supabase/admin'

const MAX_PER_HOUR = parseInt(process.env.CUSTODIAL_MAX_OPS_PER_HOUR || '10')
const MAX_PER_DAY = parseInt(process.env.CUSTODIAL_MAX_OPS_PER_DAY || '50')

/**
 * Check rate limits for a user. Throws if limits exceeded.
 * Call BEFORE executing any mutating operation.
 *
 * Note: This reads then checks — not fully atomic. For this app's
 * custodial model (one user = one custodial account, no concurrent
 * browser sessions expected), this is acceptable.
 */
export async function checkRateLimits(userId: string): Promise<void> {
  const supabase = getAdminSupabase()

  const { data: rl } = await supabase
    .from(DB.RATE_LIMITS)
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!rl) return // No rate limit row yet — first operation

  const now = Date.now()
  let opsHourly = rl.ops_hourly ?? 0
  let opsDaily = rl.ops_daily ?? 0

  // Reset hourly window if expired
  if (rl.hourly_reset_at && now - new Date(rl.hourly_reset_at).getTime() > 3_600_000) {
    opsHourly = 0
    await supabase
      .from(DB.RATE_LIMITS)
      .update({ ops_hourly: 0, hourly_reset_at: new Date().toISOString() })
      .eq('user_id', userId)
  }

  // Reset daily window if expired
  if (rl.daily_reset_at && now - new Date(rl.daily_reset_at).getTime() > 86_400_000) {
    opsDaily = 0
    await supabase
      .from(DB.RATE_LIMITS)
      .update({ ops_daily: 0, daily_reset_at: new Date().toISOString() })
      .eq('user_id', userId)
  }

  if (opsHourly >= MAX_PER_HOUR) {
    throw new Error('Rate limit exceeded: max operations per hour reached')
  }
  if (opsDaily >= MAX_PER_DAY) {
    throw new Error('Rate limit exceeded: max operations per day reached')
  }
}

/**
 * Increment rate limit counters after a successful operation.
 * Uses the existing atomic RPC function.
 */
export async function incrementRateLimits(userId: string): Promise<void> {
  const supabase = getAdminSupabase()
  await supabase.rpc('increment_dca_rate_limits', { p_user_id: userId })
}
