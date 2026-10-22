import assert from "node:assert/strict";
import test from "node:test";
import { fetchPublicHtml, normalizePublicHttpUrl, isPublicAddress } from "../lib/http/publicHtml.ts";
import { authErrorMessage, safeNextPath } from "../lib/auth/errors.ts";
import { validPushEndpoint, validPushKeys } from "../lib/push/subscription.ts";

test("preview rejects private IPv4, IPv6, mapped, numeric and credential URLs",()=>{
  for(const host of ["127.0.0.1","10.2.3.4","169.254.169.254","172.16.1.2","192.168.1.3","[::1]","[::ffff:127.0.0.1]","[fc00::1]","2130706433","0x7f000001","localhost.","a.local","a.internal"])
    assert.throws(()=>normalizePublicHttpUrl("http://"+host+"/"),host);
  for(const url of ["file:///etc/passwd","https://a:b@example.com","https://example.com:8443/"])
    assert.throws(()=>normalizePublicHttpUrl(url));
  assert.equal(isPublicAddress("8.8.8.8"),true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"),true);
  assert.equal(isPublicAddress("2001:db8::1"),false);
});
test("preview pins checked DNS results and validates every redirect",async()=>{
  const calls=[];
  const resolve=async host=>{calls.push("dns:"+host);return [{address:"8.8.8.8",family:4}];};
  const transport=async(url,address)=>{
    assert.equal(address.address,"8.8.8.8");
    calls.push(url.hostname);
    return url.hostname==="example.com"?{status:302,location:"https://other.example/",html:"",contentType:""}:{status:200,html:"<title>safe</title>",contentType:"text/html"};
  };
  assert.equal((await fetchPublicHtml("https://example.com",{resolve,transport})).finalUrl,"https://other.example/");
  assert.deepEqual(calls,["dns:example.com","example.com","dns:other.example","other.example"]);
  await assert.rejects(fetchPublicHtml("https://example.com",{resolve,transport:async()=>({status:302,location:"http://127.0.0.1",html:"",contentType:""})}),/blocked_host/);
  await assert.rejects(fetchPublicHtml("https://example.com",{resolve:async()=>[{address:"8.8.8.8",family:4},{address:"10.0.0.1",family:4}],transport}),/blocked_host/);
});
test("preview bounds redirects, body size and DNS time",async()=>{
  const resolve=async()=>[{address:"8.8.8.8",family:4}];
  await assert.rejects(fetchPublicHtml("https://example.com",{resolve,transport:async()=>({status:302,location:"/",html:"",contentType:""})}),/too_many_redirects/);
  await assert.rejects(fetchPublicHtml("https://example.com",{resolve,transport:async()=>({status:200,html:"x".repeat(524289),contentType:"text/html"})}),/too_large/);
  await assert.rejects(fetchPublicHtml("https://example.com",{timeoutMs:10,resolve:()=>new Promise(r=>setTimeout(()=>r([]),50))}),/timeout/);
});
test("auth errors are actionable and never leak server messages",()=>{
  assert.match(authErrorMessage(new TypeError("Failed to fetch")),/接続できません/);
  assert.match(authErrorMessage({code:"invalid_credentials"}),/正しくありません/);
  assert.match(authErrorMessage({code:"email_not_confirmed"}),/確認メール/);
  assert.match(authErrorMessage({status:429}),/時間をおいて/);
  assert.match(authErrorMessage({},false),/接続されていません/);
  assert.ok(!authErrorMessage({message:"secret=private-key"}).includes("private-key"));
  for(const path of ["//evil.example","/\\evil.example","https://evil.example","/\n/evil.example"])assert.equal(safeNextPath(path),"/app");
  assert.equal(safeNextPath("/profile?saved=1"),"/profile?saved=1");
});
test("push subscription targets and key material are constrained",()=>{
  assert.equal(validPushEndpoint("https://fcm.googleapis.com/fcm/send/token"),true);
  for(const url of ["http://fcm.googleapis.com/","https://127.0.0.1/","https://fcm.googleapis.com.evil.test/","https://evil.test/","https://web.push.apple.com:444/"])
    assert.equal(validPushEndpoint(url),false);
  const p=Buffer.alloc(65);p[0]=4;
  assert.equal(validPushKeys(p.toString("base64url"),Buffer.alloc(16).toString("base64url")),true);
  assert.equal(validPushKeys("bad","bad"),false);
});
