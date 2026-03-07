"use client";

import { ExternalLink } from "lucide-react";
import type { DCAExecutionRecord } from "@/types";

const NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || "testnet";
const HASHSCAN_BASE = NETWORK === "mainnet"
  ? "https://hashscan.io/mainnet"
  : "https://hashscan.io/testnet";

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
          <div className="flex items-center gap-2 text-xs text-text-muted text-right">
            <span>{new Date(exec.executedAt).toLocaleDateString()}</span>
            {exec.txHash && (
              <a
                href={`${HASHSCAN_BASE}/transaction/${exec.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-cyan hover:text-accent-cyan-hover transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
