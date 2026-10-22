import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createPulseState, stepPulse, applyPulseInput, pulseElapsed, replayPulse, validPulseInputs, PULSE_STEP_MS} from "../app/games/pulse-runner/gameEngine.ts";
import {beatX,FLOOR_Y,CUBE_BODY_SIZE,LEVEL_END_X} from "../app/games/pulse-runner/level.ts";
import {evaluateReplay, MAX_REPLAY_TAPS, speedForStage} from "../app/games/stack/gameEngine.ts";

test("empty inputs die at the first spike, never fabricate a clear or coins",()=>{
 const result=replayPulse([]);
 assert.equal(result.finished,true);assert.equal(result.completed,false);assert.equal(result.coins,0);
 assert.ok(result.progressPercent<2);assert.ok(result.durationMs<2000);
 assert.equal(replayPulse([],96000).progressPercent,result.progressPercent);
 assert.equal(replayPulse([],500).finished,false);
 for(const input of [[{atMs:-1,action:"down"}],[{atMs:"0",action:"down"}],[{atMs:0,action:"up"}],[{atMs:0,action:"down"},{atMs:1,action:"down"}],Array(4097).fill({atMs:0,action:"down"})])assert.equal(validPulseInputs(input),false);
});
test("full-course input fixture survives both rockets, gravity flip and the finale",async()=>{
 const inputs=JSON.parse(await readFile(new URL("./fixtures/pulse-clear-v11.json",import.meta.url),"utf8"));
 const result=replayPulse(inputs);
 assert.equal(result.completed,true);assert.equal(result.finished,true);
 assert.equal(result.progressPercent,100);assert.ok(result.state.x>=LEVEL_END_X);
 assert.equal(result.consumedInputs,inputs.length);
 assert.deepEqual(replayPulse(inputs,result.durationMs),result);
 // Render at 30, 60, 144 Hz (including a stalled frame). Physics and result stay identical.
 for(const fps of [30,60,144]){
  const state=createPulseState();let cursor=0,accumulator=0,frame=0;
  while(!state.ended){
   accumulator+=frame++===100?250:1000/fps;
   while(accumulator>=PULSE_STEP_MS&&!state.ended){
    while(cursor<inputs.length&&inputs[cursor].atMs<=pulseElapsed(state)+.00001)applyPulseInput(state,inputs[cursor++]);
    stepPulse(state);accumulator-=PULSE_STEP_MS;
   }
  }
  assert.deepEqual(state,result.state);
 }
});
test("real shared physics holds through every finale air ring and lands safely",()=>{
 const s=createPulseState();s.x=beatX(165.4)-(76+CUBE_BODY_SIZE)/2+1;s.y=FLOOR_Y-CUBE_BODY_SIZE/2;s.grounded=true;
 stepPulse(s);assert.ok(s.used.includes("pad:2"));
 applyPulseInput(s,{atMs:Math.floor(pulseElapsed(s)),action:"down"});
 while(!s.ended&&s.x<beatX(178)&&!(s.grounded&&s.used.includes("air:7")))stepPulse(s);
 assert.equal(s.ended,false);
 for(let i=2;i<=7;i++)assert.ok(s.used.includes("air:"+i),"missing ring "+i);
 assert.equal(s.grounded,true);
 assert.ok(s.x>=beatX(174)&&s.x<beatX(178));
});
test("Stack Tower supports more than 100 placements including the final miss",()=>{
 const taps=Array.from({length:120},(_,i)=>Math.round(4800/speedForStage(i+1)));
 const result=evaluateReplay([...taps,50],0);
 assert.equal(result.blocks,120);assert.equal(result.gameOver,true);
 const capped=evaluateReplay(Array.from({length:MAX_REPLAY_TAPS},(_,i)=>Math.round(4800/speedForStage(i+1))),0);
 assert.equal(capped.blocks,MAX_REPLAY_TAPS);assert.equal(capped.gameOver,true);
});
