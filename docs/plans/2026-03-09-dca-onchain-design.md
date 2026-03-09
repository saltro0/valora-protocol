# DCA On-Chain Protocol Design — Hedera + HIP-1215

**Date:** 2026-03-09
**Status:** Approved

---

## Overview

Protocol for automated Dollar Cost Averaging (DCA) 100% on-chain on Hedera, using HIP-1215 for self-scheduling smart contract execution. Users create DCA positions that auto-execute swaps at configured intervals without any backend, bots, or keepers.

**Pitch:** "DCA 100% on-chain, non-custodial, sin backend. Depositas, configuras y te olvidas."

---

## Architecture Decisions

| Aspect | Decision | Rationale |
|---|---|---|
| Contract architecture | Registry (single contract) + UUPS proxy | Maintainability, upgradeability, no deploy cost per user |
| Auto-execution | HIP-1215 `scheduleCall` with retry/jitter | Protocol-level scheduling, no external dependencies |
| DEX integration | Global router (SaucerSwap V1), path built on-the-fly | Simpler than per-position pool, standard Uniswap V2 interface |
| Mock for dev | MockDEXRouter simulating swaps | SaucerSwap testnet may lack liquidity |
| Signing model | Custodial via AWS KMS (VaultService) | Consistent with existing app architecture |
| Backend role | DCAService + Server Actions — only signs user-initiated txs | DCA execution loop is 100% on-chain |
| Database | Supabase as cache/index (contract is source of truth) | Fast UI reads, contract holds canonical state |
| Slippage failure | try/catch → reschedule without deducting | Better UX, retry on next interval |
| Schedule cancellation | Store `currentSchedule` address, call `deleteSchedule()` on stop | HIP-1215 supports programmatic cancellation |
| Token association | Auto-associate via HTS precompile on first use | Required by Hedera's token model |
| Repo structure | Monorepo — contracts/ in project root | Share types/ABIs between frontend and contracts |

---

## Smart Contract: DCARegistry

### Inheritance

```solidity
DCARegistry is
  Initializable,
  UUPSUpgradeable,
  OwnableUpgradeable,
  PausableUpgradeable,
  ReentrancyGuardUpgradeable,
  HederaScheduleService
```

### Data Structure

```solidity
struct DCAPosition {
    address owner;
    address tokenIn;         // Token to sell (e.g. USDC)
    address tokenOut;        // Token to buy (e.g. WHBAR, SAUCE)
    uint256 amountPerSwap;   // tokenIn amount per execution
    uint256 interval;        // Seconds between executions
    uint256 maxExecutions;   // Calculated at creation
    uint256 executionsLeft;  // Decremented each execution
    uint256 executionsDone;  // Counter of completed executions
    uint256 tokenInBalance;  // Remaining tokenIn deposited
    uint256 tokenOutAccum;   // Total tokenOut purchased (accumulated)
    uint256 hbarBalance;     // Remaining HBAR for schedule gas
    uint16 slippageBps;      // Slippage tolerance in basis points
    bool active;             // Whether position is active
    address currentSchedule; // HIP-1215 schedule address for cancellation
}
```

### State Variables

```solidity
mapping(uint256 => DCAPosition) public positions;
uint256 public nextPositionId;

// Protocol params (admin-configurable)
uint16 public feeBps;                   // Fee in basis points (e.g. 50 = 0.5%)
uint256 public estimatedGasPerExec;     // HBAR estimated per schedule execution
address public treasury;                // Fee recipient
address public dexRouter;               // SaucerSwap RouterV3 address

// Token association tracking
mapping(address => bool) public associatedTokens;
```

### Interface

```solidity
// User functions
function createPosition(
    address tokenIn, address tokenOut,
    uint256 amountPerSwap, uint256 interval,
    uint16 slippageBps, uint256 tokenInAmount
) external payable returns (uint256 positionId);

function execute(uint256 positionId) external;           // Called by HIP-1215 schedule
function stop(uint256 positionId) external;              // Owner only, cancels schedule
function withdraw(uint256 positionId) external;          // Owner only, returns all funds
function topUp(uint256 positionId, uint256 extraTokenIn) external payable;

// Admin functions
function setFeeBps(uint16 _feeBps) external;
function setEstimatedGasPerExec(uint256 _estimatedGasPerExec) external;
function setTreasury(address _treasury) external;
function setDexRouter(address _dexRouter) external;

// View functions
function getPosition(uint256 positionId) external view returns (DCAPosition memory);
function getEstimatedExecutions(uint256 tokenInAmount, uint256 amountPerSwap, uint256 hbarAmount) external view returns (uint256);
```

### HIP-1215 Integration

System contract at `0x16b`. Contract inherits `HederaScheduleService`.

```solidity
function _scheduleNext(uint256 positionId) internal {
    DCAPosition storage pos = positions[positionId];

    bytes memory callData = abi.encodeWithSelector(this.execute.selector, positionId);
    uint256 targetTime = block.timestamp + pos.interval;

    // Find available second with retry/jitter (capacity throttling)
    uint256 executeAt = _findAvailableSecond(targetTime, SCHEDULED_CALL_GAS_LIMIT);

    (int64 rc, address scheduleAddr) = scheduleCall(
        address(this),
        executeAt,
        SCHEDULED_CALL_GAS_LIMIT,  // 2_000_000
        0,                          // no tinybar value
        callData
    );

    if (rc == 22) { // SUCCESS
        pos.currentSchedule = scheduleAddr;
    } else {
        pos.active = false; // Scheduling failed, deactivate
    }
}
```

**Key behaviors:**
- `scheduleCall` never reverts — must check `responseCode == 22`
- Capacity throttling per second — use retry with exponential backoff + jitter
- Contract pays for scheduled execution gas — must hold sufficient HBAR
- `deleteSchedule(scheduleAddress)` for cancellation in `stop()`

### DEX Integration (SaucerSwap V1)

SaucerSwap V1 is a Uniswap V2 fork. Router addresses:
- **Mainnet:** `0.0.3045981`
- **Testnet:** `0.0.19264`

```solidity
function _executeSwap(
    address tokenIn, address tokenOut,
    uint256 amountIn, uint16 slippageBps
) internal returns (uint256) {
    address[] memory path = new address[](2);
    path[0] = tokenIn;
    path[1] = tokenOut;

    IERC20(tokenIn).approve(dexRouter, amountIn);

    uint256[] memory amountsOut = IUniswapV2Router02(dexRouter).getAmountsOut(amountIn, path);
    uint256 amountOutMin = amountsOut[1] * (10000 - slippageBps) / 10000;

    uint256[] memory results = IUniswapV2Router02(dexRouter).swapExactTokensForTokens(
        amountIn, amountOutMin, path, address(this), block.timestamp + 300
    );

    return results[1];
}
```

### Execute Flow

```
1. Verify position is active and has funds
2. Calculate fee: feeAmount = amountPerSwap * feeBps / 10000
3. Transfer fee to treasury
4. netAmount = amountPerSwap - feeAmount
5. try _executeSwap(netAmount, ...):
     - tokenOutAccum += amountOut
     - tokenInBalance -= amountPerSwap
     - executionsLeft--
     - executionsDone++
   catch:
     - Swap failed (slippage etc.) — don't deduct, just reschedule
6. Deduct estimatedGasPerExec from hbarBalance
7. If executionsLeft > 0 AND hbarBalance >= estimatedGasPerExec:
     - _scheduleNext(positionId)
8. Else: deactivate position
```

### Token Association (Hedera-specific)

Hedera requires explicit token association before receiving tokens. The contract auto-associates via HTS precompile (`0x167`):

```solidity
function _ensureTokenAssociation(address token) internal {
    if (!associatedTokens[token]) {
        (bool success, ) = address(0x167).call(
            abi.encodeWithSignature("associateToken(address,address)", address(this), token)
        );
        require(success, "Token association failed");
        associatedTokens[token] = true;
    }
}
```

### Security

- `ReentrancyGuardUpgradeable` on `execute`, `withdraw`, `topUp`
- `PausableUpgradeable` for emergency admin pause
- `OwnableUpgradeable` for admin functions
- Owner-only checks on `stop`, `withdraw`, `topUp`
- Input validation: amountPerSwap > 0, interval >= 60, tokenInAmount >= amountPerSwap
- Fee capped (e.g. max 500 bps = 5%)

---

## Backend Integration

### DCAService (`lib/services/dca-service.ts`)

Only handles user-initiated actions requiring KMS signature. The DCA execution loop is 100% on-chain.

```typescript
class DCAService {
  async createPosition(params): Promise<{ positionId: number, txHash: string }>
  // 1. AccountAllowanceApproveTransaction (approve tokenIn to DCARegistry)
  // 2. ContractExecuteTransaction (call createPosition with HBAR payable)
  // Both signed via VaultService.signDigest()

  async stopPosition(positionId, userAccountId): Promise<string>
  async withdrawPosition(positionId, userAccountId): Promise<string>
  async topUpPosition(positionId, extraTokenIn, extraHbar): Promise<string>
  async getPosition(positionId): Promise<DCAPosition>  // Contract read via mirror node
  async getUserPositions(ownerAddress): Promise<DCAPosition[]>
}
```

### Server Actions (`app/actions/dca.ts`)

```typescript
export async function createDCAPosition(formData: FormData): Promise<ActionResult>
export async function stopDCAPosition(positionId: number): Promise<ActionResult>
export async function withdrawDCAPosition(positionId: number): Promise<ActionResult>
export async function topUpDCAPosition(positionId: number, formData: FormData): Promise<ActionResult>
```

### Database (Supabase — cache/index only)

Contract is source of truth. Supabase provides fast UI reads.

```sql
CREATE TABLE dca_positions (
  id SERIAL PRIMARY KEY,
  position_id INTEGER NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  token_in TEXT NOT NULL,
  token_out TEXT NOT NULL,
  amount_per_swap NUMERIC NOT NULL,
  interval_seconds INTEGER NOT NULL,
  max_executions INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE dca_executions (
  id SERIAL PRIMARY KEY,
  position_id INTEGER NOT NULL,
  token_in_spent NUMERIC NOT NULL,
  token_out_received NUMERIC NOT NULL,
  fee_amount NUMERIC NOT NULL,
  tx_hash TEXT,
  executed_at TIMESTAMPTZ DEFAULT now()
);
```

Execution history populated via mirror node event polling (SwapExecuted logs).

---

## Frontend

### Routes

```
app/(dashboard)/
├── dashboard/page.tsx          # Overview: account card + positions summary
├── dca/
│   ├── page.tsx                # List all positions
│   ├── new/page.tsx            # Create new position form
│   └── [positionId]/page.tsx   # Position detail + history
```

### Components (`components/dca/`)

| Component | Purpose |
|---|---|
| `position-list.tsx` | User's positions with status badges |
| `position-card.tsx` | Compact card: token pair, progress, status, quick actions |
| `create-position-form.tsx` | Form: tokenIn, tokenOut, amount, interval, slippage + execution preview |
| `position-detail.tsx` | Detailed view: balances, executions done/left, history |
| `execution-history.tsx` | Table/timeline of past executions |
| `top-up-dialog.tsx` | Dialog to add funds to existing position |
| `token-selector.tsx` | Token selector with search (SaucerSwap API data) |
| `interval-selector.tsx` | Interval picker: 1h, 4h, 12h, 1d, 1w |

### Create Position UX

1. Select tokenIn (e.g. USDC) + tokenOut (e.g. WHBAR)
2. Enter total deposit + amount per swap
3. Select interval (1h, 4h, 12h, 1d, 1w)
4. Set slippage tolerance (default 0.5%)
5. Preview: "50 swaps of 20 USDC each, every 24h. Duration: ~50 days. Gas: X HBAR. Fee: 0.5%/swap"
6. Click "Start DCA" → backend signs txs → redirect to position detail

### State Management

```typescript
// store/dca-store.ts (Zustand)
interface DCAStore {
  positions: DCAPosition[];
  loading: boolean;
  fetchPositions: () => Promise<void>;
}
```

Data sources: contract reads via mirror node JSON-RPC, SaucerSwap REST API for token list, `getAmountsOut` for quotes.

---

## Hardhat Project Structure

```
dca-swap/                        # Existing Next.js root
├── contracts/                   # NEW
│   ├── DCARegistry.sol
│   ├── interfaces/
│   │   ├── IDCARegistry.sol
│   │   └── IUniswapV2Router02.sol
│   ├── libraries/
│   │   └── DCALib.sol
│   └── mocks/
│       └── MockDEXRouter.sol
├── scripts/                     # NEW
│   ├── deploy.ts
│   ├── upgrade.ts
│   └── verify.ts
├── test/                        # NEW
│   ├── DCARegistry.test.ts
│   ├── DCARegistry.execute.test.ts
│   └── helpers/setup.ts
├── hardhat.config.ts            # NEW
├── app/                         # Existing
├── components/                  # Existing
├── lib/services/dca-service.ts  # NEW
└── ...
```

### Dependencies

- `hardhat` + `@nomicfoundation/hardhat-toolbox`
- `@openzeppelin/contracts-upgradeable`
- `@hashgraph/hedera-smart-contracts` (from GitHub)
- Hedera testnet JSON-RPC configuration
- `dotenv`

### Testing Strategy

- **Unit tests (Hardhat local):** DCA logic, fee calculations, access control, mock DEX swaps
- **Integration tests (Hedera testnet):** HIP-1215 scheduling, real schedule execution, SaucerSwap integration
- Local Hardhat node cannot simulate HIP-1215 schedules

---

## Environment Variables (additions to .env)

```
# Hedera Operator (for deploys)
HEDERA_OPERATOR_ID=0.0.XXXXX
HEDERA_OPERATOR_KEY=302e...
HEDERA_NETWORK=testnet

# Contract addresses (populated after deploy)
DCA_REGISTRY_ADDRESS=0x...
DCA_REGISTRY_PROXY_ADDRESS=0x...

# DEX
SAUCERSWAP_ROUTER_MAINNET=0.0.3045981
SAUCERSWAP_ROUTER_TESTNET=0.0.19264
WHBAR_TOKEN_MAINNET=0.0.1456986
WHBAR_TOKEN_TESTNET=0.0.15058

# Protocol
FEE_BPS=50
TREASURY_ADDRESS=0x...
ESTIMATED_GAS_PER_EXEC=2000000
```

---

## Fee Model

- Fee deducted from `amountPerSwap` BEFORE each swap
- `feeBps` in basis points: 50 = 0.5%, 100 = 1%
- Example: 100 USDC/swap, fee 0.5% → 99.5 USDC swapped, 0.5 USDC to treasury
- Fee and treasury address configurable by admin
- Fee capped at max 500 bps (5%)

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Swap reverts (slippage) | try/catch → reschedule without deducting, retry next interval |
| HBAR runs out | Schedule fails to create → position deactivated |
| Scheduling capacity full | Retry with exponential backoff + jitter per HIP-1215 recommendation |
| Gas estimate too low | Admin updates estimatedGasPerExec, existing positions use stored hbarBalance |
| Token not associated | Auto-associate via HTS precompile on first use |
| Reentrancy | ReentrancyGuard on execute, withdraw, topUp |
| Emergency | Admin can pause entire contract |
