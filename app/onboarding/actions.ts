'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function saveNameAndGo(formData: FormData) {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('ログイン情報が取れません')

  const raw = String(formData.get('displayName') ?? '')
  const name = raw.trim()

  if (!name) throw new Error('名前が空です')
  if (name.length > 20) throw new Error('名前が長すぎます（20文字以内）')

  // 無ければ作る / あれば更新（RLSが正しく設定済みなら通る）
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, display_name: name }, { onConflict: 'id' })

  if (error) throw new Error(error.message)

  redirect('/app')
}
``