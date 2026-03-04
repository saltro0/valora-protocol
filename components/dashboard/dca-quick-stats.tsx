'use client'

import { useDCAStore } from '@/store/dca-store'
import { Repeat, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'
import { fetchUserPositions } from '@/app/actions/dca'

export function DCAQuickStats() {
  const { positions, setPositions, setLoading } = useDCAStore()

  useEffect(() => {
    fetchUserPositions().then(({ positions: data }) => {
      setPositions(data)
      setLoading(false)
    })
  }, [setPositions, setLoading])

  const active = positions.filter((p) => p.status === 'active').length
  const total = positions.length

  return (
    <div className="card-surface rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4 text-accent-cyan" />
          <h2 className="text-[15px] font-semibold text-text-primary">DCA Positions</h2>
        </div>
        <Link
          href="/dca"
          className="flex items-center gap-1 text-[13px] text-text-muted hover:text-accent-cyan transition-colors"
        >
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      {total === 0 ? (
        <p className="text-[13px] text-text-muted">
          No DCA positions yet.{' '}
          <Link href="/dca/new" className="text-accent-cyan hover:underline">
            Create one
          </Link>
        </p>
      ) : (
        <div className="flex items-center gap-6">
          <div>
            <span className="text-xs text-text-muted">Active</span>
            <p className="text-lg font-semibold text-accent-cyan">{active}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Total</span>
            <p className="text-lg font-semibold text-text-primary">{total}</p>
          </div>
        </div>
      )}
    </div>
  )
}
