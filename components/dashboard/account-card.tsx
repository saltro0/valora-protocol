'use client'

import { useAccount } from '@/hooks/use-account'
import { Copy, Check, Loader2, Wallet } from 'lucide-react'
import { useState } from 'react'

export function AccountCard() {
  const { account, provisioning, error, createAccount } = useAccount()
  const [copied, setCopied] = useState<string | null>(null)

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  if (!account) {
    return (
      <div className="card-surface p-6 text-center animate-fade-up">
        <div className="mx-auto w-11 h-11 rounded-xl bg-[#27272a] flex items-center justify-center mb-4">
          <Wallet className="w-5 h-5 text-accent-cyan" />
        </div>
        <h2 className="text-base font-semibold text-text-primary mb-1">
          {provisioning ? 'Creating your account...' : 'No Hedera account yet'}
        </h2>
        <p className="text-[13px] text-text-muted mb-5 max-w-[280px] mx-auto">
          {provisioning
            ? 'Provisioning a secure key and opening your Hedera account.'
            : 'Create a custodial Hedera account to start using DCA Swap.'}
        </p>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[13px] text-red-400">
            {error}
          </div>
        )}

        {provisioning ? (
          <Loader2 className="w-5 h-5 animate-spin text-accent-cyan mx-auto" />
        ) : (
          <button
            onClick={createAccount}
            className="btn-accent px-5 h-9 text-[13px] cursor-pointer"
          >
            Create Account
          </button>
        )}
      </div>
    )
  }

  const fields = [
    { label: 'Hedera Account', value: account.accountId },
    { label: 'EVM Address', value: account.walletAddress },
  ]

  return (
    <div className="card-surface p-5 animate-fade-up">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-[#27272a] flex items-center justify-center">
          <Wallet className="w-[18px] h-[18px] text-accent-cyan" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-text-primary">Your Account</h2>
          <p className="text-[12px] text-text-muted">
            Created {new Date(account.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`status-dot ${account.isActive ? 'bg-emerald-400 text-emerald-400' : 'bg-red-400 text-red-400'}`} />
          <span className={`text-[12px] font-medium ${
            account.isActive ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {account.isActive ? 'Active' : 'Disabled'}
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {fields.map(({ label, value }) => (
          <div key={label} className="field-row flex items-center justify-between px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[11px] text-text-muted uppercase tracking-[0.06em] font-medium mb-0.5">{label}</p>
              <p className="text-[13px] text-text-secondary font-mono truncate">{value}</p>
            </div>
            <button
              onClick={() => copyToClipboard(value, label)}
              className="shrink-0 ml-3 w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-[#27272a] transition-all cursor-pointer"
            >
              {copied === label ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
