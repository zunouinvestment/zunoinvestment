import { supabaseAdmin } from '@/lib/supabaseAdmin'

let migratedUsers = new Set<string>()

export async function ensureExpenseLegacyOwnership(userId: string): Promise<void> {
  if (!userId || migratedUsers.has(userId)) return

  try {
    // Legacy rows created before user_id hardening.
    await supabaseAdmin
      .from('expenses')
      .update({ user_id: userId })
      .is('user_id', null)

    await supabaseAdmin
      .from('expense_categories')
      .update({ user_id: userId })
      .is('user_id', null)

    await supabaseAdmin
      .from('card_settings')
      .update({ user_id: userId })
      .is('user_id', null)

    migratedUsers.add(userId)
  } catch (error) {
    console.error('[expense-legacy-backfill] failed', error)
  }
}
