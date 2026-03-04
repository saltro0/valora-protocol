import { NavBar } from '@/components/nav-bar'
import { SessionInitializer } from '@/components/session-initializer'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <SessionInitializer />
      <NavBar />
      <main className="max-w-3xl mx-auto px-5 py-8">{children}</main>
    </>
  )
}
