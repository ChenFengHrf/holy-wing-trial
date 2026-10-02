(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const modes={select:'选人中',playing:'游戏中',paused:'已暂停',over:'本局结束',away:'暂离页面'};
  const POLL_MS=3000,REQUEST_TIMEOUT_MS=12000;
  let snapshot=null,expired=false,stopped=false,active=null,pollTimer=0,clockTimer=0;
  let nextPollAt=0,lastSuccessAt=0,successCount=0,failures=0;
  function updateRefreshStatus(){
    if(expired){$('autoRefresh').textContent='自动刷新已停止 · 请重新登录';return}
    if(stopped)return;
    if(active){$('autoRefresh').textContent=`自动刷新 · 正在获取最新状态（${Math.floor((Date.now()-active.started)/1000)} 秒）`;return}
    const seconds=Math.max(0,Math.ceil((nextPollAt-Date.now())/1000));
    $('autoRefresh').textContent=failures?`自动重连 · ${seconds} 秒后重试`:`自动刷新已开启 · ${seconds} 秒后刷新`;
    if(lastSuccessAt){
      const age=Math.max(0,Math.floor((Date.now()-lastSuccessAt)/1000));
      $('lastUpdate').textContent=`上次成功 ${new Date(lastSuccessAt).toLocaleTimeString('zh-CN',{hour12:false})} · ${age} 秒前 · 已更新 ${successCount} 次`;
    }
  }
  function schedule(){
    clearTimeout(pollTimer);
    if(expired||stopped)return;
    const delay=failures?Math.min(30000,POLL_MS*2**(failures-1)):POLL_MS;
    nextPollAt=Date.now()+delay;pollTimer=setTimeout(refresh,delay);updateRefreshStatus();
  }
  function cancelRequest(){
    if(active){active.controller.abort();clearTimeout(active.timeout);active=null}
  }
  const duration=s=>s<60?`${s} 秒`:`${Math.floor(s/60)} 分${s%60?` ${s%60} 秒`:''}`;
  let countryNames;try{countryNames=new Intl.DisplayNames(['zh-CN'],{type:'region'})}catch(_){}
  const countryName=code=>{if(!/^[A-Z]{2}$/.test(code||''))return '';try{return countryNames?.of(code)||code}catch(_){return code}};
  const entryNames={github:'GitHub 游戏',site:'站点游戏',local:'本地游戏',unknown:'入口待确认'};
  const entryLabel=p=>(p.entrypoints||['unknown']).map(v=>entryNames[v]||entryNames.unknown).join(' / ');
  function locationLabel(location={}){
    const parts=[countryName(location.country_code),location.region,location.city].filter(Boolean);
    if(parts.length)return [...new Set(parts)].join(' · ');
    return location.source==='local'?'本地网络':location.source==='proxy'?'中转网络 · 暂未识别':'暂未识别';
  }
  function renderRegions(players){
    const groups=new Map();
    for(const p of players){const loc=p.location||{},label=[countryName(loc.country_code),loc.region].filter(Boolean).join(' · ')||locationLabel(loc);groups.set(label,(groups.get(label)||0)+1)}
    const sorted=[...groups].sort((a,b)=>b[1]-a[1]),shown=sorted.slice(0,6).map(([name,count])=>`${name} ${count}`);
    if(sorted.length>6)shown.push(`其他地区 ${sorted.slice(6).reduce((sum,item)=>sum+item[1],0)}`);
    const entries=new Map();for(const p of players)for(const source of p.entrypoints||['unknown'])entries.set(source,(entries.get(source)||0)+1);
    const sources=[...entries].map(([source,count])=>`${entryNames[source]||entryNames.unknown} ${count}`).join(' / ');
    const exitCount=new Set(players.map(p=>p.location?.network_group).filter(Boolean)).size;
    $('regionSummary').textContent=players.length?`请求入口：${sources}。网络出口归属：${shown.join(' / ')}。已识别 ${exitCount} 个出口，多条访客记录可能来自同一个人。`:'访客上线后，将显示请求入口和网络出口归属。';
  }
  const cell=(row,label,text,cls)=>{const td=document.createElement('td');td.dataset.label=label;if(cls)td.className=cls;if(text!==undefined)td.textContent=text;row.append(td);return td};
  function render(){
    if(!snapshot)return;
    const all=snapshot.players,needle=$('search').value.trim().toLocaleLowerCase();
    const players=all.filter(p=>`${p.name} ${p.character} ${entryLabel(p)} ${locationLabel(p.location)} ${p.location?.ip_masked||''} ${p.location?.network||''}`.toLocaleLowerCase().includes(needle));
    renderRegions(all);
    $('onlineCount').textContent=snapshot.online;$('playingCount').textContent=snapshot.playing;$('pausedCount').textContent=snapshot.paused;
    $('selectCount').textContent=all.filter(p=>p.mode==='select').length;
    $('longCount').textContent=all.filter(p=>p.hero==='long'&&p.mode==='playing').length;$('caierCount').textContent=all.filter(p=>p.hero==='caier'&&p.mode==='playing').length;
    const rows=document.createDocumentFragment();
    for(const p of players){
      const row=document.createElement('tr');
      const identity=cell(row,'',undefined,'identity');
      const avatar=document.createElement('span');avatar.className=`avatar ${p.hero}`;avatar.textContent=p.hero==='long'?'✧':'☾';avatar.setAttribute('aria-hidden','true');
      const name=document.createElement('div');name.className='name';name.textContent=p.name;
      if(p.tabs>1){const sub=document.createElement('span');sub.className='sub';sub.textContent=`${p.tabs} 个游戏标签页`;name.append(sub)}
      const entry=document.createElement('span');entry.className='sub';entry.textContent=entryLabel(p);name.append(entry);
      identity.append(avatar,name);
      const character=cell(row,'人物',(p.mode==='select'?'预选 · ':'')+p.character,'character');
      const scene=document.createElement('span');scene.className='sub';scene.textContent=p.mode==='select'?'尚未开始试炼':p.hero==='long'?'晨光圣殿':'月夜城塔';character.append(scene);
      const loc=p.location||{},geography=cell(row,'网络出口归属',locationLabel(loc),'location');
      if(loc.ip_masked){const ip=document.createElement('span');ip.className='sub ip';ip.textContent='IP '+loc.ip_masked+'（脱敏）';geography.append(ip)}
      if(loc.network){const network=document.createElement('span');network.className='sub';network.textContent=loc.network;geography.append(network)}
      if(loc.network_group){const group=document.createElement('span');group.className='sub';group.textContent=`出口 ${loc.network_group} · ${loc.shared_exit_visitors} 条访客记录`;geography.append(group)}
      const status=document.createElement('span');status.className=`status ${p.mode}`;status.textContent=modes[p.mode]||'在线';cell(row,'状态').append(status);
      cell(row,'分数',String(p.score));cell(row,'时长',duration(p.online_seconds));
      const seconds=Math.max(0,Math.floor(snapshot.updated_at-p.last_seen));cell(row,'报到',seconds<3?'刚刚':`${seconds} 秒前`);
      rows.append(row);
    }
    $('players').replaceChildren(rows);$('playerTable').hidden=players.length===0;$('empty').hidden=players.length>0;
    $('emptyTitle').textContent=needle?'没有匹配的访客':'还没有访客在线';
    $('emptyText').textContent=needle?'换个昵称、人物或地区试试。':'打开游戏，填写昵称后就能在这里看到自己。';
  }
  async function refresh(force=false){
    if(expired||stopped)return;
    if(active&&!force)return;
    cancelRequest();clearTimeout(pollTimer);
    const request={controller:new AbortController(),started:Date.now(),timeout:0};active=request;
    $('refresh').textContent='立即刷新';$('panel').setAttribute('aria-busy','true');updateRefreshStatus();
    try{
      const result=await Promise.race([
        (async()=>{
          const response=await fetch('/api/admin/online?t='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:request.controller.signal});
          // An edge/network HTML error is retryable; only our JSON auth response expires the session.
          if([401,403].includes(response.status)&&(response.headers.get('content-type')||'').includes('application/json'))return {unauthorized:true};
          if(!response.ok)throw new Error('服务暂时无法响应');
          const data=await response.json();
          if(!data||!Array.isArray(data.players)||!Number.isFinite(data.updated_at))throw new Error('在线数据格式无效');
          return {data};
        })(),
        new Promise((_,reject)=>{request.timeout=setTimeout(()=>{request.controller.abort();reject(new Error('请求超时'))},REQUEST_TIMEOUT_MS)})
      ]);
      if(active!==request)return;
      if(result.unauthorized){
        expired=true;snapshot=null;$('players').replaceChildren();$('regionSummary').textContent='';$('playerTable').hidden=true;$('empty').hidden=false;
        ['onlineCount','playingCount','pausedCount','selectCount','longCount','caierCount'].forEach(id=>$(id).textContent='—');
        $('emptyTitle').textContent='管理员登录已失效';$('emptyText').textContent='请重新打开你的管理员专用链接。';
        throw new Error('请使用带 token 的专用链接重新进入后台。');
      }
      snapshot=result.data;lastSuccessAt=Date.now();successCount++;failures=0;
      render();$('panel').classList.remove('stale');$('notice').hidden=true;$('sync').dataset.state='ok';
      $('sync').textContent='已连接 · 在线状态自动同步';
    }catch(error){
      if(active!==request)return;
      failures++;
      $('panel').classList.add('stale');$('sync').dataset.state='error';$('sync').textContent=expired?'登录已失效':'连接中断 · 等待重连';
      $('notice').hidden=false;$('notice').textContent=expired?error.message:'暂时无法更新在线状态，显示的是上次结果；恢复连接后会自动刷新。';
      if(!snapshot&&!expired){$('emptyTitle').textContent='暂时无法连接';$('emptyText').textContent='服务恢复后会自动重试。'}
    }finally{
      clearTimeout(request.timeout);
      if(active===request){active=null;$('refresh').disabled=expired;$('panel').setAttribute('aria-busy','false');schedule();updateRefreshStatus()}
    }
  }
  $('search').addEventListener('input',render);$('refresh').addEventListener('click',()=>refresh(true));
  $('logout').addEventListener('click',async()=>{
    $('logout').disabled=true;
    try{const response=await fetch('/api/admin/logout',{method:'POST',signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)});if(!response.ok)throw new Error();stop();location.replace('https://chenfenghrf.github.io/holy-wing-trial/')}
    catch(_){$('logout').disabled=false;$('notice').hidden=false;$('notice').textContent='退出失败，请在服务恢复后重试。'}
  });
  function stop(){stopped=true;cancelRequest();clearTimeout(pollTimer);clearInterval(clockTimer);clockTimer=0}
  function resume(){
    stopped=false;if(!clockTimer)clockTimer=setInterval(updateRefreshStatus,1000);
    // Focus and visibility events can arrive together; share a fresh request.
    if(!active||Date.now()-active.started>1000)refresh(true);
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume()});
  window.addEventListener('focus',resume);window.addEventListener('online',resume);
  window.addEventListener('pagehide',stop);window.addEventListener('pageshow',resume);
  resume();
})();
