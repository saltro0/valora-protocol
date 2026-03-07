"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createDCAPosition, fetchAccountBalances } from "@/app/actions/dca";
import type { AccountBalances } from "@/app/actions/dca";
import { IntervalSelector } from "./interval-selector";
import { TOKEN_MAP, WHBAR_ADDRESS } from "@/lib/constants/tokens";
import { ArrowDown, ArrowLeftRight, Clock, Repeat, Zap, Fuel } from "lucide-react";
import Image from "next/image";

const SAUCE_ADDRESS = "0x0000000000000000000000000000000000120f46";

const NUM_EXECUTIONS = 3;
const DEFAULT_SLIPPAGE_BPS = 300;
const ESTIMATED_GAS_PER_EXEC = parseFloat(process.env.NEXT_PUBLIC_ESTIMATED_GAS_PER_EXEC || "2.8");
const MIN_DEPOSIT = 1;

const INTERVAL_LABELS: Record<number, string> = {
  60: "1 minute",
  3600: "1 hour",
  14400: "4 hours",
  43200: "12 hours",
  86400: "1 day",
  604800: "1 week",
};

function floorDisplay(n: number, decimals = 2): string {
  const factor = 10 ** decimals;
  return (Math.floor(n * factor) / factor).toFixed(decimals);
}

export function CreatePositionForm() {
  const router = useRouter();
  const [tokenIn, setTokenIn] = useState(WHBAR_ADDRESS);
  const [tokenOut, setTokenOut] = useState(SAUCE_ADDRESS);
  const [interval, setInterval] = useState(3600);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<AccountBalances | null>(null);

  useEffect(() => {
    fetchAccountBalances().then(({ balances: b }) => {
      if (b) setBalances(b);
    });
  }, []);

  const tokenInMeta = TOKEN_MAP[tokenIn] ?? { symbol: "???", name: "", decimals: 8 };
  const tokenOutMeta = TOKEN_MAP[tokenOut] ?? { symbol: "???", name: "", decimals: 8 };

  const parsedAmount = parseFloat(amount) || 0;
  const perSwap = parsedAmount / NUM_EXECUTIONS;
  const estimatedGasCost = NUM_EXECUTIONS * ESTIMATED_GAS_PER_EXEC;

  // Compute display balances
  const hbarBalance = balances ? Number(balances.hbar) / 1e8 : null;
  const isWhbarIn = tokenIn.toLowerCase() === WHBAR_ADDRESS.toLowerCase();

  // For WHBAR: user pays from HBAR (auto-wrapped), so effective balance is HBAR minus gas
  // For other tokens: use the token's raw balance
  let tokenInBalance: number | null = null;
  if (balances) {
    if (isWhbarIn) {
      // HBAR available for wrapping = total HBAR - gas cost - small buffer for tx fees
      const txFeeBuffer = 1;
      tokenInBalance = hbarBalance !== null
        ? Math.max(0, hbarBalance - estimatedGasCost - txFeeBuffer)
        : null;
    } else {
      const tokenInRaw = balances.tokens[tokenIn];
      tokenInBalance = tokenInRaw !== undefined
        ? Number(tokenInRaw) / 10 ** tokenInMeta.decimals
        : 0;
    }
  }

  // Buffer for Hedera tx fees (deposit, create, approve, etc.)
  const TX_FEE_BUFFER = 1;
  const totalHbarNeeded = isWhbarIn
    ? parsedAmount + estimatedGasCost + TX_FEE_BUFFER
    : estimatedGasCost + TX_FEE_BUFFER;
  const hasEnoughTokenIn = tokenInBalance === null || parsedAmount <= 0 || parsedAmount <= tokenInBalance;
  const hasEnoughHbar = hbarBalance === null || totalHbarNeeded <= hbarBalance;
  const isValid = parsedAmount >= MIN_DEPOSIT && hasEnoughTokenIn && hasEnoughHbar;
  const intervalLabel = INTERVAL_LABELS[interval] ?? `${interval}s`;

  function handleSwapTokens() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmount("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    setError(null);

    // Convert human-readable amount to raw units
    const rawAmount = Math.floor(parsedAmount * 10 ** tokenInMeta.decimals);
    const rawPerSwap = Math.floor(perSwap * 10 ** tokenInMeta.decimals);

    const formData = new FormData();
    formData.set("tokenIn", tokenIn);
    formData.set("tokenOut", tokenOut);
    formData.set("tokenInAmount", String(rawAmount));
    formData.set("amountPerSwap", String(rawPerSwap));
    formData.set("interval", String(interval));
    formData.set("slippageBps", String(DEFAULT_SLIPPAGE_BPS));
    formData.set("gasDeposit", String(estimatedGasCost));

    try {
      const result = await createDCAPosition(formData);
      if (result.success) {
        router.push(`/dca/${result.positionId}`);
      } else {
        setError(result.error || "Something went wrong");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Token pair with swap arrow */}
      <div className="card-surface rounded-2xl p-6 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00f0ff]/5 to-[#8a2be2]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative z-10 flex items-center justify-center gap-4">
          <div className="flex-1 flex flex-col items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium">Sell</span>
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white/5 border border-white/10 w-full justify-center">
              {tokenInMeta.logo ? (
                <Image src={tokenInMeta.logo} alt={tokenInMeta.symbol} width={24} height={24} className="rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#8a2be2] flex items-center justify-center text-[10px] text-white font-bold">
                  {tokenInMeta.symbol[0]}
                </div>
              )}
              <span className="text-white font-semibold">{tokenInMeta.symbol}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSwapTokens}
            className="mt-5 w-10 h-10 rounded-full bg-[#0a0a0c] border border-white/10 flex items-center justify-center shrink-0 shadow-[0_4px_15px_rgba(0,0,0,0.5)] hover:border-[#00f0ff]/40 hover:shadow-[0_0_15px_rgba(0,240,255,0.2)] hover:scale-110 active:scale-95 transition-all"
          >
            <ArrowLeftRight className="w-4 h-4 text-zinc-500 hover:text-[#00f0ff] transition-colors" />
          </button>

          <div className="flex-1 flex flex-col items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium">Buy</span>
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white/5 border border-white/10 w-full justify-center">
              {tokenOutMeta.logo ? (
                <Image src={tokenOutMeta.logo} alt={tokenOutMeta.symbol} width={24} height={24} className="rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#8a2be2] flex items-center justify-center text-[10px] text-white font-bold">
                  {tokenOutMeta.symbol[0]}
                </div>
              )}
              <span className="text-white font-semibold">{tokenOutMeta.symbol}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interval selector */}
      <div className="card-surface rounded-2xl p-6 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00f0ff]/5 to-[#8a2be2]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <label className="text-xs text-zinc-400 mb-3 block font-medium ml-1 relative z-10">Buy frequency</label>
        <div className="relative z-10">
          <IntervalSelector value={interval} onChange={setInterval} />
        </div>
      </div>

      {/* Amount input */}
      <div className="card-surface rounded-2xl p-6 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00f0ff]/5 to-[#8a2be2]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="flex items-center justify-between mb-4 relative z-10">
          <label className="text-sm text-zinc-400 font-medium">
            How much {tokenInMeta.symbol} do you want to invest?
          </label>
          {balances && (
            <button
              type="button"
              onClick={() => {
                const displayBal = isWhbarIn ? hbarBalance : tokenInBalance;
                if (displayBal !== null) setAmount(String(Math.floor(displayBal * 100) / 100));
              }}
              className="text-xs text-zinc-500 hover:text-[#00f0ff] transition-colors font-medium"
            >
              Balance: <span className={`font-semibold ${!hasEnoughTokenIn && parsedAmount > 0 ? "text-red-400" : "text-zinc-300"}`}>{isWhbarIn ? floorDisplay(hbarBalance ?? 0) : floorDisplay(tokenInBalance ?? 0)}</span> <span className="text-[#00f0ff]/70 ml-0.5">MAX</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 relative z-10">
          <input
            type="number"
            step="any"
            min={MIN_DEPOSIT}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent text-5xl font-semibold text-white outline-none placeholder:text-zinc-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all"
          />
          <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 shrink-0 shadow-[inset_0_0_15px_rgba(255,255,255,0.02)] backdrop-blur-md">
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-[#00f0ff] to-[#8a2be2]">{tokenInMeta.symbol}</span>
          </div>
        </div>
        {parsedAmount > 0 && parsedAmount < MIN_DEPOSIT && (
          <p className="text-amber-500 text-xs mt-3 relative z-10 flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 block animate-pulse" />
            Minimum deposit is {MIN_DEPOSIT} {tokenInMeta.symbol}
          </p>
        )}
        {parsedAmount > 0 && !isWhbarIn && !hasEnoughTokenIn && tokenInBalance !== null && (
          <p className="text-red-400 text-xs mt-3 relative z-10 flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 block" />
            Insufficient {tokenInMeta.symbol} balance
          </p>
        )}
        {isWhbarIn && parsedAmount > 0 && hasEnoughTokenIn && (
          <p className="text-[#00f0ff]/70 text-xs mt-3 relative z-10 flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] block" />
            HBAR will be auto-wrapped for the DCA contract
          </p>
        )}
        {/* HBAR balance for gas fees */}
        {hbarBalance !== null && !isWhbarIn && (
          <div className="flex items-center gap-1.5 mt-3 relative z-10">
            <Fuel className="w-3 h-3 text-zinc-500" />
            <span className={`text-xs font-medium ${!hasEnoughHbar ? "text-red-400" : "text-zinc-500"}`}>
              {floorDisplay(hbarBalance)} HBAR available for gas
            </span>
          </div>
        )}
      </div>

      {/* How it works breakdown */}
      <div className="card-surface rounded-2xl p-6 space-y-5 relative">
        <h3 className="text-sm font-semibold text-white tracking-wide uppercase text-zinc-300">Here&apos;s what will happen</h3>

        <div className="space-y-4">
          <div className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group/item">
            <div className="w-8 h-8 rounded-full bg-[#00f0ff]/10 border border-[#00f0ff]/20 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.1)] group-hover/item:shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all">
              <Repeat className="w-4 h-4 text-[#00f0ff]" />
            </div>
            <div>
              <p className="text-sm text-white font-medium">
                {NUM_EXECUTIONS} automatic swaps of{" "}
                <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00f0ff] to-white">
                  {isValid ? perSwap.toFixed(2) : "\u2014"} {tokenInMeta.symbol}
                </span>{" "}
                each
              </p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Your deposit is split equally into {NUM_EXECUTIONS} purchases
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group/item">
            <div className="w-8 h-8 rounded-full bg-[#00f0ff]/10 border border-[#00f0ff]/20 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.1)] group-hover/item:shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all">
              <Clock className="w-4 h-4 text-[#00f0ff]" />
            </div>
            <div>
              <p className="text-sm text-white font-medium">
                One swap every {intervalLabel} for{" "}
                <span className="font-bold text-white">{NUM_EXECUTIONS} cycles</span>
              </p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Spreads your purchase over time to reduce price impact
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group/item">
            <div className="w-8 h-8 rounded-full bg-[#8a2be2]/10 border border-[#8a2be2]/20 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(138,43,226,0.1)] group-hover/item:shadow-[0_0_15px_rgba(138,43,226,0.3)] transition-all">
              <ArrowDown className="w-4 h-4 text-[#8a2be2]" />
            </div>
            <div>
              <p className="text-sm text-white font-medium">
                You receive <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-[#8a2be2]">{tokenOutMeta.symbol}</span> after each swap
              </p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                You can cancel anytime and get your remaining {tokenInMeta.symbol} back
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group/item">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(245,158,11,0.1)] group-hover/item:shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all">
              <Fuel className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-white font-medium">
                <span className="font-bold text-amber-400">{estimatedGasCost.toFixed(1)} HBAR</span> gas deposit required
              </p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Sent from your account to the scheduler contract. Unused gas is refunded on withdraw.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cost breakdown */}
      {parsedAmount >= MIN_DEPOSIT && (
        <div className="card-surface rounded-2xl p-5 space-y-3 relative">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Cost breakdown</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">DCA deposit {isWhbarIn && "(auto-wrapped)"}</span>
              <span className="text-white font-medium">{parsedAmount.toFixed(2)} {isWhbarIn ? "HBAR" : tokenInMeta.symbol}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Gas deposit ({NUM_EXECUTIONS} swaps)</span>
              <span className="text-white font-medium">{estimatedGasCost.toFixed(1)} HBAR</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Network fees (approx.)</span>
              <span className="text-white font-medium">{TX_FEE_BUFFER} HBAR</span>
            </div>
            <div className="border-t border-white/5 pt-2 flex items-center justify-between text-sm">
              <span className="text-zinc-300 font-semibold">Total HBAR needed</span>
              <div className="text-right">
                {isWhbarIn ? (
                  <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00f0ff] to-[#8a2be2]">
                    {totalHbarNeeded.toFixed(1)} HBAR
                  </span>
                ) : (
                  <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00f0ff] to-[#8a2be2]">
                    {parsedAmount.toFixed(2)} {tokenInMeta.symbol} + {totalHbarNeeded.toFixed(1)} HBAR
                  </span>
                )}
              </div>
            </div>
          </div>
          {!hasEnoughHbar && hbarBalance !== null && (
            <p className="text-red-400 text-xs mt-3 flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 block" />
              Insufficient HBAR balance — you need {totalHbarNeeded.toFixed(1)} HBAR but have {floorDisplay(hbarBalance)}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-5 py-4 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          <p className="text-red-400 text-sm font-medium">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !isValid}
        className="w-full btn-accent py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group/btn shadow-[0_8px_25px_rgba(0,240,255,0.15)] hover:shadow-[0_8px_30px_rgba(138,43,226,0.3)]"
      >
        {submitting ? (
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            <span>Processing...</span>
          </div>
        ) : (
          <>
            <Zap className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
            <span className="tracking-wide">START DCA</span>
          </>
        )}
      </button>
    </form>
  );
}
