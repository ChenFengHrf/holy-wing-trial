import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync('src/admin.js','utf8');
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
const person=(changes={})=>({name:'访客',hero:'long',character:'龙皓晨',mode:'select',score:0,tabs:1,online_seconds:10,last_seen:1800000000,...changes});
const data=(players=[person()])=>({players,online:players.length,playing:players.filter(p=>p.mode==='playing').length,paused:players.filter(p=>p.mode==='paused').length,updated_at:1800000000});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
class Element{
  constructor(){this.children=[];this.value='';this.hidden=false;this.disabled=false;this.dataset={};this.listeners={};this.attrs={};this.text='';const classes=new Set();this.classList={add:s=>classes.add(s),remove:s=>classes.delete(s),contains:s=>classes.has(s)}}
  set textContent(value){this.text=String(value);this.children=[]}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('')}
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=children;this.text=''}
  setAttribute(k,v){this.attrs[k]=v}
  addEventListener(type,fn){this.listeners[type]=fn}
}
async function browser(responder=()=>json(data())){
  const nodes=new Map(),timers=new Map(),windowEvents={},documentEvents={},calls=[];
  let now=1800000000000,serial=0,reply=responder;
  const el=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
  const timer=(fn,ms,repeat=0)=>{const id=++serial;timers.set(id,{fn,at:now+ms,repeat});return id};
  const document={hidden:false,getElementById:el,createElement:()=>new Element(),createDocumentFragment:()=>new Element(),addEventListener:(type,fn)=>documentEvents[type]=fn};
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
  const context={document,window:{addEventListener:(type,fn)=>windowEvents[type]=fn},Date:ClockDate,AbortController,AbortSignal,location:{replace(){}},setTimeout:(fn,ms)=>timer(fn,ms),clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>timer(fn,ms,ms),clearInterval:id=>timers.delete(id),fetch:(url,options)=>{calls.push({url,options});return Promise.resolve().then(()=>reply(url,options))}};
  vm.runInNewContext(script,context);
  await flush();
  return {el,calls,document,set reply(fn){reply=fn},
    async event(type){(windowEvents[type]||documentEvents[type])?.();await flush()},
    async click(id){el(id).listeners.click();await flush()},
    async advance(ms){
      const end=now+ms;
      while(true){const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
        const [id,t]=next;now=t.at;if(t.repeat)t.at+=t.repeat;else timers.delete(id);t.fn();await flush();
      }
      now=end;await flush();
    }
  };
}

test('polls automatically, displays countdown and counts only successful updates',async()=>{
  const app=await browser();assert.equal(app.calls.length,1);assert.match(app.el('lastUpdate').textContent,/已更新 1 次/);
  assert.match(app.el('autoRefresh').textContent,/3 秒后刷新/);
  await app.advance(1000);assert.match(app.el('autoRefresh').textContent,/2 秒后刷新/);
  await app.advance(2000);assert.equal(app.calls.length,2);assert.match(app.el('lastUpdate').textContent,/已更新 2 次/);
  assert.notEqual(app.calls[0].url,app.calls[1].url);assert.equal(app.calls[1].options.cache,'no-store');
});
test('new server state updates character, score and counts; selection is separate from playing',async()=>{
  const app=await browser();assert.equal(app.el('selectCount').textContent,'1');assert.equal(app.el('longCount').textContent,'0');
  assert.match(app.el('players').textContent,/预选 · 龙皓晨/);
  app.reply=()=>json(data([person({hero:'caier',character:'圣采儿',mode:'playing',score:8})]));
  await app.advance(3000);assert.equal(app.el('caierCount').textContent,'1');assert.equal(app.el('selectCount').textContent,'0');
  assert.equal(app.el('playingCount').textContent,'1');assert.match(app.el('players').textContent,/圣采儿/);assert.match(app.el('players').textContent,/8/);
  app.reply=()=>json(data([]));await app.advance(3000);assert.equal(app.el('onlineCount').textContent,'0');assert.equal(app.el('playerTable').hidden,true);
});
test('stalled request times out, leaves refresh usable and reconnects automatically',async()=>{
  const app=await browser(()=>new Promise(()=>{}));await app.advance(12000);
  assert.equal(app.calls[0].options.signal.aborted,true);assert.match(app.el('autoRefresh').textContent,/3 秒后重试/);assert.equal(app.el('refresh').disabled,false);
  app.reply=()=>json(data());await app.advance(3000);assert.match(app.el('lastUpdate').textContent,/已更新 1 次/);assert.equal(app.el('notice').hidden,true);
});
test('manual refresh cancels a hung request and late responses cannot overwrite newer data',async()=>{
  let finish;const app=await browser(()=>new Promise(resolve=>finish=resolve));
  app.reply=()=>json(data([]));await app.click('refresh');assert.equal(app.calls[0].options.signal.aborted,true);assert.equal(app.el('onlineCount').textContent,'0');
  finish(json(data([person()])));await flush();assert.equal(app.el('onlineCount').textContent,'0');assert.match(app.el('lastUpdate').textContent,/已更新 1 次/);
});
test('transient HTML 403 retries; real JSON auth failure clears private data and stops polling',async()=>{
  const app=await browser();app.reply=()=>new Response('Temporary edge error',{status:403,headers:{'content-type':'text/html'}});
  await app.advance(3000);assert.equal(app.el('onlineCount').textContent,'1');assert.equal(app.el('refresh').disabled,false);assert.equal(app.el('panel').classList.contains('stale'),true);
  app.reply=()=>json(data());await app.advance(3000);assert.match(app.el('lastUpdate').textContent,/已更新 2 次/);
  app.reply=()=>json({error:'需要管理员权限'},403);await app.advance(3000);
  assert.equal(app.el('players').textContent,'');assert.equal(app.el('onlineCount').textContent,'—');assert.equal(app.el('refresh').disabled,true);
  const count=app.calls.length;await app.advance(60000);assert.equal(app.calls.length,count);assert.match(app.el('autoRefresh').textContent,/请重新登录/);
});
test('returning from cached page, focus and network recovery refresh immediately without overlapping requests',async()=>{
  const app=await browser();await app.event('pagehide');await app.advance(60000);assert.equal(app.calls.length,1);
  await app.event('pageshow');assert.equal(app.calls.length,2);await app.event('focus');assert.equal(app.calls.length,3);
  let finish;app.reply=()=>new Promise(resolve=>finish=resolve);await app.event('online');const count=app.calls.length;
  await app.event('focus');assert.equal(app.calls.length,count);
  app.reply=()=>json(data([]));await app.advance(2000);await app.event('focus');assert.equal(app.calls.length,count+1);
  finish(json(data([person()])));await flush();assert.equal(app.el('onlineCount').textContent,'0');
});
test('admin shows geography, masked IP and regional totals, supports region search and clears locations at logout expiry',async()=>{
  const first=person({name:'甲',location:{country_code:'CN',region:'Guangdong',city:'Shenzhen',ip_masked:'203.0.113.*',network:'Example Network',source:'cloudflare'}});
  const second=person({name:'乙',location:{country_code:'JP',region:'Tokyo',city:'Tokyo',ip_masked:'2001:db8:abcd:*',source:'cloudflare'}});
  const app=await browser(()=>json(data([first,second])));
  assert.match(app.el('regionSummary').textContent,/中国 · Guangdong 1/);assert.match(app.el('regionSummary').textContent,/日本 · Tokyo 1/);
  assert.match(app.el('players').textContent,/203\.0\.113\.\*/);assert.match(app.el('players').textContent,/Shenzhen/);
  app.el('search').value='日本';app.el('search').listeners.input();assert.match(app.el('players').textContent,/乙/);assert.ok(!app.el('players').textContent.includes('甲'));
  app.reply=()=>json({error:'需要管理员权限'},403);await app.advance(3000);assert.equal(app.el('regionSummary').textContent,'');assert.equal(app.el('players').textContent,'');
});
test('entry labels and shared network exits clarify repeated visitors and support GitHub search',async()=>{
  const first=person({name:'甲',entrypoints:['github'],location:{country_code:'US',network_group:1,shared_exit_visitors:2}});
  const second=person({name:'乙',entrypoints:['site'],location:{country_code:'US',network_group:1,shared_exit_visitors:2}});
  const app=await browser(()=>json(data([first,second])));
  assert.match(app.el('regionSummary').textContent,/GitHub 游戏 1/);assert.match(app.el('regionSummary').textContent,/站点游戏 1/);
  assert.match(app.el('regionSummary').textContent,/已识别 1 个出口/);assert.match(app.el('players').textContent,/出口 1 · 2 条访客记录/);
  app.el('search').value='github';app.el('search').listeners.input();assert.match(app.el('players').textContent,/甲/);assert.ok(!app.el('players').textContent.includes('乙'));
});
