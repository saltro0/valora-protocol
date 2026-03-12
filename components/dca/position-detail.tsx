"use client";

import { ArrowRight, Square, Wallet, Loader2 } from "lucide-react";
import Image from "next/image";
import { ExecutionCountdown } from "./execution-countdown";
import { ExecutionHistory } from "./execution-history";
import { TOKEN_MAP } from "@/lib/constants/tokens";
import type { DCAPositionSummary, DCAExecutionRecord } from "@/types";

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
}

export function PositionDetail({
  position,
  executions,
  onStop,
  onWithdraw,
  onRefresh,
  actionLoading,
}: PositionDetailProps) {
  const totalExec = position.executionsDone + position.executionsLeft;
  const progress = totalExec > 0 ? (position.executionsDone / totalExec) * 100 : 0;

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
        </div>

        <div className="w-full h-1.5 rounded-full bg-surface-base">
          <div className="h-full rounded-full bg-accent-cyan transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {position.status === "active" && position.lastExecutedAt > 0 && (
        <ExecutionCountdown
          lastExecutedAt={position.lastExecutedAt}
          interval={position.interval}
          onExpired={onRefresh}
        />
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
