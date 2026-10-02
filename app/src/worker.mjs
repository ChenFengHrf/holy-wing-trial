const TTL=90, ADMIN_TTL=28800, PLAYER_TTL=86400;
const FRONTEND_ORIGIN='https://chenfenghrf.github.io';
const publicRoutes=new Set(['/api/session','/api/presence/heartbeat','/api/presence/leave']);
const encoder=new TextEncoder();
const validId=value=>typeof value==='string'&&/^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value);
const heroNames={long:'龙皓晨',caier:'圣采儿'};
const modes=new Set(['select','playing','paused','over','away']);
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async text=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
async function equal(a,b){const [x,y]=await Promise.all([digest(a),digest(b)]);let mismatch=0;for(let i=0;i<x.length;i++)mismatch|=x.charCodeAt(i)^y.charCodeAt(i);return mismatch===0}
async function signature(secret,value){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,encoder.encode('player:'+value)));
}
function cookie(request,name){
  const values=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
  return values.length===1?values[0].slice(name.length+1):'';
}
function cookieHeader(name,value,seconds,env){
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${env.SITE_ORIGIN.startsWith('https:')?'; Secure':''}`;
}
function policy(scripts="'self'"){return `default-src 'self'; script-src ${scripts}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`}
function reply(body,status=200,contentType='application/json; charset=utf-8',extras={}){
  const headers={'Content-Type':contentType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':policy(),...extras};
  return new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers});
}
const denied=()=>reply('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>需要管理员权限</title><body style="font-family:sans-serif;background:#f5d582;color:#4b3119;padding:10vh 8vw"><h1>需要管理员权限</h1><p>请使用你的管理员专用链接进入。</p><a href="/">返回游戏</a></body></html>',403,'text/html; charset=utf-8');
const locationText=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,100):'';
function validIP(value){
  if(typeof value!=='string'||value.length>45)return '';
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(value)&&value.split('.').every(n=>Number(n)<=255))return value;
  if(!/^[a-f\d:.]+$/i.test(value)||!value.includes(':'))return '';
  try{return new URL('http://['+value+']/').hostname.slice(1,-1)}catch(_){return ''}
}
function maskIP(ip){
  if(!ip)return '';
  if(!ip.includes(':'))return ip.split('.').slice(0,3).join('.')+'.*';
  // Expand before masking so compressed IPv6 does not accidentally reveal its host part.
  const halves=ip.split('::'),left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];
  const parts=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;
  return parts.slice(0,3).join(':')+':*';
}
export function clientLocation(request,env){
  const empty={ip_masked:'',country_code:'',region:'',city:'',network:'',source:'unavailable'};
  // Local Miniflare previews contain placeholder geography: never present it as a real location.
  if(!env.SITE_ORIGIN.startsWith('https:'))return {...empty,source:'local'};
  const ip=validIP(request.headers.get('CF-Connecting-IP'));
  if(ip==='2a06:98c0:3600::103')return {...empty,source:'proxy'};
  if(!ip)return empty;
  const cf=request.cf||{},rawCountry=locationText(cf.country||request.headers.get('CF-IPCountry')).toUpperCase();
  const country=/^[A-Z]{2}$/.test(rawCountry)&&!['XX','ZZ'].includes(rawCountry)?rawCountry:'';
  // Only Cloudflare ingress metadata is used; ignore X-Forwarded-For and client-supplied payload fields.
  return {ip_masked:maskIP(ip),country_code:country,region:locationText(cf.region),city:locationText(cf.city),network:locationText(cf.asOrganization),source:cf.country?'cloudflare':country?'country-only':'ip-only'};
}
async function connectionInfo(request,env,now,location){
  const origin=request.headers.get('Origin');
  const entrypoint=origin===FRONTEND_ORIGIN?'github':origin===env.SITE_ORIGIN?(env.SITE_ORIGIN.startsWith('https:')?'site':'local'):'unknown';
  // Compare exact addresses using a daily, secret-keyed identifier. Never store the raw IP
  // or equate different addresses just because their masked prefixes look the same.
  const ip=location.ip_masked?validIP(request.headers.get('CF-Connecting-IP')):'';
  return {entrypoint,exitKey:ip?await signature(env.ADMIN_TOKEN,`network|${Math.floor(now/86400)}|${ip}`):''};
}
// D1 is shared across all Worker instances; presence and sessions cannot live in isolate memory.
const statement=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);
async function admin(request,env,now){
  const value=cookie(request,'trial_admin');
  if(!/^[a-f0-9]{64}$/.test(value))return false;
  const row=await statement(env,'SELECT key_hash FROM admin_sessions WHERE hash = ? AND expires > ?',await digest(value),now).first();
  return !!row&&await equal(row.key_hash,await digest(env.ADMIN_TOKEN));
}
async function player(request,env,now){
  const remote=request.headers.get('Origin')===FRONTEND_ORIGIN;
  const value=remote?(request.headers.get('Authorization')||'').replace(/^Bearer /,''):cookie(request,'trial_player');
  if(value.length>160)return null;
  const [id,end,mac,...extra]=value.split('.');
  if(extra.length||!/^[a-f0-9]{32}$/.test(id||'')||!/^\d{10,13}$/.test(end||'')||!/^[a-f0-9]{64}$/.test(mac||'')||Number(end)<=now)return null;
  return await equal(mac,await signature(env.ADMIN_TOKEN,`${id}.${end}${remote?'|'+FRONTEND_ORIGIN:''}`))?id:null;
}
async function login(request,env,url,now){
  const tokens=url.searchParams.getAll('token');
  if(tokens.length!==1||tokens[0].length>256||!await equal(tokens[0],env.ADMIN_TOKEN))return denied();
  const session=randomToken();
  await env.DB.batch([
    statement(env,'DELETE FROM admin_sessions WHERE expires <= ?',now),
    statement(env,'INSERT INTO admin_sessions (hash,key_hash,expires) VALUES (?,?,?)',await digest(session),await digest(env.ADMIN_TOKEN),now+ADMIN_TTL),
  ]);
  const nonce=randomToken();
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>进入管理后台</title><script nonce="${nonce}">history.replaceState(null,'','/admin/');location.replace('/admin/');</script><p>验证通过。<a href="/admin/">进入管理后台</a></p></html>`;
  return reply(html,200,'text/html; charset=utf-8',{'Set-Cookie':cookieHeader('trial_admin',session,ADMIN_TTL,env),'Content-Security-Policy':policy(`'nonce-${nonce}'`)});
}
async function online(env,now){
  const result=await env.DB.batch([
    statement(env,'DELETE FROM presence WHERE last_seen <= ?',now-TTL),
    statement(env,'SELECT * FROM presence WHERE last_seen > ? ORDER BY last_seen DESC LIMIT 1000',now-TTL),
  ]);
  const groups=new Map();
  for(const row of result[1].results){if(!groups.has(row.visitor))groups.set(row.visitor,[]);groups.get(row.visitor).push(row)}
  const players=[];
  for(const sessions of groups.values()){
    const latest=sessions.find(p=>p.mode!=='away')||sessions[0];
    players.push({name:latest.name,hero:latest.hero,character:heroNames[latest.hero],mode:latest.mode,score:latest.score,tabs:sessions.length,online_seconds:Math.max(0,now-Math.min(...sessions.map(p=>p.first_seen))),last_seen:Math.max(...sessions.map(p=>p.last_seen)),entrypoints:[...new Set(sessions.map(p=>p.entrypoint||'unknown'))].sort(),exitKey:latest.exit_key,location:{ip_masked:latest.ip_masked,country_code:latest.country_code,region:latest.region,city:latest.city,network:latest.network,source:latest.location_source||'unavailable'}});
  }
  players.sort((a,b)=>b.last_seen-a.last_seen);
  const exits=new Map();
  for(const p of players)if(p.exitKey){if(!exits.has(p.exitKey))exits.set(p.exitKey,{id:exits.size+1,count:0});exits.get(p.exitKey).count++}
  for(const p of players){const exit=exits.get(p.exitKey);p.location.network_group=exit?.id||null;p.location.shared_exit_visitors=exit?.count||0;delete p.exitKey}
  return {players,online:players.length,playing:players.filter(p=>p.mode==='playing').length,paused:players.filter(p=>p.mode==='paused').length,updated_at:now,offline_after_seconds:TTL};
}
async function readPayload(request){
  const reader=request.body?.getReader();
  if(!reader)throw new Error('请求大小无效');
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw new Error('请求大小无效')}chunks.push(value)}
  if(!size)throw new Error('请求大小无效');
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}
  const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('在线信息无效');
  return payload;
}
async function presence(request,env,path,now){
  // A signed visitor credential owns records; submitted visitor IDs are never trusted.
  const visitor=await player(request,env,now);
  if(!visitor)return reply({error:'请刷新游戏页面后重试'},403);
  let p;
  try{
    p=await readPayload(request);
    const fields=path.endsWith('/leave')?['visitor','session']:['visitor','session','name','hero','mode','score'];
    if(Object.keys(p).length!==fields.length||!fields.every(k=>Object.hasOwn(p,k))||!validId(p.visitor)||!validId(p.session))throw new Error('在线信息无效');
    if(path.endsWith('/heartbeat')){
      if(typeof p.name!=='string'||Array.from(p.name).length>20||/[\x00-\x1f\x7f]/.test(p.name))throw new Error('昵称最多 20 个字');
      if(typeof p.hero!=='string'||!Object.hasOwn(heroNames,p.hero)||!modes.has(p.mode))throw new Error('人物或状态无效');
      if(!Number.isInteger(p.score)||p.score<0||p.score>1000000)throw new Error('分数无效');
    }
  }catch(_){return reply({error:'在线信息无效，请刷新页面后重试'},400)}
  if(path.endsWith('/leave')){
    await statement(env,'DELETE FROM presence WHERE visitor = ? AND session = ?',visitor,p.session.toLowerCase()).run();
  }else{
    const count=await statement(env,'SELECT COUNT(*) AS total FROM presence WHERE last_seen > ?',now-TTL).first();
    const previous=await statement(env,'SELECT last_seen FROM presence WHERE visitor = ? AND session = ?',visitor,p.session.toLowerCase()).first();
    if(!previous&&count.total>=1000)return reply({error:'在线连接较多，请稍后重试'},429);
    const location=clientLocation(request,env);
    const connection=await connectionInfo(request,env,now,location);
    await env.DB.batch([
      statement(env,'DELETE FROM presence WHERE last_seen <= ?',now-TTL),
      statement(env,`INSERT INTO presence (visitor,session,name,hero,mode,score,first_seen,last_seen,ip_masked,country_code,region,city,network,location_source,entrypoint,exit_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(visitor,session) DO UPDATE SET name=excluded.name,hero=excluded.hero,mode=excluded.mode,score=excluded.score,last_seen=excluded.last_seen,ip_masked=excluded.ip_masked,country_code=excluded.country_code,region=excluded.region,city=excluded.city,network=excluded.network,location_source=excluded.location_source,entrypoint=excluded.entrypoint,exit_key=excluded.exit_key`,visitor,p.session.toLowerCase(),p.name.trim()||`访客 · ${visitor.slice(-4).toUpperCase()}`,p.hero,p.mode,p.score,now,now,location.ip_masked,location.country_code,location.region,location.city,location.network,location.source,connection.entrypoint,connection.exitKey),
    ]);
  }
  return reply({ok:true,admin:await admin(request,env,now)});
}
async function route(request,env,now){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!['GET','HEAD','POST'].includes(method))return reply({error:'请求方式无效'},405);
  if(!env.ADMIN_TOKEN||env.ADMIN_TOKEN.length<32||!env.DB||!env.SITE_ORIGIN)return reply({error:'服务尚未准备好'},503);
  if(method==='HEAD'){
    const response=await route(new Request(request.url,{headers:request.headers}),env,now);
    return new Response(null,{status:response.status,headers:response.headers});
  }
  if(method==='POST'){
    const origin=request.headers.get('Origin');
    const remotePresence=origin===FRONTEND_ORIGIN&&path.startsWith('/api/presence/');
    if(!remotePresence&&((origin&&origin!==env.SITE_ORIGIN)||request.headers.get('Sec-Fetch-Site')==='cross-site'))return reply({error:'请求来源无效'},403);
    if(path==='/api/admin/logout'){
      await statement(env,'DELETE FROM admin_sessions WHERE hash = ?',await digest(cookie(request,'trial_admin'))).run();
      return reply({ok:true},200,undefined,{'Set-Cookie':cookieHeader('trial_admin','',0,env)});
    }
    if(['/api/presence/heartbeat','/api/presence/leave'].includes(path))return presence(request,env,path,now);
    return reply({error:'接口不存在'},404);
  }
  if(['/','/index.html','/admin','/admin/'].includes(path)&&url.searchParams.has('token'))return login(request,env,url,now);
  if(path==='/'||path==='/index.html')return reply(GAME,200,'text/html; charset=utf-8',{'Content-Security-Policy':policy(`'self' 'sha256-${GAME_HASH}'`)});
  if(path==='/api/session'){
    if(request.headers.get('Origin')===FRONTEND_ORIGIN){
      // GitHub Pages uses an origin-bound visitor token, never third-party cookies or admin credentials.
      let token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
      if(!await player(request,env,now)){
        const value=`${randomToken().slice(0,32)}.${now+PLAYER_TTL}`;
        token=`${value}.${await signature(env.ADMIN_TOKEN,value+'|'+FRONTEND_ORIGIN)}`;
      }
      return reply({presence:true,admin:false,player_token:token,expires_at:Number(token.split('.')[1])});
    }
    const extras={};
    if(!await player(request,env,now)){
      const id=randomToken().slice(0,32),value=`${id}.${now+PLAYER_TTL}`;
      extras['Set-Cookie']=cookieHeader('trial_player',`${value}.${await signature(env.ADMIN_TOKEN,value)}`,PLAYER_TTL,env);
    }
    return reply({presence:true,admin:await admin(request,env,now)},200,undefined,extras);
  }
  if(['/admin','/admin/','/admin.js','/api/admin/online'].includes(path)){
    if(!await admin(request,env,now))return path.startsWith('/api/')||path.endsWith('.js')?reply({error:'需要管理员权限'},403):denied();
    if(path==='/api/admin/online')return reply(await online(env,now));
    return path==='/admin.js'?reply(ADMIN_JS,200,'text/javascript; charset=utf-8'):reply(ADMIN,200,'text/html; charset=utf-8');
  }
  return reply({error:'页面不存在'},404);
}
export async function handle(request,env,now=Math.floor(Date.now()/1000)){
  const origin=request.headers.get('Origin'),path=new URL(request.url).pathname;
  const remote=origin===FRONTEND_ORIGIN&&publicRoutes.has(path);
  if(origin&&origin!==env.SITE_ORIGIN&&!remote)return reply({error:'请求来源无效'},403);
  if(request.method==='OPTIONS'){
    const method=request.headers.get('Access-Control-Request-Method');
    const headers=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
    if(!remote||method!==(path==='/api/session'?'GET':'POST')||headers.some(h=>!['authorization','content-type'].includes(h)))return reply({error:'请求来源无效'},403);
    return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':FRONTEND_ORIGIN,'Access-Control-Allow-Methods':method,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
  }
  const response=await route(request,env,now);
  if(remote){response.headers.set('Access-Control-Allow-Origin',FRONTEND_ORIGIN);response.headers.set('Vary','Origin')}
  return response;
}
export default {async fetch(request,env){
  try{return await handle(request,env)}
  catch(_){console.error('trial_request_failed');return reply({error:'服务暂时无法响应，请稍后重试'},503)}
}};
