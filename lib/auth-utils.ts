const APP_EMAIL_PREFIX = 'valora-protocol__'

export function addAppPrefix(email: string): string {
  return `${APP_EMAIL_PREFIX}${email}`
}

export function stripAppPrefix(email: string): string {
  return email.startsWith(APP_EMAIL_PREFIX)
    ? email.slice(APP_EMAIL_PREFIX.length)
    : email
}
