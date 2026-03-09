# DCA-Swap Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Next.js 15 app with Supabase SSR auth (email + Google OAuth) and automatic Hedera account creation via AWS KMS, with a futuristic dark UI.

**Architecture:** Server Actions for mutations, middleware-based SSR auth with httpOnly cookies, service classes (VaultService/LedgerService) encapsulating AWS KMS and Hedera SDK operations, Zustand for client state.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, shadcn/ui, @supabase/ssr, Zustand, @aws-sdk/client-kms, @hashgraph/sdk, @noble/hashes, Sonner

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `.env.local`
- Create: `.gitignore`

**Step 1: Initialize Next.js project**

```bash
cd /Users/sergiobanuls/Documents/PERSONAL/dca-swap
npx create-next-app@latest . --typescript --tailwind --eslint --app --src=no --import-alias "@/*" --turbopack --yes
```

**Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr @aws-sdk/client-kms @hashgraph/sdk @noble/hashes zustand @tanstack/react-query sonner lucide-react class-variance-authority clsx tailwind-merge
```

**Step 3: Update `next.config.ts`**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  serverExternalPackages: ['@hashgraph/sdk', '@supabase/supabase-js'],
}

export default nextConfig
```

**Step 4: Create `.env.local`**

Copy the relevant env vars from hbank-bridge, keeping the same Supabase and AWS credentials:

```env
NEXT_PUBLIC_HEDERA_NETWORK=mainnet
NEXT_PUBLIC_SUPABASE_URL=<copy from hbank-bridge>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<copy from hbank-bridge>
SUPABASE_SERVICE_ROLE_KEY=<copy from hbank-bridge>

AWS_ACCESS_KEY_ID=<copy from hbank-bridge>
AWS_SECRET_ACCESS_KEY=<copy from hbank-bridge>
AWS_KMS_REGION=us-east-1

CUSTODIAL_CREATOR_ACCOUNT_ID=<copy from hbank-bridge>
CUSTODIAL_CREATOR_PRIVATE_KEY=<copy from hbank-bridge>

CUSTODIAL_MAX_OPS_PER_HOUR=10
CUSTODIAL_MAX_OPS_PER_DAY=50
```

**Step 5: Commit**

```bash
git add -A
git commit -m "scaffold: initialize Next.js 15 project with dependencies"
```

---

## Task 2: Supabase SSR Clients

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`

**Step 1: Create browser client**

File: `lib/supabase/client.ts`

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 2: Create server client (cookie-based)**

File: `lib/supabase/server.ts`

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(tokensToSet) {
          try {
            tokensToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored in Server Components (read-only)
          }
        },
      },
    }
  )
}
```

**Step 3: Create admin client (service role)**

File: `lib/supabase/admin.ts`

```ts
import { createClient } from '@supabase/supabase-js'

let adminInstance: ReturnType<typeof createClient> | null = null

export function getAdminSupabase() {
  if (adminInstance) return adminInstance

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations')
  }

  adminInstance = createClient(
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
} as const
```

**Step 4: Commit**

```bash
git add lib/supabase/
git commit -m "feat: add Supabase SSR client configuration"
```

---

## Task 3: Types

**Files:**
- Create: `types/index.ts`

**Step 1: Define all types**

File: `types/index.ts`

```ts
// Vault (KMS) types
export interface VaultKeyInfo {
  keyId: string
  keyArn: string
  publicKeyHex: string
}

export interface VaultSignResult {
  signature: Uint8Array
}

// Account types
export interface DcaAccount {
  id: string
  userId: string
  accountId: string
  vaultKeyId: string
  vaultKeyArn: string
  publicKey: string
  walletAddress: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AccountSummary {
  accountId: string
  walletAddress: string
  publicKey: string
  isActive: boolean
  createdAt: string
}

// Auth types
export interface SessionUser {
  id: string
  email: string
}

// Audit types
export type OperationType =
  | 'account_create'
  | 'transfer'
  | 'token_association'
  | 'token_approval'
  | 'key_rotation'

export type OperationResult = 'pending' | 'success' | 'failed'
```

**Step 2: Commit**

```bash
git add types/
git commit -m "feat: add TypeScript type definitions"
```

---

## Task 4: Middleware (Route Protection)

**Files:**
- Create: `middleware.ts`

**Step 1: Create middleware**

File: `middleware.ts`

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PATHS = ['/dashboard']
const AUTH_PATHS = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(tokensToSet) {
          tokensToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          tokensToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Redirect unauthenticated users away from protected routes
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))
  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from auth pages
  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p))
  if (isAuthPage && user) {
    const dashUrl = new URL('/dashboard', request.url)
    return NextResponse.redirect(dashUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup'],
}
```

**Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: add auth middleware for route protection"
```

---

## Task 5: Crypto Utilities

**Files:**
- Create: `lib/utils/crypto.ts`

**Step 1: Create crypto utilities**

This covers SPKI-to-raw conversion, DER-to-raw signature conversion, and EVM address derivation. Replaces `signature-utils.ts` + `evm-utils.ts` from hbank-bridge.

File: `lib/utils/crypto.ts`

```ts
import { keccak_256 } from '@noble/hashes/sha3'

// --- Public Key Encoding ---

/**
 * Extract 65-byte uncompressed public key from SPKI DER envelope.
 * AWS KMS returns keys in SubjectPublicKeyInfo format.
 */
export function extractRawPublicKey(spki: Uint8Array): Uint8Array {
  let pos = 0

  // Outer SEQUENCE
  if (spki[pos] !== 0x30) throw new Error('Invalid SPKI: missing outer SEQUENCE')
  pos++
  pos += spki[pos] & 0x80 ? 1 + (spki[pos] & 0x7f) : 1

  // Algorithm identifier SEQUENCE
  if (spki[pos] !== 0x30) throw new Error('Invalid SPKI: missing algorithm SEQUENCE')
  pos++
  const algoLen = spki[pos]
  pos += 1 + algoLen

  // BIT STRING containing the key
  if (spki[pos] !== 0x03) throw new Error('Invalid SPKI: missing BIT STRING')
  pos++
  pos += spki[pos] & 0x80 ? 1 + (spki[pos] & 0x7f) : 1
  pos++ // skip unused-bits byte

  const raw = spki.slice(pos, pos + 65)
  if (raw[0] !== 0x04 || raw.length !== 65) {
    throw new Error(`Expected 65-byte uncompressed key (0x04 prefix), got ${raw.length}`)
  }
  return raw
}

/**
 * Compress a 65-byte uncompressed secp256k1 public key to 33 bytes.
 */
export function compressPublicKey(uncompressed: Uint8Array): Uint8Array {
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new Error('Expected 65-byte uncompressed key with 0x04 prefix')
  }
  const x = uncompressed.slice(1, 33)
  const yLastByte = uncompressed[64]
  const prefix = yLastByte % 2 === 0 ? 0x02 : 0x03
  const compressed = new Uint8Array(33)
  compressed[0] = prefix
  compressed.set(x, 1)
  return compressed
}

// --- Signature Decoding ---

const SECP256K1_ORDER = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141'
)
const HALF_ORDER = SECP256K1_ORDER / 2n

function toUint(bytes: Uint8Array): bigint {
  return BigInt('0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''))
}

function fromUint(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, '0')
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * Decode a DER ECDSA signature into raw 64-byte (r || s) format
 * with low-S normalization as required by Hedera.
 */
export function decodeSignature(der: Uint8Array): Uint8Array {
  let pos = 0

  if (der[pos] !== 0x30) throw new Error('Invalid DER: missing SEQUENCE')
  pos++
  pos += der[pos] & 0x80 ? 1 + (der[pos] & 0x7f) : 1

  // r
  if (der[pos] !== 0x02) throw new Error('Invalid DER: missing INTEGER for r')
  pos++
  const rLen = der[pos]
  pos++
  let r = der.slice(pos, pos + rLen)
  pos += rLen

  // s
  if (der[pos] !== 0x02) throw new Error('Invalid DER: missing INTEGER for s')
  pos++
  const sLen = der[pos]
  pos++
  let s = der.slice(pos, pos + sLen)

  // Strip leading zero padding
  if (r.length > 32) r = r.slice(r.length - 32)
  if (s.length > 32) s = s.slice(s.length - 32)

  // Low-S normalization
  let sInt = toUint(s)
  if (sInt > HALF_ORDER) sInt = SECP256K1_ORDER - sInt

  const output = new Uint8Array(64)
  const rPad = new Uint8Array(32)
  rPad.set(r, 32 - r.length)
  output.set(rPad, 0)
  output.set(fromUint(sInt), 32)
  return output
}

// --- EVM Address ---

/**
 * Derive a checksummed EVM address from a 65-byte uncompressed public key.
 * address = keccak256(pubkey[1..65])[-20:]
 */
export function computeEvmAddress(publicKeyHex: string): string {
  const bytes = Buffer.from(publicKeyHex, 'hex')
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error(`Expected 65-byte uncompressed key, got ${bytes.length}`)
  }

  const hash = keccak_256(bytes.slice(1))
  const raw = Array.from(hash.slice(-20), (b) => b.toString(16).padStart(2, '0')).join('')

  // EIP-55 checksum
  const hashHex = Array.from(keccak_256(Buffer.from(raw, 'utf8')), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('')

  let checksummed = '0x'
  for (let i = 0; i < 40; i++) {
    checksummed += parseInt(hashHex[i], 16) >= 8 ? raw[i].toUpperCase() : raw[i]
  }
  return checksummed
}
```

**Step 2: Commit**

```bash
git add lib/utils/
git commit -m "feat: add crypto utilities for SPKI, DER signatures, and EVM address"
```

---

## Task 6: VaultService (AWS KMS)

**Files:**
- Create: `lib/services/vault-service.ts`

**Step 1: Implement VaultService**

File: `lib/services/vault-service.ts`

```ts
import {
  KMSClient,
  CreateKeyCommand,
  GetPublicKeyCommand,
  SignCommand,
  DescribeKeyCommand,
  DisableKeyCommand,
} from '@aws-sdk/client-kms'
import { keccak_256 } from '@noble/hashes/sha3'
import { extractRawPublicKey, decodeSignature } from '@/lib/utils/crypto'
import type { VaultKeyInfo, VaultSignResult } from '@/types'

const REGION = process.env.AWS_KMS_REGION || 'us-east-1'

class VaultService {
  private client: KMSClient | null = null

  private getClient(): KMSClient {
    if (!this.client) {
      this.client = new KMSClient({ region: REGION })
    }
    return this.client
  }

  /**
   * Provision a new ECDSA secp256k1 signing key in AWS KMS.
   */
  async provisionSigningKey(userId: string): Promise<VaultKeyInfo> {
    const kms = this.getClient()

    const result = await kms.send(
      new CreateKeyCommand({
        KeySpec: 'ECC_SECG_P256K1',
        KeyUsage: 'SIGN_VERIFY',
        Description: `DCA Swap signing key — user ${userId}`,
        Tags: [
          { TagKey: 'service', TagValue: 'dca-swap' },
          { TagKey: 'user_id', TagValue: userId },
        ],
      })
    )

    const keyId = result.KeyMetadata!.KeyId!
    const keyArn = result.KeyMetadata!.Arn!
    const publicKeyHex = await this.retrievePublicKey(keyId)

    return { keyId, keyArn, publicKeyHex }
  }

  /**
   * Retrieve the raw 65-byte uncompressed public key as hex.
   */
  async retrievePublicKey(keyId: string): Promise<string> {
    const kms = this.getClient()
    const result = await kms.send(new GetPublicKeyCommand({ KeyId: keyId }))
    const spki = new Uint8Array(result.PublicKey!)
    const raw = extractRawPublicKey(spki)
    return Buffer.from(raw).toString('hex')
  }

  /**
   * Sign a transaction digest via KMS.
   * Hashes with keccak256, then signs the 32-byte digest.
   */
  async signDigest(
    keyId: string,
    bodyBytes: Uint8Array
  ): Promise<VaultSignResult> {
    const kms = this.getClient()
    const digest = keccak_256(new Uint8Array(bodyBytes))

    const result = await kms.send(
      new SignCommand({
        KeyId: keyId,
        Message: digest,
        MessageType: 'DIGEST',
        SigningAlgorithm: 'ECDSA_SHA_256',
      })
    )

    const raw = decodeSignature(new Uint8Array(result.Signature!))
    return { signature: raw }
  }

  /**
   * Verify a key is active and enabled.
   */
  async isKeyActive(keyId: string): Promise<boolean> {
    try {
      const kms = this.getClient()
      const res = await kms.send(new DescribeKeyCommand({ KeyId: keyId }))
      return res.KeyMetadata?.Enabled === true
    } catch {
      return false
    }
  }

  /**
   * Disable a key (for rotation, never deletes).
   */
  async deactivateKey(keyId: string): Promise<void> {
    const kms = this.getClient()
    await kms.send(new DisableKeyCommand({ KeyId: keyId }))
  }
}

export const vault = new VaultService()
```

**Step 2: Commit**

```bash
git add lib/services/vault-service.ts
git commit -m "feat: add VaultService for AWS KMS key management"
```

---

## Task 7: LedgerService (Hedera)

**Files:**
- Create: `lib/services/ledger-service.ts`

**Step 1: Implement LedgerService**

File: `lib/services/ledger-service.ts`

```ts
import {
  Client,
  AccountCreateTransaction,
  AccountId,
  PrivateKey,
  PublicKey,
  Hbar,
} from '@hashgraph/sdk'
import { compressPublicKey, computeEvmAddress } from '@/lib/utils/crypto'

const NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'mainnet'
const CREATOR_ID = process.env.CUSTODIAL_CREATOR_ACCOUNT_ID!
const CREATOR_KEY = process.env.CUSTODIAL_CREATOR_PRIVATE_KEY!

class LedgerService {
  /**
   * Build a Hedera client with the creator operator (limited-balance account).
   */
  private buildClient(): Client {
    const client =
      NETWORK === 'testnet' ? Client.forTestnet() : Client.forMainnet()

    client.setOperator(
      AccountId.fromString(CREATOR_ID),
      PrivateKey.fromStringECDSA(CREATOR_KEY)
    )
    return client
  }

  /**
   * Open a new Hedera account using a KMS-managed public key.
   * The creator operator pays the creation fee; initial balance is zero.
   */
  async openAccount(publicKeyHex: string): Promise<string> {
    const client = this.buildClient()

    try {
      const uncompressed = Buffer.from(publicKeyHex, 'hex')
      const compressed = compressPublicKey(uncompressed)
      const key = PublicKey.fromBytesECDSA(compressed)

      const tx = await new AccountCreateTransaction()
        .setKey(key)
        .setInitialBalance(new Hbar(0))
        .setMaxAutomaticTokenAssociations(10)
        .execute(client)

      const receipt = await tx.getReceipt(client)
      return receipt.accountId!.toString()
    } finally {
      client.close()
    }
  }

  /**
   * Derive the EVM address from an uncompressed public key.
   */
  deriveAddress(publicKeyHex: string): string {
    return computeEvmAddress(publicKeyHex)
  }
}

export const ledger = new LedgerService()
```

**Step 2: Commit**

```bash
git add lib/services/ledger-service.ts
git commit -m "feat: add LedgerService for Hedera account operations"
```

---

## Task 8: Auth Guards

**Files:**
- Create: `lib/utils/guards.ts`

**Step 1: Create auth guard helpers for Server Actions**

File: `lib/utils/guards.ts`

```ts
import { createServerSupabase } from '@/lib/supabase/server'
import { headers } from 'next/headers'

/**
 * Get the authenticated user from the current cookie session.
 * For use inside Server Actions and Server Components.
 */
export async function requireUser() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthorized')
  }

  return user
}

/**
 * Extract client IP from request headers (for audit logging).
 */
export async function extractClientIp(): Promise<string | null> {
  const hdrs = await headers()
  return (
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip') ||
    null
  )
}
```

**Step 2: Commit**

```bash
git add lib/utils/guards.ts
git commit -m "feat: add server-side auth guard utilities"
```

---

## Task 9: Auth Server Actions

**Files:**
- Create: `app/actions/auth.ts`

**Step 1: Implement auth server actions**

File: `app/actions/auth.ts`

```ts
'use server'

import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAdminSupabase } from '@/lib/supabase/admin'

export async function signUp(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const admin = getAdminSupabase()

  // Create confirmed user via admin API
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr) {
    return { error: createErr.message }
  }

  // Auto sign-in after registration
  const supabase = await createServerSupabase()
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInErr) {
    return { error: signInErr.message }
  }

  redirect('/dashboard')
}

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  redirect('/login')
}
```

**Step 2: Commit**

```bash
git add app/actions/auth.ts
git commit -m "feat: add auth server actions (signUp, signIn, signOut)"
```

---

## Task 10: Vault Server Actions (Account Provisioning)

**Files:**
- Create: `app/actions/vault.ts`

**Step 1: Implement vault server actions**

File: `app/actions/vault.ts`

```ts
'use server'

import { requireUser, extractClientIp } from '@/lib/utils/guards'
import { getAdminSupabase, DB } from '@/lib/supabase/admin'
import { vault } from '@/lib/services/vault-service'
import { ledger } from '@/lib/services/ledger-service'
import type { AccountSummary } from '@/types'

/**
 * Provision a new custodial Hedera account for the current user.
 * Creates KMS key -> Hedera account -> stores in DB.
 */
export async function provisionAccount(): Promise<{
  success: boolean
  account?: AccountSummary
  error?: string
}> {
  try {
    const user = await requireUser()
    const db = getAdminSupabase()

    // Check for existing account
    const { data: existing } = await db
      .from(DB.ACCOUNTS)
      .select('account_id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return { success: false, error: 'Account already exists' }
    }

    // 1. Provision signing key in KMS
    const keyInfo = await vault.provisionSigningKey(user.id)

    // 2. Open Hedera account
    const accountId = await ledger.openAccount(keyInfo.publicKeyHex)

    // 3. Derive EVM address
    const walletAddress = ledger.deriveAddress(keyInfo.publicKeyHex)

    // 4. Persist account
    const { error: insertErr } = await db.from(DB.ACCOUNTS).insert({
      user_id: user.id,
      account_id: accountId,
      vault_key_id: keyInfo.keyId,
      vault_key_arn: keyInfo.keyArn,
      public_key: keyInfo.publicKeyHex,
      wallet_address: walletAddress,
      is_active: true,
    })

    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`)

    // 5. Initialize rate limits
    await db.from(DB.RATE_LIMITS).insert({ user_id: user.id })

    // 6. Audit log
    const ip = await extractClientIp()
    await db.from(DB.AUDIT_LOG).insert({
      user_id: user.id,
      op_type: 'account_create',
      op_params: { account_id: accountId },
      vault_key_id: keyInfo.keyId,
      client_ip: ip,
      result: 'success',
    })

    return {
      success: true,
      account: {
        accountId,
        walletAddress,
        publicKey: keyInfo.publicKeyHex,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    }
  } catch (err: any) {
    console.error('[provisionAccount]', err)
    return { success: false, error: err.message || 'Account creation failed' }
  }
}

/**
 * Fetch the current user's account info.
 */
export async function fetchAccountInfo(): Promise<{
  account: AccountSummary | null
}> {
  try {
    const user = await requireUser()
    const db = getAdminSupabase()

    const { data } = await db
      .from(DB.ACCOUNTS)
      .select('account_id, wallet_address, public_key, is_active, created_at')
      .eq('user_id', user.id)
      .single()

    if (!data) return { account: null }

    return {
      account: {
        accountId: data.account_id,
        walletAddress: data.wallet_address,
        publicKey: data.public_key,
        isActive: data.is_active,
        createdAt: data.created_at,
      },
    }
  } catch {
    return { account: null }
  }
}
```

**Step 2: Commit**

```bash
git add app/actions/vault.ts
git commit -m "feat: add vault server actions for account provisioning"
```

---

## Task 11: Session Store (Zustand)

**Files:**
- Create: `store/session-store.ts`

**Step 1: Create Zustand session store**

File: `store/session-store.ts`

```ts
import { create } from 'zustand'
import type { AccountSummary, SessionUser } from '@/types'

interface SessionState {
  user: SessionUser | null
  account: AccountSummary | null
  isLoading: boolean
  setUser: (user: SessionUser | null) => void
  setAccount: (account: AccountSummary | null) => void
  setLoading: (loading: boolean) => void
  clear: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  account: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setAccount: (account) => set({ account }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ user: null, account: null, isLoading: false }),
}))
```

**Step 2: Commit**

```bash
git add store/
git commit -m "feat: add Zustand session store"
```

---

## Task 12: Hooks

**Files:**
- Create: `hooks/use-session.ts`
- Create: `hooks/use-account.ts`

**Step 1: Create session hook**

File: `hooks/use-session.ts`

```ts
'use client'

import { useEffect } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { useSessionStore } from '@/store/session-store'

export function useSession() {
  const { user, setUser, setLoading } = useSessionStore()

  useEffect(() => {
    const supabase = createBrowserSupabase()

    // Fetch current session
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ? { id: u.id, email: u.email || '' } : null)
      setLoading(false)
    })

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email || '' })
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser, setLoading])

  return { user, isAuthenticated: !!user }
}
```

**Step 2: Create account hook**

File: `hooks/use-account.ts`

```ts
'use client'

import { useEffect, useCallback, useState } from 'react'
import { useSessionStore } from '@/store/session-store'
import { fetchAccountInfo, provisionAccount } from '@/app/actions/vault'

export function useAccount() {
  const { user, account, setAccount } = useSessionStore()
  const [provisioning, setProvisioning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch account info when user changes
  useEffect(() => {
    if (!user) {
      setAccount(null)
      return
    }

    fetchAccountInfo().then(({ account: acc }) => {
      setAccount(acc)
    })
  }, [user, setAccount])

  const createAccount = useCallback(async () => {
    if (!user || provisioning) return
    setProvisioning(true)
    setError(null)

    try {
      const result = await provisionAccount()
      if (result.success && result.account) {
        setAccount(result.account)
      } else {
        setError(result.error || 'Failed to create account')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProvisioning(false)
    }
  }, [user, provisioning, setAccount])

  return { account, provisioning, error, createAccount }
}
```

**Step 3: Commit**

```bash
git add hooks/
git commit -m "feat: add useSession and useAccount hooks"
```

---

## Task 13: Database Migrations

**Files:**
- Supabase SQL (run via dashboard or migration tool)

**Step 1: Apply migration for dca_* tables**

Run this SQL in the Supabase SQL editor (or via the MCP tool):

```sql
-- dca_accounts
CREATE TABLE IF NOT EXISTS public.dca_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  account_id TEXT NOT NULL,
  vault_key_id TEXT NOT NULL,
  vault_key_arn TEXT NOT NULL,
  public_key TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- dca_rate_limits
CREATE TABLE IF NOT EXISTS public.dca_rate_limits (
  user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
  ops_hourly INT DEFAULT 0,
  ops_daily INT DEFAULT 0,
  last_op_at TIMESTAMPTZ,
  hourly_reset_at TIMESTAMPTZ DEFAULT now(),
  daily_reset_at TIMESTAMPTZ DEFAULT now()
);

-- dca_audit_log
CREATE TABLE IF NOT EXISTS public.dca_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  op_type TEXT NOT NULL,
  op_params JSONB,
  vault_key_id TEXT NOT NULL,
  tx_hash TEXT,
  client_ip TEXT,
  result TEXT NOT NULL DEFAULT 'pending',
  error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dca_accounts_user ON public.dca_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_dca_audit_user ON public.dca_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_dca_audit_created ON public.dca_audit_log(created_at DESC);

-- RLS policies
ALTER TABLE public.dca_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dca_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dca_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (Server Actions use service role)
CREATE POLICY "Service role full access" ON public.dca_accounts
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.dca_rate_limits
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.dca_audit_log
  FOR ALL USING (true) WITH CHECK (true);

-- Rate limit increment function
CREATE OR REPLACE FUNCTION public.increment_dca_rate_limits(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.dca_rate_limits
  SET
    ops_hourly = ops_hourly + 1,
    ops_daily = ops_daily + 1,
    last_op_at = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 2: Verify tables exist**

Run: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'dca_%';`

Expected: 3 rows (dca_accounts, dca_rate_limits, dca_audit_log)

---

## Task 14: UI — Global Styles & Layout

> **REQUIRED SUB-SKILL:** Use `frontend-design` skill for all UI tasks from here on.

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Create: `app/providers.tsx`
- Create: `lib/utils.ts` (cn helper)

**Step 1: Create cn utility**

File: `lib/utils.ts`

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Step 2: Write global styles**

Replace `app/globals.css` with a futuristic dark theme featuring neon gradients, glassmorphism, and smooth animations. Use the `frontend-design` skill to create distinctive, modern styling — NOT a copy of hbank-bridge's auth-modal styles.

Key requirements:
- Dark background (#050510 range, slightly blue-tinted, different from hbank's pure #0a0a0a)
- Accent color: cyan/teal gradient (#06b6d4 → #14b8a6) instead of hbank's blue (#3b82f6)
- Glassmorphism cards with backdrop-blur
- Animated gradient borders
- Custom input styles with glow focus states
- Button variants: primary (gradient), outline (glass), oauth (white)
- Page transition animations
- Custom scrollbar matching theme

**Step 3: Write root layout**

File: `app/layout.tsx`

```tsx
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from 'sonner'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'DCA Swap',
  description: 'Automated DCA on Hedera',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {children}
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
        </Providers>
      </body>
    </html>
  )
}
```

**Step 4: Create providers**

File: `app/providers.tsx`

```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
```

**Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx app/providers.tsx lib/utils.ts
git commit -m "feat: add root layout, providers, and futuristic global styles"
```

---

## Task 15: UI — Login Page

> **REQUIRED SUB-SKILL:** Use `frontend-design` skill.

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `components/auth/login-form.tsx`
- Create: `components/auth/oauth-button.tsx`

**Step 1: Create OAuth button component**

File: `components/auth/oauth-button.tsx`

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
      className="oauth-btn w-full h-12 rounded-xl font-medium text-sm flex items-center justify-center gap-3 disabled:opacity-40 cursor-pointer"
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

**Step 2: Create login form**

File: `components/auth/login-form.tsx`

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
    <div className="glass-card w-full max-w-[420px] p-8 rounded-2xl">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center mb-4 glow-ring">
          <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">D</span>
        </div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">
          Welcome back
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Sign in to your DCA Swap account
        </p>
      </div>

      {/* OAuth */}
      <OAuthButton />

      {/* Divider */}
      <div className="flex items-center gap-4 my-6">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <span className="text-xs text-white/20 uppercase tracking-widest">or</span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* Email form */}
      <form action={action} className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <label className="text-xs text-white/30 uppercase tracking-wider font-medium pl-1">
            Email
          </label>
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            className="form-input w-full h-12 px-4 rounded-xl text-white text-sm outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-white/30 uppercase tracking-wider font-medium pl-1">
            Password
          </label>
          <div className="relative">
            <input
              name="password"
              type={showPwd ? 'text' : 'password'}
              placeholder="Enter your password"
              required
              minLength={6}
              className="form-input w-full h-12 px-4 pr-11 rounded-xl text-white text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors"
              tabIndex={-1}
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {state?.error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            <p className="text-sm text-red-400/90">{state.error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full h-12 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 mt-1 disabled:opacity-40 cursor-pointer"
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

      <p className="text-center text-sm text-white/30 mt-6">
        {"Don't have an account? "}
        <Link
          href="/signup"
          className="text-cyan-400/80 hover:text-cyan-400 font-medium transition-colors"
        >
          Create one
        </Link>
      </p>
    </div>
  )
}
```

**Step 3: Create login page**

File: `app/(auth)/login/page.tsx`

```tsx
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-page px-4">
      <LoginForm />
    </main>
  )
}
```

**Step 4: Commit**

```bash
git add app/\(auth\)/login/ components/auth/
git commit -m "feat: add login page with email and Google OAuth"
```

---

## Task 16: UI — Signup Page

**Files:**
- Create: `app/(auth)/signup/page.tsx`
- Create: `components/auth/signup-form.tsx`

**Step 1: Create signup form**

File: `components/auth/signup-form.tsx`

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
    <div className="glass-card w-full max-w-[420px] p-8 rounded-2xl">
      <div className="text-center mb-8">
        <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center mb-4 glow-ring">
          <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">D</span>
        </div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">
          Create your account
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Get started with DCA Swap
        </p>
      </div>

      <OAuthButton />

      <div className="flex items-center gap-4 my-6">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <span className="text-xs text-white/20 uppercase tracking-widest">or</span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <form action={action} className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <label className="text-xs text-white/30 uppercase tracking-wider font-medium pl-1">
            Email
          </label>
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            className="form-input w-full h-12 px-4 rounded-xl text-white text-sm outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-white/30 uppercase tracking-wider font-medium pl-1">
            Password
          </label>
          <div className="relative">
            <input
              name="password"
              type={showPwd ? 'text' : 'password'}
              placeholder="Min 6 characters"
              required
              minLength={6}
              className="form-input w-full h-12 px-4 pr-11 rounded-xl text-white text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors"
              tabIndex={-1}
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {state?.error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            <p className="text-sm text-red-400/90">{state.error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full h-12 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 mt-1 disabled:opacity-40 cursor-pointer"
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

      <p className="text-center text-sm text-white/30 mt-6">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-cyan-400/80 hover:text-cyan-400 font-medium transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
```

**Step 2: Create signup page**

File: `app/(auth)/signup/page.tsx`

```tsx
import { SignupForm } from '@/components/auth/signup-form'

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-page px-4">
      <SignupForm />
    </main>
  )
}
```

**Step 3: Commit**

```bash
git add app/\(auth\)/signup/ components/auth/signup-form.tsx
git commit -m "feat: add signup page"
```

---

## Task 17: OAuth Callback Page

**Files:**
- Create: `app/(auth)/callback/page.tsx`

**Step 1: Create callback page**

File: `app/(auth)/callback/page.tsx`

```tsx
'use client'

import { useEffect } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function OAuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserSupabase()

    // Supabase SSR handles PKCE exchange via the code query param
    const { searchParams } = new URL(window.location.href)
    const code = searchParams.get('code')

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          console.error('[OAuth callback] session exchange failed:', error.message)
        }
        router.replace('/dashboard')
      })
    } else {
      // Fallback: hash-based tokens (implicit flow)
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(() => router.replace('/dashboard'))
      } else {
        router.replace('/login')
      }
    }
  }, [router])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-page text-white gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      <p className="text-white/40 text-sm">Completing sign in...</p>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add app/\(auth\)/callback/
git commit -m "feat: add OAuth callback page with PKCE support"
```

---

## Task 18: UI — Dashboard Layout & Page

> **REQUIRED SUB-SKILL:** Use `frontend-design` skill.

**Files:**
- Create: `app/(dashboard)/layout.tsx`
- Create: `app/(dashboard)/page.tsx`
- Create: `components/dashboard/account-card.tsx`
- Create: `components/dashboard/fund-guide.tsx`
- Create: `components/nav-bar.tsx`

**Step 1: Create nav bar**

File: `components/nav-bar.tsx`

```tsx
'use client'

import { signOut } from '@/app/actions/auth'
import { useSessionStore } from '@/store/session-store'
import { LogOut } from 'lucide-react'

export function NavBar() {
  const { user } = useSessionStore()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-page/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto flex items-center justify-between h-16 px-6">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
            DCA Swap
          </span>
        </div>

        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/40 hidden sm:block">{user.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-1.5 text-sm text-white/30 hover:text-white/60 transition-colors cursor-pointer"
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

**Step 2: Create dashboard layout**

File: `app/(dashboard)/layout.tsx`

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
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </>
  )
}
```

**Step 3: Create SessionInitializer (client component to load session)**

File: `components/session-initializer.tsx`

```tsx
'use client'

import { useSession } from '@/hooks/use-session'

export function SessionInitializer() {
  useSession()
  return null
}
```

**Step 4: Create account card**

File: `components/dashboard/account-card.tsx`

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

  // No account yet — show provisioning state
  if (!account) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/10 to-teal-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
          <Wallet className="w-7 h-7 text-cyan-400/60" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">
          {provisioning ? 'Creating your account...' : 'No Hedera account yet'}
        </h2>
        <p className="text-sm text-white/40 mb-6 max-w-sm mx-auto">
          {provisioning
            ? 'Provisioning a secure signing key and opening your Hedera account. This takes a few seconds.'
            : 'Create a custodial Hedera account to start using DCA Swap.'}
        </p>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        {provisioning ? (
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mx-auto" />
        ) : (
          <button
            onClick={createAccount}
            className="btn-primary px-6 h-11 rounded-xl text-white font-medium text-sm cursor-pointer"
          >
            Create Account
          </button>
        )}
      </div>
    )
  }

  // Account exists
  const fields = [
    { label: 'Hedera Account', value: account.accountId },
    { label: 'EVM Address', value: account.walletAddress },
  ]

  return (
    <div className="glass-card rounded-2xl p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center">
          <Wallet className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Your Account</h2>
          <p className="text-xs text-white/30">
            Created {new Date(account.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="ml-auto">
          <span className={`text-xs px-2.5 py-1 rounded-full border ${
            account.isActive
              ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10'
              : 'text-red-400 border-red-400/20 bg-red-400/10'
          }`}>
            {account.isActive ? 'Active' : 'Disabled'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="min-w-0">
              <p className="text-xs text-white/30 mb-0.5">{label}</p>
              <p className="text-sm text-white/80 font-mono truncate">{value}</p>
            </div>
            <button
              onClick={() => copyToClipboard(value, label)}
              className="shrink-0 ml-3 text-white/20 hover:text-white/50 transition-colors cursor-pointer"
            >
              {copied === label ? (
                <Check className="w-4 h-4 text-emerald-400" />
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

**Step 5: Create fund guide**

File: `components/dashboard/fund-guide.tsx`

```tsx
'use client'

import { useAccount } from '@/hooks/use-account'
import { ArrowDownToLine, ExternalLink } from 'lucide-react'

export function FundGuide() {
  const { account } = useAccount()
  if (!account) return null

  return (
    <div className="glass-card rounded-2xl p-8 mt-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
          <ArrowDownToLine className="w-5 h-5 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">Fund Your Account</h3>
      </div>

      <p className="text-sm text-white/40 mb-4">
        Send HBAR to your Hedera account to start using DCA Swap. You need at least 1 HBAR for transaction fees.
      </p>

      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 mb-4">
        <p className="text-xs text-white/30 mb-1">Send HBAR to:</p>
        <p className="text-base font-mono text-cyan-400">{account.accountId}</p>
      </div>

      <a
        href={`https://hashscan.io/mainnet/account/${account.accountId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-cyan-400/70 hover:text-cyan-400 transition-colors"
      >
        View on HashScan <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}
```

**Step 6: Create dashboard page**

File: `app/(dashboard)/page.tsx`

```tsx
import { AccountCard } from '@/components/dashboard/account-card'
import { FundGuide } from '@/components/dashboard/fund-guide'

export default function DashboardPage() {
  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
      <AccountCard />
      <FundGuide />
    </div>
  )
}
```

**Step 7: Create root page (redirect)**

File: `app/page.tsx`

```tsx
import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/dashboard')
}
```

**Step 8: Commit**

```bash
git add app/\(dashboard\)/ app/page.tsx components/dashboard/ components/nav-bar.tsx components/session-initializer.tsx
git commit -m "feat: add dashboard with account card and fund guide"
```

---

## Task 19: Install shadcn/ui components (if needed)

**Step 1: Initialize shadcn**

```bash
npx shadcn@latest init -d
```

Only install specific components if needed later. The current design uses custom CSS classes (`glass-card`, `form-input`, `btn-primary`, `oauth-btn`) rather than shadcn primitives for maximum design differentiation.

**Step 2: Commit if any changes**

```bash
git add -A
git commit -m "chore: initialize shadcn/ui"
```

---

## Task 20: Build Verification

**Step 1: Run the build**

```bash
npm run build
```

Expected: Build succeeds. Fix any TypeScript or import errors.

**Step 2: Run dev server and test manually**

```bash
npm run dev
```

Test:
1. Visit `http://localhost:3000` → should redirect to `/login` (middleware)
2. Create account via signup form
3. Check redirect to `/dashboard`
4. Verify account creation button works
5. Test Google OAuth flow
6. Verify account card displays after provisioning

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: resolve build issues and finalize Phase 1"
```

---

## Summary of Structural Differences from hbank-bridge

| File/Pattern | hbank-bridge | dca-swap |
|---|---|---|
| Auth mechanism | localStorage JWT + Context | httpOnly cookies + Middleware |
| API layer | `/api/auth/login`, `/api/kms/create-account` | Server Actions `app/actions/auth.ts`, `app/actions/vault.ts` |
| Auth protection | Manual `getAuthenticatedUser(request)` per route | `middleware.ts` + `requireUser()` helper |
| KMS client | `createSigningKey()`, `getPublicKeyHex()` flat functions | `VaultService` class with `provisionSigningKey()`, `retrievePublicKey()` |
| Hedera client | `createHederaAccountWithKMSKey()` flat function | `LedgerService` class with `openAccount()` |
| EVM address | `deriveEvmAddress()` using ethers.js | `computeEvmAddress()` using @noble/hashes (no ethers dep) |
| Signature utils | `spkiToRawPublicKey()`, `derToRawSignature()` | `extractRawPublicKey()`, `decodeSignature()` |
| Client state | `ConnectionContext` (React Context) | `useSessionStore` (Zustand) |
| Supabase | `supabase`, `supabaseAuth`, `supabaseAdmin()` | `createBrowserSupabase()`, `createServerSupabase()`, `getAdminSupabase()` |
| Table names | `custodial_accounts`, `kms_signing_audit`, `kms_rate_limits` | `dca_accounts`, `dca_audit_log`, `dca_rate_limits` |
| DB reference | `TABLES.CUSTODIAL_ACCOUNTS` | `DB.ACCOUNTS` |
| Login UI | Dialog modal (`LoginDialog`) | Full page (`/login`) |
| OAuth callback | Hash-based token extraction | PKCE code exchange |
| Route organization | Flat (`/bridge`, `/portfolio`) | Route groups `(auth)`, `(dashboard)` |
| Accent color | Blue (#3b82f6) | Cyan/Teal (#06b6d4 → #14b8a6) |
