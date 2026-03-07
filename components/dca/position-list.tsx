"use client";

import { useDCA } from "@/hooks/use-dca";
import { PositionCard } from "./position-card";
import { Plus, TrendingUp } from "lucide-react";
import Link from "next/link";

export function PositionList() {
  const { positions, loading, error, actionLoading, stop, withdraw } = useDCA();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#00f0ff]/30 border-t-[#00f0ff] rounded-full animate-spin shadow-[0_0_15px_rgba(0,240,255,0.4)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 card-surface rounded-2xl border border-red-500/20 bg-red-500/5">
        <p className="text-red-400 text-sm font-medium">{error}</p>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="text-center py-16 card-surface rounded-2xl flex flex-col items-center justify-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00f0ff]/5 to-[#8a2be2]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

        <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-5 relative z-10 shadow-[0_0_20px_rgba(255,255,255,0.05)] group-hover:shadow-[0_0_30px_rgba(0,240,255,0.15)] group-hover:border-[#00f0ff]/30 transition-all duration-500">
          <TrendingUp className="w-8 h-8 text-zinc-500 group-hover:text-[#00f0ff] transition-colors duration-500" />
        </div>

        <h3 className="text-lg font-bold text-white mb-2 relative z-10">No Positions Yet</h3>
        <p className="text-zinc-500 text-sm mb-6 max-w-[250px] relative z-10">
          Create your first Dollar Cost Averaging strategy out of your shiny new interface.
        </p>

        <Link
          href="/dca/new"
          className="relative z-10 inline-flex items-center gap-2 btn-accent px-6 py-3 rounded-xl text-sm font-bold shadow-[0_4px_15px_rgba(0,240,255,0.15)] hover:shadow-[0_6px_25px_rgba(138,43,226,0.3)]"
        >
          <Plus className="w-4 h-4" />
          Create Strategy
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {positions.map((pos) => (
        <Link key={pos.positionId} href={`/dca/${pos.positionId}`}>
          <PositionCard
            position={pos}
            onStop={stop}
            onWithdraw={withdraw}
            actionLoading={actionLoading}
          />
        </Link>
      ))}
    </div>
  );
}
