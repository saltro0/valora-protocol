"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PositionDetail } from "@/components/dca/position-detail";
import {
  fetchPositionDetail,
  fetchExecutionHistory,
  withdrawDCAPosition,
} from "@/app/actions/dca";
import type { DCAPositionSummary, DCAExecutionRecord } from "@/types";

const POLL_INTERVAL_MS = 10_000;
const POLL_MAX_MS = 120_000;

export default function PositionDetailPage() {
  const { positionId } = useParams<{ positionId: string }>();
  const [position, setPosition] = useState<DCAPositionSummary | null>(null);
  const [executions, setExecutions] = useState<DCAExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const execCountRef = useRef<number>(0);
  const latestExecCountRef = useRef<number>(0);

  // Keep ref in sync so startPolling always snapshots the latest count
  latestExecCountRef.current = executions.length;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Poll for new executions after countdown expires
  const startPolling = useCallback(() => {
    stopPolling();
    const id = parseInt(positionId);
    execCountRef.current = latestExecCountRef.current;
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > POLL_MAX_MS) {
        stopPolling();
        return;
      }
      const [posRes, execRes] = await Promise.all([
        fetchPositionDetail(id),
        fetchExecutionHistory(id),
      ]);
      if (posRes.position) setPosition(posRes.position);
      if (execRes.executions) {
        setExecutions(execRes.executions);
        if (execRes.executions.length > execCountRef.current) {
          stopPolling();
        }
      }
    }, POLL_INTERVAL_MS);
  }, [positionId, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    const id = parseInt(positionId);
    Promise.all([
      fetchPositionDetail(id),
      fetchExecutionHistory(id),
    ]).then(([posRes, execRes]) => {
      if (posRes.position) setPosition(posRes.position);
      if (execRes.executions) setExecutions(execRes.executions);
    }).finally(() => setLoading(false));
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
        onRefresh={() => {
          startPolling();
        }}
        onStop={async () => {
          setActionLoading(true);
          await withdrawDCAPosition(parseInt(positionId));
          setPosition((p) => p ? { ...p, status: "withdrawn" } : null);
          setActionLoading(false);
        }}
        onWithdraw={async () => {
          setActionLoading(true);
          await withdrawDCAPosition(parseInt(positionId));
          setPosition((p) => p ? { ...p, status: "withdrawn" } : null);
          setActionLoading(false);
        }}
        actionLoading={actionLoading}
      />
    </div>
  );
}
