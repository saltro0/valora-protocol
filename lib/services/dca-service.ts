import {
  AccountAllowanceApproveTransaction,
  AccountUpdateTransaction,
  TokenAssociateTransaction,
  ContractExecuteTransaction,
  ContractCallQuery,
  ContractFunctionParameters,
  ContractId,
  TokenId,
  AccountId,
  Hbar,
  Client,
  TransactionId,
  PublicKey,
  TransactionRecordQuery,
  Transaction,
  TransactionReceipt,
  Status,
  PrivateKey,
} from "@hashgraph/sdk";
import { vault } from "./vault-service";
import { compressPublicKey } from "@/lib/utils/crypto";
import { WHBAR_ADDRESS, WHBAR_WRAPPER_ADDRESS } from "@/lib/constants/tokens";
import type { CreatePositionParams, DCAPositionOnChain } from "@/types";

const DCA_REGISTRY_ID = process.env.DCA_REGISTRY_CONTRACT_ID || "";
const DCA_SCHEDULER_ID = process.env.DCA_SCHEDULER_CONTRACT_ID || "";
const HEDERA_NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || "testnet";

function toBigInt(bn: { toString(): string }): bigint {
  return BigInt(bn.toString());
}

export class DCAService {
  private buildClient(): Client {
    const client =
      HEDERA_NETWORK === "mainnet"
        ? Client.forMainnet()
        : Client.forTestnet();

    client.setOperator(
      AccountId.fromString(process.env.CUSTODIAL_CREATOR_ACCOUNT_ID!),
      PrivateKey.fromStringECDSA(process.env.CUSTODIAL_CREATOR_PRIVATE_KEY!)
    );

    return client;
  }

  private async signAndSubmit(
    tx: Transaction,
    userAccountId: string,
    userVaultKeyId: string,
    client: Client
  ): Promise<{ txHash: string; receipt: TransactionReceipt }> {
    const publicKeyHex = await vault.retrievePublicKey(userVaultKeyId);
    const rawKey = Buffer.from(publicKeyHex, "hex");
    const compressed = compressPublicKey(rawKey);
    const publicKey = PublicKey.fromBytesECDSA(compressed);

    tx.setTransactionId(TransactionId.generate(AccountId.fromString(userAccountId)));
    tx.freezeWith(client);

    await tx.signWith(publicKey, async (bytes: Uint8Array) => {
      const result = await vault.signDigest(userVaultKeyId, bytes);
      return result.signature;
    });

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    return { txHash: response.transactionId.toString(), receipt };
  }

  /**
   * Rotate the Hedera account key.
   * Signs the AccountUpdateTransaction with BOTH old and new KMS keys.
   */
  async rotateAccountKey(
    userAccountId: string,
    oldVaultKeyId: string,
    oldPublicKeyHex: string,
    newVaultKeyId: string,
    newPublicKeyHex: string
  ): Promise<string> {
    const client = this.buildClient();

    try {
      const payer = AccountId.fromString(userAccountId);

      // Compress new public key for Hedera (65-byte → 33-byte)
      const newRawKey = Buffer.from(newPublicKeyHex, "hex");
      const newCompressed = compressPublicKey(newRawKey);
      const newPublicKey = PublicKey.fromBytesECDSA(newCompressed);

      // Build AccountUpdateTransaction with new key
      const tx = new AccountUpdateTransaction()
        .setAccountId(payer)
        .setKey(newPublicKey)
        .setTransactionId(TransactionId.generate(payer))
        .freezeWith(client);

      // Extract body bytes for manual signing
      const bodyBytes = (tx as any)._signedTransactions.list[0].bodyBytes;
      if (!bodyBytes) throw new Error("Failed to extract transaction body bytes");

      // Sign with OLD key
      const oldRawKey = Buffer.from(oldPublicKeyHex, "hex");
      const oldCompressed = compressPublicKey(oldRawKey);
      const oldPublicKey = PublicKey.fromBytesECDSA(oldCompressed);
      const oldSig = await vault.signDigest(oldVaultKeyId, bodyBytes);
      tx.addSignature(oldPublicKey, oldSig.signature);

      // Sign with NEW key (required by Hedera for key changes)
      const newSig = await vault.signDigest(newVaultKeyId, bodyBytes);
      tx.addSignature(newPublicKey, newSig.signature);

      // Execute
      const response = await tx.execute(client);
      const receipt = await response.getReceipt(client);

      if (receipt.status.toString() !== "SUCCESS") {
        throw new Error(`Key rotation failed: ${receipt.status.toString()}`);
      }

      return response.transactionId.toString();
    } finally {
      client.close();
    }
  }

  private async getAssociatedTokens(userAccountId: string): Promise<Set<string>> {
    const base = HEDERA_NETWORK === "mainnet"
      ? "https://mainnet.mirrornode.hedera.com"
      : "https://testnet.mirrornode.hedera.com";

    const res = await fetch(`${base}/api/v1/accounts/${userAccountId}/tokens`);
    if (!res.ok) return new Set();

    const data = await res.json();
    const set = new Set<string>();
    for (const t of data.tokens ?? []) {
      const parts = t.token_id?.split(".") ?? [];
      const num = parseInt(parts[2] ?? "0");
      const evmAddr = "0x" + num.toString(16).padStart(40, "0");
      set.add(evmAddr.toLowerCase());
    }
    return set;
  }

  private async associateTokens(
    tokenAddresses: string[],
    userAccountId: string,
    userVaultKeyId: string,
    client: Client
  ): Promise<void> {
    // Check which tokens are already associated to avoid paying fees for no-ops
    const associated = await this.getAssociatedTokens(userAccountId);
    const needed = tokenAddresses.filter(
      (addr) => !associated.has(addr.toLowerCase())
    );

    if (needed.length === 0) return;

    const tokenIds = needed.map((addr) => TokenId.fromSolidityAddress(addr));
    const tx = new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(userAccountId))
      .setTokenIds(tokenIds);

    try {
      await this.signAndSubmit(tx, userAccountId, userVaultKeyId, client);
    } catch (err: any) {
      const alreadyAssociated =
        err?.status?.toString() === "TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT" ||
        err?.message?.includes("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT");
      if (!alreadyAssociated) throw err;
    }
  }

  async wrapHbar(
    userAccountId: string,
    userVaultKeyId: string,
    hbarAmount: number,
    client: Client
  ): Promise<void> {
    const whbarId = ContractId.fromSolidityAddress(WHBAR_WRAPPER_ADDRESS);
    const tx = new ContractExecuteTransaction()
      .setContractId(whbarId)
      .setGas(300_000)
      .setPayableAmount(Hbar.fromTinybars(Math.ceil(hbarAmount * 1e8)))
      .setFunction("deposit");

    await this.signAndSubmit(tx, userAccountId, userVaultKeyId, client);
  }

  async unwrapWhbar(
    userAccountId: string,
    userVaultKeyId: string
  ): Promise<string> {
    const client = this.buildClient();
    try {
      // Get current WHBAR balance from Mirror Node
      const associated = await this.getAssociatedTokens(userAccountId);
      const whbarTokenId = TokenId.fromSolidityAddress(WHBAR_ADDRESS);

      const base = HEDERA_NETWORK === "mainnet"
        ? "https://mainnet.mirrornode.hedera.com"
        : "https://testnet.mirrornode.hedera.com";
      const res = await fetch(`${base}/api/v1/accounts/${userAccountId}/tokens?token.id=${whbarTokenId.toString()}`);
      const data = res.ok ? await res.json() : { tokens: [] };
      const whbarBalance = BigInt(data.tokens?.[0]?.balance ?? "0");

      if (whbarBalance <= 0n) {
        throw new Error("No WHBAR balance to unwrap");
      }

      // Approve WHBAR wrapper contract to pull WHBAR tokens from user
      const approveTx = new AccountAllowanceApproveTransaction()
        .approveTokenAllowance(
          TokenId.fromSolidityAddress(WHBAR_ADDRESS),
          AccountId.fromString(userAccountId),
          AccountId.fromString(ContractId.fromSolidityAddress(WHBAR_WRAPPER_ADDRESS).toString()),
          Number(whbarBalance)
        );
      await this.signAndSubmit(approveTx, userAccountId, userVaultKeyId, client);

      const tx = new ContractExecuteTransaction()
        .setContractId(ContractId.fromSolidityAddress(WHBAR_WRAPPER_ADDRESS))
        .setGas(300_000)
        .setFunction(
          "withdraw",
          new ContractFunctionParameters().addUint256(Number(whbarBalance))
        );

      const { txHash } = await this.signAndSubmit(tx, userAccountId, userVaultKeyId, client);
      return txHash;
    } finally {
      client.close();
    }
  }

  async depositGas(
    userAccountId: string,
    userVaultKeyId: string,
    hbarAmount: string
  ): Promise<{ txHash: string }> {
    const client = this.buildClient();
    try {
      const tx = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(DCA_SCHEDULER_ID))
        .setGas(300_000)
        .setPayableAmount(Hbar.fromTinybars(Math.ceil(Number(hbarAmount) * 1e8)))
        .setFunction("deposit");

      const { txHash } = await this.signAndSubmit(tx, userAccountId, userVaultKeyId, client);
      return { txHash };
    } finally {
      client.close();
    }
  }

  async getSchedulerBalance(userAccountId: string): Promise<bigint> {
    const client = this.buildClient();
    try {
      const evmAddress = AccountId.fromString(userAccountId).toSolidityAddress();
      const query = new ContractCallQuery()
        .setContractId(ContractId.fromString(DCA_SCHEDULER_ID))
        .setGas(100_000)
        .setFunction(
          "userBalance",
          new ContractFunctionParameters().addAddress(evmAddress)
        );

      const result = await query.execute(client);
      return toBigInt(result.getUint256(0));
    } finally {
      client.close();
    }
  }

  async withdrawSchedulerBalance(
    userAccountId: string,
    userVaultKeyId: string
  ): Promise<{ txHash: string }> {
    const client = this.buildClient();
    try {
      const tx = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(DCA_SCHEDULER_ID))
        .setGas(300_000)
        .setFunction("withdrawBalance");

      const { txHash } = await this.signAndSubmit(tx, userAccountId, userVaultKeyId, client);
      return { txHash };
    } finally {
      client.close();
    }
  }

  async createPosition(
    userAccountId: string,
    userVaultKeyId: string,
    params: CreatePositionParams
  ): Promise<{ positionId: number; txHash: string }> {
    const client = this.buildClient();
    try {
      // Step 0: Associate tokens with user account if needed
      await this.associateTokens(
        [params.tokenIn, params.tokenOut],
        userAccountId, userVaultKeyId, client
      );

      // Step 0.5: Wrap HBAR → WHBAR if tokenIn is WHBAR
      if (params.tokenIn.toLowerCase() === WHBAR_ADDRESS.toLowerCase()) {
        const decimals = 8; // WHBAR has 8 decimals
        const hbarAmount = Number(params.tokenInAmount) / 10 ** decimals;
        await this.wrapHbar(userAccountId, userVaultKeyId, hbarAmount, client);
      }

      // Step 1: Approve tokenIn to DCARegistry
      const tokenId = TokenId.fromSolidityAddress(params.tokenIn);
      const approveTx = new AccountAllowanceApproveTransaction()
        .approveTokenAllowance(
          tokenId,
          AccountId.fromString(userAccountId),
          AccountId.fromString(DCA_REGISTRY_ID),
          Number(BigInt(params.tokenInAmount))
        );

      await this.signAndSubmit(approveTx, userAccountId, userVaultKeyId, client);

      // Step 2: Call createPosition on contract
      const contractTx = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(DCA_REGISTRY_ID))
        .setGas(3_000_000)
        .setFunction(
          "createPosition",
          new ContractFunctionParameters()
            .addAddress(params.tokenIn)
            .addAddress(params.tokenOut)
            .addUint256(Number(params.amountPerSwap))
            .addUint256(Number(params.interval))
            .addUint16(params.slippageBps)
            .addUint256(Number(params.tokenInAmount))
        );

      const { txHash } = await this.signAndSubmit(
        contractTx, userAccountId, userVaultKeyId, client
      );

      // Parse positionId from contract execution result
      const record = await new TransactionRecordQuery()
        .setTransactionId(TransactionId.fromString(txHash))
        .execute(client);

      const positionId = record.contractFunctionResult
        ? Number(record.contractFunctionResult.getUint256(0))
        : 0;

      return { positionId, txHash };
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
        .setFunction(
          "stop",
          new ContractFunctionParameters().addUint256(positionId)
        );

      const { txHash } = await this.signAndSubmit(tx, userAccountId, userVaultKeyId, client);
      return txHash;
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
      // Read position before withdraw to check if auto-unwrap is needed
      const pos = await this.getPosition(positionId);
      const tokenInBalance = pos ? pos.tokenInBalance : 0n;
      const isWhbar = pos
        ? pos.tokenIn.toLowerCase() === WHBAR_ADDRESS.toLowerCase()
        : false;

      const tx = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(DCA_REGISTRY_ID))
        .setGas(1_500_000)
        .setFunction(
          "withdraw",
          new ContractFunctionParameters().addUint256(positionId)
        );

      const { txHash } = await this.signAndSubmit(tx, userAccountId, userVaultKeyId, client);

      // Auto-unwrap WHBAR → HBAR if the position used WHBAR as tokenIn
      if (isWhbar && tokenInBalance > 0n) {
        // Approve WHBAR wrapper to pull WHBAR tokens
        const approveUnwrapTx = new AccountAllowanceApproveTransaction()
          .approveTokenAllowance(
            TokenId.fromSolidityAddress(WHBAR_ADDRESS),
            AccountId.fromString(userAccountId),
            AccountId.fromString(ContractId.fromSolidityAddress(WHBAR_WRAPPER_ADDRESS).toString()),
            Number(tokenInBalance)
          );
        await this.signAndSubmit(approveUnwrapTx, userAccountId, userVaultKeyId, client);

        const unwrapTx = new ContractExecuteTransaction()
          .setContractId(ContractId.fromSolidityAddress(WHBAR_WRAPPER_ADDRESS))
          .setGas(300_000)
          .setFunction(
            "withdraw",
            new ContractFunctionParameters().addUint256(Number(tokenInBalance))
          );

        await this.signAndSubmit(unwrapTx, userAccountId, userVaultKeyId, client);
      }

      return txHash;
    } finally {
      client.close();
    }
  }

  async topUpPosition(
    userAccountId: string,
    userVaultKeyId: string,
    positionId: number,
    extraTokenIn: bigint,
    extraGas: string
  ): Promise<string> {
    const client = this.buildClient();
    try {
      // Approve additional tokenIn if needed
      if (extraTokenIn > 0n) {
        const pos = await this.getPosition(positionId);
        if (pos) {
          // Ensure token is associated
          await this.associateTokens(
            [pos.tokenIn], userAccountId, userVaultKeyId, client
          );

          const tokenId = TokenId.fromSolidityAddress(pos.tokenIn);
          const approveTx = new AccountAllowanceApproveTransaction()
            .approveTokenAllowance(
              tokenId,
              AccountId.fromString(userAccountId),
              AccountId.fromString(DCA_REGISTRY_ID),
              Number(extraTokenIn)
            );

          await this.signAndSubmit(approveTx, userAccountId, userVaultKeyId, client);
        }
      }

      const tx = new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(DCA_REGISTRY_ID))
        .setGas(1_500_000)
        .setFunction(
          "topUp",
          new ContractFunctionParameters()
            .addUint256(positionId)
            .addUint256(Number(extraTokenIn))
            .addUint256(Number(extraGas))
        );

      const { txHash } = await this.signAndSubmit(tx, userAccountId, userVaultKeyId, client);
      return txHash;
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
        .setFunction(
          "getPosition",
          new ContractFunctionParameters().addUint256(positionId)
        );

      const result = await query.execute(client);

      // Struct with all fixed-size fields: no ABI offset pointer, fields start at slot 0
      const S = 0;
      // getAddress() returns without 0x prefix — normalize all addresses
      const toAddr = (i: number) => `0x${result.getAddress(i)}`;
      const owner = toAddr(S);

      // Zero owner means position does not exist
      if (!owner || owner === "0x0000000000000000000000000000000000000000") {
        return null;
      }

      return {
        owner,
        tokenIn: toAddr(S + 1),
        tokenOut: toAddr(S + 2),
        amountPerSwap: toBigInt(result.getUint256(S + 3)),
        interval: toBigInt(result.getUint256(S + 4)),
        maxExecutions: toBigInt(result.getUint256(S + 5)),
        executionsLeft: toBigInt(result.getUint256(S + 6)),
        executionsDone: toBigInt(result.getUint256(S + 7)),
        tokenInBalance: toBigInt(result.getUint256(S + 8)),
        tokenOutAccum: toBigInt(result.getUint256(S + 9)),
        hbarBalance: toBigInt(result.getUint256(S + 10)),
        slippageBps: result.getUint256(S + 11).toNumber(),
        active: result.getBool(S + 12),
        currentSchedule: toAddr(S + 13),
        lastExecutedAt: toBigInt(result.getUint256(S + 14)),
        consecutiveFailures: result.getUint256(S + 15).toNumber(),
      };
    } finally {
      client.close();
    }
  }
}

export const dcaService = new DCAService();
