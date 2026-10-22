// Offline level-design tool. Prints a reproducible input fixture, never saves a game.
import {createPulseState,stepPulse,applyPulseInput,pulseElapsed} from "../app/games/pulse-runner/gameEngine.ts";
let beam=[{state:createPulseState(),path:null}];
let best=0;
for(let round=0;round<2500;round++){
 const next=new Map();
 for(const node of beam)for(const pressed of [false,true]){
  const s={...node.state,used:[...node.state.used],collapseAt:[...node.state.collapseAt]};
  let path=node.path;
  if(s.pressed!==pressed){const input={atMs:Math.floor(pulseElapsed(s)),action:pressed?"down":"up"};applyPulseInput(s,input);path={input,previous:path};}
  for(let k=0;k<6&&!s.ended;k++)stepPulse(s);
  if(s.completed){
   const inputs=[];for(let p=path;p;p=p.previous)inputs.push(p.input);
   console.log("FIXTURE:"+JSON.stringify(inputs.reverse()));process.exit(0);
  }
  if(s.ended)continue;
  const key=[Math.round(s.x/8),Math.round(s.y/4),Math.round(s.vy/45),s.pressed,s.grounded,s.used.slice(-2).join(",")].join(":");
  if(!next.has(key))next.set(key,{state:s,path});
 }
 beam=[...next.values()].sort((a,b)=>b.state.x-a.state.x).slice(0,320);
 if(!beam.length){console.error("No surviving path; last x="+best);process.exit(1);}
 best=Math.max(best,...beam.map(n=>n.state.x));
 if(round%150===0)console.error("round "+round+" beat "+((best-320)/190).toFixed(2)+" states "+beam.length);
}
throw new Error("course exceeds search duration");
