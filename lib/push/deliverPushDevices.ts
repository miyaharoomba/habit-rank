import {createHash} from "node:crypto";
import {validPushEndpoint} from "./subscription";
export type PushDevice = {endpoint:string;p256dh:string;auth:string};
export async function deliverPushDevices({
  devices,deliveredTo,payload,send,disable,
}: {
  devices:PushDevice[];deliveredTo:string[];payload:string;
  send:(device:PushDevice,payload:string)=>Promise<unknown>;
  disable:(endpoint:string)=>Promise<unknown>;
}) {
 const delivered=new Set(deliveredTo);
 let lastError:string|null=null;
 // Do not let a user with many devices create unbounded simultaneous requests.
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,devices.length)},async()=>{
  while(cursor<devices.length){
   const device=devices[cursor++];
   const key=createHash("sha256").update(device.endpoint).digest("hex");
   if(delivered.has(key))continue;
   if(!validPushEndpoint(device.endpoint)){await disable(device.endpoint);continue;}
   try {await send(device,payload);delivered.add(key);}
   catch(error){
    const details=error&&typeof error==="object"?error as {statusCode?:number;message?:string}:{};
    if(details.statusCode===404||details.statusCode===410)await disable(device.endpoint);
    else lastError=String(details.message??"push delivery failed").slice(0,1000);
   }
  }
 }));
 return {deliveredTo:[...delivered],lastError};
}
