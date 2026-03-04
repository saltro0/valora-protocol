import { AccountCard } from '@/components/dashboard/account-card'
import { GasBalanceCard } from '@/components/dashboard/gas-balance-card'
import { DCAQuickStats } from '@/components/dashboard/dca-quick-stats'
import { FundGuide } from '@/components/dashboard/fund-guide'

export default function DashboardPage() {
  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-text-primary">
          Dashboard
        </h1>
        <p className="text-[13px] text-text-muted mt-0.5">
          Manage your Hedera account and DCA strategies
        </p>
      </div>
      <div className="space-y-4">
        <AccountCard />
        <GasBalanceCard />
        <DCAQuickStats />
        <FundGuide />
      </div>
    </div>
  )
}
