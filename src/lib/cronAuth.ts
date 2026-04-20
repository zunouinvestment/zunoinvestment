import { NextRequest } from 'next/server'

type CronAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

function getSecretFromHeader(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim()
  }

  // Backward-compatible fallback for older callers.
  const legacyHeader = req.headers.get('x-cron-secret')
  return legacyHeader?.trim() || null
}

export function verifyCronRequest(req: NextRequest): CronAuthResult {
  const configuredSecret = process.env.CRON_SECRET

  if (!configuredSecret) {
    if (process.env.NODE_ENV !== 'production') {
      return { ok: true }
    }

    return {
      ok: false,
      status: 500,
      error: 'CRON_SECRET is not configured on server',
    }
  }

  const providedSecret = getSecretFromHeader(req)
  if (!providedSecret || providedSecret !== configuredSecret) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  return { ok: true }
}
