"use client";

import { ArrowRight, Pause, Wallet } from "lucide-react";
import Image from "next/image";
import { ExecutionCountdown } from "./execution-countdown";
import { TOKEN_MAP } from "@/lib/constants/tokens";
import type { DCAPositionSummary } from "@/types";

function tokenLogo(address: string): string | undefined {
  return TOKEN_MAP[address.toLowerCase()]?.logo;
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "text-[#00f0ff]", bg: "bg-[#00f0ff]/10 border-[#00f0ff]/20" },
  stopped: { label: "Stopped", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  withdrawn: { label: "Withdrawn", color: "text-zinc-400", bg: "bg-zinc-400/10 border-zinc-400/20" },
  exhausted: { label: "Completed", color: "text-[#8a2be2]", bg: "bg-[#8a2be2]/10 border-[#8a2be2]/20" },
};

const INTERVAL_LABELS: Record<number, string> = {
  60: "Every 1m",
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
    <div className="card-surface p-5 rounded-2xl flex flex-col gap-4 group">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {tokenLogo(position.tokenIn) ? (
            <Image src={tokenLogo(position.tokenIn)!} alt={position.tokenInSymbol} width={32} height={32} className="rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center p-1 font-bold text-xs text-white">
              {position.tokenInSymbol?.[0] || "?"}
            </div>
          )}
          <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
          {tokenLogo(position.tokenOut) ? (
            <Image src={tokenLogo(position.tokenOut)!} alt={position.tokenOutSymbol} width={32} height={32} className="rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center p-1 font-bold text-xs text-white">
              {position.tokenOutSymbol?.[0] || "?"}
            </div>
          )}
        </div>
        <div className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${status.bg} ${status.color}`}>
          {status.label}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="field-row p-3">
          <span className="text-zinc-500 text-xs block mb-1">Per swap</span>
          <p className="text-white font-semibold">
            {position.amountPerSwap} <span className="text-zinc-400 text-xs">{position.tokenInSymbol}</span>
          </p>
        </div>
        <div className="field-row p-3">
          <span className="text-zinc-500 text-xs block mb-1">Frequency</span>
          <p className="text-white font-semibold">{intervalLabel}</p>
        </div>
        <div className="field-row p-3">
          <span className="text-zinc-500 text-xs block mb-1">Executed</span>
          <p className="text-white font-semibold">
            {position.executionsDone} <span className="text-zinc-500 text-xs">/ {position.executionsDone + position.executionsLeft}</span>
          </p>
        </div>
        <div className="field-row p-3 relative overflow-hidden group/accum">
          <div className="absolute inset-0 bg-gradient-to-br from-[#00f0ff]/5 to-[#8a2be2]/5 opacity-0 group-hover/accum:opacity-100 transition-opacity" />
          <span className="text-zinc-500 text-xs block mb-1 relative z-10">Accumulated</span>
          <p className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#00f0ff] to-[#8a2be2] relative z-10 drop-shadow-[0_0_8px_rgba(0,240,255,0.3)]">
            {position.tokenOutAccum} <span className="text-zinc-400 text-xs">{position.tokenOutSymbol}</span>
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 rounded-full bg-black/40 border border-white/5 overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2] relative transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute top-0 right-0 bottom-0 w-10 bg-gradient-to-r from-transparent to-white/50 blur-[2px]" />
        </div>
      </div>

      {/* Countdown */}
      {position.status === "active" && position.lastExecutedAt > 0 && (
        <ExecutionCountdown
          lastExecutedAt={position.lastExecutedAt}
          interval={position.interval}
        />
      )}

      {/* Actions */}
      {position.status === "active" && (
        <div className="flex gap-3 mt-1">
          <button
            onClick={() => onStop?.(position.positionId)}
            disabled={actionLoading === `stop-${position.positionId}`}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:bg-amber-500/10 hover:border-amber-500/20 hover:shadow-[0_0_15px_rgba(245,158,11,0.15)] transition-all disabled:opacity-50 disabled:cursor-not-allowed group/btn"
          >
            <Pause className="w-3.5 h-3.5 text-amber-500 group-hover/btn:scale-110 transition-transform" />
            Stop
          </button>
          <button
            onClick={() => onWithdraw?.(position.positionId)}
            disabled={actionLoading === `withdraw-${position.positionId}`}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:bg-[#00f0ff]/10 hover:border-[#00f0ff]/20 hover:shadow-[0_0_15px_rgba(0,240,255,0.15)] transition-all disabled:opacity-50 disabled:cursor-not-allowed group/btn"
          >
            <Wallet className="w-3.5 h-3.5 text-[#00f0ff] group-hover/btn:scale-110 transition-transform" />
            Withdraw
          </button>
        </div>
      )}
    </div>
  );
}
