"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface TopUpDialogProps {
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<void>;
  tokenInSymbol: string;
}

export function TopUpDialog({ onClose, onSubmit, tokenInSymbol }: TopUpDialogProps) {
  const [extraTokenIn, setExtraTokenIn] = useState("");
  const [extraGas, setExtraGas] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData();
    fd.set("extraTokenIn", extraTokenIn);
    fd.set("extraGas", extraGas);
    await onSubmit(fd);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card-surface p-5 rounded-xl w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Top Up Position</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">Extra {tokenInSymbol}</label>
            <input
              type="number"
              step="any"
              value={extraTokenIn}
              onChange={(e) => setExtraTokenIn(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-base border border-border-subtle text-text-primary text-sm outline-none focus:border-accent-cyan/40"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Extra gas (HBAR from scheduler deposit)</label>
            <input
              type="number"
              step="any"
              value={extraGas}
              onChange={(e) => setExtraGas(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-base border border-border-subtle text-text-primary text-sm outline-none focus:border-accent-cyan/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-accent py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Processing..." : "Confirm Top Up"}
          </button>
        </form>
      </div>
    </div>
  );
}
