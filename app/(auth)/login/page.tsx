import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full flex flex-col items-center">
        <LoginForm />
        <div className="mt-10 flex items-center gap-2 text-[11px] text-text-muted/60 tracking-widest uppercase">
          <div className="w-8 h-px bg-[#27272a]" />
          Valora Protocol
          <div className="w-8 h-px bg-[#27272a]" />
        </div>
      </div>
    </main>
  )
}
