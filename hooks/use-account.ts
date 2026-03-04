'use client'

import { useEffect, useCallback, useState } from 'react'
import { useSessionStore } from '@/store/session-store'
import { fetchAccountInfo, provisionAccount } from '@/app/actions/vault'

export function useAccount() {
  const { user, account, setAccount } = useSessionStore()
  const [provisioning, setProvisioning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch account info when user changes
  useEffect(() => {
    if (!user) {
      setAccount(null)
      return
    }

    fetchAccountInfo().then(({ account: acc }) => {
      setAccount(acc)
    })
  }, [user, setAccount])

  const createAccount = useCallback(async () => {
    if (!user || provisioning) return
    setProvisioning(true)
    setError(null)

    try {
      const result = await provisionAccount()
      if (result.success && result.account) {
        setAccount(result.account)
      } else {
        setError(result.error || 'Failed to create account')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProvisioning(false)
    }
  }, [user, provisioning, setAccount])

  return { account, provisioning, error, createAccount }
}
