import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("empty schema, RLS, atomic corrections, notification leases and game reward slots",async t=>{
 const db=new PGlite();
 t.after(()=>db.close());
 // Only managed Supabase schemas are stubbed. ALL application DDL below is real.
 await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.objects(id uuid primary key,bucket_id text,name text);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 grant usage on schema public,auth,storage to authenticated,anon,service_role;
 `);
 const migrations=(await readdir(new URL("../supabase/migrations/",import.meta.url))).filter(n=>/^20261022.*\.sql$/.test(n)).sort();
 for(const file of migrations) {
   const sql=(await readFile(new URL("../supabase/migrations/"+file,import.meta.url),"utf8")).replace(/^create extension[^;]+;/gm,"");
   await db.exec(sql);
 }
 const a="10000000-0000-4000-8000-000000000001",b="10000000-0000-4000-8000-000000000002";
 await db.exec(await readFile(new URL("../supabase/seed.sql",import.meta.url),"utf8"));
 assert.equal((await db.query("select count(*)::int as n from badges")).rows[0].n,36);
 await db.exec(`insert into auth.users values ('${a}'),('${b}');insert into profiles(id,display_name) values ('${a}','A'),('${b}','B');select set_config('request.jwt.claim.sub','${a}',false);`);
 const query=(sql,values=[])=>db.query(sql,values);
 await t.test("all application tables use RLS and anonymous correction is denied",async()=>{
  const rows=(await query("select tablename from pg_tables where schemaname='public' and not rowsecurity")).rows;
  assert.deepEqual(rows,[]);
  await db.exec("set role anon");
  await assert.rejects(query("select correct_streak_session(1,'split','{}')"),/permission denied/);
  await db.exec("reset role");
 });
 let session;
 await t.test("split failure restores original session and creates no audit row",async()=>{
  session=(await query("insert into streak_sessions(user_id,started_at,ended_at,end_reason) values ($1,'2026-01-01 00:00Z','2026-01-01 02:00Z','finished') returning id",[a])).rows[0].id;
  await db.exec("create function reject_split_insert() returns trigger language plpgsql as $$begin raise exception 'forced insert failure';end;$$;create trigger force_split_failure before insert on streak_sessions for each row execute function reject_split_insert()");
  await assert.rejects(query("select correct_streak_session($1,'split',$2)",[session,{actualEndedAt:"2026-01-01T01:00:00Z",resumedAt:"2026-01-01T01:30:00Z"}]),/forced insert failure/);
  assert.equal((await query("select ended_at from streak_sessions where id=$1",[session])).rows[0].ended_at.toISOString(),"2026-01-01T02:00:00.000Z");
  assert.equal((await query("select count(*)::int as n from streak_session_edits")).rows[0].n,0);
  await db.exec("drop trigger force_split_failure on streak_sessions");
 });
 await t.test("correction ownership, successful split/merge, overlap prevention",async()=>{
  await db.exec(`select set_config('request.jwt.claim.sub','${b}',false)`);
  await assert.rejects(query("select correct_streak_session($1,'adjust',$2)",[session,{newEndedAt:"2026-01-01T01:00:00Z"}]),/見つかりません/);
  await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);set role authenticated`);
  const split=(await query("select correct_streak_session($1,'split',$2) as result",[session,{actualEndedAt:"2026-01-01T01:00:00Z",resumedAt:"2026-01-01T01:30:00Z"}])).rows[0].result;
  assert.ok(split.secondSessionId);
  await assert.rejects(query("select correct_streak_session($1,'adjust',$2)",[session,{newEndedAt:"2026-01-01T01:45:00Z"}]),/重複/);
  const merged=(await query("select correct_streak_session($1,'merge','{}') as result",[session])).rows[0].result;
  assert.equal(merged.keptSessionId,split.secondSessionId);
  await db.exec("reset role");
  assert.equal((await query("select count(*)::int as n from streak_sessions where user_id=$1",[a])).rows[0].n,1);
  assert.equal((await query("select count(*)::int as n from streak_session_edits")).rows[0].n,2);
 });
 await t.test("profile editing cannot forge earned XP",async()=>{
  await db.exec("set role authenticated");
  await query("update profiles set display_name='renamed' where id=$1",[a]);
  await assert.rejects(query("update profiles set xp_total=999999,level=100 where id=$1",[a]),/permission denied/);
  const unowned=(await query("select id from badges limit 1")).rows[0].id;
  await assert.rejects(query("update profiles set current_title_badge_id=$1 where id=$2",[unowned,a]),/not owned/);
  await assert.rejects(query("select refresh_profile_level($1)",[b]),/permission denied/);
  await db.exec("reset role");
 });
 await t.test("claimed notifications are disjoint and expired leases are recoverable",async()=>{
  await db.exec("truncate push_outbox");
  await query("insert into notifications(type,recipient_id,actor_id,message_preview) values ('dm',$1,$2,'test'),('dm',$1,$2,'test')",[a,b]);
  const w1="20000000-0000-4000-8000-000000000001",w2="20000000-0000-4000-8000-000000000002";
  const first=(await query("select * from claim_push_outbox($1,1)",[w1])).rows;
  assert.equal(first.length,1);
  const second=(await query("select * from claim_push_outbox($1,10)",[w2])).rows;
  assert.equal(second.length,1);assert.notEqual(first[0].id,second[0].id);
  assert.equal((await query("select * from claim_push_outbox($1,10)",[w2])).rows.length,0);
  await query("update push_outbox set claimed_until=now()-interval '1 minute' where id=$1",[first[0].id]);
  assert.equal((await query("select * from claim_push_outbox($1,1)",[w2])).rows[0].attempts,2);
  await db.exec("set role authenticated");
  await assert.rejects(query("select * from claim_push_outbox($1,1)",[w1]),/permission denied/);
  await db.exec("reset role");
 });
 await t.test("game saves are idempotent, daily reward is capped at three",async()=>{
  const runs=[];
  for(let i=0;i<4;i++)runs.push((await query("insert into minigame_runs(user_id,game_key,game_version,seed) values ($1,'stack_tower','test',1) returning id",[a])).rows[0].id);
  const finish=(id,replay=[100])=>query("select finalize_minigame_run($1,$2,'stack_tower','test',$3,$4,5) as result",[id,a,{score:100,blocks:1,perfects:1,maxCombo:1},replay]);
  const results=await Promise.all(runs.map(id=>finish(id)));
  assert.deepEqual(results.map(r=>r.rows[0].result.rewardXp),[5,5,5,0]);
  const before=(await query("select xp_total from profiles where id=$1",[a])).rows[0].xp_total;
  await finish(runs[0]);
  assert.equal((await query("select xp_total from profiles where id=$1",[a])).rows[0].xp_total,before);
  await assert.rejects(finish(runs[0],[200]),/replay mismatch/);
  await db.exec("set role authenticated");
  await assert.rejects(finish(runs[1]),/permission denied/);
  await db.exec("reset role");
 });
});
