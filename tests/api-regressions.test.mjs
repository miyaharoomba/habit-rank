import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import * as pulse from "../app/games/pulse-runner/gameEngine.ts";
import * as level from "../app/games/pulse-runner/level.ts";
import * as stack from "../app/games/stack/gameEngine.ts";

async function loadModule(path,dependencies){
 const source=await readFile(new URL("../"+path,import.meta.url),"utf8");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const compiledModule={exports:{}};
 vm.runInNewContext(code,{module:compiledModule,exports:compiledModule.exports,console:{error(){}},Error,Date,Request,Response,FormData,
  require(name){assert.ok(name in dependencies,"unmocked dependency "+name);return dependencies[name];}
 },{filename:path});
 return compiledModule.exports;
}
const auth=user=>({createClient:async()=>({auth:{getUser:async()=>({data:{user},error:null})}})});
const jsonRequest=body=>new Request("https://habitbase.test/api/game/finish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
test("actual Pulse finish handler rejects forged clears and accepts a replay-derived result",async()=>{
 let saves=0;const filters=[];
 const admin={
  from(){const chain={select(){return chain},eq(k,v){filters.push([k,v]);return chain},order(){return chain},
   maybeSingle:async()=>({data:{id:"run",status:"started",started_at:new Date(Date.now()-100000).toISOString(),game_version:level.PULSE_GAME_VERSION},error:null}),
   limit:async()=>({data:[],error:null})};return chain;},
  rpc:async(name,args)=>{saves++;assert.equal(name,"finalize_minigame_run");assert.equal(args.p_result.progress,1.7);assert.equal(args.p_result.coins,0);return{data:{rewardXp:0.1,rewardEligible:true,levelBefore:1,levelAfter:1},error:null};}
 };
 const deps={
  "@/app/games/pulse-runner/gameEngine":pulse,"@/app/games/pulse-runner/level":level,
  "@/lib/supabase/server":auth({id:"owner"}),"next/server":{NextResponse:Response},
  "@/app/lib/stackGameServer":{getStackGameAdminClient:()=>admin,awardPulseRunnerBadges:async()=>[]},
  "@/lib/push/triggerDispatchSoon":{triggerPushDispatchBestEffort:async()=>{}}
 };
 const {POST}=await loadModule("app/api/games/pulse-runner/finish/route.ts",deps);
 assert.equal((await POST(jsonRequest({runId:"run",inputs:[],progressPercent:100,completed:true,durationMs:96000,coins:3}))).status,400);
 assert.equal(saves,0);
 const replay=pulse.replayPulse([]);
 const response=await POST(jsonRequest({runId:"run",inputs:[],progressPercent:replay.progressPercent,completed:false,durationMs:replay.durationMs,coins:0}));
 assert.equal(response.status,200);assert.equal(saves,1);
 assert.ok(filters.some(([k,v])=>k==="user_id"&&v==="owner"));
 const unauthorized=await loadModule("app/api/games/pulse-runner/finish/route.ts",{...deps,"@/lib/supabase/server":auth(null)});
 assert.equal((await unauthorized.POST(jsonRequest({}))).status,401);
});
test("actual Stack handler accepts a 120-block run and does not fail saved records for badge errors",async()=>{
 const taps=Array.from({length:120},(_,i)=>Math.round(4800/stack.speedForStage(i+1)));taps.push(50);
 const admin={from(){const chain={select(){return chain},eq(){return chain},order(){return chain},
  maybeSingle:async()=>({data:{id:"run",seed:0,status:"started",started_at:new Date(Date.now()-taps.reduce((a,b)=>a+b,0)).toISOString(),game_version:stack.STACK_GAME_VERSION}}),
  limit:async()=>({data:[],error:null})};return chain;},
  rpc:async(name,args)=>{assert.equal(args.p_result.blocks,120);return {data:{rewardXp:15},error:null};}};
 const {POST}=await loadModule("app/api/games/stack/finish/route.ts",{
  "@/lib/supabase/server":auth({id:"owner"}),"next/server":{NextResponse:Response},
  "@/app/games/stack/gameEngine":stack,
  "@/app/lib/stackGameServer":{getStackGameAdminClient:()=>admin,awardStackBadges:async()=>{throw new Error("optional badge failure");}},
  "@/lib/push/triggerDispatchSoon":{triggerPushDispatchBestEffort:async()=>{}}
 });
 const response=await POST(jsonRequest({runId:"run",tapsMs:taps}));
 assert.equal(response.status,200);assert.equal((await response.json()).blocks,120);
});
test("successful correction redirects are not caught as NEXT_REDIRECT errors",async()=>{
 const redirects=[];
 const actions=await loadModule("app/results/[sessionId]/actions.ts",{
  "@/lib/supabase/server":auth({id:"owner"}),"next/cache":{revalidatePath(){}},
  "next/navigation":{redirect(path){redirects.push(path);const e=new Error("NEXT_REDIRECT");e.location=path;throw e;}},
  "@/app/services/sessionCorrectionService":{
   adjustSession:async()=>({}),mergeSessionWithNext:async()=>({keptSessionId:8}),splitFinishedSession:async()=>({secondSessionId:9})
  }
 });
 for(const [name,expected] of [["adjustSessionAction","/results/7?corrected=adjust"],["mergeSessionAction","/results/8?corrected=merge"],["splitSessionAction","/results/7?corrected=split&created=9"]]){
  const form=new FormData();for(const [k,v] of Object.entries({session_id:"7",new_ended_at:"2026-01-01T01:00:00Z",actual_ended_at:"2026-01-01T01:00:00Z",resumed_at:"2026-01-01T01:30:00Z"}))form.set(k,v);
  await assert.rejects(actions[name](form),error=>error.location===expected);
 }
 assert.equal(redirects.length,3);
});
