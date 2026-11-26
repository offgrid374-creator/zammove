import { chromium } from 'playwright-core';
const B='http://localhost:3100', sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++;};
const br=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const errs=[];
const mk=async w=>{const p=await br.newPage({viewport:{width:w,height:900}}); p.on('pageerror',e=>errs.push(e.message)); await p.goto(B+'/customer/'); await sleep(800); return p;};
const login=async(p,em,ws)=>{const r=await p.evaluate(em=>ZAPI.auth('login',{em,pw:'Demo1234'}),em); await p.evaluate(([me,ws])=>{S.me=me;S.ws=ws;save();},[r.me,ws]); await p.evaluate(()=>ZAPI.refresh());};
// owner offers a driver on one rentable vehicle
const O=await mk(1366);
let set=null;
for (const em of ['owner1@zammove.test','owner2@zammove.test']) { await login(O,em,'owner');
  set = await O.evaluate(()=>{const v=(S.vh||[]).find(v=>v.owner==S.me.em&&v.rent&&v.rent.on!==false); if(!v) return null; return ZAPI.act('vehRent',{id:v.id,on:true,day:v.rent.day,dep:Math.max(5000,+v.rent.dep||0),drv:800,seats:v.seats||'',trans:v.trans||'',fuel:v.fuel||''}).then(r=>({id:v.id,type:v.type,r}));});
  if (set) break; }
console.log('driver rate set', JSON.stringify(set&&{id:set.id,type:set.type,ok:set.r.ok,err:set.r.err}));
for (const w of [390,1366]) {
  const C=await mk(w); await login(C,'customer@zammove.test','customer');
  await C.evaluate(()=>{location.hash='#rent';view='rent';render();}); await sleep(900);
  const txt=await C.innerText('#app');
  ok(/Who drives\?/.test(txt) && /Vehicle type/.test(txt), w+': who-drives and type chips shown');
  ok(!(await C.locator('[data-rf="brand"]').count()), w+': detail filters hidden before a type is picked');
  const typeBtn=C.locator('[data-a="zf-chip"][data-k="type"]').nth(1); const tname=(await typeBtn.innerText()).split('\n')[0];
  await typeBtn.click(); await sleep(500);
  ok((await C.locator('[data-rf="trans"]').count())==1, w+': detail filters appear after picking '+tname);
  const allSame=await C.evaluate(()=>{const t=document.querySelector('[data-a="zf-chip"][data-k="type"].on').dataset.v; return [...document.querySelectorAll('.fx-model')].length>0;});
  ok(allSame, w+': vehicle cards shown for the type');
  await C.screenshot({path:`rf-${w}-type.png`,fullPage:true});
  await C.locator('[data-a="zf-chip"][data-k="wd"][data-v="drv"]').click(); await sleep(500);
  const cards=await C.locator('.fx-model').count();
  ok(cards>=1, w+': With a driver shows '+cards+' vehicle group(s)');
  await C.screenshot({path:`rf-${w}-drv.png`,fullPage:true});
  const ow=await C.evaluate(()=>ZFX.wd); ok(ow===true, w+': step 4 preselects With a driver');
  const ov=await C.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1); ok(!ov, w+': no sideways scroll');
}
ok(!errs.length,'no page errors '+errs.join('|'));
await br.close(); console.log(fails?fails+' FAILED':'ALL PASSED');
