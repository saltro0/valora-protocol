'use client'

import { signOut } from '@/app/actions/auth'
import { useSessionStore } from '@/store/session-store'
import { LogOut, Repeat, ScrollText } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavBar() {
  const { user } = useSessionStore()
  const pathname = usePathname()

  return (
    <div className="w-full flex justify-center pt-5 pb-2 px-4 sticky top-0 z-50">
      <header className="w-full max-w-4xl bg-[rgba(15,15,18,0.6)] backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] px-5 h-16 flex items-center justify-between transition-all duration-300 hover:border-white/20 hover:shadow-[0_8px_32px_0_rgba(0,240,255,0.1)]">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Valora Protocol"
              width={36}
              height={36}
              className="rounded-xl transition-transform duration-300 group-hover:scale-105"
            />
            <span className="text-[16px] font-semibold tracking-[-0.02em] text-white">
              Valora Protocol
            </span>
          </Link>
          {user && (
            <nav className="flex items-center gap-1.5 border-l border-white/10 pl-6 hidden md:flex">
              <Link
                href="/dashboard"
                className={`px-4 py-2 rounded-xl text-[14px] font-medium transition-all duration-200 ${pathname === '/dashboard'
                    ? 'text-white bg-white/10 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                Dashboard
              </Link>
              <Link
                href="/dca"
                className={`px-4 py-2 rounded-xl text-[14px] font-medium transition-all duration-200 flex items-center gap-2 ${pathname?.startsWith('/dca')
                    ? 'text-white bg-white/10 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <Repeat className={`w-4 h-4 ${pathname?.startsWith('/dca') ? 'text-[#00f0ff]' : ''}`} />
                DCA
              </Link>
              <Link
                href="/audit"
                className={`px-4 py-2 rounded-xl text-[14px] font-medium transition-all duration-200 flex items-center gap-2 ${pathname?.startsWith('/audit')
                    ? 'text-white bg-white/10 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <ScrollText className={`w-4 h-4 ${pathname?.startsWith('/audit') ? 'text-[#00f0ff]' : ''}`} />
                Activity
              </Link>
            </nav>
          )}
        </div>

        {user && (
          <div className="flex items-center gap-5">
            <span className="text-[14px] text-zinc-400 hidden sm:block bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">
              {user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-2 text-[14px] text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl border border-white/5 hover:border-white/20 transition-all duration-200 active:scale-95 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        )}
      </header>
    </div>
  )
}
