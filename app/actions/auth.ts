'use server'

import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAdminSupabase } from '@/lib/supabase/admin'
import { addAppPrefix } from '@/lib/auth-utils'

export async function signUp(_prevState: { error: string } | null, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const admin = getAdminSupabase()
  const prefixedEmail = addAppPrefix(email)

  // Create confirmed user via admin API with prefixed email
  const { error: createErr } = await admin.auth.admin.createUser({
    email: prefixedEmail,
    password,
    email_confirm: true,
  })

  if (createErr) {
    return { error: createErr.message }
  }

  // Auto sign-in after registration
  const supabase = await createServerSupabase()
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: prefixedEmail,
    password,
  })

  if (signInErr) {
    return { error: signInErr.message }
  }

  redirect('/dashboard')
}

export async function signIn(_prevState: { error: string } | null, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createServerSupabase()
  const prefixedEmail = addAppPrefix(email)

  // Try login with prefixed email first (new/migrated users)
  const { error } = await supabase.auth.signInWithPassword({
    email: prefixedEmail,
    password,
  })

  if (!error) {
    redirect('/dashboard')
  }

  // Fallback: try raw email (legacy users) and migrate
  const { error: legacyErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (legacyErr) {
    return { error: legacyErr.message }
  }

  // Migrate legacy user: update email to prefixed version
  const admin = getAdminSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    await admin.auth.admin.updateUserById(user.id, {
      email: prefixedEmail,
    })
  }

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  redirect('/login')
}
