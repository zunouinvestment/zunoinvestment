import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function getServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set() {
          // read-only in route handlers
        },
        remove() {
          // read-only in route handlers
        },
      },
    }
  )
}

export async function requireUserId() {
  const client = await getServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error || !user) {
    return { ok: false as const, status: 401, error: '로그인이 필요합니다.' }
  }

  return { ok: true as const, userId: user.id }
}
