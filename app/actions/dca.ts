"use server";

import { requireUser } from "@/lib/utils/guards";
import { getAdminSupabase, DB } from "@/lib/supabase/admin";
import { dcaService } from "@/lib/services/dca-service";
import { TOKEN_MAP } from "@/lib/constants/tokens";
import type { CreatePositionParams, DCAPositionSummary, DCAExecutionRecord } from "@/types";
import { recordAuditLog } from "@/lib/utils/audit";
import { checkRateLimits, incrementRateLimits } from "@/lib/utils/rate-limiter";
import { extractClientIp } from "@/lib/utils/guards";

const HEDERA_NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || "testnet";

async function buildAuditCtx(userId: string, vaultKeyId: string) {
  const ip = await extractClientIp();
  return { userId, vaultKeyId, ip };
}

function resolveSymbol(address: string): string {
  const lower = address.toLowerCase();
  return TOKEN_MAP[lower]?.symbol ?? lower.slice(0, 10);
}

function resolveDecimals(address: string): number {
  const lower = address.toLowerCase();
  return TOKEN_MAP[lower]?.decimals ?? 8;
}

function formatRawAmount(raw: string | number | bigint, decimals: number): string {
  const str = String(raw);
  if (str === "0") return "0";
  const n = Number(str) / 10 ** decimals;
  // Avoid trailing zeros but keep meaningful precision
  return n % 1 === 0 ? n.toFixed(0) : parseFloat(n.toFixed(decimals)).toString();
}

export async function depositGasToScheduler(hbarAmount: string) {
  let ctx: { userId: string; vaultKeyId: string; ip: string | null } | undefined;
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id, vault_key_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, error: "No account found" };

    ctx = await buildAuditCtx(user.id, account.vault_key_id);
    await checkRateLimits(user.id);

    const result = await dcaService.depositGas(
      account.account_id,
      account.vault_key_id,
      hbarAmount
    );

    await recordAuditLog(ctx, "gas_deposit", { hbarAmount }, { txHash: result.txHash }).catch(() => {});
    await incrementRateLimits(user.id).catch(() => {});

    return { success: true, txHash: result.txHash };
  } catch (err: any) {
    if (ctx) {
      await recordAuditLog(ctx, "gas_deposit", { hbarAmount }, { error: err.message }).catch(() => {});
    }
    return { success: false, error: err.message };
  }
}

export async function getSchedulerBalance() {
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, balance: "0", error: "No account found" };

    const balance = await dcaService.getSchedulerBalance(account.account_id);

    return { success: true, balance: balance.toString() };
  } catch (err: any) {
    return { success: false, balance: "0", error: err.message };
  }
}

export async function withdrawSchedulerBalance() {
  let ctx: { userId: string; vaultKeyId: string; ip: string | null } | undefined;
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id, vault_key_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, error: "No account found" };

    ctx = await buildAuditCtx(user.id, account.vault_key_id);
    await checkRateLimits(user.id);

    const result = await dcaService.withdrawSchedulerBalance(
      account.account_id,
      account.vault_key_id
    );

    await recordAuditLog(ctx, "gas_withdraw", {}, { txHash: result.txHash }).catch(() => {});
    await incrementRateLimits(user.id).catch(() => {});

    return { success: true, txHash: result.txHash };
  } catch (err: any) {
    if (ctx) {
      await recordAuditLog(ctx, "gas_withdraw", {}, { error: err.message }).catch(() => {});
    }
    return { success: false, error: err.message };
  }
}

export async function unwrapWhbar() {
  let ctx: { userId: string; vaultKeyId: string; ip: string | null } | undefined;
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id, vault_key_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, error: "No account found" };

    ctx = await buildAuditCtx(user.id, account.vault_key_id);
    await checkRateLimits(user.id);

    const txHash = await dcaService.unwrapWhbar(
      account.account_id,
      account.vault_key_id
    );

    await recordAuditLog(ctx, "unwrap_whbar", {}, { txHash }).catch(() => {});
    await incrementRateLimits(user.id).catch(() => {});

    return { success: true, txHash };
  } catch (err: any) {
    if (ctx) {
      await recordAuditLog(ctx, "unwrap_whbar", {}, { error: err.message }).catch(() => {});
    }
    return { success: false, error: err.message };
  }
}

export async function createDCAPosition(formData: FormData) {
  let ctx: { userId: string; vaultKeyId: string; ip: string | null } | undefined;
  const params: CreatePositionParams = {
    tokenIn: formData.get("tokenIn") as string,
    tokenOut: formData.get("tokenOut") as string,
    amountPerSwap: formData.get("amountPerSwap") as string,
    tokenInAmount: formData.get("tokenInAmount") as string,
    interval: parseInt(formData.get("interval") as string),
    slippageBps: parseInt(formData.get("slippageBps") as string) || 50,
  };

  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id, vault_key_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, error: "No account found" };

    ctx = await buildAuditCtx(user.id, account.vault_key_id);
    await checkRateLimits(user.id);

    // Deposit gas to scheduler before creating position
    const gasDeposit = formData.get("gasDeposit") as string;
    if (gasDeposit && parseFloat(gasDeposit) > 0) {
      await dcaService.depositGas(
        account.account_id,
        account.vault_key_id,
        gasDeposit
      );
    }

    const result = await dcaService.createPosition(
      account.account_id,
      account.vault_key_id,
      params
    );

    await supabase.from(DB.DCA_POSITIONS).insert({
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

    await recordAuditLog(ctx, "dca_create", params as unknown as Record<string, unknown>, { txHash: result.txHash }).catch(() => {});
    await incrementRateLimits(user.id).catch(() => {});

    return { success: true, positionId: result.positionId };
  } catch (err: any) {
    if (ctx) {
      await recordAuditLog(ctx, "dca_create", params as unknown as Record<string, unknown>, { error: err.message }).catch(() => {});
    }
    return { success: false, error: err.message };
  }
}

export async function stopDCAPosition(positionId: number) {
  let ctx: { userId: string; vaultKeyId: string; ip: string | null } | undefined;
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id, vault_key_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, error: "No account found" };

    ctx = await buildAuditCtx(user.id, account.vault_key_id);
    await checkRateLimits(user.id);

    const txHash = await dcaService.stopPosition(
      account.account_id,
      account.vault_key_id,
      positionId
    );

    await supabase
      .from(DB.DCA_POSITIONS)
      .update({ status: "stopped", updated_at: new Date().toISOString() })
      .eq("position_id", positionId)
      .eq("user_id", user.id);

    await recordAuditLog(ctx, "dca_stop", { positionId }, { txHash }).catch(() => {});
    await incrementRateLimits(user.id).catch(() => {});

    return { success: true, txHash };
  } catch (err: any) {
    if (ctx) {
      await recordAuditLog(ctx, "dca_stop", { positionId }, { error: err.message }).catch(() => {});
    }
    return { success: false, error: err.message };
  }
}

export async function withdrawDCAPosition(positionId: number) {
  let ctx: { userId: string; vaultKeyId: string; ip: string | null } | undefined;
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id, vault_key_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, error: "No account found" };

    ctx = await buildAuditCtx(user.id, account.vault_key_id);
    await checkRateLimits(user.id);

    // Snapshot on-chain data before withdraw (withdraw deletes it)
    let executionsDone = 0;
    let tokenOutAccum = "0";
    try {
      const onChain = await dcaService.getPosition(positionId);
      if (onChain) {
        executionsDone = Number(onChain.executionsDone);
        tokenOutAccum = onChain.tokenOutAccum.toString();
      }
    } catch {
      // Fallback: keep defaults
    }

    const txHash = await dcaService.withdrawPosition(
      account.account_id,
      account.vault_key_id,
      positionId
    );

    await supabase
      .from(DB.DCA_POSITIONS)
      .update({
        status: "withdrawn",
        executions_done: executionsDone,
        token_out_accum: tokenOutAccum,
        updated_at: new Date().toISOString(),
      })
      .eq("position_id", positionId)
      .eq("user_id", user.id);

    await recordAuditLog(ctx, "dca_withdraw", { positionId }, { txHash }).catch(() => {});
    await incrementRateLimits(user.id).catch(() => {});

    return { success: true, txHash };
  } catch (err: any) {
    if (ctx) {
      await recordAuditLog(ctx, "dca_withdraw", { positionId }, { error: err.message }).catch(() => {});
    }
    return { success: false, error: err.message };
  }
}

export async function topUpDCAPosition(
  positionId: number,
  formData: FormData
) {
  let ctx: { userId: string; vaultKeyId: string; ip: string | null } | undefined;
  const extraTokenIn = formData.get("extraTokenIn") as string;
  const extraGas = formData.get("extraGas") as string;

  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id, vault_key_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { success: false, error: "No account found" };

    ctx = await buildAuditCtx(user.id, account.vault_key_id);
    await checkRateLimits(user.id);

    const txHash = await dcaService.topUpPosition(
      account.account_id,
      account.vault_key_id,
      positionId,
      BigInt(extraTokenIn),
      extraGas
    );

    await recordAuditLog(ctx, "dca_topup", { positionId, extraTokenIn, extraGas }, { txHash }).catch(() => {});
    await incrementRateLimits(user.id).catch(() => {});

    return { success: true, txHash };
  } catch (err: any) {
    if (ctx) {
      await recordAuditLog(ctx, "dca_topup", { positionId, extraTokenIn, extraGas }, { error: err.message }).catch(() => {});
    }
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
      .from(DB.DCA_POSITIONS)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return { positions: [], error: error.message };

    const positions: DCAPositionSummary[] = await Promise.all(
      (data || []).map(async (row: any) => {
        const tokenInSymbol = resolveSymbol(row.token_in);
        const tokenOutSymbol = resolveSymbol(row.token_out);
        const tokenInDecimals = resolveDecimals(row.token_in);
        const tokenOutDecimals = resolveDecimals(row.token_out);

        let executionsDone = row.executions_done ?? 0;
        let executionsLeft = (row.max_executions ?? 0) - executionsDone;
        let tokenInBalance = "0";
        let tokenOutAccum = row.token_out_accum
          ? formatRawAmount(row.token_out_accum, tokenOutDecimals)
          : "0";
        let lastExecutedAt = 0;
        let status = row.status as DCAPositionSummary["status"];

        // Read on-chain state (skip for withdrawn — data is deleted on-chain)
        if (status !== "withdrawn") {
          try {
            const onChain = await dcaService.getPosition(row.position_id);
            if (onChain) {
              executionsLeft = Number(onChain.executionsLeft);
              executionsDone = Number(onChain.executionsDone);
              tokenInBalance = formatRawAmount(onChain.tokenInBalance, tokenInDecimals);
              tokenOutAccum = formatRawAmount(onChain.tokenOutAccum, tokenOutDecimals);
              lastExecutedAt = Number(onChain.lastExecutedAt);

              // Sync DB if position deactivated on-chain
              if (!onChain.active && status === "active") {
                status = executionsLeft === 0 ? "exhausted" : "stopped";
                await supabase
                  .from(DB.DCA_POSITIONS)
                  .update({ status, updated_at: new Date().toISOString() })
                  .eq("position_id", row.position_id)
                  .eq("user_id", user.id);
              }
            }
          } catch {
            // Fallback to DB data if on-chain read fails
          }
        }

        return {
          positionId: row.position_id,
          tokenIn: row.token_in,
          tokenOut: row.token_out,
          tokenInSymbol,
          tokenOutSymbol,
          amountPerSwap: formatRawAmount(row.amount_per_swap, tokenInDecimals),
          interval: row.interval_seconds,
          executionsLeft,
          executionsDone,
          tokenInBalance,
          tokenOutAccum,
          lastExecutedAt,
          status,
          createdAt: row.created_at ?? "",
        };
      })
    );

    return { positions };
  } catch (err: any) {
    return { positions: [], error: err.message };
  }
}

export async function fetchPositionDetail(
  positionId: number
): Promise<{ position: DCAPositionSummary | null; error?: string }> {
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: row, error } = await supabase
      .from(DB.DCA_POSITIONS)
      .select("*")
      .eq("position_id", positionId)
      .eq("user_id", user.id)
      .single();

    if (error || !row) return { position: null, error: error?.message ?? "Not found" };

    const tokenInSymbol = resolveSymbol(row.token_in);
    const tokenOutSymbol = resolveSymbol(row.token_out);
    const tokenInDecimals = resolveDecimals(row.token_in);
    const tokenOutDecimals = resolveDecimals(row.token_out);

    let executionsDone = row.executions_done ?? 0;
    let executionsLeft = (row.max_executions ?? 0) - executionsDone;
    let tokenInBalance = "0";
    let tokenOutAccum = row.token_out_accum
      ? formatRawAmount(row.token_out_accum, tokenOutDecimals)
      : "0";
    let lastExecutedAt = 0;
    let status = row.status as DCAPositionSummary["status"];

    // Read on-chain state (skip for withdrawn — data is deleted on-chain)
    if (status !== "withdrawn") {
      try {
        const onChain = await dcaService.getPosition(positionId);
        if (onChain) {
          executionsLeft = Number(onChain.executionsLeft);
          executionsDone = Number(onChain.executionsDone);
          tokenInBalance = formatRawAmount(onChain.tokenInBalance, tokenInDecimals);
          tokenOutAccum = formatRawAmount(onChain.tokenOutAccum, tokenOutDecimals);
          lastExecutedAt = Number(onChain.lastExecutedAt);

          if (!onChain.active && status === "active") {
            status = executionsLeft === 0 ? "exhausted" : "stopped";
            await supabase
              .from(DB.DCA_POSITIONS)
              .update({ status, updated_at: new Date().toISOString() })
              .eq("position_id", positionId)
              .eq("user_id", user.id);
          }
        }
      } catch {
        // Fallback to DB data
      }
    }

    return {
      position: {
        positionId: row.position_id,
        tokenIn: row.token_in,
        tokenOut: row.token_out,
        tokenInSymbol,
        tokenOutSymbol,
        amountPerSwap: formatRawAmount(row.amount_per_swap, tokenInDecimals),
        interval: row.interval_seconds,
        executionsLeft,
        executionsDone,
        tokenInBalance,
        tokenOutAccum,
        lastExecutedAt,
        status,
        createdAt: row.created_at ?? "",
      },
    };
  } catch (err: any) {
    return { position: null, error: err.message };
  }
}

const MIRROR_BASE =
  HEDERA_NETWORK === "mainnet"
    ? "https://mainnet.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";

export interface AccountBalances {
  hbar: string;
  tokens: Record<string, string>; // address -> raw balance
}

export async function fetchAccountBalances(): Promise<{
  balances: AccountBalances | null;
  error?: string;
}> {
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const { data: account } = await supabase
      .from(DB.ACCOUNTS)
      .select("account_id")
      .eq("user_id", user.id)
      .single();

    if (!account) return { balances: null, error: "No account found" };

    const accountId = account.account_id;

    // Fetch HBAR balance
    const acctRes = await fetch(`${MIRROR_BASE}/api/v1/accounts/${accountId}`);
    if (!acctRes.ok) return { balances: null, error: "Failed to fetch account" };
    const acctData = await acctRes.json();
    const hbarTinybars = acctData?.balance?.balance ?? 0;

    // Fetch token balances
    const tokensRes = await fetch(
      `${MIRROR_BASE}/api/v1/accounts/${accountId}/tokens`
    );
    const tokensData = tokensRes.ok ? await tokensRes.json() : { tokens: [] };

    const tokens: Record<string, string> = {};
    for (const t of tokensData.tokens ?? []) {
      // Convert Hedera token ID (0.0.XXXX) to EVM address
      const parts = t.token_id?.split(".") ?? [];
      const num = parseInt(parts[2] ?? "0");
      const evmAddr = "0x" + num.toString(16).padStart(40, "0");
      tokens[evmAddr] = String(t.balance ?? "0");
    }

    return {
      balances: {
        hbar: hbarTinybars.toString(),
        tokens,
      },
    };
  } catch (err: any) {
    return { balances: null, error: err.message };
  }
}

const SWAP_EXECUTED_TOPIC =
  "0x3ba16738f12bfd0daedccb776cd79d883720a59aaeb01266e36a510f8fdf8bc5";

const DCA_REGISTRY_CONTRACT_ID = process.env.DCA_REGISTRY_CONTRACT_ID || "";

export async function fetchExecutionHistory(
  positionId: number
): Promise<{ executions: DCAExecutionRecord[]; error?: string }> {
  try {
    await requireUser();

    const positionTopic = "0x" + positionId.toString(16).padStart(64, "0");

    // Mirror node doesn't support topic filtering as query params reliably,
    // so fetch all logs and filter server-side
    const url = `${MIRROR_BASE}/api/v1/contracts/${DCA_REGISTRY_CONTRACT_ID}/results/logs?limit=100&order=desc`;

    const res = await fetch(url);
    if (!res.ok) return { executions: [], error: "Failed to fetch logs" };

    const allData = await res.json();
    const data = {
      logs: (allData.logs ?? []).filter(
        (log: any) =>
          log.topics?.[0] === SWAP_EXECUTED_TOPIC &&
          log.topics?.[1] === positionTopic
      ),
    };

    // Look up token addresses for this position from DB
    const supabase = getAdminSupabase();
    const { data: row } = await supabase
      .from(DB.DCA_POSITIONS)
      .select("token_in, token_out")
      .eq("position_id", positionId)
      .single();

    const tokenInDecimals = row ? resolveDecimals(row.token_in) : 8;
    const tokenOutDecimals = row ? resolveDecimals(row.token_out) : 6;
    const tokenInSymbol = row ? resolveSymbol(row.token_in) : "?";
    const tokenOutSymbol = row ? resolveSymbol(row.token_out) : "?";

    const executions: DCAExecutionRecord[] = (data.logs ?? []).map(
      (log: any) => {
        const d = (log.data ?? "").replace("0x", "");
        const slots = [];
        for (let i = 0; i < d.length; i += 64) {
          slots.push(BigInt("0x" + d.slice(i, i + 64)));
        }

        const tokenInSpent = slots[0] ?? 0n;
        const tokenOutReceived = slots[1] ?? 0n;
        const fee = slots[2] ?? 0n;
        const ts = log.timestamp ?? "";

        return {
          positionId,
          tokenInSpent: `${formatRawAmount(tokenInSpent, tokenInDecimals)} ${tokenInSymbol}`,
          tokenOutReceived: `${formatRawAmount(tokenOutReceived, tokenOutDecimals)} ${tokenOutSymbol}`,
          feeAmount: `${formatRawAmount(fee, tokenOutDecimals)} ${tokenOutSymbol}`,
          txHash: log.transaction_hash ?? "",
          executedAt: ts ? new Date(parseFloat(ts) * 1000).toISOString() : "",
        };
      }
    );

    return { executions };
  } catch (err: any) {
    return { executions: [], error: err.message };
  }
}
