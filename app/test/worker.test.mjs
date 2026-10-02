import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {handle,clientLocation} from '../dist/server/index.js';
const origin='https://game.example',secret='test-only-secret-do-not-use-in-production';
const start=1800000000;
function create(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
  const wrap=(sql,args=[])=>({bind(...a){return wrap(sql,a)},async first(){return sqlite.prepare(sql).get(...args)||null},async run(){sqlite.prepare(sql).run(...args);return {success:true}},async all(){return {results:sqlite.prepare(sql).all(...args)}}});
  const DB={prepare:sql=>wrap(sql),async batch(stmts){sqlite.exec('BEGIN');try{const result=await Promise.all(stmts.map(s=>s.all()));sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
  return {sqlite,env:{DB,ADMIN_TOKEN:secret,SITE_ORIGIN:origin}};
}
const req=(path,cookie='',payload=null)=>new Request(origin+path,{method:payload===null?'GET':'POST',headers:{Cookie:cookie,...(payload===null?{}:{Origin:origin,'Content-Type':'application/json'})},...(payload===null?{}:{body:JSON.stringify(payload)})});
const pair=response=>response.headers.get('set-cookie').split(';')[0];
async function setup(env){const r=await handle(req('/api/session'),env,start);assert.equal(r.status,200);return pair(r)}
async function login(env){const r=await handle(req('/?token='+secret),env,start);assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Secure/);assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.ok(!(await r.text()).includes(secret));return pair(r)}
const payload=(changes={})=>({visitor:'a'.repeat(32),session:'b'.repeat(32),name:'试炼者',hero:'long',mode:'playing',score:2,...changes});
test('pages and API reject absent, invalid, duplicate and forged administrator tokens',async()=>{
  const {env}=create();
  for(const path of ['/admin/','/admin.js','/api/admin/online','/?token=wrong','/?token=%E4%B8%AD%E6%96%87','/?token='+secret+'&token=wrong'])assert.equal((await handle(req(path),env,start)).status,403);
  assert.equal((await handle(req('/api/admin/online','trial_admin='+secret),env,start)).status,403);
  for(const path of ['/.env','/.admin-key','/src/admin.html','/admin.html'])assert.equal((await handle(req(path),env,start)).status,404);
  assert.equal((await handle(req('/'),env,start)).status,200);
});
test('secure sessions expire on server, are revoked at logout, and secret rotation invalidates them',async()=>{
  const {env}=create(),cookie=await login(env);
  assert.equal((await handle(req('/admin/',cookie),env,start+28799)).status,200);
  assert.equal((await handle(req('/admin/',cookie),env,start+28800)).status,403);
  assert.equal((await handle(req('/admin/',cookie),{...env,ADMIN_TOKEN:secret+'new'},start)).status,403);
  assert.equal((await handle(req('/api/admin/logout',cookie,{}),env,start)).status,200);
  assert.equal((await handle(req('/api/admin/online',cookie),env,start)).status,403);
});
test('signed visitor owns presence; multiple players and tabs are deduplicated and expire',async()=>{
  const {env}=create(),a=await setup(env),b=await setup(env),owner=await login(env);
  const beat=async(cookie,p,time=start)=>assert.equal((await handle(req('/api/presence/heartbeat',cookie,p),env,time)).status,200);
  const snapshot=async(time=start)=>await (await handle(req('/api/admin/online',owner),env,time)).json();
  await beat(a,payload());await beat(a,payload({session:'c'.repeat(32),mode:'away',hero:'caier'}),start+1);
  let s=await snapshot(start+1);assert.equal(s.online,1);assert.equal(s.players[0].tabs,2);assert.equal(s.players[0].hero,'long');
  await beat(b,payload({name:'另一位',hero:'caier'}),start+2);s=await snapshot(start+2);assert.equal(s.online,2);
  await handle(req('/api/presence/leave',b,{visitor:'a'.repeat(32),session:'c'.repeat(32)}),env,start+2);
  assert.equal((await snapshot(start+2)).players.find(p=>p.name==='试炼者').tabs,2);
  assert.equal((await snapshot(start+89)).online,2);assert.equal((await snapshot(start+92)).online,0);
});
test('anonymous writes require valid server-issued cookie and valid payload; cross-site requests fail',async()=>{
  const {env}=create(),player=await setup(env);
  assert.equal((await handle(req('/api/presence/heartbeat','',payload()),env,start)).status,403);
  assert.equal((await handle(req('/api/presence/heartbeat',player+'bad',payload()),env,start)).status,403);
  for(const changes of [{score:true},{name:'x'.repeat(21)},{hero:'constructor'},{session:'fake'},{mode:'owner'},{admin:true}])assert.equal((await handle(req('/api/presence/heartbeat',player,payload(changes)),env,start)).status,400);
  const cross=req('/api/presence/heartbeat',player,payload());cross.headers.set('Origin','https://evil.example');assert.equal((await handle(cross,env,start)).status,403);
});
test('nickname is data, leaving removes only owned tab, missing runtime config fails closed',async()=>{
  const {env}=create(),player=await setup(env),owner=await login(env);
  await handle(req('/api/presence/heartbeat',player,payload({name:'<b>昵称</b>'})),env,start);
  let snapshot=await (await handle(req('/api/admin/online',owner),env,start)).json();assert.equal(snapshot.players[0].name,'<b>昵称</b>');
  await handle(req('/api/presence/leave',player,{visitor:'a'.repeat(32),session:'b'.repeat(32)}),env,start);
  snapshot=await (await handle(req('/api/admin/online',owner),env,start)).json();assert.equal(snapshot.online,0);
  assert.equal((await handle(req('/admin/'),{...env,ADMIN_TOKEN:''},start)).status,503);
});
const github='https://chenfenghrf.github.io';
const remoteReq=(path,token='',data=null)=>new Request(origin+path,{method:data===null?'GET':'POST',headers:{Origin:github,'Sec-Fetch-Site':'cross-site',...(token?{Authorization:'Bearer '+token}:{}),...(data===null?{}:{'Content-Type':'application/json'})},...(data===null?{}:{body:JSON.stringify(data)})});
test('GitHub CORS permits only visitor endpoints and origin-bound credentials, never admin reads or logout',async()=>{
  const {env}=create(),owner=await login(env);
  const preflight=(path,method='POST',headers='authorization,content-type',source=github)=>new Request(origin+path,{method:'OPTIONS',headers:{Origin:source,'Access-Control-Request-Method':method,'Access-Control-Request-Headers':headers}});
  const pre=await handle(preflight('/api/presence/heartbeat'),env,start);
  assert.equal(pre.status,204);assert.equal(pre.headers.get('Access-Control-Allow-Origin'),github);assert.equal(pre.headers.get('Access-Control-Allow-Credentials'),null);
  for(const r of [preflight('/api/admin/online','GET'),preflight('/api/presence/heartbeat','POST','cookie'),preflight('/api/session','POST'),preflight('/api/session','GET','','https://evil.example')])assert.equal((await handle(r,env,start)).status,403);
  const session=await handle(remoteReq('/api/session'),env,start),info=await session.json();
  assert.equal(session.headers.get('Access-Control-Allow-Origin'),github);assert.equal(session.headers.get('Set-Cookie'),null);assert.equal(info.admin,false);
  const token=info.player_token;
  assert.equal((await (await handle(remoteReq('/api/session',token),env,start)).json()).player_token,token);
  assert.equal((await handle(remoteReq('/api/presence/heartbeat',token,payload()),env,start)).status,200);
  assert.equal((await handle(remoteReq('/api/presence/heartbeat',token+'x',payload()),env,start)).status,403);
  assert.equal((await handle(remoteReq('/api/presence/heartbeat',token,payload()),env,start+86400)).status,403);
  // A cookie and a cross-origin visitor token are not interchangeable.
  const localCookie=await setup(env);
  assert.equal((await handle(remoteReq('/api/presence/heartbeat',localCookie.split('=')[1],payload()),env,start)).status,403);
  assert.equal((await handle(req('/api/presence/heartbeat','trial_player='+token,payload()),env,start)).status,403);
  for(const path of ['/api/admin/online','/admin/','/admin.js']){
    const r=remoteReq(path,token);r.headers.set('Cookie',owner);
    const denied=await handle(r,env,start);assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
  }
  const logout=remoteReq('/api/admin/logout','',{});logout.headers.set('Cookie',owner);
  assert.equal((await handle(logout,env,start)).status,403);
  assert.equal((await handle(req('/api/admin/online',owner),env,start)).status,200);
  assert.equal((await handle(remoteReq('/api/presence/leave',token,{visitor:'a'.repeat(32),session:'b'.repeat(32)}),env,start)).status,200);
});

function bootGithub(env,storage=new Map(),locks={request:(_,fn)=>fn()},search='',clock){
  const elements=new Map(),tools=new Map(),events={},requests=[],redirects=[];
  const ctx=new Proxy({}, {get:(_,key)=>key.includes('Gradient')?()=>({addColorStop(){}}):()=>{},set:()=>true});
  function el(id){if(!elements.has(id))elements.set(id,{hidden:false,dataset:{},listeners:{},focus(){},classList:{add(){},remove(){}},getContext:()=>ctx,setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn}});return elements.get(id)}
  const cards=['long','caier'].map(id=>{const c=el('card-'+id);c.dataset.hero=id;return c});
  const location={origin:github,protocol:'https:',pathname:'/holy-wing-trial/',search,hash:'',replace:url=>redirects.push(url)};
  const window={location,history:{replaceState:(_,__,url)=>requests.push({history:url})},crypto,navigator:{locks},addEventListener:(type,fn)=>events[type]=fn,setTimeout,clearTimeout,setInterval:()=>0,fetch:async(url,options)=>{
    assert.equal(new URL(url).origin,'https://holy-wing-trial.luz22stantonqvy.chatgpt.site');
    assert.equal(options.credentials,'omit');requests.push({url,options});
    const r=new Request(url,{...options,headers:{...options.headers,Origin:github,'Sec-Fetch-Site':'cross-site'}});
    const response=await handle(r,env,clock?.now);assert.equal(response.headers.get('Access-Control-Allow-Origin'),github);return response;
  }};
  const sandbox={window,document:{getElementById:el,querySelectorAll:()=>cards,body:{dataset:{}},addEventListener(){},modelContext:{registerTool:t=>tools.set(t.name,t)}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},AbortController,performance:{now:()=>0},setTimeout,requestAnimationFrame(){},URL,URLSearchParams};
  const script=readFileSync('src/game.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script,sandbox);
  return {elements,tools,events,requests,redirects};
}
const until=async predicate=>{for(let i=0;i<100;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,10))}assert.fail('Timed out waiting for client state')};
test('actual GitHub game client reports two tabs as one visitor, changes character and leaves cleanly',async()=>{
  const {env}=create(),storage=new Map();let queue=Promise.resolve();
  const locks={request:(_,fn)=>{const next=queue.then(fn);queue=next.catch(()=>{});return next}};
  // The D1 test adapter uses a single synchronous connection; serialize simulated network requests.
  let network=Promise.resolve();const originalBatch=env.DB.batch;
  env.DB.batch=stmts=>{const next=network.then(()=>originalBatch(stmts));network=next.catch(()=>{});return next};
  const clock={now:Math.floor(Date.now()/1000)};
  const a=bootGithub(env,storage,locks,'',clock),b=bootGithub(env,storage,locks,'',clock);
  await until(()=>[a,b].every(c=>c.elements.get('presenceStatus').textContent==='在线状态已同步'));
  assert.deepEqual(a.redirects,[]);assert.equal(a.elements.get('adminLink').hidden,true);
  const now=Math.floor(Date.now()/1000),loginResponse=await handle(req('/?token='+secret),env,now),owner=pair(loginResponse);
  const snapshot=async()=>await (await handle(req('/api/admin/online',owner),env,clock.now)).json();
  let state=await snapshot();assert.equal(state.online,1);assert.equal(state.players[0].tabs,2);
  clock.now+=1;a.tools.get('select_trial_hero').execute({hero:'caier'});
  a.elements.get('playerName').value='GitHub玩家';a.elements.get('playerName').listeners.input();
  await until(async()=>{const s=await snapshot();return s.players.some(p=>p.name==='GitHub玩家'&&p.hero==='caier')});
  a.events.pagehide();await until(async()=>(await snapshot()).players[0]?.tabs===1);
  b.events.pagehide();await until(async()=>(await snapshot()).online===0);
});
test('only an explicit token in the GitHub URL redirects to administrator login',()=>{
  const {env}=create(),a=bootGithub(env,new Map(),undefined,'?token=example-secret');
  assert.equal(a.redirects.length,1);assert.equal(new URL(a.redirects[0]).searchParams.get('token'),'example-secret');
  assert.equal(a.requests[0].history,'/holy-wing-trial/');assert.equal(a.requests.filter(r=>r.url).length,0);
});
function withNetwork(request,ip,cf){
  request.headers.set('CF-Connecting-IP',ip);
  if(cf)Object.defineProperty(request,'cf',{value:cf});
  return request;
}
test('edge location is stored masked, updates with the connection and is visible only to administrators',async()=>{
  const {env,sqlite}=create(),guest=await setup(env),owner=await login(env);
  const r=withNetwork(req('/api/presence/heartbeat',guest,payload()),'203.0.113.25',{country:'CN',region:'Guangdong',city:'Shenzhen',asOrganization:'Example Network'});
  r.headers.set('X-Forwarded-For','8.8.8.8');r.headers.set('CF-Connecting-IPv6','2001:db8:ffff::1234');
  const posted=await handle(r,env,start);assert.deepEqual(await posted.json(),{ok:true,admin:false});
  const snapshot=await (await handle(req('/api/admin/online',owner),env,start)).json();
  assert.deepEqual(snapshot.players[0].location,{ip_masked:'203.0.113.*',country_code:'CN',region:'Guangdong',city:'Shenzhen',network:'Example Network',source:'cloudflare'});
  assert.equal((await handle(req('/api/admin/online',guest),env,start)).status,403);
  assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM presence').all()).includes('203.0.113.25'));
  assert.equal((await handle(req('/api/presence/heartbeat',guest,payload({city:'fake'})),env,start)).status,400);
  const changed=withNetwork(req('/api/presence/heartbeat',guest,payload()),'2001:db8:abcd:1234::9876',{country:'US',region:'California',city:'San Francisco'});
  await handle(changed,env,start+1);
  const updated=await (await handle(req('/api/admin/online',owner),env,start+1)).json();
  assert.equal(updated.players[0].location.ip_masked,'2001:db8:abcd:*');assert.equal(updated.players[0].location.city,'San Francisco');
  await handle(req('/api/admin/online',owner),env,start+91);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM presence').get().n,0);
});
test('local, missing, invalid and cross-zone proxy addresses never fabricate geography',()=>{
  const {env}=create();
  const incoming=withNetwork(req('/'),'203.0.113.25',{country:'US',region:'Texas',city:'Austin'});
  assert.equal(clientLocation(incoming,{...env,SITE_ORIGIN:'http://127.0.0.1:8833'}).source,'local');
  const noIP=req('/');noIP.headers.set('X-Forwarded-For','8.8.8.8');assert.equal(clientLocation(noIP,env).country_code,'');
  for(const ip of ['999.2.3.4','203.0.113.25, 8.8.8.8','2a06:98c0:3600::103']){
    const info=clientLocation(withNetwork(req('/'),ip,{country:'US',city:'Austin'}),env);assert.equal(info.ip_masked,'');assert.equal(info.city,'');
  }
  const countryOnly=withNetwork(req('/'),'203.0.113.25');countryOnly.headers.set('CF-IPCountry','JP');
  assert.deepEqual(clientLocation(countryOnly,env),{ip_masked:'203.0.113.*',country_code:'JP',region:'',city:'',network:'',source:'country-only'});
});
