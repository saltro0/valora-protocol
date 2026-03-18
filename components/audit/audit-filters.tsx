"use client";

import type { AuditLogFilters } from "@/types";

const OP_TYPES = [
  { value: "", label: "All types" },
  { value: "account_create", label: "Account Create" },
  { value: "dca_create", label: "DCA Create" },
  { value: "dca_stop", label: "DCA Stop" },
  { value: "dca_withdraw", label: "DCA Withdraw" },
  { value: "dca_topup", label: "DCA Top-up" },
  { value: "gas_deposit", label: "Gas Deposit" },
  { value: "gas_withdraw", label: "Gas Withdraw" },
  { value: "unwrap_whbar", label: "Unwrap WHBAR" },
];

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
];

interface AuditFiltersProps {
  filters: AuditLogFilters;
  onChange: (filters: AuditLogFilters) => void;
}

export function AuditFilters({ filters, onChange }: AuditFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.type ?? ""}
        onChange={(e) => onChange({ ...filters, type: e.target.value || undefined })}
        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#00f0ff]/50"
      >
        {OP_TYPES.map((t) => (
          <option key={t.value} value={t.value} className="bg-zinc-900">
            {t.label}
          </option>
        ))}
      </select>

      <select
        value={filters.status ?? ""}
        onChange={(e) => onChange({ ...filters, status: e.target.value || undefined })}
        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#00f0ff]/50"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value} className="bg-zinc-900">
            {s.label}
          </option>
        ))}
      </select>

      <input
        type="date"
        value={filters.dateFrom ?? ""}
        onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined })}
        placeholder="From"
        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#00f0ff]/50"
      />

      <input
        type="date"
        value={filters.dateTo ?? ""}
        onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined })}
        placeholder="To"
        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#00f0ff]/50"
      />
    </div>
  );
}
