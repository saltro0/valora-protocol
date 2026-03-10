# DCA Smart Contract Audit Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all CRITICAL, HIGH, MEDIUM, and PERF findings from the security audit to prepare the contracts for mainnet deployment.

**Architecture:** DCARegistry (UUPS proxy) + DCAScheduler (non-proxy, redeploy). Changes to DCAPosition struct must append-only (UUPS storage safety). DCAScheduler is not upgradeable — a new version is redeployed and the registry is pointed to it via `setScheduler()`.

**Tech Stack:** Solidity 0.8.24, Hardhat, OpenZeppelin Upgradeable, Hedera HIP-1215, ethers.js v6, Chai/Mocha

**Audit doc:** `docs/plans/2026-03-10-smart-contract-audit-design.md`

---

## Task 1: Update IDCARegistry — Add new struct fields and events

**Files:**
- Modify: `contracts/interfaces/IDCARegistry.sol`

**Step 1: Add new fields to DCAPosition struct**

Append two new fields at the END of the struct (critical for UUPS storage compatibility — never insert in the middle):

```solidity
struct DCAPosition {
    address owner;
    address tokenIn;
    address tokenOut;
    uint256 amountPerSwap;
    uint256 interval;
    uint256 maxExecutions;
    uint256 executionsLeft;
    uint256 executionsDone;
    uint256 tokenInBalance;
    uint256 tokenOutAccum;
    uint256 hbarBalance;
    uint16 slippageBps;
    bool active;
    address currentSchedule;
    // --- New fields (audit fixes) ---
    uint256 lastExecutedAt;       // CRITICAL-1: timing guard
    uint8 consecutiveFailures;    // CRITICAL-2: failure tracking
}
```

**Step 2: Add new event for CRITICAL-3 + LOW-4**

```solidity
event ScheduleCancelFailed(uint256 indexed positionId, address scheduleAddr);
```

**Step 3: Commit**

```bash
git add contracts/interfaces/IDCARegistry.sol
git commit -m "feat(interface): add lastExecutedAt, consecutiveFailures fields and ScheduleCancelFailed event"
```

---

## Task 2: Update DCALib — Add token validation and failure constant

**Files:**
- Modify: `contracts/libraries/DCALib.sol`

**Step 1: Add constant and update validateCreateParams**

```solidity
library DCALib {
    uint16 constant MAX_FEE_BPS = 500;
    uint256 constant MIN_INTERVAL = 60;
    uint256 constant MIN_DEPOSIT = 1e6;
    uint8 constant MAX_CONSECUTIVE_FAILURES = 5;  // CRITICAL-2

    function calculateFee(
        uint256 amount,
        uint16 feeBps
    ) internal pure returns (uint256) {
        return (amount * feeBps) / 10000;
    }

    function calculateMaxExecutions(
        uint256 tokenInAmount,
        uint256 amountPerSwap,
        uint256 hbarAmount,
        uint256 estimatedGasPerExec
    ) internal pure returns (uint256) {
        uint256 maxByToken = tokenInAmount / amountPerSwap;
        uint256 maxByGas = estimatedGasPerExec > 0
            ? hbarAmount / estimatedGasPerExec
            : type(uint256).max;
        return maxByToken < maxByGas ? maxByToken : maxByGas;
    }

    function validateCreateParams(
        address tokenIn,      // NEW param
        address tokenOut,     // NEW param
        uint256 amountPerSwap,
        uint256 interval,
        uint256 tokenInAmount,
        uint16 slippageBps
    ) internal view {         // changed from pure to view (for code.length check)
        require(tokenIn != tokenOut, "Same token");                          // MED-1
        require(tokenIn.code.length > 0, "tokenIn not a contract");         // MED-2
        require(tokenOut.code.length > 0, "tokenOut not a contract");       // MED-2
        require(amountPerSwap > 0, "amountPerSwap must be > 0");
        require(interval >= MIN_INTERVAL, "interval too short");
        require(tokenInAmount >= MIN_DEPOSIT, "deposit < minimum (1 USD)");
        require(tokenInAmount >= amountPerSwap, "deposit < amountPerSwap");
        require(slippageBps <= 5000, "slippage > 50%");
    }
}
```

**Step 2: Commit**

```bash
git add contracts/libraries/DCALib.sol
git commit -m "feat(lib): add token address validation and MAX_CONSECUTIVE_FAILURES constant"
```

---

## Task 3: Rewrite DCAScheduler — Fix HIGH-2, HIGH-3, PERF-2

**Files:**
- Modify: `contracts/ScheduleTest.sol`
- Modify: `contracts/interfaces/IDCAScheduler.sol`

The DCAScheduler is NOT a proxy — it must be redeployed. After deploying the new version, call `registry.setScheduler(newAddr)`.

**Step 1: Update IDCAScheduler interface**

Add `gasLimit()` view function and `setGasLimit()`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDCAScheduler {
    function scheduleCall(
        address target,
        uint256 executeAt,
        bytes calldata callData
    ) external returns (int64 rc, address scheduleAddr);

    function cancelSchedule(address scheduleAddr) external returns (bool success);  // now returns bool

    function reserveGas(address user, uint256 amount) external returns (bool);
    function refundGas(address payable user, uint256 amount) external returns (bool success);  // now returns bool

    function userBalance(address user) external view returns (uint256);
    function gasLimit() external view returns (uint256);
    function hasCapacity(uint256 timestamp) external view returns (bool);
}
```

**Step 2: Rewrite DCAScheduler (ScheduleTest.sol)**

Key changes:
- **HIGH-3:** `withdrawBalance()` — only deduct `toSend` from `userBalance`, not full amount
- **HIGH-2:** `refundGas()` — return bool instead of reverting, so DCARegistry.withdraw is never blocked
- **PERF-2:** Make `gasLimit` configurable via `setGasLimit()`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IScheduleService.sol";

contract DCAScheduler {
    address constant HSS = address(0x16b);

    address public owner;
    address public registry;
    uint256 public gasLimit;

    mapping(address => uint256) public userBalance;

    event Scheduled(address target, uint256 executeAt, address scheduleAddr, int64 rc);
    event ScheduleFailed(string reason);
    event Deposited(address indexed user, uint256 amount);
    event GasReserved(address indexed user, uint256 amount);
    event GasRefunded(address indexed user, uint256 amount, uint256 actualSent);
    event BalanceWithdrawn(address indexed user, uint256 requested, uint256 actualSent);

    modifier onlyOwnerOrRegistry() {
        require(msg.sender == owner || msg.sender == registry, "Not authorized");
        _;
    }

    constructor(address _registry, uint256 _gasLimit) {
        owner = msg.sender;
        registry = _registry;
        gasLimit = _gasLimit;
    }

    function setRegistry(address _registry) external {
        require(msg.sender == owner, "Not owner");
        registry = _registry;
    }

    function setGasLimit(uint256 _gasLimit) external {
        require(msg.sender == owner, "Not owner");
        require(_gasLimit >= 500_000, "Gas limit too low");
        gasLimit = _gasLimit;
    }

    function deposit() external payable {
        userBalance[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    receive() external payable {
        userBalance[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function reserveGas(address user, uint256 amount) external onlyOwnerOrRegistry returns (bool) {
        if (userBalance[user] < amount) return false;
        userBalance[user] -= amount;
        emit GasReserved(user, amount);
        return true;
    }

    // HIGH-2: Returns bool instead of reverting — never blocks withdraw
    function refundGas(address payable user, uint256 amount) external onlyOwnerOrRegistry returns (bool success) {
        uint256 available = address(this).balance;
        uint256 toSend = amount < available ? amount : available;
        if (toSend > 0) {
            (success,) = user.call{value: toSend}("");
            // Don't revert — just return false so DCARegistry.withdraw can proceed
        }
        emit GasRefunded(user, amount, toSend);
    }

    // HIGH-3: Only deduct what was actually sent
    function withdrawBalance() external {
        uint256 amount = userBalance[msg.sender];
        require(amount > 0, "No balance");

        uint256 available = address(this).balance;
        uint256 toSend = amount < available ? amount : available;
        userBalance[msg.sender] -= toSend;  // FIX: only deduct what's actually sent

        if (toSend > 0) {
            (bool sent,) = payable(msg.sender).call{value: toSend}("");
            if (!sent) {
                userBalance[msg.sender] += toSend;  // Restore on failure
                revert("Transfer failed");
            }
        }
        emit BalanceWithdrawn(msg.sender, amount, toSend);
    }

    function scheduleCall(
        address target,
        uint256 executeAt,
        bytes calldata callData
    ) external onlyOwnerOrRegistry returns (int64 rc, address scheduleAddr) {
        (bool success, bytes memory result) = HSS.call(
            abi.encodeWithSelector(
                IScheduleService.scheduleCall.selector,
                target,
                executeAt,
                gasLimit,
                uint64(0),
                callData
            )
        );

        if (success && result.length >= 64) {
            (rc, scheduleAddr) = abi.decode(result, (int64, address));
            emit Scheduled(target, executeAt, scheduleAddr, rc);
        } else {
            rc = -1;
            emit ScheduleFailed("HSS call failed");
        }
    }

    // Now returns bool for CRITICAL-3 handling
    function cancelSchedule(address scheduleAddr) external onlyOwnerOrRegistry returns (bool success) {
        if (scheduleAddr != address(0)) {
            (success,) = HSS.call(
                abi.encodeWithSelector(
                    IScheduleService.deleteSchedule.selector,
                    scheduleAddr
                )
            );
        }
    }

    function hasCapacity(uint256 timestamp) external view returns (bool) {
        (bool ok, bytes memory res) = HSS.staticcall(
            abi.encodeWithSelector(
                IScheduleService.hasScheduleCapacity.selector,
                timestamp,
                gasLimit
            )
        );
        if (ok && res.length >= 32) {
            return abi.decode(res, (bool));
        }
        return true;
    }
}
```

**Step 3: Commit**

```bash
git add contracts/ScheduleTest.sol contracts/interfaces/IDCAScheduler.sol
git commit -m "fix(scheduler): fix withdrawBalance fund loss, refundGas blocking, configurable gasLimit"
```

---

## Task 4: Fix DCARegistry — All CRITICAL, HIGH, MEDIUM, PERF issues

**Files:**
- Modify: `contracts/DCARegistry.sol`

This is the main task. Apply ALL remaining fixes to DCARegistry in one coherent update.

**Step 1: Update createPosition**

Changes:
- Pass `tokenIn` and `tokenOut` to `validateCreateParams` (MED-1, MED-2)
- Set `lastExecutedAt: block.timestamp` in position struct (CRITICAL-1)
- Set `consecutiveFailures: 0` (CRITICAL-2)

```solidity
function createPosition(
    address tokenIn,
    address tokenOut,
    uint256 amountPerSwap,
    uint256 interval,
    uint16 slippageBps,
    uint256 tokenInAmount
) external whenNotPaused nonReentrant returns (uint256) {
    DCALib.validateCreateParams(tokenIn, tokenOut, amountPerSwap, interval, tokenInAmount, slippageBps);

    uint256 maxByToken = tokenInAmount / amountPerSwap;
    uint256 gasNeeded = maxByToken * estimatedGasPerExec;

    if (schedulingEnabled && estimatedGasPerExec > 0 && scheduler != address(0)) {
        require(
            IDCAScheduler(scheduler).reserveGas(msg.sender, gasNeeded),
            "Insufficient gas deposit in scheduler"
        );
    }

    uint256 maxExec = DCALib.calculateMaxExecutions(
        tokenInAmount, amountPerSwap, gasNeeded, estimatedGasPerExec
    );
    require(maxExec > 0, "Insufficient funds for 1 execution");

    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount);

    uint256 positionId = nextPositionId++;
    _positions[positionId] = DCAPosition({
        owner: msg.sender,
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amountPerSwap: amountPerSwap,
        interval: interval,
        maxExecutions: maxExec,
        executionsLeft: maxExec,
        executionsDone: 0,
        tokenInBalance: tokenInAmount,
        tokenOutAccum: 0,
        hbarBalance: gasNeeded,
        slippageBps: slippageBps,
        active: true,
        currentSchedule: address(0),
        lastExecutedAt: block.timestamp,    // CRITICAL-1
        consecutiveFailures: 0              // CRITICAL-2
    });

    emit PositionCreated(
        positionId, msg.sender, tokenIn, tokenOut,
        amountPerSwap, interval, maxExec
    );

    if (schedulingEnabled) {
        _scheduleNext(positionId);
    }
    return positionId;
}
```

**Step 2: Rewrite execute() — CRITICAL-1, CRITICAL-2**

```solidity
function execute(uint256 positionId) external whenNotPaused nonReentrant {
    DCAPosition storage pos = _positions[positionId];
    require(pos.active, "Position not active");
    require(pos.executionsLeft > 0, "No executions left");
    require(pos.tokenInBalance >= pos.amountPerSwap, "Insufficient tokenIn");

    // CRITICAL-1: Timing guard — prevent early execution
    require(
        block.timestamp >= pos.lastExecutedAt + pos.interval,
        "Too early"
    );

    uint256 feeAmount = DCALib.calculateFee(pos.amountPerSwap, feeBps);
    uint256 netAmount = pos.amountPerSwap - feeAmount;

    try this._executeSwapExternal(pos.tokenIn, pos.tokenOut, netAmount, pos.slippageBps, pos.owner)
        returns (uint256 amountOut)
    {
        if (feeAmount > 0) {
            IERC20(pos.tokenIn).safeTransfer(treasury, feeAmount);
        }

        pos.tokenOutAccum += amountOut;
        pos.tokenInBalance -= pos.amountPerSwap;
        pos.executionsLeft--;
        pos.executionsDone++;
        pos.lastExecutedAt = block.timestamp;   // CRITICAL-1: update timestamp
        pos.consecutiveFailures = 0;            // CRITICAL-2: reset on success

        // CRITICAL-2: Deduct gas ONLY on successful swap
        if (pos.hbarBalance >= estimatedGasPerExec) {
            pos.hbarBalance -= estimatedGasPerExec;
        }

        emit SwapExecuted(positionId, pos.amountPerSwap, amountOut, feeAmount, pos.executionsLeft);
    } catch {
        // CRITICAL-2: Don't deduct gas on failure, track consecutive failures
        pos.consecutiveFailures++;
        emit SwapFailed(positionId, pos.executionsLeft);

        if (pos.consecutiveFailures >= DCALib.MAX_CONSECUTIVE_FAILURES) {
            pos.active = false;
            emit PositionDeactivated(positionId, "too many consecutive failures");
            return;
        }
    }

    // Schedule next or deactivate
    if (pos.executionsLeft == 0) {
        pos.active = false;
        emit PositionDeactivated(positionId, "executions exhausted");
    } else if (pos.hbarBalance < estimatedGasPerExec) {
        pos.active = false;
        emit PositionDeactivated(positionId, "insufficient gas");
    } else if (schedulingEnabled) {
        _scheduleNext(positionId);
    }
}
```

**Step 3: Fix _executeSwap — MED-5 (reset approval after swap)**

```solidity
function _executeSwap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint16 slippageBps,
    address recipient
) internal returns (uint256) {
    address[] memory path = new address[](2);
    path[0] = tokenIn;
    path[1] = tokenOut;

    IERC20(tokenIn).forceApprove(dexRouter, amountIn);   // MED-5: use forceApprove (OZ SafeERC20)

    uint256[] memory amountsOut = IUniswapV2Router02(dexRouter).getAmountsOut(amountIn, path);
    uint256 amountOutMin = (amountsOut[1] * (10000 - slippageBps)) / 10000;

    uint256[] memory results = IUniswapV2Router02(dexRouter).swapExactTokensForTokens(
        amountIn, amountOutMin, path, recipient, block.timestamp + 300
    );

    IERC20(tokenIn).forceApprove(dexRouter, 0);           // MED-5: reset approval

    return results[results.length - 1];
}
```

**Step 4: Fix withdraw — Handle refundGas failure gracefully (HIGH-2)**

```solidity
function withdraw(uint256 positionId) external whenNotPaused nonReentrant {
    DCAPosition storage pos = _positions[positionId];
    require(pos.owner == msg.sender, "Not owner");

    if (pos.active) {
        pos.active = false;
        if (schedulingEnabled) {
            _cancelSchedule(positionId, pos.currentSchedule);
            pos.currentSchedule = address(0);
        }
    }

    uint256 tokenInReturn = pos.tokenInBalance;
    uint256 hbarReturn = pos.hbarBalance;

    pos.tokenInBalance = 0;
    pos.hbarBalance = 0;

    if (tokenInReturn > 0) {
        IERC20(pos.tokenIn).safeTransfer(msg.sender, tokenInReturn);
    }
    // HIGH-2: Don't let HBAR refund failure block token withdrawal
    if (hbarReturn > 0 && scheduler != address(0)) {
        try IDCAScheduler(scheduler).refundGas(payable(msg.sender), hbarReturn) {
        } catch {
            // Refund failed — user can claim from scheduler directly
        }
    }

    // PERF-5: Clean up storage for withdrawn positions
    // Keep tokenOutAccum for the event, then delete
    uint256 tokenOutAccum = pos.tokenOutAccum;
    delete _positions[positionId];

    emit Withdrawal(positionId, tokenInReturn, tokenOutAccum, hbarReturn);
}
```

**Step 5: Fix topUp — MED-4 (execution recalculation)**

```solidity
function topUp(
    uint256 positionId,
    uint256 extraTokenIn,
    uint256 extraGas
) external whenNotPaused nonReentrant {
    DCAPosition storage pos = _positions[positionId];
    require(pos.owner == msg.sender, "Not owner");
    require(pos.active, "Position not active");

    if (extraTokenIn > 0) {
        IERC20(pos.tokenIn).safeTransferFrom(msg.sender, address(this), extraTokenIn);
        pos.tokenInBalance += extraTokenIn;
    }

    if (extraGas > 0 && scheduler != address(0)) {
        require(
            IDCAScheduler(scheduler).reserveGas(msg.sender, extraGas),
            "Insufficient gas deposit"
        );
        pos.hbarBalance += extraGas;
    }

    // MED-4: Calculate executionsLeft directly from current balances
    pos.executionsLeft = DCALib.calculateMaxExecutions(
        pos.tokenInBalance, pos.amountPerSwap, pos.hbarBalance, estimatedGasPerExec
    );
    pos.maxExecutions = pos.executionsDone + pos.executionsLeft;

    emit TopUp(positionId, extraTokenIn, extraGas, pos.executionsLeft);
}
```

**Step 6: Fix _cancelSchedule — CRITICAL-3 (check return value, emit event)**

Change `_cancelSchedule` to accept `positionId` so it can emit the event:

```solidity
function _cancelSchedule(uint256 positionId, address scheduleAddr) internal {
    if (scheduler != address(0) && scheduleAddr != address(0)) {
        (bool success, bytes memory result) = scheduler.call(
            abi.encodeWithSelector(
                IDCAScheduler.cancelSchedule.selector,
                scheduleAddr
            )
        );
        if (!success) {
            emit ScheduleCancelFailed(positionId, scheduleAddr);
        }
    }
}
```

Also update `stop()` to pass positionId:

```solidity
function stop(uint256 positionId) external whenNotPaused nonReentrant {
    DCAPosition storage pos = _positions[positionId];
    require(pos.owner == msg.sender, "Not owner");
    require(pos.active, "Already stopped");

    pos.active = false;

    if (schedulingEnabled) {
        _cancelSchedule(positionId, pos.currentSchedule);
        pos.currentSchedule = address(0);
    }

    emit PositionStopped(positionId);
}
```

**Step 7: Fix _scheduleNext — PERF-3 (add jitter to distribute load)**

```solidity
function _scheduleNext(uint256 positionId) internal {
    if (scheduler == address(0)) {
        return;
    }

    DCAPosition storage pos = _positions[positionId];
    bytes memory callData = abi.encodeWithSelector(this.execute.selector, positionId);

    // PERF-3: Add jitter to distribute scheduling load (0-29 seconds)
    uint256 jitter = uint256(keccak256(abi.encode(positionId, block.timestamp))) % 30;
    uint256 executeAt = block.timestamp + pos.interval + jitter;

    (bool success, bytes memory result) = scheduler.call(
        abi.encodeWithSelector(
            IDCAScheduler.scheduleCall.selector,
            address(this),
            executeAt,
            callData
        )
    );

    if (success && result.length >= 64) {
        (int64 rc, address scheduleAddr) = abi.decode(result, (int64, address));
        if (rc == 22) {
            pos.currentSchedule = scheduleAddr;
            return;
        }
    }

    pos.active = false;
    emit PositionDeactivated(positionId, "scheduling failed");
}
```

**Step 8: Commit**

```bash
git add contracts/DCARegistry.sol
git commit -m "fix(registry): apply all audit fixes — timing guard, gas deduction, cancel check, validation, topUp calc"
```

---

## Task 5: Create MockDCAScheduler for tests

**Files:**
- Create: `contracts/mocks/MockDCAScheduler.sol`

The Hardhat local network has no HIP-1215 precompile, so tests need a mock scheduler that simulates gas deposit, reserve, and refund.

**Step 1: Write MockDCAScheduler**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockDCAScheduler {
    mapping(address => uint256) public userBalance;
    uint256 public gasLimit;
    bool public shouldFailCancel;
    bool public shouldFailRefund;

    event GasReserved(address indexed user, uint256 amount);
    event GasRefunded(address indexed user, uint256 amount, uint256 actualSent);

    constructor(uint256 _gasLimit) {
        gasLimit = _gasLimit;
    }

    function deposit() external payable {
        userBalance[msg.sender] += msg.value;
    }

    receive() external payable {
        userBalance[msg.sender] += msg.value;
    }

    function reserveGas(address user, uint256 amount) external returns (bool) {
        if (userBalance[user] < amount) return false;
        userBalance[user] -= amount;
        emit GasReserved(user, amount);
        return true;
    }

    function refundGas(address payable user, uint256 amount) external returns (bool success) {
        if (shouldFailRefund) return false;
        uint256 available = address(this).balance;
        uint256 toSend = amount < available ? amount : available;
        if (toSend > 0) {
            (success,) = user.call{value: toSend}("");
        }
        emit GasRefunded(user, amount, toSend);
    }

    function scheduleCall(
        address, uint256, bytes calldata
    ) external pure returns (int64 rc, address scheduleAddr) {
        // Mock: always succeed with a dummy address
        rc = 22;
        scheduleAddr = address(0xDEAD);
    }

    function cancelSchedule(address) external view returns (bool) {
        return !shouldFailCancel;
    }

    function hasCapacity(uint256) external pure returns (bool) {
        return true;
    }

    // Test helpers
    function setShouldFailCancel(bool _fail) external {
        shouldFailCancel = _fail;
    }

    function setShouldFailRefund(bool _fail) external {
        shouldFailRefund = _fail;
    }
}
```

**Step 2: Commit**

```bash
git add contracts/mocks/MockDCAScheduler.sol
git commit -m "test: add MockDCAScheduler for unit testing scheduler interactions"
```

---

## Task 6: Update test fixture

**Files:**
- Modify: `test/helpers/setup.ts`

Update the fixture to deploy MockDCAScheduler, enable scheduling, and have users deposit HBAR for gas before creating positions.

**Step 1: Rewrite setup.ts**

```typescript
import { ethers, upgrades } from "hardhat";
import { DCARegistry, MockDEXRouter, MockERC20, MockDCAScheduler } from "../../typechain-types";

export const FEE_BPS = 50;
export const ESTIMATED_GAS = ethers.parseEther("0.5");
export const ONE_HOUR = 3600;
export const ONE_DAY = 86400;
export const MOCK_GAS_LIMIT = 1_000_000;

export async function deployFixture() {
  const [owner, user1, user2, treasury] = await ethers.getSigners();

  // Deploy mock tokens
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const tokenIn = (await upgrades.deployProxy(MockERC20Factory, [
    "USD Coin", "USDC", 6,
  ])) as unknown as MockERC20;
  const tokenOut = (await upgrades.deployProxy(MockERC20Factory, [
    "Wrapped HBAR", "WHBAR", 8,
  ])) as unknown as MockERC20;

  // Deploy mock DEX router
  const MockDEXFactory = await ethers.getContractFactory("MockDEXRouter");
  const mockRouter = await MockDEXFactory.deploy(1000, 1);

  // Fund router with tokenOut
  await tokenOut.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 8));

  // Deploy DCARegistry via UUPS proxy
  const DCARegistryFactory = await ethers.getContractFactory("DCARegistry");
  const registry = (await upgrades.deployProxy(
    DCARegistryFactory,
    [await treasury.getAddress(), await mockRouter.getAddress(), FEE_BPS, ESTIMATED_GAS],
    { kind: "uups" }
  )) as unknown as DCARegistry;

  // Deploy MockDCAScheduler
  const MockSchedulerFactory = await ethers.getContractFactory("MockDCAScheduler");
  const mockScheduler = (await MockSchedulerFactory.deploy(MOCK_GAS_LIMIT)) as unknown as MockDCAScheduler;

  // Configure scheduling
  await registry.setScheduler(await mockScheduler.getAddress());
  await registry.setSchedulingEnabled(true);

  // Mint tokens for users
  await tokenIn.mint(await user1.getAddress(), ethers.parseUnits("10000", 6));
  await tokenIn.mint(await user2.getAddress(), ethers.parseUnits("10000", 6));

  return {
    registry, tokenIn, tokenOut, mockRouter, mockScheduler,
    owner, user1, user2, treasury,
  };
}

/**
 * Helper: deposit HBAR to scheduler for a user, then create a standard position.
 * Returns positionId.
 */
export async function createTestPosition(
  fixture: Awaited<ReturnType<typeof deployFixture>>,
  options?: {
    deposit?: bigint;
    amountPerSwap?: bigint;
    interval?: number;
    slippageBps?: number;
    hbarDeposit?: bigint;
  }
) {
  const { registry, tokenIn, tokenOut, mockScheduler, user1 } = fixture;
  const deposit = options?.deposit ?? ethers.parseUnits("500", 6);
  const amountPerSwap = options?.amountPerSwap ?? ethers.parseUnits("100", 6);
  const interval = options?.interval ?? ONE_DAY;
  const slippageBps = options?.slippageBps ?? 50;
  const hbarDeposit = options?.hbarDeposit ?? ethers.parseEther("5");

  // User deposits HBAR to scheduler for gas
  await mockScheduler.connect(user1).deposit({ value: hbarDeposit });

  // Approve and create position
  await tokenIn.connect(user1).approve(await registry.getAddress(), deposit);
  await registry.connect(user1).createPosition(
    await tokenIn.getAddress(),
    await tokenOut.getAddress(),
    amountPerSwap,
    interval,
    slippageBps,
    deposit
  );

  return 0; // First position ID is always 0
}
```

**Step 2: Commit**

```bash
git add test/helpers/setup.ts
git commit -m "test: update fixture with MockDCAScheduler and helper for position creation"
```

---

## Task 7: Rewrite test suite for all audit fixes

**Files:**
- Modify: `test/DCARegistry.test.ts`

Rewrite the full test suite to cover all original functionality plus all audit fix scenarios. Run `npx hardhat compile` first to generate types, then write tests.

**Step 1: Compile contracts to regenerate typechain types**

Run: `npx hardhat compile`
Expected: Compilation successful, typechain types regenerated.

**Step 2: Write the full test suite**

```typescript
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployFixture, createTestPosition,
  FEE_BPS, ESTIMATED_GAS, ONE_HOUR, ONE_DAY,
} from "./helpers/setup";

describe("DCARegistry", () => {

  // ==================== Initialization ====================
  describe("Initialization", () => {
    it("should set correct initial values", async () => {
      const { registry, treasury, mockRouter } = await deployFixture();
      expect(await registry.feeBps()).to.equal(FEE_BPS);
      expect(await registry.estimatedGasPerExec()).to.equal(ESTIMATED_GAS);
      expect(await registry.treasury()).to.equal(await treasury.getAddress());
      expect(await registry.dexRouter()).to.equal(await mockRouter.getAddress());
      expect(await registry.nextPositionId()).to.equal(0);
    });

    it("should not allow re-initialization", async () => {
      const { registry, treasury, mockRouter } = await deployFixture();
      await expect(
        registry.initialize(await treasury.getAddress(), await mockRouter.getAddress(), 50, 1000)
      ).to.be.reverted;
    });
  });

  // ==================== Admin ====================
  describe("Admin", () => {
    it("should allow owner to set feeBps", async () => {
      const { registry } = await deployFixture();
      await registry.setFeeBps(100);
      expect(await registry.feeBps()).to.equal(100);
    });

    it("should reject feeBps > 500", async () => {
      const { registry } = await deployFixture();
      await expect(registry.setFeeBps(501)).to.be.revertedWith("Fee too high");
    });

    it("should reject non-owner admin calls", async () => {
      const { registry, user1 } = await deployFixture();
      await expect(registry.connect(user1).setFeeBps(100)).to.be.reverted;
    });

    it("should allow owner to pause/unpause", async () => {
      const { registry } = await deployFixture();
      await registry.pause();
      expect(await registry.paused()).to.be.true;
      await registry.unpause();
      expect(await registry.paused()).to.be.false;
    });
  });

  // ==================== createPosition ====================
  describe("createPosition", () => {
    it("should create a position with correct values", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);

      const pos = await fixture.registry.getPosition(0);
      expect(pos.owner).to.equal(await fixture.user1.getAddress());
      expect(pos.active).to.be.true;
      expect(pos.executionsDone).to.equal(0);
      expect(pos.tokenInBalance).to.equal(ethers.parseUnits("500", 6));
      expect(pos.consecutiveFailures).to.equal(0);
      expect(pos.lastExecutedAt).to.be.gt(0);
    });

    it("should emit PositionCreated event", async () => {
      const fixture = await deployFixture();
      const { registry, tokenIn, tokenOut, mockScheduler, user1 } = fixture;
      const deposit = ethers.parseUnits("500", 6);

      await mockScheduler.connect(user1).deposit({ value: ethers.parseEther("5") });
      await tokenIn.connect(user1).approve(await registry.getAddress(), deposit);

      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenOut.getAddress(),
          ethers.parseUnits("100", 6), ONE_HOUR, 50, deposit
        )
      ).to.emit(registry, "PositionCreated");
    });

    it("should revert if amountPerSwap is 0", async () => {
      const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenOut.getAddress(),
          0, ONE_DAY, 50, ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("amountPerSwap must be > 0");
    });

    it("should revert if deposit < amountPerSwap", async () => {
      const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenOut.getAddress(),
          ethers.parseUnits("200", 6), ONE_DAY, 50, ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("deposit < amountPerSwap");
    });

    it("should revert if deposit < minimum (1 USD)", async () => {
      const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
      const tiny = ethers.parseUnits("0.5", 6);
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenOut.getAddress(),
          tiny, ONE_DAY, 50, tiny
        )
      ).to.be.revertedWith("deposit < minimum (1 USD)");
    });

    // MED-1: Same token validation
    it("should revert if tokenIn == tokenOut", async () => {
      const { registry, tokenIn, user1 } = await deployFixture();
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenIn.getAddress(),
          ethers.parseUnits("100", 6), ONE_DAY, 50, ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("Same token");
    });

    // MED-2: Contract address validation
    it("should revert if tokenIn is not a contract", async () => {
      const { registry, tokenOut, user1 } = await deployFixture();
      const fakeAddr = "0x0000000000000000000000000000000000000001";
      await expect(
        registry.connect(user1).createPosition(
          fakeAddr, await tokenOut.getAddress(),
          ethers.parseUnits("100", 6), ONE_DAY, 50, ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("tokenIn not a contract");
    });

    it("should revert if tokenOut is not a contract", async () => {
      const { registry, tokenIn, user1 } = await deployFixture();
      const fakeAddr = "0x0000000000000000000000000000000000000001";
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), fakeAddr,
          ethers.parseUnits("100", 6), ONE_DAY, 50, ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("tokenOut not a contract");
    });

    it("should transfer tokenIn from user to contract", async () => {
      const fixture = await deployFixture();
      const { tokenIn, user1 } = fixture;
      const balBefore = await tokenIn.balanceOf(await user1.getAddress());
      await createTestPosition(fixture);
      const balAfter = await tokenIn.balanceOf(await user1.getAddress());
      expect(balBefore - balAfter).to.equal(ethers.parseUnits("500", 6));
    });

    it("should revert if insufficient gas deposit in scheduler", async () => {
      const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
      // Don't deposit HBAR to scheduler
      const deposit = ethers.parseUnits("500", 6);
      await tokenIn.connect(user1).approve(await registry.getAddress(), deposit);
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenOut.getAddress(),
          ethers.parseUnits("100", 6), ONE_DAY, 50, deposit
        )
      ).to.be.revertedWith("Insufficient gas deposit in scheduler");
    });
  });

  // ==================== execute ====================
  describe("execute", () => {
    it("should execute swap and update position", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);

      // Advance time past interval
      await time.increase(ONE_DAY);

      await fixture.registry.execute(0);
      const pos = await fixture.registry.getPosition(0);
      expect(pos.executionsDone).to.equal(1);
      expect(pos.tokenInBalance).to.equal(ethers.parseUnits("400", 6));
      expect(pos.tokenOutAccum).to.be.gt(0);
      expect(pos.consecutiveFailures).to.equal(0);
    });

    it("should send fee to treasury", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      const treasuryAddr = await fixture.treasury.getAddress();
      const balBefore = await fixture.tokenIn.balanceOf(treasuryAddr);

      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);

      const balAfter = await fixture.tokenIn.balanceOf(treasuryAddr);
      expect(balAfter - balBefore).to.equal(ethers.parseUnits("0.5", 6));
    });

    it("should emit SwapExecuted event", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await time.increase(ONE_DAY);
      await expect(fixture.registry.execute(0)).to.emit(fixture.registry, "SwapExecuted");
    });

    it("should deactivate when executionsLeft hits 0", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture, {
        deposit: ethers.parseUnits("100", 6),
        amountPerSwap: ethers.parseUnits("100", 6),
        hbarDeposit: ethers.parseEther("0.5"),
      });

      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);

      const pos = await fixture.registry.getPosition(0);
      expect(pos.active).to.be.false;
    });

    it("should revert on inactive position", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture, {
        deposit: ethers.parseUnits("100", 6),
        amountPerSwap: ethers.parseUnits("100", 6),
        hbarDeposit: ethers.parseEther("0.5"),
      });
      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);
      await expect(fixture.registry.execute(0)).to.be.revertedWith("Position not active");
    });

    // CRITICAL-1: Timing guard
    it("should revert if called too early (CRITICAL-1)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      // Don't advance time — should fail
      await expect(fixture.registry.execute(0)).to.be.revertedWith("Too early");
    });

    it("should allow execution after interval has passed (CRITICAL-1)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await time.increase(ONE_DAY);
      await expect(fixture.registry.execute(0)).to.not.be.reverted;
    });

    // CRITICAL-2: Gas not deducted on failure
    it("should NOT deduct gas on swap failure (CRITICAL-2)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);

      // Make router fail by setting rate to 0
      await fixture.mockRouter.setRate(0, 1);
      const posBefore = await fixture.registry.getPosition(0);

      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);

      const posAfter = await fixture.registry.getPosition(0);
      // Gas should NOT have been deducted
      expect(posAfter.hbarBalance).to.equal(posBefore.hbarBalance);
      // But consecutiveFailures should increment
      expect(posAfter.consecutiveFailures).to.equal(1);
    });

    it("should deactivate after MAX_CONSECUTIVE_FAILURES (CRITICAL-2)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);

      // Make swaps fail
      await fixture.mockRouter.setRate(0, 1);

      // Execute 5 times (MAX_CONSECUTIVE_FAILURES = 5)
      for (let i = 0; i < 5; i++) {
        await time.increase(ONE_DAY);
        await fixture.registry.execute(0);
      }

      const pos = await fixture.registry.getPosition(0);
      expect(pos.active).to.be.false;
    });

    it("should reset consecutiveFailures on success (CRITICAL-2)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);

      // Fail once
      await fixture.mockRouter.setRate(0, 1);
      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);
      expect((await fixture.registry.getPosition(0)).consecutiveFailures).to.equal(1);

      // Succeed
      await fixture.mockRouter.setRate(1000, 1);
      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);
      expect((await fixture.registry.getPosition(0)).consecutiveFailures).to.equal(0);
    });
  });

  // ==================== stop ====================
  describe("stop", () => {
    it("should set active=false", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await fixture.registry.connect(fixture.user1).stop(0);
      expect((await fixture.registry.getPosition(0)).active).to.be.false;
    });

    it("should emit PositionStopped", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await expect(fixture.registry.connect(fixture.user1).stop(0))
        .to.emit(fixture.registry, "PositionStopped");
    });

    it("should revert if not owner", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await expect(fixture.registry.connect(fixture.user2).stop(0))
        .to.be.revertedWith("Not owner");
    });

    it("should revert if already stopped", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await fixture.registry.connect(fixture.user1).stop(0);
      await expect(fixture.registry.connect(fixture.user1).stop(0))
        .to.be.revertedWith("Already stopped");
    });
  });

  // ==================== withdraw ====================
  describe("withdraw", () => {
    it("should return unused tokenIn to owner", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      const userAddr = await fixture.user1.getAddress();

      // Execute once
      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);

      const tokenInBefore = await fixture.tokenIn.balanceOf(userAddr);
      await fixture.registry.connect(fixture.user1).withdraw(0);
      const tokenInAfter = await fixture.tokenIn.balanceOf(userAddr);
      expect(tokenInAfter - tokenInBefore).to.equal(ethers.parseUnits("400", 6));
    });

    it("should emit Withdrawal event", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await expect(fixture.registry.connect(fixture.user1).withdraw(0))
        .to.emit(fixture.registry, "Withdrawal");
    });

    it("should revert if not owner", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await expect(fixture.registry.connect(fixture.user2).withdraw(0))
        .to.be.revertedWith("Not owner");
    });

    // PERF-5: Storage cleanup
    it("should delete position from storage after withdraw (PERF-5)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await fixture.registry.connect(fixture.user1).withdraw(0);
      const pos = await fixture.registry.getPosition(0);
      expect(pos.owner).to.equal(ethers.ZeroAddress);
      expect(pos.tokenInBalance).to.equal(0);
    });
  });

  // ==================== topUp ====================
  describe("topUp", () => {
    it("should add more tokenIn and recalculate executions", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      const { registry, tokenIn, mockScheduler, user1 } = fixture;

      const extra = ethers.parseUnits("500", 6);
      await mockScheduler.connect(user1).deposit({ value: ethers.parseEther("5") });
      await tokenIn.connect(user1).approve(await registry.getAddress(), extra);
      await registry.connect(user1).topUp(0, extra, ethers.parseEther("5"));

      const pos = await registry.getPosition(0);
      expect(pos.tokenInBalance).to.equal(ethers.parseUnits("1000", 6));
    });

    it("should emit TopUp event", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      const { registry, tokenIn, user1 } = fixture;

      const extra = ethers.parseUnits("100", 6);
      await tokenIn.connect(user1).approve(await registry.getAddress(), extra);
      await expect(registry.connect(user1).topUp(0, extra, 0))
        .to.emit(registry, "TopUp");
    });

    it("should revert if not owner", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await expect(fixture.registry.connect(fixture.user2).topUp(0, 0, 0))
        .to.be.revertedWith("Not owner");
    });

    it("should revert if position not active", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await fixture.registry.connect(fixture.user1).stop(0);
      await expect(fixture.registry.connect(fixture.user1).topUp(0, 0, 0))
        .to.be.revertedWith("Position not active");
    });

    // MED-4: Correct recalculation
    it("should calculate executionsLeft from current balances (MED-4)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      const { registry, tokenIn, mockScheduler, user1 } = fixture;

      // Execute 2 times
      await time.increase(ONE_DAY);
      await registry.execute(0);
      await time.increase(ONE_DAY);
      await registry.execute(0);

      // Top up 300 USDC (total: 300 remaining + 300 new = 600 => 6 execs by token)
      const extra = ethers.parseUnits("300", 6);
      await mockScheduler.connect(user1).deposit({ value: ethers.parseEther("3") });
      await tokenIn.connect(user1).approve(await registry.getAddress(), extra);
      await registry.connect(user1).topUp(0, extra, ethers.parseEther("3"));

      const pos = await registry.getPosition(0);
      // executionsLeft should be based on current balances, not historical
      expect(pos.executionsLeft).to.be.gt(0);
      expect(pos.maxExecutions).to.equal(pos.executionsDone + pos.executionsLeft);
    });
  });

  // ==================== View ====================
  describe("View", () => {
    it("should estimate executions correctly", async () => {
      const { registry } = await deployFixture();
      const est = await registry.getEstimatedExecutions(
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("100", 6),
        ethers.parseEther("5")
      );
      expect(est).to.equal(10);
    });

    it("should return min of token and gas limits", async () => {
      const { registry } = await deployFixture();
      const est = await registry.getEstimatedExecutions(
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("100", 6),
        ethers.parseEther("2")
      );
      expect(est).to.equal(4);
    });
  });
});
```

**Step 3: Run the tests**

Run: `npx hardhat test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add test/
git commit -m "test: rewrite test suite covering all audit fixes — timing, gas, failures, validation"
```

---

## Task 8: Final verification

**Step 1: Run full compilation**

Run: `npx hardhat compile`
Expected: No errors.

**Step 2: Run full test suite**

Run: `npx hardhat test`
Expected: All tests pass.

**Step 3: Check for remaining warnings**

Run: `npx hardhat compile 2>&1 | grep -i warn`
Expected: No critical warnings.

---

## Findings NOT addressed in code (documented only)

| ID | Finding | Rationale |
|---|---|---|
| HIGH-1 | Front-running/sandwich | Hedera has lower MEV risk than Ethereum. Mitigated by user-set `slippageBps`. A TWAP oracle is out of scope for V1 — no reliable oracle on Hedera yet. |
| MED-3 | HTS token association | Requires Hedera-specific precompile integration (0x167). Should be tested on testnet before mainnet. Out of scope for this plan — track as separate task. |
| PERF-4 | Scheduler balance insolvency | Partially addressed by HIGH-3 fix (withdrawBalance only deducts sent amount). Full solution requires tracking actual HIP-1215 gas consumption, which depends on Hedera network data. |

---

## Summary of changes by file

| File | Changes |
|---|---|
| `contracts/interfaces/IDCARegistry.sol` | Add `lastExecutedAt`, `consecutiveFailures` to struct; add `ScheduleCancelFailed` event |
| `contracts/interfaces/IDCAScheduler.sol` | `cancelSchedule` and `refundGas` now return `bool`; add `gasLimit()`, `hasCapacity()` |
| `contracts/libraries/DCALib.sol` | Add `MAX_CONSECUTIVE_FAILURES`; add `tokenIn`/`tokenOut` params to `validateCreateParams` (MED-1, MED-2) |
| `contracts/ScheduleTest.sol` | Fix `withdrawBalance` (HIGH-3); `refundGas` returns bool (HIGH-2); configurable `gasLimit` (PERF-2) |
| `contracts/DCARegistry.sol` | Timing guard (C-1), gas on success only (C-2), cancel check (C-3), topUp calc (M-4), approval reset (M-5), jitter (P-3), storage cleanup (P-5) |
| `contracts/mocks/MockDCAScheduler.sol` | New mock for testing scheduler interactions |
| `test/helpers/setup.ts` | Updated fixture with MockDCAScheduler |
| `test/DCARegistry.test.ts` | Full rewrite with audit fix coverage |
