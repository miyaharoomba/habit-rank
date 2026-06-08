-- バッジごとの称号と、プロフィールの現在称号設定を追加

alter table public.badges
add column if not exists title_label varchar(100);

alter table public.profiles
add column if not exists current_title_badge_id uuid null references public.badges(id) on delete set null;

create index if not exists idx_profiles_current_title_badge_id
  on public.profiles(current_title_badge_id);

-- 既存バッジへ称号名を付与
update public.badges
set title_label = case title
  when '最初の一歩' then '挑戦者'
  when '習慣の確立' then '継続者'
  when '継続の鬼' then '継続の鬼'
  when '朝型の達人' then '朝型の達人'
  when '10時間の壁' then '積み上げ人'
  when '100時間の求道者' then '求道者'
  when '伝説の継続者' then '伝説の継続者'
  else title
end
where title_label is null;