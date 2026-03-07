"use client";

import { useEffect, useState, useRef } from "react";

interface ExecutionCountdownProps {
  lastExecutedAt: number;
  interval: number;
  onExpired?: () => void;
}

function formatRemaining(seconds: number, interval: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  // Adapt format to interval size
  if (interval >= 3600) return `${h}h ${m}m ${s}s`;
  if (interval >= 60) return `${m}m ${s}s`;
  return `${s}s`;
}

export function ExecutionCountdown({
  lastExecutedAt,
  interval,
  onExpired,
}: ExecutionCountdownProps) {
  const [remaining, setRemaining] = useState(() => {
    const next = lastExecutedAt + interval;
    return Math.max(0, next - Math.floor(Date.now() / 1000));
  });
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const tick = () => {
      const next = lastExecutedAt + interval;
      const r = Math.max(0, next - Math.floor(Date.now() / 1000));
      setRemaining(r);
      if (r <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpired?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastExecutedAt, interval, onExpired]);

  const progress = Math.min(1, (interval - remaining) / interval);
  const expired = remaining <= 0;

  return (
    <div className="card-surface rounded-xl px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">Next execution in</span>
        {expired ? (
          <span className="text-xs font-semibold text-[#00f0ff] animate-pulse">
            Executing...
          </span>
        ) : (
          <span className="text-sm font-semibold text-white tabular-nums">
            {formatRemaining(remaining, interval)}
          </span>
        )}
      </div>
      <div className="w-full h-1 rounded-full bg-black/40 border border-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-[#00f0ff] to-[#8a2be2] transition-all duration-1000 ease-linear ${
            expired ? "animate-pulse" : ""
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
