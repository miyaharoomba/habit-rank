import * as L from "./level";

// Identical fixed-tick simulation in the browser and on the server.
// Phaser renders this state; its variable-frame Arcade physics is not authoritative.
export const PULSE_STEP_MS = 1000 / 120;
export const MAX_PULSE_INPUTS = 4096;
export const MAX_PULSE_DURATION_MS = 120_000;
export type PulseState = {
  tick: number; x: number; y: number; vy: number; mode: L.PulseMode;
  gravity: L.PulseGravity; mini: boolean; grounded: boolean; pressed: boolean;
  jumpUntil: number; bounceUntil: number; dashUntil: number; dashSpeed: number;
  used: string[]; collapseAt: number[]; coins: number; ended: boolean; completed: boolean;
};
type Rect = { x: number; y: number; w: number; h: number };
type Platform = Rect & { gravity: L.PulseGravity; collapse?: number; beatBlock?: number };
const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const platforms: Platform[] = [
  ...L.CUBE_PLATFORMS.map(p => ({ ...rect(L.beatX(p.beat), L.FLOOR_Y-p.height/2, p.widthBeats*L.PX_PER_BEAT, p.height), gravity: 1 as const })),
  ...L.INVERTED_PLATFORMS.map(p => ({ ...rect(L.beatX(p.beat), L.CEILING_Y+p.depth/2, p.widthBeats*L.PX_PER_BEAT, p.depth), gravity: -1 as const })),
  ...L.SPECIAL_FLOOR_PLATFORMS.map(p => ({ ...rect(L.beatX(p.beat), L.FLOOR_Y+50, p.widthBeats*L.PX_PER_BEAT, 100), gravity: 1 as const })),
  ...L.COLLAPSING_FLOORS.map((p,i) => ({ ...rect(L.beatX(p.beat), L.FLOOR_Y+28, p.widthBeats*L.PX_PER_BEAT, 56), gravity: 1 as const, collapse: i })),
  ...L.BEAT_BLOCKS.map((p,i) => ({ ...rect(L.beatX(p.beat), L.FLOOR_Y+28, p.widthBeats*L.PX_PER_BEAT, 56), gravity: 1 as const, beatBlock: i })),
  ...L.BRANCH_PLATFORMS.map(p => ({ ...rect(L.beatX(p.beat), L.FLOOR_Y-p.height, p.widthBeats*L.PX_PER_BEAT, 24), gravity: 1 as const })),
];
const hazards: Rect[] = [
  ...L.CUBE_SPIKE_BEATS.map(b => rect(L.beatX(b), L.FLOOR_Y-19.5, L.SPIKE_BODY_WIDTH,37)),
  ...L.CEILING_SPIKES.map(p => rect(L.beatX(p.beat),p.baseY+19.5,L.SPIKE_BODY_WIDTH,37)),
  ...L.MINI_CEILING_OBSTACLES.map(p => rect(L.beatX(p.beat),p.bottomY/2,p.widthBeats*L.PX_PER_BEAT,p.bottomY)),
  ...L.SHIP_HAZARDS.map(p => rect(L.beatX(p.beat),p.side==="top"?p.height/2:540-p.height/2,p.width,p.height)),
];
function overlaps(a: Rect,b: Rect) {
  return Math.abs(a.x-b.x)<(a.w+b.w)/2-0.001 && Math.abs(a.y-b.y)<(a.h+b.h)/2-0.001;
}
export function createPulseState(): PulseState {
  return {tick:0,x:L.LEVEL_START_X,y:L.FLOOR_Y-26,vy:0,mode:"cube",gravity:1,mini:false,
    grounded:false,pressed:false,jumpUntil:-1,bounceUntil:0,dashUntil:0,dashSpeed:1,
    used:[],collapseAt:L.COLLAPSING_FLOORS.map(()=>Infinity),coins:0,ended:false,completed:false};
}
export function pulseElapsed(s: PulseState) { return s.tick * PULSE_STEP_MS; }
export function pulseProgress(s: PulseState) {
  return s.completed ? 100 : Math.max(0,Math.min(100,(s.x-L.LEVEL_START_X)/(L.LEVEL_END_X-L.LEVEL_START_X)*100));
}
export function applyPulseInput(s: PulseState,input: L.PulseInput) {
  const down=input.action==="down";
  if (down===s.pressed) return;
  s.pressed=down;
  if(down && s.mode==="cube") s.jumpUntil=pulseElapsed(s)+120;
}
export function stepPulse(s: PulseState, ignoreDeath=false) {
  if(s.ended) return;
  const t=pulseElapsed(s),dt=PULSE_STEP_MS/1000;
  const mode=L.pulseModeAtX(s.x);
  if(mode!==s.mode) {
    s.mode=mode;s.mini=false;s.gravity=1;s.grounded=false;
    s.y=mode==="ship"?300:L.FLOOR_Y-28;s.vy=mode==="ship"?-80:0;
  }
  s.gravity=mode==="cube"?L.pulseGravityAtX(s.x):1;
  const mini=mode==="cube" && L.pulseMiniAtX(s.x);
  if(mini!==s.mini && s.grounded && s.gravity===1) s.y=L.FLOOR_Y-(mini?L.CUBE_BODY_SIZE*.7:L.CUBE_BODY_SIZE)/2;
  s.mini=mini;
  const size=L.CUBE_BODY_SIZE*(mini?.7:1),w=mode==="ship"?52:size,h=mode==="ship"?28:size;
  const previous=rect(s.x,s.y,w,h);
  if(mode==="cube" && s.grounded && t>=s.bounceUntil && (s.pressed||t<=s.jumpUntil)) {
    s.vy=-L.CUBE_JUMP_SPEED*s.gravity;s.jumpUntil=-1;
  }
  const beat=(s.x-L.LEVEL_START_X)/L.PX_PER_BEAT;
  const acceleration=mode==="cube"?L.CUBE_GRAVITY*s.gravity:(s.pressed?-1450:1050)+L.pulseWindAtBeat(beat);
  const max=mode==="cube"?L.CUBE_MAX_VERTICAL_SPEED:430;
  s.vy=Math.max(-max,Math.min(max,s.vy+acceleration*dt));
  s.x+=L.RUN_SPEED*(t<s.dashUntil?s.dashSpeed:1)*dt;
  s.y+=s.vy*dt;s.grounded=false;
  let dead=false;
  const body=()=>rect(s.x,s.y,w,h);
  const surface=L.pulseSurfaceState(mode,s.gravity,L.pulseUsesSegmentedFloorAtX(s.x));
  if(surface.groundEnabled && s.vy>=0 && s.y+h/2>=L.FLOOR_Y && previous.y+h/2<=L.FLOOR_Y+1) {
    s.y=L.FLOOR_Y-h/2;s.vy=0;s.grounded=true;
  }
  if(surface.ceilingEnabled && s.vy<=0 && s.y-h/2<=L.CEILING_Y && previous.y-h/2>=L.CEILING_Y-1) {
    s.y=L.CEILING_Y+h/2;s.vy=0;s.grounded=true;
  }
  const currentBeat=(s.x-L.LEVEL_START_X)/L.PX_PER_BEAT;
  for(const p of platforms) {
    if(p.collapse!==undefined && t>=s.collapseAt[p.collapse]) continue;
    if(p.beatBlock!==undefined && !L.pulseBeatBlockActive(L.BEAT_BLOCKS[p.beatBlock],currentBeat)) continue;
    if(Math.abs(s.x-p.x)>=(w+p.w)/2-.001) continue;
    const top=p.y-p.h/2,bottom=p.y+p.h/2;
    const land=mode==="cube"&&s.gravity===p.gravity && (p.gravity===1
      ? s.vy>=0&&previous.y+h/2<=top+1&&s.y+h/2>=top
      : s.vy<=0&&previous.y-h/2>=bottom-1&&s.y-h/2<=bottom);
    if(land){
      s.y=p.gravity===1?top-h/2:bottom+h/2;s.vy=0;s.grounded=true;
      if(p.collapse!==undefined && !Number.isFinite(s.collapseAt[p.collapse])) s.collapseAt[p.collapse]=t+150;
    } else if(overlaps(body(),p)) dead=true;
  }
  const dynamic: Rect[] = [
    ...L.CUBE_PRESS_GATES.map(p=>rect(L.beatX(p.beat),L.pulsePressGateBottomAtBeat(p,currentBeat)-230,p.width,460)),
    ...L.SHIP_MOVING_HAZARDS.map(p=>rect(L.beatX(p.beat),L.pulseMovingHazardYAtBeat(p,currentBeat),p.width,p.height)),
    ...L.SHIP_GATES.flatMap(p=>{
      const gap=L.pulseGateGapAtBeat(p,currentBeat);
      return [rect(L.beatX(p.beat),p.gapY-gap/2-180,44,360),rect(L.beatX(p.beat),p.gapY+gap/2+180,44,360)];
    }),
  ];
  if([...hazards,...dynamic].some(p=>overlaps(body(),p))) dead=true;
  const use=(key:string,r:Rect,fn:()=>void)=>{
    if(!s.used.includes(key)&&overlaps(body(),r)){s.used.push(key);fn();}
  };
  if(mode==="cube") {
    [...L.BOUNCE_PADS.map(p=>({...p,gravity:1 as const})),...L.INVERTED_BOUNCE_PADS.map(p=>({...p,gravity:-1 as const}))].forEach((p,i)=>{
      if(p.gravity===s.gravity)use("pad:"+i,rect(L.beatX(p.beat),p.gravity===1?L.FLOOR_Y-6:L.CEILING_Y+6,L.BOUNCE_PAD_WIDTH,12),()=>{
        s.vy=-p.power*s.gravity;s.jumpUntil=-1;s.bounceUntil=t+240;s.grounded=false;
      });
    });
    if(s.pressed){
      L.AIR_JUMP_RINGS.forEach((p,i)=>use("air:"+i,rect(L.beatX(p.beat),p.y,L.AIR_RING_BODY_SIZE,L.AIR_RING_BODY_SIZE),()=>{
        s.vy=-p.power*s.gravity;s.jumpUntil=-1;s.grounded=false;
      }));
      L.DASH_RINGS.forEach((p,i)=>use("dash:"+i,rect(L.beatX(p.beat),p.y,58,58),()=>{
        s.dashUntil=t+p.durationMs;s.dashSpeed=p.speedMultiplier;
      }));
    }
  }
  L.PULSE_COINS.forEach((p,i)=>use("coin:"+i,rect(L.beatX(p.beat),p.y,36,36),()=>s.coins++));
  s.tick++;
  if(s.y<12||s.y>528) {
    if(ignoreDeath){s.y=mode==="ship"?270:s.gravity===1?L.FLOOR_Y-72:L.CEILING_Y+72;s.vy=0;}
    else dead=true;
  }
  if(s.x>=L.LEVEL_END_X) {s.completed=true;s.ended=true;}
  else if(dead&&!ignoreDeath)s.ended=true;
}
export function validPulseInputs(value: unknown): value is L.PulseInput[] {
  if(!Array.isArray(value)||value.length>MAX_PULSE_INPUTS)return false;
  let previous=-1,pressed=false;
  for(const v of value){
    if(!v||typeof v!=="object"||!Number.isInteger(v.atMs)||v.atMs<0||v.atMs<previous||v.atMs>MAX_PULSE_DURATION_MS)return false;
    if(v.action!=="down"&&v.action!=="up")return false;
    if((v.action==="down")===pressed)return false;
    pressed=v.action==="down";previous=v.atMs;
  }
  return true;
}
export function replayPulse(inputs: L.PulseInput[],durationMs=MAX_PULSE_DURATION_MS) {
  if(!validPulseInputs(inputs)||!Number.isFinite(durationMs)||durationMs<0||durationMs>MAX_PULSE_DURATION_MS)throw new Error("invalid replay");
  const state=createPulseState();let cursor=0;
  while(!state.ended&&pulseElapsed(state)<durationMs+PULSE_STEP_MS) {
    while(cursor<inputs.length&&inputs[cursor].atMs<=pulseElapsed(state)+.00001)applyPulseInput(state,inputs[cursor++]);
    stepPulse(state);
  }
  return {state,progressPercent:Math.round(pulseProgress(state)*100)/100,durationMs:Math.round(pulseElapsed(state)),
    completed:state.completed,coins:state.coins,finished:state.ended,consumedInputs:cursor};
}
