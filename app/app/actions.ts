'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

/**
 * 継続開始
 */
export async function startSession() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) throw new Error('ログイン情報が取れません')

  const { error } = await supabase
    .from('streak_sessions')
    .insert({ user_id: user.id })

  // 継続中1個制限に引っかかったら開始済み扱いでOK
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
 * - mode=restart: 終了して次を自動開始
 * - mode=stop:    完全に終了
 * - FormData.get は同名フィールドが複数あると先頭を拾うことがあるため、
 *   getAll して「最後の非空」を採用する
 */
export async function finishSession(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) throw new Error('ログイン情報が取れません')

  // end_reason は複数同名フィールドが来ても最後の非空を採用
  const allReasons = formData
    .getAll('end_reason')
    .map((v) => String(v ?? '').trim())

  const lastNonEmpty = [...allReasons].reverse().find((v) => v.length > 0) ?? ''
  const reason = lastNonEmpty.slice(0, 200) || 'finished'

  // mode が渡っていない旧UIでも自動再開に倒す
  const mode = String(formData.get('mode') ?? 'restart').trim()
  const autoRestart = mode !== 'stop'

  const { data, error } = await supabase.rpc('finish_and_maybe_restart_session', {
    end_reason_input: reason,
    auto_restart: autoRestart,
  })

  if (error) throw new Error(error.message)

  const finishedSessionId = data?.[0]?.finished_session_id as string | undefined
  if (!finishedSessionId) {
    throw new Error('finished session id not found')
  }

  revalidatePath('/app')
  redirect(`/results/${finishedSessionId}`)
}

/**
 * 表示名を保存（profiles.display_name）
 * - 空文字は禁止
 * - 長すぎ防止
 * - upsert（無ければ作る、あれば更新）
 */
export async function setDisplayName(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

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

  revalidatePath('/app')
}
``