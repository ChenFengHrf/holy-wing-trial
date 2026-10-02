import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handle} from '../dist/server/index.js';
const origin='https://game.example',secret='test-only-secret-do-not-use-in-production';
const start=1800000000;
function create(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('drizzle/0000_friendly_black_cat.sql','utf8'));
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
