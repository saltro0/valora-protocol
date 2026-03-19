'use client'

import { useAccount } from '@/hooks/use-account'
import { ArrowDownToLine, ExternalLink } from 'lucide-react'

const NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'testnet'
const HASHSCAN_BASE = NETWORK === 'mainnet'
  ? 'https://hashscan.io/mainnet'
  : 'https://hashscan.io/testnet'

export function FundGuide() {
  const { account } = useAccount()
  if (!account) return null

  return (
    <div className="card-surface p-5 animate-fade-up" style={{ animationDelay: '0.08s' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-[#27272a] flex items-center justify-center">
          <ArrowDownToLine className="w-[18px] h-[18px] text-amber-400" />
        </div>
        <h3 className="text-[15px] font-semibold text-text-primary">
          Fund Your Account
        </h3>
      </div>

      <p className="text-[13px] text-text-muted mb-4">
        Send HBAR to your Hedera account to start using DCA Swap. You need at least 1 HBAR for fees.
      </p>

      <div className="field-row px-3.5 py-3 mb-4">
        <p className="text-[11px] text-text-muted uppercase tracking-[0.06em] font-medium mb-0.5">Send HBAR to</p>
        <p className="text-[14px] font-mono text-accent-cyan">{account.accountId}</p>
      </div>

      <a
        href={`${HASHSCAN_BASE}/account/${account.accountId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-accent-cyan transition-colors"
      >
        View on HashScan <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  )
}
