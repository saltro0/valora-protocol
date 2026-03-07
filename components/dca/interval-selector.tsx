"use client";

const INTERVALS = [
  { label: "1m", value: 60 },
  { label: "1h", value: 3600 },
  { label: "4h", value: 14400 },
  { label: "12h", value: 43200 },
  { label: "1d", value: 86400 },
  { label: "1w", value: 604800 },
];

interface IntervalSelectorProps {
  value: number;
  onChange: (value: number) => void;
}

export function IntervalSelector({ value, onChange }: IntervalSelectorProps) {
  return (
    <div className="flex gap-2">
      {INTERVALS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${value === opt.value
              ? "bg-gradient-to-br from-[#00f0ff]/20 to-[#8a2be2]/20 text-white border border-[#00f0ff]/40 shadow-[0_0_15px_rgba(0,240,255,0.2)]"
              : "bg-white/5 text-zinc-400 border border-white/10 hover:text-white hover:bg-white/10 hover:border-white/20"
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
