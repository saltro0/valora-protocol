# DCA On-Chain Protocol Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a fully on-chain DCA protocol on Hedera using HIP-1215 for auto-scheduling, with SaucerSwap V1 DEX integration, custodial signing via AWS KMS, and a complete Next.js frontend.

**Architecture:** Single DCARegistry contract (UUPS proxy) stores all positions. HIP-1215 schedules auto-execute swaps at user-defined intervals. Backend only signs user-initiated transactions (create/stop/withdraw/topUp). Frontend displays positions, execution history, and creation form.

**Tech Stack:** Solidity 0.8.24 + Hardhat, OpenZeppelin Upgradeable, Hedera Schedule Service (HIP-1215), SaucerSwap V1 (Uniswap V2 fork), Next.js 16 + React 19 + Tailwind 4 + Zustand, Supabase (cache), AWS KMS (signing)

**Design Doc:** `docs/plans/2026-03-09-dca-onchain-design.md`

---

## Phase 1: Hardhat Project Setup

### Task 1: Initialize Hardhat in monorepo

**Files:**
- Create: `hardhat.config.ts`
- Create: `contracts/.gitkeep` (placeholder)
- Modify: `package.json` (add dev dependencies)
- Modify: `.gitignore` (add hardhat artifacts)

**Step 1: Install Hardhat dependencies**

Run:
```bash
pnpm add -D hardhat @nomicfoundation/hardhat-toolbox @nomicfoundation/hardhat-ethers ethers @typechain/hardhat @typechain/ethers-v6 typechain
```

**Step 2: Install OpenZeppelin and Hedera contracts**

Run:
```bash
pnpm add @openzeppelin/contracts-upgradeable @openzeppelin/hardhat-upgrades
pnpm add @hashgraph/hedera-smart-contracts@github:hashgraph/hedera-smart-contracts
```

**Step 3: Install dotenv for Hardhat scripts**

Run:
```bash
pnpm add -D dotenv
```

**Step 4: Create hardhat.config.ts**

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    hederaTestnet: {
      url: "https://testnet.hashio.io/api",
      accounts: process.env.HEDERA_OPERATOR_KEY
        ? [process.env.HEDERA_OPERATOR_KEY]
        : [],
      chainId: 296,
    },
    hederaMainnet: {
      url: "https://mainnet.hashio.io/api",
      accounts: process.env.HEDERA_OPERATOR_KEY
        ? [process.env.HEDERA_OPERATOR_KEY]
        : [],
      chainId: 295,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
```

**Step 5: Add Hardhat artifacts to .gitignore**

Append to `.gitignore`:
```
# Hardhat
cache/
artifacts/
typechain-types/
```

**Step 6: Create contracts directory structure**

Run:
```bash
mkdir -p contracts/interfaces contracts/libraries contracts/mocks
```

**Step 7: Verify Hardhat compiles**

Run: `npx hardhat compile`
Expected: Clean compilation (no sources yet, no errors)

**Step 8: Commit**

```bash
git add hardhat.config.ts package.json pnpm-lock.yaml .gitignore contracts/
git commit -m "chore: initialize Hardhat project for DCA smart contracts"
```

---

## Phase 2: Smart Contract Interfaces & Mocks

### Task 2: Create IUniswapV2Router02 interface

**Files:**
- Create: `contracts/interfaces/IUniswapV2Router02.sol`

**Step 1: Write the interface**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}
```

**Step 2: Compile**

Run: `npx hardhat compile`
Expected: Compiled 1 Solidity file successfully

**Step 3: Commit**

```bash
git add contracts/interfaces/IUniswapV2Router02.sol
git commit -m "feat: add IUniswapV2Router02 interface for SaucerSwap"
```

---

### Task 3: Create IDCARegistry interface

**Files:**
- Create: `contracts/interfaces/IDCARegistry.sol`

**Step 1: Write the interface**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDCARegistry {
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
    }

    event PositionCreated(
        uint256 indexed positionId,
        address indexed owner,
        address tokenIn,
        address tokenOut,
        uint256 amountPerSwap,
        uint256 interval,
        uint256 maxExecutions
    );
    event SwapExecuted(
        uint256 indexed positionId,
        uint256 tokenInSpent,
        uint256 tokenOutReceived,
        uint256 fee,
        uint256 executionsLeft
    );
    event SwapFailed(uint256 indexed positionId, uint256 executionsLeft);
    event PositionStopped(uint256 indexed positionId);
    event PositionDeactivated(uint256 indexed positionId, string reason);
    event Withdrawal(
        uint256 indexed positionId,
        uint256 tokenInReturned,
        uint256 tokenOutReturned,
        uint256 hbarReturned
    );
    event TopUp(
        uint256 indexed positionId,
        uint256 extraTokenIn,
        uint256 extraHbar,
        uint256 newExecutionsLeft
    );

    function createPosition(
        address tokenIn,
        address tokenOut,
        uint256 amountPerSwap,
        uint256 interval,
        uint16 slippageBps,
        uint256 tokenInAmount
    ) external payable returns (uint256 positionId);

    function execute(uint256 positionId) external;
    function stop(uint256 positionId) external;
    function withdraw(uint256 positionId) external;
    function topUp(uint256 positionId, uint256 extraTokenIn) external payable;

    function getPosition(uint256 positionId) external view returns (DCAPosition memory);
    function getEstimatedExecutions(
        uint256 tokenInAmount,
        uint256 amountPerSwap,
        uint256 hbarAmount
    ) external view returns (uint256);
}
```

**Step 2: Compile**

Run: `npx hardhat compile`
Expected: Compiled successfully

**Step 3: Commit**

```bash
git add contracts/interfaces/IDCARegistry.sol
git commit -m "feat: add IDCARegistry interface with events and structs"
```

---

### Task 4: Create MockERC20 token

**Files:**
- Create: `contracts/mocks/MockERC20.sol`

**Step 1: Write mock token**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract MockERC20 is ERC20Upgradeable {
    uint8 private _decimals;

    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) public initializer {
        __ERC20_init(name_, symbol_);
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

**Step 2: Compile**

Run: `npx hardhat compile`
Expected: Compiled successfully

**Step 3: Commit**

```bash
git add contracts/mocks/MockERC20.sol
git commit -m "feat: add MockERC20 for testing"
```

---

### Task 5: Create MockDEXRouter

**Files:**
- Create: `contracts/mocks/MockDEXRouter.sol`

**Step 1: Write mock router**

This mock simulates SaucerSwap V1 with a configurable exchange rate.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "../interfaces/IUniswapV2Router02.sol";

contract MockDEXRouter is IUniswapV2Router02 {
    // Exchange rate: for every 1 tokenIn, how many tokenOut (in token units)
    // rateNumerator / rateDenominator = exchange rate
    uint256 public rateNumerator;
    uint256 public rateDenominator;

    constructor(uint256 _rateNumerator, uint256 _rateDenominator) {
        rateNumerator = _rateNumerator;
        rateDenominator = _rateDenominator;
    }

    function setRate(uint256 _num, uint256 _den) external {
        rateNumerator = _num;
        rateDenominator = _den;
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view override returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = (amountIn * rateNumerator) / rateDenominator;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external override returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");

        uint256 amountOut = (amountIn * rateNumerator) / rateDenominator;
        require(amountOut >= amountOutMin, "Insufficient output amount");

        // Pull tokenIn from sender
        IERC20Upgradeable(path[0]).transferFrom(msg.sender, address(this), amountIn);

        // Send tokenOut to recipient (mock must hold tokenOut balance)
        IERC20Upgradeable(path[path.length - 1]).transfer(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;
    }
}
```

**Step 2: Compile**

Run: `npx hardhat compile`
Expected: Compiled successfully

**Step 3: Commit**

```bash
git add contracts/mocks/MockDEXRouter.sol
git commit -m "feat: add MockDEXRouter simulating SaucerSwap V1"
```

---

## Phase 3: DCARegistry Core Contract (No Scheduling)

### Task 6: Create DCALib helper library

**Files:**
- Create: `contracts/libraries/DCALib.sol`

**Step 1: Write library**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library DCALib {
    uint16 constant MAX_FEE_BPS = 500; // 5% max
    uint256 constant MIN_INTERVAL = 60; // 1 minute minimum

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
        uint256 amountPerSwap,
        uint256 interval,
        uint256 tokenInAmount,
        uint16 slippageBps
    ) internal pure {
        require(amountPerSwap > 0, "amountPerSwap must be > 0");
        require(interval >= MIN_INTERVAL, "interval too short");
        require(tokenInAmount >= amountPerSwap, "deposit < amountPerSwap");
        require(slippageBps <= 5000, "slippage > 50%");
    }
}
```

**Step 2: Compile**

Run: `npx hardhat compile`
Expected: Compiled successfully

**Step 3: Commit**

```bash
git add contracts/libraries/DCALib.sol
git commit -m "feat: add DCALib helper library"
```

---

### Task 7: Create DCARegistry contract — storage and initialization

**Files:**
- Create: `contracts/DCARegistry.sol`

**Step 1: Write the contract skeleton with storage and initializer**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./interfaces/IDCARegistry.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./libraries/DCALib.sol";

contract DCARegistry is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    IDCARegistry
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // --- Storage ---
    mapping(uint256 => DCAPosition) private _positions;
    uint256 public nextPositionId;

    uint16 public feeBps;
    uint256 public estimatedGasPerExec;
    address public treasury;
    address public dexRouter;

    mapping(address => bool) public associatedTokens;

    uint256 constant SCHEDULED_CALL_GAS_LIMIT = 2_000_000;

    // --- Initializer ---
    function initialize(
        address _treasury,
        address _dexRouter,
        uint16 _feeBps,
        uint256 _estimatedGasPerExec
    ) public initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        require(_treasury != address(0), "Invalid treasury");
        require(_dexRouter != address(0), "Invalid router");
        require(_feeBps <= DCALib.MAX_FEE_BPS, "Fee too high");

        treasury = _treasury;
        dexRouter = _dexRouter;
        feeBps = _feeBps;
        estimatedGasPerExec = _estimatedGasPerExec;
    }

    // --- UUPS ---
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // --- Admin ---
    function setFeeBps(uint16 _feeBps) external onlyOwner {
        require(_feeBps <= DCALib.MAX_FEE_BPS, "Fee too high");
        feeBps = _feeBps;
    }

    function setEstimatedGasPerExec(uint256 _val) external onlyOwner {
        estimatedGasPerExec = _val;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function setDexRouter(address _dexRouter) external onlyOwner {
        require(_dexRouter != address(0), "Invalid router");
        dexRouter = _dexRouter;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // --- View ---
    function getPosition(uint256 positionId) external view returns (DCAPosition memory) {
        return _positions[positionId];
    }

    function getEstimatedExecutions(
        uint256 tokenInAmount,
        uint256 amountPerSwap,
        uint256 hbarAmount
    ) external view returns (uint256) {
        return DCALib.calculateMaxExecutions(
            tokenInAmount, amountPerSwap, hbarAmount, estimatedGasPerExec
        );
    }

    // Placeholder functions — implemented in subsequent tasks
    function createPosition(
        address tokenIn,
        address tokenOut,
        uint256 amountPerSwap,
        uint256 interval,
        uint16 slippageBps,
        uint256 tokenInAmount
    ) external payable whenNotPaused nonReentrant returns (uint256) {
        revert("Not implemented");
    }

    function execute(uint256 positionId) external whenNotPaused nonReentrant {
        revert("Not implemented");
    }

    function stop(uint256 positionId) external whenNotPaused nonReentrant {
        revert("Not implemented");
    }

    function withdraw(uint256 positionId) external whenNotPaused nonReentrant {
        revert("Not implemented");
    }

    function topUp(uint256 positionId, uint256 extraTokenIn) external payable whenNotPaused nonReentrant {
        revert("Not implemented");
    }

    // --- Receive HBAR ---
    receive() external payable {}
}
```

**Step 2: Compile**

Run: `npx hardhat compile`
Expected: Compiled successfully

**Step 3: Commit**

```bash
git add contracts/DCARegistry.sol
git commit -m "feat: DCARegistry skeleton with storage, init, admin, and views"
```

---

### Task 8: Write test helpers and first test — initialization

**Files:**
- Create: `test/helpers/setup.ts`
- Create: `test/DCARegistry.test.ts`

**Step 1: Write test helper**

```typescript
import { ethers, upgrades } from "hardhat";
import { DCARegistry, MockDEXRouter, MockERC20 } from "../../typechain-types";

export const FEE_BPS = 50; // 0.5%
export const ESTIMATED_GAS = ethers.parseEther("0.5"); // 0.5 HBAR
export const ONE_HOUR = 3600;
export const ONE_DAY = 86400;

export async function deployFixture() {
  const [owner, user1, user2, treasury] = await ethers.getSigners();

  // Deploy mock tokens
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const tokenIn = (await upgrades.deployProxy(MockERC20Factory, [
    "USD Coin",
    "USDC",
    6,
  ])) as unknown as MockERC20;
  const tokenOut = (await upgrades.deployProxy(MockERC20Factory, [
    "Wrapped HBAR",
    "WHBAR",
    8,
  ])) as unknown as MockERC20;

  // Deploy mock DEX router (1 USDC = 10 WHBAR, scaled: 10 * 10^8 / 10^6 = 1000)
  const MockDEXFactory = await ethers.getContractFactory("MockDEXRouter");
  const mockRouter = await MockDEXFactory.deploy(1000, 1);

  // Fund router with tokenOut for swaps
  await tokenOut.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 8));

  // Deploy DCARegistry via UUPS proxy
  const DCARegistryFactory = await ethers.getContractFactory("DCARegistry");
  const registry = (await upgrades.deployProxy(
    DCARegistryFactory,
    [
      await treasury.getAddress(),
      await mockRouter.getAddress(),
      FEE_BPS,
      ESTIMATED_GAS,
    ],
    { kind: "uups" }
  )) as unknown as DCARegistry;

  // Mint tokens for users
  await tokenIn.mint(await user1.getAddress(), ethers.parseUnits("10000", 6));
  await tokenIn.mint(await user2.getAddress(), ethers.parseUnits("10000", 6));

  return {
    registry,
    tokenIn,
    tokenOut,
    mockRouter,
    owner,
    user1,
    user2,
    treasury,
  };
}
```

**Step 2: Write initialization tests**

```typescript
import { expect } from "chai";
import { deployFixture, FEE_BPS, ESTIMATED_GAS } from "./helpers/setup";

describe("DCARegistry", () => {
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
        registry.initialize(
          await treasury.getAddress(),
          await mockRouter.getAddress(),
          50,
          1000
        )
      ).to.be.reverted;
    });
  });

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
      await expect(
        registry.connect(user1).setFeeBps(100)
      ).to.be.reverted;
    });

    it("should allow owner to pause/unpause", async () => {
      const { registry } = await deployFixture();
      await registry.pause();
      expect(await registry.paused()).to.be.true;
      await registry.unpause();
      expect(await registry.paused()).to.be.false;
    });
  });

  describe("View", () => {
    it("should estimate executions correctly", async () => {
      const { registry } = await deployFixture();
      // 1000 USDC, 100 per swap = 10 by token
      // 5 HBAR, 0.5 per exec = 10 by gas
      // min(10, 10) = 10
      const est = await registry.getEstimatedExecutions(
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("100", 6),
        ethers.parseEther("5")
      );
      expect(est).to.equal(10);
    });

    it("should return min of token and gas limits", async () => {
      const { registry } = await deployFixture();
      // 1000 USDC, 100 per swap = 10 by token
      // 2 HBAR, 0.5 per exec = 4 by gas
      // min(10, 4) = 4
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

**Step 3: Run tests**

Run: `npx hardhat test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add test/
git commit -m "test: DCARegistry initialization, admin, and view tests"
```

---

### Task 9: Implement createPosition

**Files:**
- Modify: `contracts/DCARegistry.sol` (replace createPosition placeholder)

**Step 1: Write failing test for createPosition**

Add to `test/DCARegistry.test.ts`:

```typescript
describe("createPosition", () => {
  it("should create a position with correct values", async () => {
    const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
    const amountPerSwap = ethers.parseUnits("100", 6);
    const totalDeposit = ethers.parseUnits("1000", 6);
    const hbarDeposit = ethers.parseEther("5");

    // Approve tokenIn to registry
    await tokenIn.connect(user1).approve(await registry.getAddress(), totalDeposit);

    // Create position
    const tx = await registry.connect(user1).createPosition(
      await tokenIn.getAddress(),
      await tokenOut.getAddress(),
      amountPerSwap,
      ONE_DAY,
      50, // 0.5% slippage
      totalDeposit,
      { value: hbarDeposit }
    );

    const pos = await registry.getPosition(0);
    expect(pos.owner).to.equal(await user1.getAddress());
    expect(pos.tokenIn).to.equal(await tokenIn.getAddress());
    expect(pos.tokenOut).to.equal(await tokenOut.getAddress());
    expect(pos.amountPerSwap).to.equal(amountPerSwap);
    expect(pos.interval).to.equal(ONE_DAY);
    expect(pos.maxExecutions).to.equal(10); // min(1000/100, 5/0.5)
    expect(pos.executionsLeft).to.equal(10);
    expect(pos.executionsDone).to.equal(0);
    expect(pos.tokenInBalance).to.equal(totalDeposit);
    expect(pos.hbarBalance).to.equal(hbarDeposit);
    expect(pos.slippageBps).to.equal(50);
    expect(pos.active).to.be.true;
    expect(await registry.nextPositionId()).to.equal(1);
  });

  it("should emit PositionCreated event", async () => {
    const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
    const totalDeposit = ethers.parseUnits("500", 6);
    await tokenIn.connect(user1).approve(await registry.getAddress(), totalDeposit);

    await expect(
      registry.connect(user1).createPosition(
        await tokenIn.getAddress(),
        await tokenOut.getAddress(),
        ethers.parseUnits("100", 6),
        ONE_HOUR,
        50,
        totalDeposit,
        { value: ethers.parseEther("5") }
      )
    ).to.emit(registry, "PositionCreated");
  });

  it("should revert if amountPerSwap is 0", async () => {
    const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
    await expect(
      registry.connect(user1).createPosition(
        await tokenIn.getAddress(),
        await tokenOut.getAddress(),
        0,
        ONE_DAY,
        50,
        ethers.parseUnits("100", 6),
        { value: ethers.parseEther("1") }
      )
    ).to.be.revertedWith("amountPerSwap must be > 0");
  });

  it("should revert if deposit < amountPerSwap", async () => {
    const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
    await expect(
      registry.connect(user1).createPosition(
        await tokenIn.getAddress(),
        await tokenOut.getAddress(),
        ethers.parseUnits("200", 6),
        ONE_DAY,
        50,
        ethers.parseUnits("100", 6),
        { value: ethers.parseEther("1") }
      )
    ).to.be.revertedWith("deposit < amountPerSwap");
  });

  it("should transfer tokenIn from user to contract", async () => {
    const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
    const deposit = ethers.parseUnits("500", 6);
    await tokenIn.connect(user1).approve(await registry.getAddress(), deposit);

    const balBefore = await tokenIn.balanceOf(await user1.getAddress());
    await registry.connect(user1).createPosition(
      await tokenIn.getAddress(),
      await tokenOut.getAddress(),
      ethers.parseUnits("100", 6),
      ONE_DAY,
      50,
      deposit,
      { value: ethers.parseEther("3") }
    );
    const balAfter = await tokenIn.balanceOf(await user1.getAddress());
    expect(balBefore - balAfter).to.equal(deposit);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx hardhat test`
Expected: FAIL — "Not implemented"

**Step 3: Implement createPosition**

Replace the `createPosition` placeholder in `contracts/DCARegistry.sol`:

```solidity
function createPosition(
    address tokenIn,
    address tokenOut,
    uint256 amountPerSwap,
    uint256 interval,
    uint16 slippageBps,
    uint256 tokenInAmount
) external payable whenNotPaused nonReentrant returns (uint256) {
    DCALib.validateCreateParams(amountPerSwap, interval, tokenInAmount, slippageBps);

    uint256 maxExec = DCALib.calculateMaxExecutions(
        tokenInAmount, amountPerSwap, msg.value, estimatedGasPerExec
    );
    require(maxExec > 0, "Insufficient funds for 1 execution");

    // Transfer tokenIn from user
    IERC20Upgradeable(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount);

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
        hbarBalance: msg.value,
        slippageBps: slippageBps,
        active: true,
        currentSchedule: address(0)
    });

    emit PositionCreated(
        positionId, msg.sender, tokenIn, tokenOut,
        amountPerSwap, interval, maxExec
    );

    // NOTE: _scheduleNext(positionId) will be added in Phase 4
    return positionId;
}
```

**Step 4: Run tests**

Run: `npx hardhat test`
Expected: All pass

**Step 5: Commit**

```bash
git add contracts/DCARegistry.sol test/DCARegistry.test.ts
git commit -m "feat: implement createPosition with validation and token transfer"
```

---

### Task 10: Implement execute (manual, no scheduling)

**Files:**
- Modify: `contracts/DCARegistry.sol` (replace execute placeholder)
- Modify: `test/DCARegistry.test.ts` (add execute tests)

**Step 1: Write failing tests for execute**

Add to `test/DCARegistry.test.ts` a new `describe("execute", ...)` block. Key tests:
- Should swap tokenIn for tokenOut and update balances
- Should deduct fee and send to treasury
- Should decrement executionsLeft and increment executionsDone
- Should deactivate position when executionsLeft reaches 0
- Should handle swap failure (reschedule without deducting) — test with mock router set to revert
- Should revert if position is not active
- Should emit SwapExecuted event

```typescript
describe("execute", () => {
  async function createTestPosition() {
    const fixture = await deployFixture();
    const { registry, tokenIn, tokenOut, user1 } = fixture;
    const deposit = ethers.parseUnits("500", 6);
    const hbar = ethers.parseEther("5");
    await tokenIn.connect(user1).approve(await registry.getAddress(), deposit);
    await registry.connect(user1).createPosition(
      await tokenIn.getAddress(),
      await tokenOut.getAddress(),
      ethers.parseUnits("100", 6),
      ONE_DAY,
      50,
      deposit,
      { value: hbar }
    );
    return { ...fixture, positionId: 0 };
  }

  it("should execute swap and update position", async () => {
    const { registry, tokenOut, treasury, positionId } = await createTestPosition();

    await registry.execute(positionId);

    const pos = await registry.getPosition(positionId);
    expect(pos.executionsDone).to.equal(1);
    expect(pos.executionsLeft).to.equal(4); // was 5 from min(500/100, 5/0.5) but recalc needed
    expect(pos.tokenInBalance).to.equal(ethers.parseUnits("400", 6));
    expect(pos.tokenOutAccum).to.be.gt(0);
  });

  it("should send fee to treasury", async () => {
    const { registry, tokenIn, treasury, positionId } = await createTestPosition();
    const treasuryAddr = await treasury.getAddress();
    const balBefore = await tokenIn.balanceOf(treasuryAddr);

    await registry.execute(positionId);

    const balAfter = await tokenIn.balanceOf(treasuryAddr);
    // Fee = 100 USDC * 50 / 10000 = 0.5 USDC = 500000
    expect(balAfter - balBefore).to.equal(ethers.parseUnits("0.5", 6));
  });

  it("should emit SwapExecuted event", async () => {
    const { registry, positionId } = await createTestPosition();
    await expect(registry.execute(positionId))
      .to.emit(registry, "SwapExecuted");
  });

  it("should deactivate when executionsLeft hits 0", async () => {
    const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
    // Create position with exactly 1 execution
    const deposit = ethers.parseUnits("100", 6);
    await tokenIn.connect(user1).approve(await registry.getAddress(), deposit);
    await registry.connect(user1).createPosition(
      await tokenIn.getAddress(),
      await tokenOut.getAddress(),
      ethers.parseUnits("100", 6),
      ONE_DAY,
      50,
      deposit,
      { value: ethers.parseEther("0.5") }
    );

    await registry.execute(0);
    const pos = await registry.getPosition(0);
    expect(pos.active).to.be.false;
    expect(pos.executionsLeft).to.equal(0);
  });

  it("should revert on inactive position", async () => {
    const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
    const deposit = ethers.parseUnits("100", 6);
    await tokenIn.connect(user1).approve(await registry.getAddress(), deposit);
    await registry.connect(user1).createPosition(
      await tokenIn.getAddress(),
      await tokenOut.getAddress(),
      ethers.parseUnits("100", 6),
      ONE_DAY,
      50,
      deposit,
      { value: ethers.parseEther("0.5") }
    );
    await registry.execute(0); // exhausts position

    await expect(registry.execute(0)).to.be.revertedWith("Position not active");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx hardhat test`
Expected: FAIL — "Not implemented"

**Step 3: Implement execute**

Replace the `execute` placeholder in `contracts/DCARegistry.sol`:

```solidity
function execute(uint256 positionId) external whenNotPaused nonReentrant {
    DCAPosition storage pos = _positions[positionId];
    require(pos.active, "Position not active");
    require(pos.executionsLeft > 0, "No executions left");
    require(pos.tokenInBalance >= pos.amountPerSwap, "Insufficient tokenIn");

    // Calculate and transfer fee
    uint256 feeAmount = DCALib.calculateFee(pos.amountPerSwap, feeBps);
    uint256 netAmount = pos.amountPerSwap - feeAmount;

    if (feeAmount > 0) {
        IERC20Upgradeable(pos.tokenIn).safeTransfer(treasury, feeAmount);
    }

    // Attempt swap
    try this._executeSwapExternal(pos.tokenIn, pos.tokenOut, netAmount, pos.slippageBps)
        returns (uint256 amountOut)
    {
        pos.tokenOutAccum += amountOut;
        pos.tokenInBalance -= pos.amountPerSwap;
        pos.executionsLeft--;
        pos.executionsDone++;

        emit SwapExecuted(positionId, pos.amountPerSwap, amountOut, feeAmount, pos.executionsLeft);
    } catch {
        // Swap failed — refund fee, don't deduct, emit failure
        if (feeAmount > 0) {
            // Fee was already transferred, but swap failed. Since we use safeTransfer
            // to treasury, we need to get it back. Simpler: don't transfer fee until
            // swap succeeds. Refactored below.
        }
        emit SwapFailed(positionId, pos.executionsLeft);
    }

    // Deduct gas cost estimate
    if (pos.hbarBalance >= estimatedGasPerExec) {
        pos.hbarBalance -= estimatedGasPerExec;
    }

    // Schedule next or deactivate
    if (pos.executionsLeft > 0 && pos.hbarBalance >= estimatedGasPerExec) {
        // _scheduleNext(positionId); — added in Phase 4
    } else if (pos.executionsLeft == 0) {
        pos.active = false;
        emit PositionDeactivated(positionId, "executions exhausted");
    }
}

// External wrapper for try/catch (Solidity requires external call for try/catch)
function _executeSwapExternal(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint16 slippageBps
) external returns (uint256) {
    require(msg.sender == address(this), "Only self");
    return _executeSwap(tokenIn, tokenOut, amountIn, slippageBps);
}

function _executeSwap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint16 slippageBps
) internal returns (uint256) {
    address[] memory path = new address[](2);
    path[0] = tokenIn;
    path[1] = tokenOut;

    IERC20Upgradeable(tokenIn).approve(dexRouter, amountIn);

    uint256[] memory amountsOut = IUniswapV2Router02(dexRouter).getAmountsOut(amountIn, path);
    uint256 amountOutMin = (amountsOut[1] * (10000 - slippageBps)) / 10000;

    uint256[] memory results = IUniswapV2Router02(dexRouter).swapExactTokensForTokens(
        amountIn, amountOutMin, path, address(this), block.timestamp + 300
    );

    return results[results.length - 1];
}
```

**Note:** The fee transfer should happen AFTER a successful swap to avoid the refund problem. Refactor execute to move fee transfer after the try/catch success block.

**Step 4: Run tests**

Run: `npx hardhat test`
Expected: All pass

**Step 5: Commit**

```bash
git add contracts/DCARegistry.sol test/DCARegistry.test.ts
git commit -m "feat: implement execute with swap, fee deduction, and deactivation"
```

---

### Task 11: Implement stop, withdraw, topUp

**Files:**
- Modify: `contracts/DCARegistry.sol` (replace remaining placeholders)
- Modify: `test/DCARegistry.test.ts` (add tests for each)

**Step 1: Write failing tests**

Add `describe("stop")`, `describe("withdraw")`, `describe("topUp")` blocks:

- **stop**: Should set active=false, only owner, revert if already stopped
- **withdraw**: Should return tokenIn + tokenOut + HBAR, set active=false, only owner
- **topUp**: Should add more tokenIn and HBAR, recalculate executionsLeft, only owner, only active positions

**Step 2: Run tests — expect FAIL**

**Step 3: Implement stop**

```solidity
function stop(uint256 positionId) external whenNotPaused nonReentrant {
    DCAPosition storage pos = _positions[positionId];
    require(pos.owner == msg.sender, "Not owner");
    require(pos.active, "Already stopped");

    pos.active = false;

    // Cancel scheduled execution if exists
    // deleteSchedule(pos.currentSchedule); — added in Phase 4

    emit PositionStopped(positionId);
}
```

**Step 4: Implement withdraw**

```solidity
function withdraw(uint256 positionId) external whenNotPaused nonReentrant {
    DCAPosition storage pos = _positions[positionId];
    require(pos.owner == msg.sender, "Not owner");

    if (pos.active) {
        pos.active = false;
        // Cancel scheduled execution if exists
        // deleteSchedule(pos.currentSchedule); — added in Phase 4
    }

    uint256 tokenInReturn = pos.tokenInBalance;
    uint256 tokenOutReturn = pos.tokenOutAccum;
    uint256 hbarReturn = pos.hbarBalance;

    pos.tokenInBalance = 0;
    pos.tokenOutAccum = 0;
    pos.hbarBalance = 0;

    if (tokenInReturn > 0) {
        IERC20Upgradeable(pos.tokenIn).safeTransfer(msg.sender, tokenInReturn);
    }
    if (tokenOutReturn > 0) {
        IERC20Upgradeable(pos.tokenOut).safeTransfer(msg.sender, tokenOutReturn);
    }
    if (hbarReturn > 0) {
        (bool sent, ) = msg.sender.call{value: hbarReturn}("");
        require(sent, "HBAR transfer failed");
    }

    emit Withdrawal(positionId, tokenInReturn, tokenOutReturn, hbarReturn);
}
```

**Step 5: Implement topUp**

```solidity
function topUp(
    uint256 positionId,
    uint256 extraTokenIn
) external payable whenNotPaused nonReentrant {
    DCAPosition storage pos = _positions[positionId];
    require(pos.owner == msg.sender, "Not owner");
    require(pos.active, "Position not active");

    if (extraTokenIn > 0) {
        IERC20Upgradeable(pos.tokenIn).safeTransferFrom(msg.sender, address(this), extraTokenIn);
        pos.tokenInBalance += extraTokenIn;
    }

    if (msg.value > 0) {
        pos.hbarBalance += msg.value;
    }

    // Recalculate executions
    uint256 newMaxExec = DCALib.calculateMaxExecutions(
        pos.tokenInBalance, pos.amountPerSwap, pos.hbarBalance, estimatedGasPerExec
    );
    pos.executionsLeft = newMaxExec - pos.executionsDone;
    pos.maxExecutions = newMaxExec;

    emit TopUp(positionId, extraTokenIn, msg.value, pos.executionsLeft);
}
```

**Step 6: Run tests**

Run: `npx hardhat test`
Expected: All pass

**Step 7: Commit**

```bash
git add contracts/DCARegistry.sol test/DCARegistry.test.ts
git commit -m "feat: implement stop, withdraw, and topUp"
```

---

## Phase 4: HIP-1215 Integration

### Task 12: Add HIP-1215 scheduling to DCARegistry

**Files:**
- Modify: `contracts/DCARegistry.sol`

**Note:** HIP-1215 schedule calls cannot be tested on local Hardhat. This phase adds the scheduling code that will be tested on Hedera testnet. Local tests continue to work without scheduling (the schedule calls will be no-ops in local environment).

**Step 1: Import HederaScheduleService and add scheduling functions**

Add to DCARegistry.sol imports:

```solidity
import "@hashgraph/hedera-smart-contracts/contracts/system-contracts/hedera-schedule-service/HederaScheduleService.sol";
```

Update contract inheritance:

```solidity
contract DCARegistry is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    HederaScheduleService,
    IDCARegistry
```

Add internal scheduling functions:

```solidity
function _scheduleNext(uint256 positionId) internal {
    DCAPosition storage pos = _positions[positionId];

    bytes memory callData = abi.encodeWithSelector(this.execute.selector, positionId);
    uint256 targetTime = block.timestamp + pos.interval;
    uint256 executeAt = _findAvailableSecond(targetTime, SCHEDULED_CALL_GAS_LIMIT, 5);

    (int64 rc, address scheduleAddr) = scheduleCall(
        address(this),
        executeAt,
        SCHEDULED_CALL_GAS_LIMIT,
        0,
        callData
    );

    if (rc == 22) {
        pos.currentSchedule = scheduleAddr;
    } else {
        pos.active = false;
        emit PositionDeactivated(positionId, "scheduling failed");
    }
}

function _cancelSchedule(address scheduleAddr) internal {
    if (scheduleAddr != address(0)) {
        deleteSchedule(scheduleAddr);
    }
}

function _findAvailableSecond(
    uint256 target,
    uint256 gasLimit,
    uint256 maxProbes
) internal view returns (uint256) {
    if (hasScheduleCapacity(target, gasLimit)) return target;

    bytes32 seed = block.prevrandao;
    for (uint256 i = 0; i < maxProbes; i++) {
        uint256 baseDelay = 1 << i;
        bytes32 h = keccak256(abi.encodePacked(seed, i));
        uint16 r = uint16(uint256(h));
        uint256 jitter = uint256(r) % baseDelay;
        uint256 candidate = target + baseDelay + jitter;
        if (hasScheduleCapacity(candidate, gasLimit)) return candidate;
    }

    // Fallback: just use target + maxProbes seconds
    return target + maxProbes;
}
```

**Step 2: Wire scheduling into createPosition, execute, stop, withdraw**

In `createPosition`, after storing position and emitting event, add:
```solidity
_scheduleNext(positionId);
```

In `execute`, replace the scheduling comment with:
```solidity
if (pos.executionsLeft > 0 && pos.hbarBalance >= estimatedGasPerExec) {
    _scheduleNext(positionId);
} else if (pos.executionsLeft == 0) {
    pos.active = false;
    emit PositionDeactivated(positionId, "executions exhausted");
}
```

In `stop`, replace the cancel comment with:
```solidity
_cancelSchedule(pos.currentSchedule);
pos.currentSchedule = address(0);
```

In `withdraw`, replace the cancel comment with:
```solidity
_cancelSchedule(pos.currentSchedule);
pos.currentSchedule = address(0);
```

**Step 3: Compile**

Run: `npx hardhat compile`
Expected: Compiled successfully (may need to verify import paths for hedera-smart-contracts)

**Step 4: Run existing tests**

Run: `npx hardhat test`
Expected: Tests should still pass on local Hardhat. `scheduleCall` and `hasScheduleCapacity` will likely revert on local network (no system contract at 0x16b), so we may need to wrap scheduling in a try/catch or use a `schedulingEnabled` flag for local testing.

If tests fail, add a boolean flag:
```solidity
bool public schedulingEnabled;

function setSchedulingEnabled(bool _enabled) external onlyOwner {
    schedulingEnabled = _enabled;
}
```

And wrap `_scheduleNext` calls with `if (schedulingEnabled)`.

**Step 5: Commit**

```bash
git add contracts/DCARegistry.sol
git commit -m "feat: integrate HIP-1215 scheduling with retry/jitter"
```

---

## Phase 5: Deploy Scripts

### Task 13: Create deploy and upgrade scripts

**Files:**
- Create: `scripts/deploy.ts`
- Create: `scripts/upgrade.ts`

**Step 1: Write deploy script**

```typescript
import { ethers, upgrades } from "hardhat";
import "dotenv/config";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  const dexRouter = process.env.SAUCERSWAP_ROUTER_TESTNET || "0x0000000000000000000000000000000000004b40"; // 0.0.19264
  const feeBps = parseInt(process.env.FEE_BPS || "50");
  const estimatedGas = ethers.parseEther(process.env.ESTIMATED_GAS_PER_EXEC || "0.5");

  const DCARegistry = await ethers.getContractFactory("DCARegistry");
  const proxy = await upgrades.deployProxy(
    DCARegistry,
    [treasury, dexRouter, feeBps, estimatedGas],
    { kind: "uups" }
  );

  await proxy.waitForDeployment();
  const proxyAddr = await proxy.getAddress();
  const implAddr = await upgrades.erc1967.getImplementationAddress(proxyAddr);

  console.log("Proxy deployed to:", proxyAddr);
  console.log("Implementation:", implAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

**Step 2: Write upgrade script**

```typescript
import { ethers, upgrades } from "hardhat";
import "dotenv/config";

async function main() {
  const proxyAddress = process.env.DCA_REGISTRY_PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("DCA_REGISTRY_PROXY_ADDRESS required");

  const DCARegistryV2 = await ethers.getContractFactory("DCARegistry");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, DCARegistryV2);

  await upgraded.waitForDeployment();
  const implAddr = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("Upgraded. New implementation:", implAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

**Step 3: Commit**

```bash
git add scripts/
git commit -m "feat: add deploy and upgrade scripts for DCARegistry"
```

---

## Phase 6: Backend — DCAService & Server Actions

### Task 14: Create DCA types

**Files:**
- Modify: `types/index.ts`

**Step 1: Add DCA-related types**

Append to `types/index.ts`:

```typescript
// DCA types
export interface DCAPositionOnChain {
  owner: string
  tokenIn: string
  tokenOut: string
  amountPerSwap: bigint
  interval: bigint
  maxExecutions: bigint
  executionsLeft: bigint
  executionsDone: bigint
  tokenInBalance: bigint
  tokenOutAccum: bigint
  hbarBalance: bigint
  slippageBps: number
  active: boolean
  currentSchedule: string
}

export interface DCAPositionSummary {
  positionId: number
  tokenIn: string
  tokenOut: string
  tokenInSymbol: string
  tokenOutSymbol: string
  amountPerSwap: string
  interval: number
  executionsLeft: number
  executionsDone: number
  tokenInBalance: string
  tokenOutAccum: string
  status: 'active' | 'stopped' | 'withdrawn' | 'exhausted'
  createdAt: string
}

export interface CreatePositionParams {
  tokenIn: string       // Token address (EVM)
  tokenOut: string      // Token address (EVM)
  amountPerSwap: string // Human-readable amount (e.g. "100")
  tokenInAmount: string // Total deposit human-readable
  interval: number      // Seconds
  slippageBps: number
  hbarForGas: string    // HBAR amount human-readable
}

export interface DCAExecutionRecord {
  positionId: number
  tokenInSpent: string
  tokenOutReceived: string
  feeAmount: string
  txHash: string
  executedAt: string
}
```

**Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add DCA type definitions"
```

---

### Task 15: Create DCAService

**Files:**
- Create: `lib/services/dca-service.ts`

**Step 1: Implement DCAService**

This service builds and signs Hedera transactions for user-initiated DCA operations using the existing VaultService for KMS signing and LedgerService patterns.

```typescript
import {
  AccountAllowanceApproveTransaction,
  ContractExecuteTransaction,
  ContractCallQuery,
  ContractId,
  TokenId,
  AccountId,
  Hbar,
  Client,
} from "@hashgraph/sdk";
import { vault } from "./vault-service";
import type { CreatePositionParams, DCAPositionOnChain } from "@/types";

const DCA_REGISTRY_ID = process.env.DCA_REGISTRY_CONTRACT_ID || "";
const HEDERA_NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || "testnet";

export class DCAService {
  private buildClient(): Client {
    const client =
      HEDERA_NETWORK === "mainnet"
        ? Client.forMainnet()
        : Client.forTestnet();

    client.setOperator(
      AccountId.fromString(process.env.CUSTODIAL_CREATOR_ACCOUNT_ID!),
      process.env.CUSTODIAL_CREATOR_PRIVATE_KEY!
    );

    return client;
  }

  async createPosition(
    userAccountId: string,
    userVaultKeyId: string,
    params: CreatePositionParams
  ): Promise<{ positionId: number; txHash: string }> {
    const client = this.buildClient();

    try {
      // Step 1: Approve tokenIn to DCARegistry
      const tokenId = TokenId.fromSolidityAddress(params.tokenIn);
      const registryId = ContractId.fromString(DCA_REGISTRY_ID);
      const approveAmount = BigInt(params.tokenInAmount);

      const approveTx = new AccountAllowanceApproveTransaction()
        .approveTokenAllowance(
          tokenId,
          AccountId.fromString(userAccountId),
          AccountId.fromString(DCA_REGISTRY_ID),
          Number(approveAmount)
        )
        .freezeWith(client);

      const approveBytes = approveTx.toBytes();
      const approveSig = await vault.signDigest(userVaultKeyId, approveBytes);
      // Submit with user signature
      // (Implementation depends on how VaultService signature is applied)

      // Step 2: Call createPosition on contract
      // Encode function call using ABI
      const contractTx = new ContractExecuteTransaction()
        .setContractId(registryId)
        .setGas(3_000_000)
        .setPayableAmount(new Hbar(Number(params.hbarForGas)))
        .setFunction(
          "createPosition",
          // ABI encode params — use ContractFunctionParameters
        )
        .freezeWith(client);

      // Sign and submit
      // Parse positionId from receipt/record

      return { positionId: 0, txHash: "" }; // Placeholder — flesh out with actual Hedera SDK calls
    } finally {
      client.close();
    }
  }

  async stopPosition(
    userAccountId: string,
    userVaultKeyId: string,
    positionId: number
  ): Promise<string> {
    const client = this.buildClient();
    try {
      const tx = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(DCA_REGISTRY_ID))
        .setGas(1_000_000)
        .setFunction("stop" /* encode positionId */)
        .freezeWith(client);

      // Sign via KMS and submit
      return ""; // txHash
    } finally {
      client.close();
    }
  }

  async withdrawPosition(
    userAccountId: string,
    userVaultKeyId: string,
    positionId: number
  ): Promise<string> {
    const client = this.buildClient();
    try {
      const tx = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(DCA_REGISTRY_ID))
        .setGas(1_500_000)
        .setFunction("withdraw" /* encode positionId */)
        .freezeWith(client);

      // Sign via KMS and submit
      return ""; // txHash
    } finally {
      client.close();
    }
  }

  async topUpPosition(
    userAccountId: string,
    userVaultKeyId: string,
    positionId: number,
    extraTokenIn: bigint,
    extraHbar: string
  ): Promise<string> {
    const client = this.buildClient();
    try {
      // Approve additional tokenIn if > 0, then call topUp
      return ""; // txHash
    } finally {
      client.close();
    }
  }

  async getPosition(positionId: number): Promise<DCAPositionOnChain | null> {
    const client = this.buildClient();
    try {
      const query = new ContractCallQuery()
        .setContractId(ContractId.fromString(DCA_REGISTRY_ID))
        .setGas(100_000)
        .setFunction("getPosition" /* encode positionId */);

      const result = await query.execute(client);
      // Decode result into DCAPositionOnChain
      return null; // Placeholder
    } finally {
      client.close();
    }
  }
}

export const dcaService = new DCAService();
```

**Note:** The actual KMS signing integration with ContractExecuteTransaction requires encoding the transaction bytes, signing with VaultService, then reconstructing the signed transaction. This follows the same pattern as the existing `ledger-service.ts` but for contract calls. The exact implementation will be refined when testing against testnet.

**Step 2: Commit**

```bash
git add lib/services/dca-service.ts
git commit -m "feat: add DCAService for custodial contract interactions"
```

---

### Task 16: Create Server Actions for DCA

**Files:**
- Create: `app/actions/dca.ts`

**Step 1: Implement server actions**

```typescript
"use server";

import { requireUser } from "@/lib/utils/guards";
import { getAdminSupabase, DB } from "@/lib/supabase/admin";
import { dcaService } from "@/lib/services/dca-service";
import type { CreatePositionParams, DCAPositionSummary } from "@/types";

export async function createDCAPosition(formData: FormData) {
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    // Get user's account info (vault key, account ID)
    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id, vault_key_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, error: "No account found" };

    const params: CreatePositionParams = {
      tokenIn: formData.get("tokenIn") as string,
      tokenOut: formData.get("tokenOut") as string,
      amountPerSwap: formData.get("amountPerSwap") as string,
      tokenInAmount: formData.get("tokenInAmount") as string,
      interval: parseInt(formData.get("interval") as string),
      slippageBps: parseInt(formData.get("slippageBps") as string) || 50,
      hbarForGas: formData.get("hbarForGas") as string,
    };

    const result = await dcaService.createPosition(
      account.account_id,
      account.vault_key_id,
      params
    );

    // Cache in Supabase
    await supabase.from("dca_positions").insert({
      position_id: result.positionId,
      user_id: user.id,
      token_in: params.tokenIn,
      token_out: params.tokenOut,
      amount_per_swap: parseFloat(params.amountPerSwap),
      interval_seconds: params.interval,
      max_executions: Math.floor(
        parseFloat(params.tokenInAmount) / parseFloat(params.amountPerSwap)
      ),
      status: "active",
      tx_hash: result.txHash,
    });

    // Audit log
    await supabase.from(DB.AUDIT_LOG).insert({
      user_id: user.id,
      op_type: "dca_create",
      op_params: params,
      tx_hash: result.txHash,
      result: "success",
    });

    return { success: true, positionId: result.positionId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function stopDCAPosition(positionId: number) {
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id, vault_key_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, error: "No account found" };

    const txHash = await dcaService.stopPosition(
      account.account_id,
      account.vault_key_id,
      positionId
    );

    await supabase
      .from("dca_positions")
      .update({ status: "stopped", updated_at: new Date().toISOString() })
      .eq("position_id", positionId)
      .eq("user_id", user.id);

    return { success: true, txHash };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function withdrawDCAPosition(positionId: number) {
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id, vault_key_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, error: "No account found" };

    const txHash = await dcaService.withdrawPosition(
      account.account_id,
      account.vault_key_id,
      positionId
    );

    await supabase
      .from("dca_positions")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("position_id", positionId)
      .eq("user_id", user.id);

    return { success: true, txHash };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function topUpDCAPosition(
  positionId: number,
  formData: FormData
) {
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id, vault_key_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, error: "No account found" };

    const extraTokenIn = BigInt(formData.get("extraTokenIn") as string);
    const extraHbar = formData.get("extraHbar") as string;

    const txHash = await dcaService.topUpPosition(
      account.account_id,
      account.vault_key_id,
      positionId,
      extraTokenIn,
      extraHbar
    );

    return { success: true, txHash };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchUserPositions(): Promise<{
  positions: DCAPositionSummary[];
  error?: string;
}> {
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("dca_positions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return { positions: [], error: error.message };

    const positions: DCAPositionSummary[] = (data || []).map((row: any) => ({
      positionId: row.position_id,
      tokenIn: row.token_in,
      tokenOut: row.token_out,
      tokenInSymbol: "", // Resolve from token list
      tokenOutSymbol: "",
      amountPerSwap: String(row.amount_per_swap),
      interval: row.interval_seconds,
      executionsLeft: 0, // Fetch from chain for accuracy
      executionsDone: 0,
      tokenInBalance: "0",
      tokenOutAccum: "0",
      status: row.status,
      createdAt: row.created_at,
    }));

    return { positions };
  } catch (err: any) {
    return { positions: [], error: err.message };
  }
}
```

**Step 2: Commit**

```bash
git add app/actions/dca.ts
git commit -m "feat: add DCA server actions for create, stop, withdraw, topUp"
```

---

### Task 17: Create Supabase migration for DCA tables

**Files:**
- Supabase migration via MCP tool

**Step 1: Apply migration**

Use `mcp__supabase__apply_migration` with name `create_dca_tables`:

```sql
CREATE TABLE IF NOT EXISTS dca_positions (
  id SERIAL PRIMARY KEY,
  position_id INTEGER NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  token_in TEXT NOT NULL,
  token_out TEXT NOT NULL,
  amount_per_swap NUMERIC NOT NULL,
  interval_seconds INTEGER NOT NULL,
  max_executions INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'stopped', 'withdrawn', 'exhausted')),
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dca_executions (
  id SERIAL PRIMARY KEY,
  position_id INTEGER NOT NULL,
  token_in_spent NUMERIC NOT NULL,
  token_out_received NUMERIC NOT NULL,
  fee_amount NUMERIC NOT NULL,
  tx_hash TEXT,
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dca_positions_user ON dca_positions(user_id);
CREATE INDEX idx_dca_positions_status ON dca_positions(status);
CREATE INDEX idx_dca_executions_position ON dca_executions(position_id);

-- RLS
ALTER TABLE dca_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dca_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own positions"
  ON dca_positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access positions"
  ON dca_positions FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can read own executions"
  ON dca_executions FOR SELECT
  USING (position_id IN (
    SELECT position_id FROM dca_positions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access executions"
  ON dca_executions FOR ALL
  USING (auth.role() = 'service_role');
```

**Step 2: Update DB constants**

Add to `lib/supabase/admin.ts`:

```typescript
export const DB = {
  ACCOUNTS: 'dca_accounts',
  RATE_LIMITS: 'dca_rate_limits',
  AUDIT_LOG: 'dca_audit_log',
  DCA_POSITIONS: 'dca_positions',
  DCA_EXECUTIONS: 'dca_executions',
} as const
```

**Step 3: Commit**

```bash
git add lib/supabase/admin.ts
git commit -m "feat: add Supabase migration for DCA tables with RLS"
```

---

## Phase 7: Frontend — Store, Hooks & Components

### Task 18: Create DCA Zustand store

**Files:**
- Create: `store/dca-store.ts`

**Step 1: Implement store**

```typescript
import { create } from "zustand";
import type { DCAPositionSummary } from "@/types";

interface DCAState {
  positions: DCAPositionSummary[];
  loading: boolean;
  error: string | null;
  setPositions: (positions: DCAPositionSummary[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updatePositionStatus: (positionId: number, status: string) => void;
  clear: () => void;
}

export const useDCAStore = create<DCAState>((set) => ({
  positions: [],
  loading: false,
  error: null,
  setPositions: (positions) => set({ positions, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  updatePositionStatus: (positionId, status) =>
    set((state) => ({
      positions: state.positions.map((p) =>
        p.positionId === positionId ? { ...p, status: status as any } : p
      ),
    })),
  clear: () => set({ positions: [], loading: false, error: null }),
}));
```

**Step 2: Commit**

```bash
git add store/dca-store.ts
git commit -m "feat: add DCA Zustand store"
```

---

### Task 19: Create useDCA hook

**Files:**
- Create: `hooks/use-dca.ts`

**Step 1: Implement hook**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { useDCAStore } from "@/store/dca-store";
import { useSessionStore } from "@/store/session-store";
import {
  fetchUserPositions,
  stopDCAPosition,
  withdrawDCAPosition,
} from "@/app/actions/dca";

export function useDCA() {
  const { user } = useSessionStore();
  const { positions, loading, error, setPositions, setLoading, setError, updatePositionStatus } =
    useDCAStore();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setPositions([]);
      return;
    }
    setLoading(true);
    fetchUserPositions()
      .then(({ positions: pos, error: err }) => {
        if (err) setError(err);
        else setPositions(pos);
      })
      .finally(() => setLoading(false));
  }, [user, setPositions, setLoading, setError]);

  const stop = useCallback(
    async (positionId: number) => {
      setActionLoading(`stop-${positionId}`);
      try {
        const result = await stopDCAPosition(positionId);
        if (result.success) {
          updatePositionStatus(positionId, "stopped");
        } else {
          setError(result.error || "Failed to stop position");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setActionLoading(null);
      }
    },
    [updatePositionStatus, setError]
  );

  const withdraw = useCallback(
    async (positionId: number) => {
      setActionLoading(`withdraw-${positionId}`);
      try {
        const result = await withdrawDCAPosition(positionId);
        if (result.success) {
          updatePositionStatus(positionId, "withdrawn");
        } else {
          setError(result.error || "Failed to withdraw");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setActionLoading(null);
      }
    },
    [updatePositionStatus, setError]
  );

  return {
    positions,
    loading,
    error,
    actionLoading,
    stop,
    withdraw,
  };
}
```

**Step 2: Commit**

```bash
git add hooks/use-dca.ts
git commit -m "feat: add useDCA hook"
```

---

### Task 20: Create interval-selector component

**Files:**
- Create: `components/dca/interval-selector.tsx`

**Step 1: Implement**

```tsx
"use client";

const INTERVALS = [
  { label: "1h", value: 3600 },
  { label: "4h", value: 14400 },
  { label: "12h", value: 43200 },
  { label: "1d", value: 86400 },
  { label: "1w", value: 604800 },
];

interface IntervalSelectorProps {
  value: number;
  onChange: (value: number) => void;
}

export function IntervalSelector({ value, onChange }: IntervalSelectorProps) {
  return (
    <div className="flex gap-2">
      {INTERVALS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40"
              : "bg-surface-card text-text-muted border border-border-subtle hover:text-text-primary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/dca/interval-selector.tsx
git commit -m "feat: add interval-selector component"
```

---

### Task 21: Create token-selector component

**Files:**
- Create: `components/dca/token-selector.tsx`

**Step 1: Implement**

A simple token selector dropdown. Token list can be hardcoded for MVP and fetched from SaucerSwap API later.

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

// Hardcoded testnet tokens for MVP
const TESTNET_TOKENS: Token[] = [
  { address: "0x0000000000000000000000000000000000003ad2", symbol: "WHBAR", name: "Wrapped HBAR", decimals: 8 },
  { address: "0x0000000000000000000000000000000000001549", symbol: "USDC", name: "USD Coin", decimals: 6 },
  { address: "0x00000000000000000000000000000000000014f3", symbol: "SAUCE", name: "SaucerSwap", decimals: 6 },
];

interface TokenSelectorProps {
  value: string;
  onChange: (address: string) => void;
  exclude?: string;
  label: string;
}

export function TokenSelector({ value, onChange, exclude, label }: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const tokens = TESTNET_TOKENS.filter(
    (t) => t.address !== exclude && t.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const selected = TESTNET_TOKENS.find((t) => t.address === value);

  return (
    <div className="relative">
      <label className="text-xs text-text-muted mb-1 block">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-card border border-border-subtle text-left hover:border-accent-cyan/40 transition-colors"
      >
        <span className={selected ? "text-text-primary" : "text-text-muted"}>
          {selected ? selected.symbol : "Select token"}
        </span>
        <ChevronDown className="w-4 h-4 text-text-muted" />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg bg-surface-card border border-border-subtle shadow-lg">
          <div className="p-2">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-base">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-sm text-text-primary outline-none flex-1"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {tokens.map((token) => (
              <button
                key={token.address}
                type="button"
                onClick={() => {
                  onChange(token.address);
                  setOpen(false);
                  setSearch("");
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-surface-base transition-colors"
              >
                <span className="text-sm font-medium text-text-primary">{token.symbol}</span>
                <span className="text-xs text-text-muted ml-2">{token.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/dca/token-selector.tsx
git commit -m "feat: add token-selector component"
```

---

### Task 22: Create position-card component

**Files:**
- Create: `components/dca/position-card.tsx`

**Step 1: Implement**

```tsx
"use client";

import { ArrowRight, Pause, Wallet } from "lucide-react";
import type { DCAPositionSummary } from "@/types";

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "text-emerald-400" },
  stopped: { label: "Stopped", color: "text-amber-400" },
  withdrawn: { label: "Withdrawn", color: "text-text-muted" },
  exhausted: { label: "Completed", color: "text-accent-cyan" },
};

const INTERVAL_LABELS: Record<number, string> = {
  3600: "Every 1h",
  14400: "Every 4h",
  43200: "Every 12h",
  86400: "Every 1d",
  604800: "Every 1w",
};

interface PositionCardProps {
  position: DCAPositionSummary;
  onStop?: (id: number) => void;
  onWithdraw?: (id: number) => void;
  actionLoading?: string | null;
}

export function PositionCard({ position, onStop, onWithdraw, actionLoading }: PositionCardProps) {
  const status = STATUS_STYLES[position.status] || STATUS_STYLES.active;
  const intervalLabel = INTERVAL_LABELS[position.interval] || `Every ${position.interval}s`;
  const progress =
    position.executionsDone + position.executionsLeft > 0
      ? (position.executionsDone / (position.executionsDone + position.executionsLeft)) * 100
      : 0;

  return (
    <div className="card-surface p-4 rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">
            {position.tokenInSymbol || "???"}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-sm font-semibold text-text-primary">
            {position.tokenOutSymbol || "???"}
          </span>
        </div>
        <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <span className="text-text-muted">Per swap</span>
          <p className="text-text-primary font-medium">{position.amountPerSwap} {position.tokenInSymbol}</p>
        </div>
        <div>
          <span className="text-text-muted">Frequency</span>
          <p className="text-text-primary font-medium">{intervalLabel}</p>
        </div>
        <div>
          <span className="text-text-muted">Executed</span>
          <p className="text-text-primary font-medium">
            {position.executionsDone} / {position.executionsDone + position.executionsLeft}
          </p>
        </div>
        <div>
          <span className="text-text-muted">Accumulated</span>
          <p className="text-accent-cyan font-medium">{position.tokenOutAccum} {position.tokenOutSymbol}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 rounded-full bg-surface-base mb-3">
        <div
          className="h-full rounded-full bg-accent-cyan transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Actions */}
      {position.status === "active" && (
        <div className="flex gap-2">
          <button
            onClick={() => onStop?.(position.positionId)}
            disabled={actionLoading === `stop-${position.positionId}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-surface-base text-text-muted hover:text-amber-400 transition-colors"
          >
            <Pause className="w-3.5 h-3.5" />
            Stop
          </button>
          <button
            onClick={() => onWithdraw?.(position.positionId)}
            disabled={actionLoading === `withdraw-${position.positionId}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-surface-base text-text-muted hover:text-accent-cyan transition-colors"
          >
            <Wallet className="w-3.5 h-3.5" />
            Withdraw
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/dca/position-card.tsx
git commit -m "feat: add position-card component"
```

---

### Task 23: Create position-list component

**Files:**
- Create: `components/dca/position-list.tsx`

**Step 1: Implement**

```tsx
"use client";

import { useDCA } from "@/hooks/use-dca";
import { PositionCard } from "./position-card";
import { Plus, TrendingUp } from "lucide-react";
import Link from "next/link";

export function PositionList() {
  const { positions, loading, error, actionLoading, stop, withdraw } = useDCA();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="text-center py-12">
        <TrendingUp className="w-10 h-10 text-text-muted mx-auto mb-3" />
        <p className="text-text-muted text-sm mb-4">No DCA positions yet</p>
        <Link
          href="/dca/new"
          className="inline-flex items-center gap-2 btn-accent px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Create Position
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {positions.map((pos) => (
        <PositionCard
          key={pos.positionId}
          position={pos}
          onStop={stop}
          onWithdraw={withdraw}
          actionLoading={actionLoading}
        />
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/dca/position-list.tsx
git commit -m "feat: add position-list component"
```

---

### Task 24: Create create-position-form component

**Files:**
- Create: `components/dca/create-position-form.tsx`

**Step 1: Implement**

```tsx
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TokenSelector } from "./token-selector";
import { IntervalSelector } from "./interval-selector";
import { createDCAPosition } from "@/app/actions/dca";
import { Calculator, Zap } from "lucide-react";

export function CreatePositionForm() {
  const router = useRouter();
  const [tokenIn, setTokenIn] = useState("");
  const [tokenOut, setTokenOut] = useState("");
  const [totalDeposit, setTotalDeposit] = useState("");
  const [amountPerSwap, setAmountPerSwap] = useState("");
  const [interval, setInterval] = useState(86400);
  const [slippageBps, setSlippageBps] = useState(50);
  const [hbarForGas, setHbarForGas] = useState("5");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    const total = parseFloat(totalDeposit) || 0;
    const perSwap = parseFloat(amountPerSwap) || 0;
    if (total <= 0 || perSwap <= 0 || perSwap > total) return null;

    const numSwaps = Math.floor(total / perSwap);
    const durationSeconds = numSwaps * interval;
    const days = Math.floor(durationSeconds / 86400);
    const feePerSwap = perSwap * 0.005; // 0.5%

    return { numSwaps, days, feePerSwap };
  }, [totalDeposit, amountPerSwap, interval]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenIn || !tokenOut || !totalDeposit || !amountPerSwap) return;

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("tokenIn", tokenIn);
    formData.set("tokenOut", tokenOut);
    formData.set("tokenInAmount", totalDeposit);
    formData.set("amountPerSwap", amountPerSwap);
    formData.set("interval", String(interval));
    formData.set("slippageBps", String(slippageBps));
    formData.set("hbarForGas", hbarForGas);

    try {
      const result = await createDCAPosition(formData);
      if (result.success) {
        router.push(`/dca/${result.positionId}`);
      } else {
        setError(result.error || "Failed to create position");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Token selection */}
      <div className="grid grid-cols-2 gap-3">
        <TokenSelector label="Sell" value={tokenIn} onChange={setTokenIn} exclude={tokenOut} />
        <TokenSelector label="Buy" value={tokenOut} onChange={setTokenOut} exclude={tokenIn} />
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-text-muted mb-1 block">Total deposit</label>
          <input
            type="number"
            step="any"
            value={totalDeposit}
            onChange={(e) => setTotalDeposit(e.target.value)}
            placeholder="1000"
            className="w-full px-3 py-2.5 rounded-lg bg-surface-card border border-border-subtle text-text-primary text-sm outline-none focus:border-accent-cyan/40"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">Per swap</label>
          <input
            type="number"
            step="any"
            value={amountPerSwap}
            onChange={(e) => setAmountPerSwap(e.target.value)}
            placeholder="100"
            className="w-full px-3 py-2.5 rounded-lg bg-surface-card border border-border-subtle text-text-primary text-sm outline-none focus:border-accent-cyan/40"
          />
        </div>
      </div>

      {/* Interval */}
      <div>
        <label className="text-xs text-text-muted mb-1 block">Frequency</label>
        <IntervalSelector value={interval} onChange={setInterval} />
      </div>

      {/* Slippage */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-text-muted mb-1 block">Slippage tolerance</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="1"
              min="1"
              max="5000"
              value={slippageBps}
              onChange={(e) => setSlippageBps(parseInt(e.target.value) || 50)}
              className="w-20 px-3 py-2.5 rounded-lg bg-surface-card border border-border-subtle text-text-primary text-sm outline-none focus:border-accent-cyan/40"
            />
            <span className="text-xs text-text-muted">bps ({(slippageBps / 100).toFixed(1)}%)</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-text-muted mb-1 block">HBAR for gas</label>
          <input
            type="number"
            step="any"
            value={hbarForGas}
            onChange={(e) => setHbarForGas(e.target.value)}
            placeholder="5"
            className="w-full px-3 py-2.5 rounded-lg bg-surface-card border border-border-subtle text-text-primary text-sm outline-none focus:border-accent-cyan/40"
          />
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="card-surface p-4 rounded-xl space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-4 h-4 text-accent-cyan" />
            <span className="text-sm font-medium text-text-primary">Preview</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-text-muted">Swaps</span>
              <p className="text-text-primary font-medium">{preview.numSwaps}</p>
            </div>
            <div>
              <span className="text-text-muted">Duration</span>
              <p className="text-text-primary font-medium">~{preview.days} days</p>
            </div>
            <div>
              <span className="text-text-muted">Fee/swap</span>
              <p className="text-text-primary font-medium">{preview.feePerSwap.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !tokenIn || !tokenOut || !totalDeposit || !amountPerSwap}
        className="w-full btn-accent py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {submitting ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <>
            <Zap className="w-4 h-4" />
            Start DCA
          </>
        )}
      </button>
    </form>
  );
}
```

**Step 2: Commit**

```bash
git add components/dca/create-position-form.tsx
git commit -m "feat: add create-position-form component"
```

---

### Task 25: Create execution-history and position-detail components

**Files:**
- Create: `components/dca/execution-history.tsx`
- Create: `components/dca/position-detail.tsx`
- Create: `components/dca/top-up-dialog.tsx`

**Step 1: Implement execution-history**

```tsx
"use client";

import type { DCAExecutionRecord } from "@/types";

interface ExecutionHistoryProps {
  executions: DCAExecutionRecord[];
}

export function ExecutionHistory({ executions }: ExecutionHistoryProps) {
  if (executions.length === 0) {
    return <p className="text-text-muted text-sm text-center py-4">No executions yet</p>;
  }

  return (
    <div className="space-y-2">
      {executions.map((exec, i) => (
        <div key={i} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
          <div className="text-xs">
            <p className="text-text-primary font-medium">
              -{exec.tokenInSpent} &rarr; +{exec.tokenOutReceived}
            </p>
            <p className="text-text-muted">Fee: {exec.feeAmount}</p>
          </div>
          <div className="text-xs text-text-muted text-right">
            {new Date(exec.executedAt).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Implement position-detail**

```tsx
"use client";

import { ArrowRight, Square, Wallet, Plus } from "lucide-react";
import { useState } from "react";
import { ExecutionHistory } from "./execution-history";
import { TopUpDialog } from "./top-up-dialog";
import type { DCAPositionSummary, DCAExecutionRecord } from "@/types";

interface PositionDetailProps {
  position: DCAPositionSummary;
  executions: DCAExecutionRecord[];
  onStop: () => void;
  onWithdraw: () => void;
  onTopUp: (formData: FormData) => Promise<void>;
  actionLoading: boolean;
}

export function PositionDetail({
  position,
  executions,
  onStop,
  onWithdraw,
  onTopUp,
  actionLoading,
}: PositionDetailProps) {
  const [showTopUp, setShowTopUp] = useState(false);
  const totalExec = position.executionsDone + position.executionsLeft;
  const progress = totalExec > 0 ? (position.executionsDone / totalExec) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card-surface p-5 rounded-xl">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-lg font-semibold text-text-primary">
            {position.tokenInSymbol}
          </span>
          <ArrowRight className="w-5 h-5 text-text-muted" />
          <span className="text-lg font-semibold text-text-primary">
            {position.tokenOutSymbol}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <span className="text-xs text-text-muted">Remaining balance</span>
            <p className="text-text-primary font-medium">{position.tokenInBalance} {position.tokenInSymbol}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Accumulated</span>
            <p className="text-accent-cyan font-medium">{position.tokenOutAccum} {position.tokenOutSymbol}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Progress</span>
            <p className="text-text-primary font-medium">{position.executionsDone} / {totalExec} swaps</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Per swap</span>
            <p className="text-text-primary font-medium">{position.amountPerSwap} {position.tokenInSymbol}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full bg-surface-base">
          <div className="h-full rounded-full bg-accent-cyan transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Actions */}
      {position.status === "active" && (
        <div className="flex gap-2">
          <button
            onClick={onStop}
            disabled={actionLoading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-surface-card border border-border-subtle text-text-muted hover:text-amber-400 transition-colors"
          >
            <Square className="w-4 h-4" /> Stop
          </button>
          <button
            onClick={() => setShowTopUp(true)}
            disabled={actionLoading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-surface-card border border-border-subtle text-text-muted hover:text-emerald-400 transition-colors"
          >
            <Plus className="w-4 h-4" /> Top Up
          </button>
          <button
            onClick={onWithdraw}
            disabled={actionLoading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-surface-card border border-border-subtle text-text-muted hover:text-accent-cyan transition-colors"
          >
            <Wallet className="w-4 h-4" /> Withdraw
          </button>
        </div>
      )}

      {/* Execution history */}
      <div className="card-surface p-5 rounded-xl">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Execution History</h3>
        <ExecutionHistory executions={executions} />
      </div>

      {showTopUp && (
        <TopUpDialog
          onClose={() => setShowTopUp(false)}
          onSubmit={async (fd) => {
            await onTopUp(fd);
            setShowTopUp(false);
          }}
          tokenInSymbol={position.tokenInSymbol}
        />
      )}
    </div>
  );
}
```

**Step 3: Implement top-up-dialog**

```tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface TopUpDialogProps {
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<void>;
  tokenInSymbol: string;
}

export function TopUpDialog({ onClose, onSubmit, tokenInSymbol }: TopUpDialogProps) {
  const [extraTokenIn, setExtraTokenIn] = useState("");
  const [extraHbar, setExtraHbar] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData();
    fd.set("extraTokenIn", extraTokenIn);
    fd.set("extraHbar", extraHbar);
    await onSubmit(fd);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card-surface p-5 rounded-xl w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Top Up Position</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">Extra {tokenInSymbol}</label>
            <input
              type="number"
              step="any"
              value={extraTokenIn}
              onChange={(e) => setExtraTokenIn(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-base border border-border-subtle text-text-primary text-sm outline-none focus:border-accent-cyan/40"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Extra HBAR (for gas)</label>
            <input
              type="number"
              step="any"
              value={extraHbar}
              onChange={(e) => setExtraHbar(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-base border border-border-subtle text-text-primary text-sm outline-none focus:border-accent-cyan/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-accent py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Processing..." : "Confirm Top Up"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add components/dca/execution-history.tsx components/dca/position-detail.tsx components/dca/top-up-dialog.tsx
git commit -m "feat: add execution-history, position-detail, and top-up-dialog components"
```

---

## Phase 8: Frontend — Pages & Navigation

### Task 26: Create DCA pages

**Files:**
- Create: `app/(dashboard)/dca/page.tsx`
- Create: `app/(dashboard)/dca/new/page.tsx`
- Create: `app/(dashboard)/dca/[positionId]/page.tsx`

**Step 1: DCA list page**

```tsx
import { PositionList } from "@/components/dca/position-list";
import { Plus } from "lucide-react";
import Link from "next/link";

export default function DCAPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">DCA Positions</h1>
        <Link
          href="/dca/new"
          className="inline-flex items-center gap-1.5 btn-accent px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New
        </Link>
      </div>
      <PositionList />
    </div>
  );
}
```

**Step 2: Create new position page**

```tsx
import { CreatePositionForm } from "@/components/dca/create-position-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewDCAPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dca" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">Create DCA Position</h1>
      </div>
      <CreatePositionForm />
    </div>
  );
}
```

**Step 3: Position detail page**

```tsx
"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PositionDetail } from "@/components/dca/position-detail";
import {
  stopDCAPosition,
  withdrawDCAPosition,
  topUpDCAPosition,
} from "@/app/actions/dca";
import type { DCAPositionSummary, DCAExecutionRecord } from "@/types";

export default function PositionDetailPage() {
  const { positionId } = useParams<{ positionId: string }>();
  const [position, setPosition] = useState<DCAPositionSummary | null>(null);
  const [executions, setExecutions] = useState<DCAExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    // Fetch position data — from Supabase cache or contract read
    // For now, placeholder
    setLoading(false);
  }, [positionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
      </div>
    );
  }

  if (!position) {
    return <p className="text-text-muted text-center py-8">Position not found</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dca" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">Position #{positionId}</h1>
      </div>
      <PositionDetail
        position={position}
        executions={executions}
        onStop={async () => {
          setActionLoading(true);
          await stopDCAPosition(parseInt(positionId));
          setPosition((p) => p ? { ...p, status: "stopped" } : null);
          setActionLoading(false);
        }}
        onWithdraw={async () => {
          setActionLoading(true);
          await withdrawDCAPosition(parseInt(positionId));
          setPosition((p) => p ? { ...p, status: "withdrawn" } : null);
          setActionLoading(false);
        }}
        onTopUp={async (fd) => {
          setActionLoading(true);
          await topUpDCAPosition(parseInt(positionId), fd);
          setActionLoading(false);
        }}
        actionLoading={actionLoading}
      />
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add app/\(dashboard\)/dca/
git commit -m "feat: add DCA pages — list, create, and detail"
```

---

### Task 27: Update navigation

**Files:**
- Modify: `components/nav-bar.tsx`

**Step 1: Add DCA link to navigation**

Add a "DCA" link alongside the existing Dashboard link in the NavBar component. Look at the existing NavBar structure and add:

```tsx
<Link href="/dca" className="...existing link styles...">
  DCA
</Link>
```

**Step 2: Commit**

```bash
git add components/nav-bar.tsx
git commit -m "feat: add DCA link to navigation"
```

---

### Task 28: Update dashboard overview with DCA summary

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Step 1: Add a DCA positions summary section**

Below the existing AccountCard, add a compact summary of active DCA positions with a "View All" link to `/dca`.

```tsx
import { PositionList } from "@/components/dca/position-list";
// ... existing imports

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <AccountCard />
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">DCA Positions</h2>
          <Link href="/dca" className="text-xs text-accent-cyan hover:underline">View all</Link>
        </div>
        <PositionList />
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: add DCA summary to dashboard"
```

---

## Phase 9: Testnet Integration

### Task 29: Deploy to Hedera testnet and verify

**Step 1: Set environment variables**

Add to `.env.local`:
```
HEDERA_OPERATOR_ID=0.0.XXXXX
HEDERA_OPERATOR_KEY=302e...
TREASURY_ADDRESS=<your testnet address>
SAUCERSWAP_ROUTER_TESTNET=0.0.19264
ESTIMATED_GAS_PER_EXEC=500000000
FEE_BPS=50
```

**Step 2: Deploy**

Run: `npx hardhat run scripts/deploy.ts --network hederaTestnet`
Expected: Proxy and implementation addresses printed

**Step 3: Record addresses**

Add to `.env.local`:
```
DCA_REGISTRY_PROXY_ADDRESS=<proxy address>
DCA_REGISTRY_CONTRACT_ID=<0.0.XXXX format>
```

**Step 4: Test basic operations manually**

Use Hardhat console or a test script to:
1. Create a position with testnet tokens
2. Verify HIP-1215 schedule was created
3. Wait for schedule execution
4. Check position state was updated

**Step 5: Commit**

```bash
git commit -m "chore: record testnet deployment addresses"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1 | Hardhat setup in monorepo |
| 2 | 2-5 | Interfaces & mocks (IUniswapV2Router02, IDCARegistry, MockERC20, MockDEXRouter) |
| 3 | 6-11 | DCARegistry core: DCALib, storage/init, createPosition, execute, stop/withdraw/topUp |
| 4 | 12 | HIP-1215 scheduling integration |
| 5 | 13 | Deploy & upgrade scripts |
| 6 | 14-17 | Backend: types, DCAService, server actions, Supabase migration |
| 7 | 18-25 | Frontend: store, hooks, all components |
| 8 | 26-28 | Pages, routing, navigation |
| 9 | 29 | Testnet deployment and verification |
