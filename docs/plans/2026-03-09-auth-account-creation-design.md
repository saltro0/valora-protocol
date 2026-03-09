# DCA-Swap: Auth + Hedera Account Creation Design

## Overview

New Next.js 15 project providing custodial Hedera account management. Users authenticate via email/password or Google OAuth, and the system automatically provisions an AWS KMS signing key and Hedera account per user.

Shares the same Supabase instance and AWS KMS credentials as hbank-bridge but uses independent database tables (prefixed `dca_`). Code is structurally differentiated through Server Actions, middleware-based auth, service classes, and SSR cookie-based sessions.

## Scope (Phase 1)

- Email/password signup and login
- Google OAuth login
- Automatic Hedera account creation (AWS KMS + Hedera SDK)
- Dashboard showing account info and funding instructions
- Modern futuristic dark UI

## Architecture

### Auth: Supabase SSR with cookies

Unlike hbank-bridge (which stores JWT in localStorage via Context), dca-swap uses `@supabase/ssr` with httpOnly cookies managed by Next.js middleware.

**Signup flow:**
1. Server Action `signUp(email, password)`
2. `supabaseAdmin.auth.admin.createUser()` with auto-confirm
3. `supabaseServer.auth.signInWithPassword()` sets cookies
4. Redirect to `/dashboard`

**Login flow:**
1. Server Action `signIn(email, password)`
2. `supabaseServer.auth.signInWithPassword()` sets cookies
3. Redirect to `/dashboard`

**Google OAuth flow:**
1. Client: `supabaseBrowser.auth.signInWithOAuth({ provider: 'google' })`
2. Google redirect -> `/callback`
3. `supabase.auth.exchangeCodeForSession(code)` (PKCE)
4. Cookies set -> redirect to `/dashboard`

**Middleware:**
- Protects `/(dashboard)/*` routes
- Refreshes tokens automatically
- Redirects unauthenticated users to `/login`

### Key Management: VaultService + LedgerService

Service classes encapsulate AWS KMS and Hedera operations:

```
VaultService
  - provisionSigningKey(userId) -> KeyInfo
  - retrievePublicKey(keyId) -> hex string
  - signDigest(keyId, digest) -> raw signature

LedgerService
  - openAccount(compressedPubKey) -> AccountInfo
  - deriveAddress(uncompressedPubKey) -> EVM address
```

### Account Creation Flow (Server Action `provisionAccount`)

1. Validate session from cookies
2. VaultService.provisionSigningKey(userId) -> AWS KMS secp256k1 key
3. VaultService.retrievePublicKey(keyId) -> public key hex
4. LedgerService.openAccount(pubkey) -> Hedera account 0.0.XXXX
5. LedgerService.deriveAddress(pubkey) -> 0x EVM address
6. Insert into `dca_accounts` table
7. Initialize `dca_rate_limits`
8. Log to `dca_audit_log`

## Database Tables

All tables are independent from hbank-bridge, using `dca_` prefix.

### dca_accounts
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | auto-generated |
| user_id | UUID FK auth.users | unique per user |
| account_id | TEXT | Hedera 0.0.XXXX |
| vault_key_id | TEXT | AWS KMS key ID |
| vault_key_arn | TEXT | AWS KMS ARN |
| public_key | TEXT | 65-byte uncompressed hex |
| wallet_address | TEXT | 0x EVM address |
| is_active | BOOLEAN | default true |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### dca_rate_limits
| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID PK FK | |
| ops_hourly | INT | default 0 |
| ops_daily | INT | default 0 |
| last_op_at | TIMESTAMPTZ | |
| hourly_reset_at | TIMESTAMPTZ | |
| daily_reset_at | TIMESTAMPTZ | |

### dca_audit_log
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| op_type | TEXT | e.g. account_create |
| op_params | JSONB | |
| vault_key_id | TEXT | |
| tx_hash | TEXT | nullable |
| client_ip | TEXT | nullable |
| result | TEXT | pending/success/failed |
| error_detail | TEXT | nullable |
| created_at | TIMESTAMPTZ | |

## Project Structure

```
app/
  (auth)/login/page.tsx
  (auth)/signup/page.tsx
  (auth)/callback/page.tsx
  (dashboard)/layout.tsx        # protected
  (dashboard)/page.tsx          # dashboard
  actions/auth.ts               # server actions
  actions/vault.ts              # server actions
  layout.tsx
  page.tsx
  globals.css
  providers.tsx
components/
  auth/login-form.tsx
  auth/signup-form.tsx
  auth/oauth-button.tsx
  dashboard/account-card.tsx
  dashboard/fund-guide.tsx
  ui/                           # shadcn
lib/
  services/auth-service.ts
  services/vault-service.ts
  services/ledger-service.ts
  utils/crypto.ts
  utils/guards.ts
  supabase/client.ts
  supabase/server.ts
  supabase/admin.ts
hooks/use-session.ts
hooks/use-account.ts
store/session-store.ts
middleware.ts
types/index.ts
```

## Key Structural Differences from hbank-bridge

| Aspect | hbank-bridge | dca-swap |
|--------|-------------|----------|
| Auth state | Context + localStorage | Middleware + httpOnly cookies |
| API layer | API routes (`/api/kms/*`) | Server Actions (`app/actions/*`) |
| Auth check | Manual per-route | Centralized middleware |
| Key mgmt code | Flat functions in `/lib/kms/` | Service classes (VaultService, LedgerService) |
| Client state | React Context | Zustand store |
| DB tables | custodial_accounts, kms_* | dca_accounts, dca_* |
| Login UI | Dialog modal | Full page |
| Route org | Flat routes | Route groups (auth), (dashboard) |

## Tech Stack

- Next.js 15 (App Router)
- React 19
- Tailwind CSS v4 + shadcn/ui
- Supabase Auth SSR (@supabase/ssr)
- Zustand + React Query
- @aws-sdk/client-kms
- @hashgraph/sdk
- @noble/hashes
- Sonner (toasts)

## UI Style

Dark theme, futuristic aesthetic:
- Glassmorphism effects
- Gradient accents (neon-style)
- Modern typography (Geist)
- Smooth transitions and animations
