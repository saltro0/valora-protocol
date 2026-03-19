'use client'

import { useAccount } from '@/hooks/use-account'
import { rotateKey } from '@/app/actions/vault'
import { Copy, Check, Loader2, Wallet, KeyRound, AlertTriangle, X, ExternalLink } from 'lucide-react'
import { useState } from 'react'

const NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'testnet'
const HASHSCAN_BASE = NETWORK === 'mainnet'
  ? 'https://hashscan.io/mainnet'
  : 'https://hashscan.io/testnet'

export function AccountCard() {
  const { account, provisioning, error, createAccount } = useAccount()
  const [copied, setCopied] = useState<string | null>(null)
  const [showRotateConfirm, setShowRotateConfirm] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [rotationSuccess, setRotationSuccess] = useState<string | null>(null)
  const [rotationError, setRotationError] = useState<string | null>(null)

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleRotate = async () => {
    setShowRotateConfirm(false)
    setIsRotating(true)
    setRotationError(null)

    const result = await rotateKey()

    setIsRotating(false)
    if (result.success && result.newWalletAddress) {
      setRotationSuccess(result.newWalletAddress)
    } else {
      setRotationError(result.error || 'Key rotation failed')
    }
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

      {/* Fund account */}
      <div className="mt-4 pt-4 border-t border-white/5">
        <p className="text-[13px] text-text-muted mb-3">
          Send HBAR to your Hedera account to start using DCA Swap. You need at least 1 HBAR for fees.
        </p>
        <a
          href={`${HASHSCAN_BASE}/account/${account.accountId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-accent-cyan transition-colors"
        >
          View on HashScan <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Key rotation */}
      <div className="mt-4 pt-4 border-t border-white/5">
        <button
          onClick={() => setShowRotateConfirm(true)}
          disabled={isRotating}
          className="flex items-center gap-2 text-[13px] text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg border border-white/5 hover:border-white/20 transition-all duration-200 disabled:opacity-50 cursor-pointer"
        >
          {isRotating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <KeyRound className="w-3.5 h-3.5" />
          )}
          {isRotating ? 'Rotating...' : 'Rotate Signing Key'}
        </button>
      </div>

      {/* Confirmation modal */}
      {showRotateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1e] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <h3 className="text-base font-semibold text-white">Rotate Signing Key</h3>
              </div>
              <button onClick={() => setShowRotateConfirm(false)} className="text-zinc-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[13px] text-zinc-400 mb-4">
              A new cryptographic key will be created in AWS KMS and your Hedera account will be updated.
            </p>
            <div className="space-y-2 mb-5 text-[13px]">
              <div className="flex items-center gap-2 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>Hedera Account ID stays the same</span>
              </div>
              <div className="flex items-center gap-2 text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Signing key will change</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRotateConfirm(false)}
                className="flex-1 px-4 py-2 text-[13px] text-zinc-400 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRotate}
                className="flex-1 px-4 py-2 text-[13px] text-white bg-red-500/20 hover:bg-red-500/30 rounded-lg border border-red-500/30 transition-colors cursor-pointer"
              >
                Confirm Rotation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success modal */}
      {rotationSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1e] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Check className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-semibold text-white">Key Rotated</h3>
            </div>
            <p className="text-[13px] text-zinc-400 mb-5">
              Your signing key has been rotated successfully.
            </p>
            <button
              onClick={() => { setRotationSuccess(null); window.location.reload() }}
              className="w-full px-4 py-2 text-[13px] text-white bg-white/10 hover:bg-white/20 rounded-lg border border-white/5 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Error modal */}
      {rotationError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1e] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="text-base font-semibold text-white">Rotation Failed</h3>
            </div>
            <p className="text-[13px] text-zinc-400 mb-2">Something went wrong:</p>
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[13px] text-red-400 mb-3">
              {rotationError}
            </div>
            {rotationError.includes('INSUFFICIENT_PAYER_BALANCE') && (
              <p className="text-[12px] text-zinc-500 mb-3">
                Your Hedera account needs HBAR to pay for the key update transaction. Send HBAR to <span className="font-mono text-zinc-300">{account.accountId}</span>.
              </p>
            )}
            <button
              onClick={() => setRotationError(null)}
              className="w-full px-4 py-2 text-[13px] text-white bg-white/10 hover:bg-white/20 rounded-lg border border-white/5 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
