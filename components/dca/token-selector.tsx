"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import Image from "next/image";
import { TOKEN_MAP } from "@/lib/constants/tokens";

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logo?: string;
}

const TESTNET_TOKENS: Token[] = Object.entries(TOKEN_MAP).map(([address, meta]) => ({
  address,
  ...meta,
}));

interface TokenSelectorProps {
  value: string;
  onChange: (address: string) => void;
  exclude?: string;
  label: string;
}

export function TokenSelector({ value, onChange, exclude, label }: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const tokens = TESTNET_TOKENS.filter(
    (t) => t.address !== exclude && t.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const selected = TESTNET_TOKENS.find((t) => t.address === value);

  return (
    <div className="relative">
      <label className="text-xs text-zinc-400 mb-2 block font-medium ml-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input-field w-full flex items-center justify-between px-4 py-3 text-left hover:border-[#00f0ff]/40 hover:bg-white/5 transition-all group"
      >
        <span className={selected ? "text-white font-semibold flex items-center gap-2" : "text-zinc-500"}>
          {selected && (
            selected.logo ? (
              <Image src={selected.logo} alt={selected.symbol} width={20} height={20} className="rounded-full" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#8a2be2] flex items-center justify-center text-[10px] text-white">
                {selected.symbol[0]}
              </div>
            )
          )}
          {selected ? selected.symbol : "Select token"}
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ${open ? "rotate-180 text-[#00f0ff]" : "group-hover:text-white"}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 w-full rounded-xl bg-[rgba(15,15,18,0.95)] backdrop-blur-xl border border-white/10 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in slide-in-from-top-2">
            <div className="p-2 border-b border-white/5">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-white/5 focus-within:border-[#00f0ff]/50 focus-within:shadow-[0_0_10px_rgba(0,240,255,0.1)] transition-all">
                <Search className="w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search tokens..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-sm text-white outline-none flex-1 placeholder:text-zinc-500"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto py-1 custom-scrollbar">
              {tokens.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-zinc-500">
                  No tokens found
                </div>
              ) : (
                tokens.map((token) => (
                  <button
                    key={token.address}
                    type="button"
                    onClick={() => {
                      onChange(token.address);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center justify-between group/item"
                  >
                    <div className="flex items-center gap-3">
                      {token.logo ? (
                        <Image src={token.logo} alt={token.symbol} width={32} height={32} className="rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00f0ff]/20 to-[#8a2be2]/20 border border-white/10 flex items-center justify-center text-xs text-white font-bold group-hover/item:border-[#00f0ff]/40 transition-colors">
                          {token.symbol[0]}
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-white group-hover/item:text-[#00f0ff] transition-colors">{token.symbol}</span>
                        <span className="text-xs text-zinc-400">{token.name}</span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
