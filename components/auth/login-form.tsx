'use client'

import { useActionState } from 'react'
import { signIn } from '@/app/actions/auth'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null)
  const [showPwd, setShowPwd] = useState(false)

  return (
    <div className="card-surface w-full max-w-[380px] p-7 animate-fade-up">
      <div className="mb-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Valora Protocol" width={40} height={40} className="rounded-xl mx-auto mb-4" />
        <h1 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">
          Welcome back
        </h1>
        <p className="text-[13px] text-text-muted mt-1">
          Sign in to your account
        </p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <label className="text-[13px] text-text-secondary font-medium">
            Email
          </label>
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            className="input-field w-full h-10 px-3.5 text-[13px]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] text-text-secondary font-medium">
            Password
          </label>
          <div className="relative">
            <input
              name="password"
              type={showPwd ? 'text' : 'password'}
              placeholder="Enter your password"
              required
              minLength={6}
              className="input-field w-full h-10 px-3.5 pr-10 text-[13px]"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              tabIndex={-1}
            >
              {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {state?.error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            <p className="text-[13px] text-red-400">{state.error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-accent w-full h-10 text-[13px] flex items-center justify-center gap-2 mt-1 disabled:opacity-40 cursor-pointer"
        >
          {pending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>

      <p className="text-center text-[13px] text-text-muted mt-6">
        {"Don't have an account? "}
        <Link
          href="/signup"
          className="text-accent-cyan hover:text-accent-cyan-hover font-medium transition-colors"
        >
          Create one
        </Link>
      </p>
    </div>
  )
}
