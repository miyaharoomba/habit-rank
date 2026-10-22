import assert from "node:assert/strict";
import test from "node:test";
import {deliverPushDevices} from "../lib/push/deliverPushDevices.ts";
const device=n=>({endpoint:"https://fcm.googleapis.com/fcm/send/"+n,p256dh:"test",auth:"test"});
test("a failed device is retried without resending to successful devices",async()=>{
 const sent=[];const devices=[device("one"),device("two")];
 const first=await deliverPushDevices({devices,deliveredTo:[],payload:"test",disable:async()=>{},send:async d=>{sent.push(d.endpoint);if(d===devices[1])throw Object.assign(new Error("temporary"),{statusCode:503});}});
 assert.equal(first.deliveredTo.length,1);assert.equal(first.lastError,"temporary");
 sent.length=0;
 const retry=await deliverPushDevices({devices,deliveredTo:first.deliveredTo,payload:"test",disable:async()=>{},send:async d=>sent.push(d.endpoint)});
 assert.deepEqual(sent,[devices[1].endpoint]);assert.equal(retry.lastError,null);assert.equal(retry.deliveredTo.length,2);
});
test("expired and unsafe device endpoints are disabled, bounded delivery concurrency",async()=>{
 const disabled=[];let active=0,max=0;
 const devices=Array.from({length:12},(_,i)=>device(i));
 devices.push({endpoint:"https://127.0.0.1/",p256dh:"",auth:""});
 const result=await deliverPushDevices({devices,deliveredTo:[],payload:"test",
 disable:async endpoint=>disabled.push(endpoint),
 send:async d=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;if(d===devices[0])throw {statusCode:410};}
 });
 assert.ok(max<=4);assert.equal(result.lastError,null);assert.equal(result.deliveredTo.length,11);
 assert.deepEqual(new Set(disabled),new Set([devices[0].endpoint,"https://127.0.0.1/"]));
});
