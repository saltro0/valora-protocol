# Valora Protocol: Autonomous Dollar Cost Averaging on Hedera

> **Fully autonomous DCA engine** that leverages Hedera's native Schedule Service (HIP-1215) to make a smart contract call itself on a recurring schedule — no bots, no keepers, no cron jobs. Combined with **AWS KMS** for institutional-grade key custody, users get a seamless, set-and-forget DCA experience powered entirely by on-chain infrastructure.

---

## The Problem

Dollar Cost Averaging is one of the most popular investment strategies, yet in DeFi it remains painfully manual. Existing solutions rely on:

- **Off-chain keepers or bots** that can go offline, get rate-limited, or run out of gas
- **Centralized cron services** that create single points of failure
- **Manual execution** requiring users to come back and swap periodically

These approaches break the core promise of DeFi: trustless, permissionless automation.

## Our Solution

Valora Protocol solves this with a fundamentally different approach — **the smart contract schedules its own future execution** using Hedera's native Schedule Service (HIP-1215).

```
User creates position → Contract executes first swap → Contract schedules ITSELF for next execution → Repeat
```

No external infrastructure. No bots. No trust assumptions beyond the blockchain itself.

---

## How It Works

### The Self-Scheduling Loop (HIP-1215)

This is the core innovation. Hedera's **Schedule Service** (system contract at `0x16b`) allows a smart contract to schedule a future call to itself:

```
┌─────────────────────────────────────────────────────┐
│                  DCARegistry.execute()               │
│                                                      │
│  1. Validate timing (interval elapsed?)              │
│  2. Deduct protocol fee → treasury                   │
│  3. Swap tokens via SaucerSwap DEX                   │
│  4. Update position state                            │
│  5. ┌──────────────────────────────────────┐         │
│     │  Call DCAScheduler.scheduleCall()    │         │
│     │  → Calls HSS precompile (0x16b)     │         │
│     │  → Schedules DCARegistry.execute()   │         │
│     │    for (now + interval + jitter)     │         │
│     └──────────────────────────────────────┘         │
│  6. Store schedule address for cancellation          │
└─────────────────────────────────────────────────────┘
         │                              ▲
         │    Hedera Schedule Service   │
         │    executes at scheduled     │
         └──────────time────────────────┘
```

Each execution creates the next schedule. This chain continues autonomously until:
- All planned executions are complete
- The user stops the position
- Gas budget is exhausted
- 5+ consecutive swap failures occur

### AWS KMS: Institutional-Grade Key Custody

Users never handle private keys. Instead, each user gets a dedicated **ECDSA secp256k1 signing key** stored in AWS KMS:

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  User    │────▶│  Next.js     │────▶│  AWS KMS    │────▶│  Hedera  │
│  (Web)   │     │  Server      │     │  (us-east-1)│     │  Network │
└──────────┘     └──────────────┘     └─────────────┘     └──────────┘
                  Signs tx digest      Key NEVER leaves     Submits
                  via KMS API          the HSM hardware     signed tx
```

- **Key generation**: `CreateKeyCommand` with `ECC_SECG_P256K1` spec
- **Transaction signing**: Only the 32-byte keccak256 digest is sent to KMS; the key material never leaves the HSM
- **Key lifecycle**: Keys can be disabled/rotated per user without affecting other accounts
- **Hedera account**: Created with the KMS public key as the account's signing authority

This gives every user the security of a hardware wallet without any UX complexity.

### Smart Contract Architecture

```
┌─────────────────────────────────┐
│     DCARegistry (UUPS Proxy)    │
│  ─────────────────────────────  │
│  • createPosition()             │
│  • execute()     ◄── HSS calls  │
│  • stop() / withdraw()          │
│  • topUp()                      │
│  • OpenZeppelin security suite  │
│    (Pausable, ReentrancyGuard,  │
│     UUPS Upgradeable)           │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│       DCAScheduler              │
│  ─────────────────────────────  │
│  • HBAR gas deposit management  │
│  • scheduleCall() → HSS 0x16b  │
│  • cancelSchedule()             │
│  • reserveGas() / refundGas()   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Hedera Schedule Service        │
│  (HIP-1215 — System Contract)   │
│  ─────────────────────────────  │
│  • Native L1 transaction        │
│    scheduling                   │
│  • Guaranteed execution at      │
│    specified timestamp           │
│  • No external dependencies     │
└─────────────────────────────────┘
```

**DCARegistry** is deployed as a UUPS proxy (upgradeable) and handles all position logic, swap execution, and fee collection.

**DCAScheduler** is a lightweight non-proxy contract that manages HBAR gas deposits and interfaces with Hedera's Schedule Service precompile.

### Gas Management

Users pre-fund their positions with HBAR to cover execution gas:

| Parameter | Value |
|-----------|-------|
| Gas per swap (SaucerSwap) | ~2.9M gas |
| HSS gas limit | 4M (includes reschedule overhead) |
| Cost per execution | ~2.8 HBAR |
| Gas deduction | Only on successful swaps |
| Failure tolerance | 5 consecutive failures before deactivation |

Gas is **never deducted on failed swaps** — if a swap reverts (slippage, liquidity issues), the user's gas budget is preserved and the system retries on the next scheduled execution.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Smart Contracts** | Solidity 0.8.24 + OpenZeppelin 5.x | DCA logic, UUPS proxy, security |
| **Blockchain** | Hedera (EVM-compatible) | L1 execution + HIP-1215 scheduling |
| **DEX** | SaucerSwap (Uniswap V2 interface) | Token swaps |
| **Frontend** | Next.js 16, React 19, TypeScript | User dashboard + audit log |
| **UI** | Tailwind CSS 4 + shadcn/ui | Component library |
| **Database** | Supabase (PostgreSQL) | User accounts, position metadata, audit log |
| **Auth** | Supabase Auth | Email/password |
| **Key Management** | AWS KMS (ECDSA secp256k1) | Custodial key storage in HSM |
| **Blockchain SDK** | @hashgraph/sdk 2.80 | Transaction construction + submission |
| **Contract Tooling** | Hardhat + ethers v6 | Compilation, testing, deployment |
| **State Management** | Zustand + TanStack Query | Client-side state + server data |

---

## Application Flow

### 1. Account Creation

```
Sign Up → Supabase Auth → AWS KMS generates key → Hedera account created → Ready
```

The user signs up with email/password. Behind the scenes:
1. Supabase creates the auth identity
2. AWS KMS provisions a new ECDSA secp256k1 key (tagged to the user)
3. The public key is extracted and used to create a Hedera account
4. The EVM address is derived and stored in Supabase

### 2. Creating a DCA Position

The user selects:
- **Token pair** (e.g., WHBAR → USDC)
- **Amount per swap** (e.g., 10 WHBAR per execution)
- **Interval** (e.g., every 24 hours)
- **Number of executions** (e.g., 30 swaps over a month)
- **Slippage tolerance** (e.g., 1%)

The system:
1. Associates required tokens with the user's Hedera account
2. Wraps HBAR to WHBAR if needed
3. Approves the DCARegistry to spend tokens
4. Calls `createPosition()` on-chain
5. The contract reserves gas and schedules the first execution via HIP-1215

### 3. Autonomous Execution

From this point, **everything is autonomous**:
- Hedera's Schedule Service triggers `execute()` at each interval
- Each execution swaps tokens, collects fees, and schedules the next one
- The user can monitor progress, top up, or stop at any time

### 4. Position Lifecycle

```
Active ──── executing swaps ────▶ Completed (all executions done)
  │                                     │
  ├── User calls stop() ──────▶ Stopped │
  │                                     │
  ├── Gas exhausted ───────────▶ Paused │
  │                                     │
  └── 5+ failures ─────────────▶ Paused │
                                        │
                              withdraw() ▼ tokens returned
```

---

## Security

### Smart Contract Audit

A comprehensive security audit was conducted covering:

| Severity | Findings | Status |
|----------|----------|--------|
| **Critical** | 3 (timing validation, gas accounting, schedule cancellation) | All fixed |
| **High** | 3 (front-running mitigation, refund safety, balance accounting) | All fixed |
| **Medium** | 5 (input validation, approval patterns, schedule distribution) | All fixed |

Key security measures:
- **Timing guard**: `block.timestamp >= lastExecutedAt + interval` prevents double-execution
- **Reentrancy protection**: OpenZeppelin `ReentrancyGuardTransient`
- **Safe approvals**: `forceApprove()` + reset to 0 after each swap
- **Pausable**: Emergency pause by contract owner
- **UUPS upgradeable**: Allows patching vulnerabilities without redeployment
- **Slippage protection**: User-defined tolerance per position
- **Failure circuit breaker**: Auto-deactivation after 5 consecutive failures

### AWS KMS Security

- Keys stored in **FIPS 140-2 Level 2** hardware security modules
- Key material **never leaves AWS KMS** — only digests are signed
- Per-user key isolation with IAM-scoped access
- Key disable/rotation supported without affecting other users
- Full audit trail via AWS CloudTrail

### Key Rotation

Users can rotate their signing key from the Dashboard. The process uses **dual-key signing** — Hedera requires signatures from both the old and new key for `AccountUpdateTransaction`:

```
1. Create new KMS key (secp256k1)
2. Build AccountUpdateTransaction with new key
3. Sign with OLD key via KMS
4. Sign with NEW key via KMS
5. Execute on Hedera (both signatures validated)
6. Update database (new key ID, ARN, public key, EVM address)
7. Disable old KMS key (never deleted — preserves audit trail)
8. Record audit log with old/new key details
```

- **Hedera Account ID stays the same** — only the signing key changes
- **EVM address changes** — it's derived from the public key (`keccak256(pubkey[1:])[-20:]`)
- **Old keys are disabled, never deleted** — this preserves the full audit trail and prevents accidental reuse
- **Rate limited** — rotation counts toward the per-user operation limits

### Audit Logging System

A dual-layer audit system tracks every signing operation for compliance and forensic analysis:

**Application-level audit** (`dca_audit_log` table):
- Every mutating operation is recorded (success AND failure)
- Captures: user ID, operation type, parameters, KMS key ID, tx hash, client IP, timestamps
- Row-Level Security ensures users can only view their own logs
- Audit log is **immutable from client side** — only the service role can insert

**Operation types tracked:**
| Operation | Trigger |
|-----------|---------|
| `account_create` | User provisions a new Hedera account |
| `dca_create` | New DCA position created |
| `dca_stop` | Position stopped by user |
| `dca_withdraw` | Tokens withdrawn from position |
| `dca_topup` | Position topped up with more tokens/gas |
| `gas_deposit` | HBAR deposited to scheduler |
| `gas_withdraw` | HBAR withdrawn from scheduler |
| `unwrap_whbar` | WHBAR unwrapped to HBAR |
| `key_rotation` | Signing key rotated |

**Rate limiting:**
- Per-user hourly and daily operation limits (configurable via env vars)
- Checked before every mutating operation
- Atomic counter increment via Postgres RPC function

**Activity Log UI** (`/audit`):
- Filterable table with operation type, status, and date range filters
- Color-coded status badges (success/failed)
- Expandable rows showing transaction params, KMS key ID, IP, and errors
- Copy buttons for tx hashes and key IDs
- HashScan links to view transactions on-chain
- Load-more pagination

---

## Project Structure

```
valora-protocol/
├── app/                        # Next.js 16 app directory
│   ├── (auth)/                 # Login, signup
│   ├── (dashboard)/            # Dashboard, DCA positions, audit log
│   │   └── audit/              # Activity Log page
│   └── actions/                # Server actions (auth, dca, vault, audit)
├── components/                 # React components
│   ├── auth/                   # Login/signup forms
│   ├── audit/                  # Audit log table & filters
│   ├── dashboard/              # Account (+ key rotation), stats, gas balance
│   ├── dca/                    # Position management UI
│   └── ui/                     # shadcn/ui components
├── contracts/                  # Solidity smart contracts
│   ├── DCARegistry.sol         # Core DCA engine (UUPS proxy)
│   ├── ScheduleTest.sol        # DCAScheduler (HSS interface)
│   ├── interfaces/             # Contract interfaces
│   ├── libraries/              # Shared logic (DCALib)
│   └── mocks/                  # Test doubles
├── lib/                        # Backend services
│   ├── services/
│   │   ├── dca-service.ts      # Hedera SDK operations + key rotation
│   │   ├── vault-service.ts    # AWS KMS key management
│   │   └── ledger-service.ts   # Hedera account creation
│   ├── supabase/               # Database clients
│   ├── utils/                  # Audit logging, rate limiting, crypto
│   └── constants/              # Token addresses & metadata
├── supabase/migrations/        # Database migrations (RLS, constraints)
├── test/                       # Hardhat test suite
├── scripts/                    # Deploy & upgrade scripts
├── store/                      # Zustand state stores
├── hooks/                      # React hooks (DCA, session, audit)
├── types/                      # TypeScript definitions
└── docs/                       # Architecture, plans & audit docs
```

---

## Running Locally

### Prerequisites

- Node.js 20+
- A Hedera testnet account (create at [portal.hedera.com](https://portal.hedera.com))
- AWS account with KMS access
- Supabase project

### Setup

```bash
# Install dependencies
npm install

# Copy environment template and fill in credentials
cp .env.local.example .env.local

# Compile smart contracts
npm run compile

# Run contract tests
npm run test:contracts

# Start development server
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_HEDERA_NETWORK` | `testnet` or `mainnet` |
| `CUSTODIAL_CREATOR_ACCOUNT_ID` | Hedera operator account (0.0.XXXXX) |
| `CUSTODIAL_CREATOR_PRIVATE_KEY` | Operator private key (hex) |
| `DCA_REGISTRY_CONTRACT_ID` | Deployed DCARegistry proxy (0.0.XXXXX) |
| `DCA_SCHEDULER_CONTRACT_ID` | Deployed DCAScheduler (0.0.XXXXX) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key |
| `AWS_ACCESS_KEY_ID` | AWS credentials for KMS |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for KMS |
| `AWS_KMS_REGION` | KMS region (default: us-east-1) |
| `CUSTODIAL_MAX_OPS_PER_HOUR` | Rate limit: max operations per hour (default: 10) |
| `CUSTODIAL_MAX_OPS_PER_DAY` | Rate limit: max operations per day (default: 50) |

---

## Deployed Contracts (Hedera Testnet)

| Contract | Hedera ID | Type |
|----------|-----------|------|
| DCARegistry | `0.0.8140637` | UUPS Proxy |
| DCAScheduler | `0.0.8160490` | Non-proxy |

| Token / Service | Hedera ID |
|----------------|-----------|
| SaucerSwap Router | `0.0.19264` |
| WHBAR | `0.0.15058` |
| USDC | `0.0.5481` |

---

## Why Hedera?

**HIP-1215 (Schedule Service)** is the key differentiator. No other L1/L2 offers native on-chain transaction scheduling at the protocol level. This eliminates the entire keeper/bot infrastructure that plagues DCA solutions on Ethereum, Solana, and other chains.

Additional Hedera advantages for DCA:
- **Predictable fees**: Fixed gas costs make budget estimation reliable
- **Fast finality**: 3-5 second consensus with immediate finality
- **EVM compatibility**: Full Solidity support with OpenZeppelin stack
- **HTS integration**: Native token service with built-in association model
- **Low MEV risk**: Hedera's consensus model significantly reduces sandwich attack vectors

---

## Built With

- [Hedera](https://hedera.com) — L1 blockchain with native scheduling (HIP-1215)
- [SaucerSwap](https://saucerswap.finance) — Hedera's leading DEX
- [AWS KMS](https://aws.amazon.com/kms/) — Hardware security module for key custody
- [Next.js](https://nextjs.org) — Full-stack React framework
- [Supabase](https://supabase.com) — Auth + PostgreSQL database
- [OpenZeppelin](https://openzeppelin.com) — Smart contract security library
- [Hardhat](https://hardhat.org) — Ethereum development environment
- [shadcn/ui](https://ui.shadcn.com) — UI component library
