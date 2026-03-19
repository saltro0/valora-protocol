"use client";

import { ArrowRight, Square, Wallet, Loader2, Clock } from "lucide-react";
import Image from "next/image";
import { ExecutionCountdown } from "./execution-countdown";
import { ExecutionHistory } from "./execution-history";
import { TOKEN_MAP } from "@/lib/constants/tokens";
import type { DCAPositionSummary, DCAExecutionRecord } from "@/types";

const INTERVAL_LABELS: Record<number, string> = {
  60: "Every 1 min",
  3600: "Every 1 hour",
  14400: "Every 4 hours",
  43200: "Every 12 hours",
  86400: "Every 1 day",
  604800: "Every 1 week",
};

function tokenLogo(address: string): string | undefined {
  return TOKEN_MAP[address.toLowerCase()]?.logo;
}

interface PositionDetailProps {
  position: DCAPositionSummary;
  executions: DCAExecutionRecord[];
  onStop: () => void;
  onWithdraw: () => void;
  onRefresh?: () => void;
  actionLoading: boolean;
  actionError?: string | null;
}

export function PositionDetail({
  position,
  executions,
  onStop,
  onWithdraw,
  onRefresh,
  actionLoading,
  actionError,
}: PositionDetailProps) {
  const totalExec = position.executionsDone + position.executionsLeft;
  const progress = totalExec > 0 ? (position.executionsDone / totalExec) * 100 : 0;
  const intervalLabel = INTERVAL_LABELS[position.interval] || `Every ${position.interval}s`;

  return (
    <div className="space-y-6">
      <div className="card-surface p-5 rounded-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            {tokenLogo(position.tokenIn) ? (
              <Image src={tokenLogo(position.tokenIn)!} alt={position.tokenInSymbol} width={28} height={28} className="rounded-full" />
            ) : null}
            <span className="text-lg font-semibold text-text-primary">
              {position.tokenInSymbol}
            </span>
          </div>
          <ArrowRight className="w-5 h-5 text-text-muted" />
          <div className="flex items-center gap-2">
            {tokenLogo(position.tokenOut) ? (
              <Image src={tokenLogo(position.tokenOut)!} alt={position.tokenOutSymbol} width={28} height={28} className="rounded-full" />
            ) : null}
            <span className="text-lg font-semibold text-text-primary">
              {position.tokenOutSymbol}
            </span>
          </div>
        </div>

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
          <div>
            <span className="text-xs text-text-muted flex items-center gap-1"><Clock className="w-3 h-3" /> Interval</span>
            <p className="text-text-primary font-medium">{intervalLabel}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Created</span>
            <p className="text-text-primary font-medium">{new Date(position.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="w-full h-1.5 rounded-full bg-surface-base">
          <div className="h-full rounded-full bg-accent-cyan transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {position.status === "active" && (
        <ExecutionCountdown
          lastExecutedAt={
            position.lastExecutedAt > 0
              ? position.lastExecutedAt
              : Math.floor(new Date(position.createdAt).getTime() / 1000)
          }
          interval={position.interval}
          onExpired={onRefresh}
        />
      )}

      {actionError && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {actionError}
        </div>
      )}

      {position.status === "active" && (
        <button
          onClick={onStop}
          disabled={actionLoading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium card-surface border border-border-subtle text-text-muted hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {actionLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Stopping...</>
          ) : (
            <><Square className="w-4 h-4" /> Stop & Withdraw</>
          )}
        </button>
      )}

      {position.status === "stopped" && (
        <button
          onClick={onWithdraw}
          disabled={actionLoading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium card-surface border border-border-subtle text-text-muted hover:text-accent-cyan transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {actionLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Withdrawing...</>
          ) : (
            <><Wallet className="w-4 h-4" /> Withdraw Funds</>
          )}
        </button>
      )}

      <div className="card-surface p-5 rounded-xl">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Execution History</h3>
        <ExecutionHistory executions={executions} />
      </div>

    </div>
  );
}
