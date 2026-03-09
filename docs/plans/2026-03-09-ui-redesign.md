# UI Redesign: Structured Minimal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Full visual redesign of all pages and components to a clean, minimal dark theme inspired by Uniswap/Aave — removing glassmorphism, glow effects, and shimmer overlays in favor of solid surfaces, subtle borders, and crisp typography.

**Architecture:** Replace all custom CSS classes (glass-card, glow-ring, btn-primary, form-input, oauth-btn, bg-page) with Tailwind utilities and clean CSS variables. Each component gets rewritten in-place with the new design tokens. No structural/logic changes — purely visual.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Lucide icons (all unchanged)

---

### Task 1: Rewrite globals.css — new design tokens, remove old effects

**Files:**
- Modify: `app/globals.css` (full rewrite)

**Step 1: Replace globals.css with new design system**

Replace the entire `app/globals.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-surface-hover: var(--surface-hover);
  --color-accent-cyan: var(--accent-cyan);
  --color-accent-cyan-hover: var(--accent-cyan-hover);
  --color-accent-muted: var(--accent-muted);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  /* Design tokens */
  --background: #0a0e1a;
  --foreground: #f1f5f9;
  --surface: #111827;
  --surface-hover: #1a2332;
  --accent-cyan: #06b6d4;
  --accent-cyan-hover: #22d3ee;
  --accent-muted: rgba(6, 182, 212, 0.1);
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  /* shadcn tokens (dark-first) */
  --card: #111827;
  --card-foreground: #f1f5f9;
  --popover: #111827;
  --popover-foreground: #f1f5f9;
  --primary: #06b6d4;
  --primary-foreground: #ffffff;
  --secondary: #1a2332;
  --secondary-foreground: #f1f5f9;
  --muted: #1a2332;
  --muted-foreground: #94a3b8;
  --accent: #1a2332;
  --accent-foreground: #f1f5f9;
  --destructive: #ef4444;
  --border: rgba(255, 255, 255, 0.06);
  --input: rgba(255, 255, 255, 0.06);
  --ring: #06b6d4;
  --radius: 0.75rem;

  --chart-1: oklch(0.809 0.105 251.813);
  --chart-2: oklch(0.623 0.214 259.815);
  --chart-3: oklch(0.546 0.245 262.881);
  --chart-4: oklch(0.488 0.243 264.376);
  --chart-5: oklch(0.424 0.199 265.638);

  --sidebar: #111827;
  --sidebar-foreground: #f1f5f9;
  --sidebar-primary: #06b6d4;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #1a2332;
  --sidebar-accent-foreground: #f1f5f9;
  --sidebar-border: rgba(255, 255, 255, 0.06);
  --sidebar-ring: #06b6d4;
}

html {
  color-scheme: dark;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.14);
}

/* Selection */
::selection {
  background: rgba(6, 182, 212, 0.25);
  color: #fff;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    @apply font-sans;
  }
}
```

Key changes: removed `.bg-page`, `.glass-card`, `.glow-ring`, `.form-input`, `.btn-primary`, `.oauth-btn`, all keyframe animations, all gradients. Replaced oklch tokens with hex values. Unified dark-first (no light mode variables needed).

**Step 2: Verify the app compiles**

Run: `cd /Users/sergiobanuls/Documents/PERSONAL/dca-swap && npx next build 2>&1 | head -40`

Note: This will show errors because components still reference removed CSS classes. That's expected — we fix those in the next tasks.

**Step 3: Commit**

```bash
git add app/globals.css
git commit -m "refactor: replace design tokens with structured minimal system"
```

---

### Task 2: Update root layout — clean toaster styling

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Update toaster styling**

In `app/layout.tsx`, replace the Toaster component's `toastOptions` to use the new design tokens:

Replace:
```tsx
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'rgba(15, 15, 30, 0.9)',
                color: '#e2e8f0',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                backdropFilter: 'blur(12px)',
              },
            }}
          />
```

With:
```tsx
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#111827',
                color: '#f1f5f9',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              },
            }}
          />
```

**Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "refactor: update toaster to solid surface style"
```

---

### Task 3: Rewrite NavBar — clean minimal header

**Files:**
- Modify: `components/nav-bar.tsx`

**Step 1: Rewrite NavBar component**

Replace the entire content of `components/nav-bar.tsx` with:

```tsx
'use client'

import { signOut } from '@/app/actions/auth'
import { useSessionStore } from '@/store/session-store'
import { LogOut } from 'lucide-react'

export function NavBar() {
  const { user } = useSessionStore()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#0a0e1a]/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4 sm:px-6">
        <span className="text-lg font-semibold text-text-primary">
          DCA Swap
        </span>

        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-text-secondary hidden sm:block">
              {user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  )
}
```

Key changes: removed gradient text on logo (now plain white), `bg-page/80` → `bg-[#0a0e1a]/80`, `backdrop-blur-xl` → `backdrop-blur-sm`, max-w-5xl → max-w-6xl, h-16 → h-14, uses new text color tokens.

**Step 2: Commit**

```bash
git add components/nav-bar.tsx
git commit -m "refactor: redesign navbar with clean minimal style"
```

---

### Task 4: Rewrite auth pages and forms

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/(auth)/signup/page.tsx`
- Modify: `components/auth/login-form.tsx`
- Modify: `components/auth/signup-form.tsx`
- Modify: `components/auth/oauth-button.tsx`

**Step 1: Update login page**

Replace `app/(auth)/login/page.tsx` with:

```tsx
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full flex flex-col items-center">
        <LoginForm />
        <p className="mt-8 text-xs text-text-muted">DCA Swap</p>
      </div>
    </main>
  )
}
```

**Step 2: Update signup page**

Replace `app/(auth)/signup/page.tsx` with:

```tsx
import { SignupForm } from '@/components/auth/signup-form'

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full flex flex-col items-center">
        <SignupForm />
        <p className="mt-8 text-xs text-text-muted">DCA Swap</p>
      </div>
    </main>
  )
}
```

**Step 3: Rewrite OAuthButton**

Replace `components/auth/oauth-button.tsx` with:

```tsx
'use client'

import { createBrowserSupabase } from '@/lib/supabase/client'
import { useState } from 'react'

export function OAuthButton() {
  const [loading, setLoading] = useState(false)

  const handleGoogleLogin = async () => {
    setLoading(true)
    const supabase = createBrowserSupabase()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`,
      },
    })
  }

  return (
    <button
      type="button"
      onClick={handleGoogleLogin}
      disabled={loading}
      className="w-full h-11 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] text-text-primary font-medium text-sm flex items-center justify-center gap-3 transition-colors disabled:opacity-40 cursor-pointer"
    >
      <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      {loading ? 'Redirecting...' : 'Continue with Google'}
    </button>
  )
}
```

**Step 4: Rewrite LoginForm**

Replace `components/auth/login-form.tsx` with:

```tsx
'use client'

import { useActionState } from 'react'
import { signIn } from '@/app/actions/auth'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { OAuthButton } from './oauth-button'

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null)
  const [showPwd, setShowPwd] = useState(false)

  return (
    <div className="w-full max-w-sm bg-surface rounded-xl border border-white/[0.06] p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-text-primary">
          Sign in to DCA Swap
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Enter your credentials to continue
        </p>
      </div>

      {/* OAuth */}
      <OAuthButton />

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div className="h-px flex-1 bg-white/[0.06]" />
        <span className="text-xs text-text-muted">or</span>
        <div className="h-px flex-1 bg-white/[0.06]" />
      </div>

      {/* Form */}
      <form action={action} className="flex flex-col gap-4">
        <div className="space-y-2">
          <label className="text-sm text-text-secondary font-medium">
            Email
          </label>
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            className="w-full h-11 px-4 rounded-lg bg-white/[0.03] border border-white/[0.08] text-text-primary text-sm placeholder:text-text-muted/60 outline-none focus:border-accent-cyan/40 focus:ring-2 focus:ring-accent-cyan/10 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-text-secondary font-medium">
            Password
          </label>
          <div className="relative">
            <input
              name="password"
              type={showPwd ? 'text' : 'password'}
              placeholder="Enter your password"
              required
              minLength={6}
              className="w-full h-11 px-4 pr-11 rounded-lg bg-white/[0.03] border border-white/[0.08] text-text-primary text-sm placeholder:text-text-muted/60 outline-none focus:border-accent-cyan/40 focus:ring-2 focus:ring-accent-cyan/10 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              tabIndex={-1}
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {state?.error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            <p className="text-sm text-red-400">{state.error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full h-11 rounded-lg bg-accent-cyan hover:bg-accent-cyan-hover text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-40 cursor-pointer mt-1"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>

      <p className="text-center text-sm text-text-secondary mt-6">
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
```

**Step 5: Rewrite SignupForm**

Replace `components/auth/signup-form.tsx` with:

```tsx
'use client'

import { useActionState } from 'react'
import { signUp } from '@/app/actions/auth'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { OAuthButton } from './oauth-button'

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, null)
  const [showPwd, setShowPwd] = useState(false)

  return (
    <div className="w-full max-w-sm bg-surface rounded-xl border border-white/[0.06] p-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-text-primary">
          Create your account
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Get started with DCA Swap
        </p>
      </div>

      <OAuthButton />

      <div className="flex items-center gap-3 my-6">
        <div className="h-px flex-1 bg-white/[0.06]" />
        <span className="text-xs text-text-muted">or</span>
        <div className="h-px flex-1 bg-white/[0.06]" />
      </div>

      <form action={action} className="flex flex-col gap-4">
        <div className="space-y-2">
          <label className="text-sm text-text-secondary font-medium">
            Email
          </label>
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            className="w-full h-11 px-4 rounded-lg bg-white/[0.03] border border-white/[0.08] text-text-primary text-sm placeholder:text-text-muted/60 outline-none focus:border-accent-cyan/40 focus:ring-2 focus:ring-accent-cyan/10 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-text-secondary font-medium">
            Password
          </label>
          <div className="relative">
            <input
              name="password"
              type={showPwd ? 'text' : 'password'}
              placeholder="Min 6 characters"
              required
              minLength={6}
              className="w-full h-11 px-4 pr-11 rounded-lg bg-white/[0.03] border border-white/[0.08] text-text-primary text-sm placeholder:text-text-muted/60 outline-none focus:border-accent-cyan/40 focus:ring-2 focus:ring-accent-cyan/10 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              tabIndex={-1}
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {state?.error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            <p className="text-sm text-red-400">{state.error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full h-11 rounded-lg bg-accent-cyan hover:bg-accent-cyan-hover text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-40 cursor-pointer mt-1"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating account...
            </>
          ) : (
            'Create Account'
          )}
        </button>
      </form>

      <p className="text-center text-sm text-text-secondary mt-6">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-accent-cyan hover:text-accent-cyan-hover font-medium transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
```

**Step 6: Commit**

```bash
git add app/(auth)/login/page.tsx app/(auth)/signup/page.tsx components/auth/login-form.tsx components/auth/signup-form.tsx components/auth/oauth-button.tsx
git commit -m "refactor: redesign auth pages with clean minimal style"
```

---

### Task 5: Update dashboard layout and page

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Step 1: Update dashboard layout**

Replace `app/(dashboard)/layout.tsx` with:

```tsx
import { NavBar } from '@/components/nav-bar'
import { SessionInitializer } from '@/components/session-initializer'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <SessionInitializer />
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </>
  )
}
```

**Step 2: Update dashboard page**

Replace `app/(dashboard)/dashboard/page.tsx` with:

```tsx
import { AccountCard } from '@/components/dashboard/account-card'
import { FundGuide } from '@/components/dashboard/fund-guide'

export default function DashboardPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
      <AccountCard />
      <FundGuide />
    </div>
  )
}
```

Key changes: max-w-xl → max-w-2xl, text-white → text-text-primary, font-bold → font-semibold, uses space-y-6 instead of manual margin.

**Step 3: Commit**

```bash
git add app/(dashboard)/layout.tsx app/(dashboard)/dashboard/page.tsx
git commit -m "refactor: update dashboard layout with wider max-width and spacing"
```

---

### Task 6: Rewrite AccountCard — clean surface card

**Files:**
- Modify: `components/dashboard/account-card.tsx`

**Step 1: Rewrite AccountCard**

Replace `components/dashboard/account-card.tsx` with:

```tsx
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
      <div className="bg-surface rounded-xl border border-white/[0.06] p-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-lg bg-accent-muted flex items-center justify-center mb-4">
          <Wallet className="w-6 h-6 text-accent-cyan" />
        </div>
        <h2 className="text-lg font-medium text-text-primary mb-1">
          {provisioning ? 'Creating your account...' : 'No Hedera account yet'}
        </h2>
        <p className="text-sm text-text-secondary mb-6 max-w-xs mx-auto">
          {provisioning
            ? 'Provisioning a secure signing key and opening your Hedera account.'
            : 'Create a custodial Hedera account to start using DCA Swap.'}
        </p>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        {provisioning ? (
          <Loader2 className="w-5 h-5 animate-spin text-accent-cyan mx-auto" />
        ) : (
          <button
            onClick={createAccount}
            className="px-5 h-10 rounded-lg bg-accent-cyan hover:bg-accent-cyan-hover text-white font-medium text-sm transition-colors cursor-pointer"
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
    <div className="bg-surface rounded-xl border border-white/[0.06] p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-accent-muted flex items-center justify-center">
          <Wallet className="w-5 h-5 text-accent-cyan" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-text-primary">Your Account</h2>
          <p className="text-xs text-text-muted">
            Created {new Date(account.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="ml-auto">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            account.isActive
              ? 'text-green-400 bg-green-500/10'
              : 'text-red-400 bg-red-500/10'
          }`}>
            {account.isActive ? 'Active' : 'Disabled'}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <div className="min-w-0">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-0.5">{label}</p>
              <p className="text-sm text-text-primary font-mono truncate">{value}</p>
            </div>
            <button
              onClick={() => copyToClipboard(value, label)}
              className="shrink-0 ml-3 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
            >
              {copied === label ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Key changes: `glass-card rounded-2xl p-8` → `bg-surface rounded-xl border border-white/[0.06] p-6`, gradient icon container → `bg-accent-muted rounded-lg`, removed glow-ring, border on badges removed, cleaner label styling.

**Step 2: Commit**

```bash
git add components/dashboard/account-card.tsx
git commit -m "refactor: redesign account card with solid surface style"
```

---

### Task 7: Rewrite FundGuide — clean card

**Files:**
- Modify: `components/dashboard/fund-guide.tsx`

**Step 1: Rewrite FundGuide**

Replace `components/dashboard/fund-guide.tsx` with:

```tsx
'use client'

import { useAccount } from '@/hooks/use-account'
import { ArrowDownToLine, ExternalLink } from 'lucide-react'

export function FundGuide() {
  const { account } = useAccount()
  if (!account) return null

  return (
    <div className="bg-surface rounded-xl border border-white/[0.06] p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <ArrowDownToLine className="w-5 h-5 text-amber-400" />
        </div>
        <h3 className="text-lg font-medium text-text-primary">Fund Your Account</h3>
      </div>

      <p className="text-sm text-text-secondary mb-4">
        Send HBAR to your Hedera account to start using DCA Swap. You need at least 1 HBAR for transaction fees.
      </p>

      <div className="px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.04] mb-4">
        <p className="text-xs text-text-muted mb-1">Send HBAR to:</p>
        <p className="text-sm font-mono text-accent-cyan">{account.accountId}</p>
      </div>

      <a
        href={`https://hashscan.io/mainnet/account/${account.accountId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-accent-cyan hover:text-accent-cyan-hover transition-colors"
      >
        View on HashScan <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}
```

Key changes: same card style as AccountCard, amber icon uses simple bg instead of gradient, cleaned up text colors.

**Step 2: Commit**

```bash
git add components/dashboard/fund-guide.tsx
git commit -m "refactor: redesign fund guide with solid surface style"
```

---

### Task 8: Final build verification

**Step 1: Run full build**

Run: `cd /Users/sergiobanuls/Documents/PERSONAL/dca-swap && npx next build`

Expected: Build succeeds with no errors.

**Step 2: Fix any build issues**

If there are Tailwind compilation warnings about unknown utility classes (e.g., `bg-surface`, `text-text-primary`, `bg-accent-cyan`, etc.), verify the `@theme inline` block in globals.css maps them correctly. The custom color tokens `--color-surface`, `--color-text-primary`, `--color-accent-cyan`, etc. must be defined in the `@theme inline` block for Tailwind 4 to recognize them.

**Step 3: Visual spot-check**

Run: `cd /Users/sergiobanuls/Documents/PERSONAL/dca-swap && npx next dev`

Check these pages:
- `/login` — centered card, solid background, no glass effect, clean inputs
- `/signup` — same style as login
- `/dashboard` — clean navbar, solid account card, fund guide

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues from UI redesign"
```
