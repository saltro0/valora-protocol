'use client'

import { useEffect, useState } from 'react'
import { Fuel, ArrowUpFromLine, Loader2 } from 'lucide-react'
import { getSchedulerBalance, withdrawSchedulerBalance } from '@/app/actions/dca'
import { useAccount } from '@/hooks/use-account'

export function GasBalanceCard() {
  const { account } = useAccount()
  const [balance, setBalance] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [withdrawing, setWithdrawing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchBalance = async () => {
    setLoading(true)
    const res = await getSchedulerBalance()
    if (res.success) {
      setBalance(res.balance)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (account) fetchBalance()
  }, [account])

  if (!account) return null

  const balanceTinybars = BigInt(balance || '0')
  const balanceHbar = Number(balanceTinybars) / 1e8
  const hasBalance = balanceTinybars > 0n

  const handleWithdraw = async () => {
    setWithdrawing(true)
    setMessage(null)
    try {
      const res = await withdrawSchedulerBalance()
      if (res.success) {
        setMessage({ type: 'success', text: `Withdrawn successfully` })
        setBalance('0')
      } else {
        setMessage({ type: 'error', text: res.error || 'Withdraw failed' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    }
    setWithdrawing(false)
  }

  return (
    <div className="card-surface p-5 animate-fade-up" style={{ animationDelay: '0.04s' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-[#27272a] flex items-center justify-center">
          <Fuel className="w-[18px] h-[18px] text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-text-primary">Scheduler Gas</h3>
          <p className="text-[12px] text-text-muted">HBAR deposited for DCA executions</p>
        </div>
      </div>

      <div className="field-row px-3.5 py-3 mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-text-muted uppercase tracking-[0.06em] font-medium mb-0.5">Balance</p>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
          ) : (
            <p className="text-[16px] font-semibold text-text-primary">
              {balanceHbar.toFixed(2)} <span className="text-[13px] text-text-muted font-normal">HBAR</span>
            </p>
          )}
        </div>
        {hasBalance && !loading && (
          <button
            onClick={handleWithdraw}
            disabled={withdrawing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 hover:shadow-[0_0_12px_rgba(245,158,11,0.15)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {withdrawing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowUpFromLine className="w-3.5 h-3.5" />
            )}
            Withdraw
          </button>
        )}
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-[13px] ${
          message.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  )
}
