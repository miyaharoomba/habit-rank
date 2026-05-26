'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * 継続開始
 */
export async function startSession() {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('ログイン情報が取れません')

  const { error } = await supabase
    .from('streak_sessions')
    .insert({ user_id: user.id })

  // 継続中1個制限に引っかかったら開始済み扱いでOKにする（任意）
  if (error) {
    const anyErr = error as any
    if (anyErr?.code === '23505') {
      revalidatePath('/app')
      return
    }
    throw new Error(error.message)
  }

  revalidatePath('/app')
}

/**
 * 継続終了
 */
export async function finishSession() {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('ログイン情報が取れません')

  const { error } = await supabase
    .from('streak_sessions')
    .update({
      ended_at: new Date().toISOString(),
      end_reason: 'finished',
    })
    .eq('user_id', user.id)
    .is('ended_at', null)

  if (error) throw new Error(error.message)

  revalidatePath('/app')
}

/**
 * 表示名を保存（profiles.display_name）
 * - 空文字は禁止
 * - 長すぎ防止
 * - upsert（無ければ作る、あれば更新）
 */
export async function setDisplayName(formData: FormData) {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('ログイン情報が取れません')

  const raw = String(formData.get('displayName') ?? '')
  const name = raw.trim()

  if (!name) throw new Error('名前が空です')
  if (name.length > 20) throw new Error('名前が長すぎます（20文字以内）')

  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, display_name: name },
      { onConflict: 'id' }
    )

  if (error) throw new Error(error.message)

  // /app を更新してヘッダーの名前を即反映
  revalidatePath('/app')
}
``