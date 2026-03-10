# Smart Contract Audit — DCARegistry + DCAScheduler

**Date:** 2026-03-10
**Scope:** Security + Performance/Scalability audit
**Target:** Deployed contracts on Hedera Testnet (chainId 296)
**Contracts:**
- DCARegistry (UUPS Proxy): `0xB9aD3787972d41c772ffc752b2c0687a37296731`
- DCAScheduler: deployed via `ScheduleTest.sol`

---

## Architecture Overview

- **DCARegistry**: UUPS upgradeable proxy managing all DCA positions. Uses OpenZeppelin's Initializable, UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable, and ReentrancyGuardUpgradeable.
- **DCAScheduler**: Non-proxy contract handling HIP-1215 scheduling and per-user HBAR gas deposits.
- **Execution model**: Each position auto-executes via HIP-1215 `scheduleCall`. Each `execute()` does one swap via SaucerSwap V1 (Uniswap V2 interface) and reschedules itself.

---

## CRITICAL Findings

### CRITICAL-1: `execute()` callable by anyone without timing validation

**Location:** `DCARegistry.sol:180`

`execute()` has no access control beyond `whenNotPaused` and `nonReentrant`. Any address can call it at any time, executing swaps outside the intended interval. An attacker could force execution during high-slippage conditions.

**Fix:** Add timing validation:
```solidity
uint256 lastExecutedAt; // new field in DCAPosition
require(block.timestamp >= pos.lastExecutedAt + pos.interval, "Too early");
```
Or restrict caller to the scheduler contract.

### CRITICAL-2: Gas deducted even on failed swaps

**Location:** `DCARegistry.sol:211-213`

The gas deduction block runs **outside** the try/catch, meaning HBAR is consumed from the user's balance even when the swap fails. An attacker could manipulate the liquidity pool to cause repeated swap failures, draining the user's gas budget without any successful swaps.

**Fix:** Move gas deduction inside the success branch of try/catch, or implement a consecutive-failure counter that deactivates the position after N failures.

### CRITICAL-3: `_cancelSchedule` silently ignores failures

**Location:** `DCARegistry.sol:382-391`

The return value of `scheduler.call()` in `_cancelSchedule` is never checked. If cancellation fails, the old schedule remains active, potentially causing ghost executions after the user has stopped or withdrawn.

**Fix:** Check return value and revert or emit a warning event.

---

## HIGH Findings

### HIGH-1: Front-running / Sandwich attacks on swaps

**Location:** `DCARegistry.sol:250-257`

Swaps use `getAmountsOut()` for `amountOutMin` immediately before the swap. With HIP-1215 scheduling, execution timestamps are predictable, making sandwich attacks easier. The `slippageBps` parameter provides partial protection.

**Fix:** Use a price oracle or TWAP-based minimum output. Note: Hedera's consensus model reduces but doesn't eliminate MEV risk.

### HIGH-2: HBAR refund blocks withdraw if receiver reverts

**Location:** `DCAScheduler.sol:62-70`

If the refund recipient is a contract with a reverting `receive()`, the `require(sent)` blocks the entire `withdraw()` in DCARegistry. The user cannot recover their tokens.

**Fix:** Use pull-pattern for HBAR refunds (user claims separately) or wrap the refund in try/catch so token withdrawal is not blocked.

### HIGH-3: `withdrawBalance()` permanently loses funds on insolvency

**Location:** `DCAScheduler.sol:74-86`

`userBalance[msg.sender]` is set to 0 regardless of how much was actually sent. If `address(this).balance < amount`, the user loses the difference permanently.

**Fix:** Only reduce `userBalance` by `toSend`, not the full amount:
```solidity
userBalance[msg.sender] -= toSend; // not = 0
```

---

## MEDIUM Findings

### MED-1: No validation that tokenIn != tokenOut

**Location:** `DCARegistry.sol:121-129`, `DCALib.sol:29-40`

A user can create a position swapping a token for itself. The DEX would likely revert, but gas is wasted.

**Fix:** Add `require(tokenIn != tokenOut, "Same token")`.

### MED-2: No validation that token addresses are contracts

**Location:** `DCARegistry.sol:148`

If a non-contract address is passed as a token, `safeTransferFrom` will revert. But partial ERC20 implementations could cause unpredictable behavior.

**Fix:** Validate `address.code.length > 0` for both token addresses.

### MED-3: Hedera token association not handled

**Location:** Absent in both contracts

Hedera HTS tokens require explicit "token association" before receiving them. The `associatedTokens` mapping exists but is never used. Swaps will fail for unassociated tokenOut.

**Fix:** Call HTS precompile (`0x167`) to auto-associate tokens, or validate association in `createPosition`.

### MED-4: topUp recalculates executions incorrectly under gas estimate changes

**Location:** `DCARegistry.sol:335-343`

`calculateMaxExecutions` uses current balances (already reduced by prior executions) but then subtracts `executionsDone`. If `estimatedGasPerExec` changes between creation and topUp, the calculation becomes inconsistent.

**Fix:** Calculate `executionsLeft` directly:
```solidity
pos.executionsLeft = DCALib.calculateMaxExecutions(
    pos.tokenInBalance, pos.amountPerSwap, pos.hbarBalance, estimatedGasPerExec
);
pos.maxExecutions = pos.executionsDone + pos.executionsLeft;
```

### MED-5: Token approval not reset after swap

**Location:** `DCARegistry.sol:250`

Each execution approves `amountIn` to the router. The allowance is not reset to 0 after the swap completes.

**Fix:** Add `IERC20(tokenIn).approve(dexRouter, 0)` after the swap, or use `safeIncreaseAllowance`.

---

## LOW Findings

### LOW-1: No maximum positions per user
Users can create unlimited positions. Low risk since each requires real deposits.

### LOW-2: `getPosition()` exposes full position data
Includes `hbarBalance` — attackers can calculate exactly when a position runs out of gas.

### LOW-3: Hardcoded 5-minute swap deadline
`block.timestamp + 300` is reasonable but not configurable.

### LOW-4: No event on failed schedule cancellation
Combined with CRITICAL-3, there's no way to detect failed cancellations off-chain.

---

## Performance & Scalability Analysis

### PERF-1: Individual execution model scales linearly

Each position has its own HIP-1215 schedule. No loops, no batching. 1,000 positions = 1,000 independent schedules. Each `execute()` is O(1). **Scales well.**

### PERF-2: GAS_LIMIT ~12x higher than needed

Estimated gas per `execute()`: ~270,000 - 415,000. `GAS_LIMIT = 5,000,000`. Users overpay gas by ~12x.

**Fix:** Reduce to ~1,000,000 or make configurable.

### PERF-3: `hasScheduleCapacity()` not used

**Location:** `DCAScheduler.sol:125-137`

The function exists but is never called in `_scheduleNext()`. If the network lacks capacity at the target timestamp, the schedule silently fails and the position deactivates.

**Fix:** Check capacity before scheduling. Add jitter to `executeAt` to distribute load:
```solidity
uint256 jitter = uint256(keccak256(abi.encode(positionId, block.timestamp))) % 30;
uint256 executeAt = block.timestamp + pos.interval + jitter;
```

### PERF-4: Scheduler balance insolvency risk

HIP-1215 consumes HBAR from the scheduler's balance for gas execution. The `estimatedGasPerExec` tracking in positions is an approximation. With many users, the actual vs estimated consumption can diverge, causing refund insolvency (see HIGH-3).

**Recommendation:** Implement accounting that tracks actual HBAR consumed per execution, or add a safety margin to estimates.

### PERF-5: Storage never cleaned

Completed/withdrawn positions remain in `_positions` mapping forever. Mappings are O(1) for reads, so this doesn't affect gas, but increases state size.

**Fix (low priority):** `delete _positions[positionId]` in withdraw after clearing balances.

---

## Summary Table

| ID | Severity | Finding | Fix Required |
|---|---|---|---|
| CRITICAL-1 | **CRITICAL** | `execute()` callable by anyone without timing | Yes |
| CRITICAL-2 | **CRITICAL** | Gas deducted on failed swaps | Yes |
| CRITICAL-3 | **CRITICAL** | Cancel schedule ignores failures | Yes |
| HIGH-1 | **HIGH** | Front-running/sandwich on swaps | Partial |
| HIGH-2 | **HIGH** | HBAR refund blocks withdraw | Yes |
| HIGH-3 | **HIGH** | withdrawBalance permanently loses funds | Yes |
| MED-1 | **MEDIUM** | tokenIn == tokenOut not validated | Yes |
| MED-2 | **MEDIUM** | No contract address validation | Yes |
| MED-3 | **MEDIUM** | HTS token association not handled | Yes |
| MED-4 | **MEDIUM** | topUp execution recalculation bug | Yes |
| MED-5 | **MEDIUM** | Approve not reset post-swap | Yes |
| PERF-2 | **PERF** | GAS_LIMIT 12x over needed | Yes |
| PERF-3 | **PERF** | hasScheduleCapacity unused | Yes |
| PERF-4 | **PERF** | Scheduler balance insolvency | Design |
| PERF-5 | **PERF** | Storage not cleaned | Low |
