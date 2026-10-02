(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const modes={select:'选人中',playing:'游戏中',paused:'已暂停',over:'本局结束',away:'暂离页面'};
  let snapshot=null,pending=false,expired=false;
  const duration=s=>s<60?`${s} 秒`:`${Math.floor(s/60)} 分${s%60?` ${s%60} 秒`:''}`;
  const cell=(row,label,text,cls)=>{const td=document.createElement('td');td.dataset.label=label;if(cls)td.className=cls;if(text!==undefined)td.textContent=text;row.append(td);return td};
  function render(){
    if(!snapshot)return;
    const all=snapshot.players,needle=$('search').value.trim().toLocaleLowerCase();
    const players=all.filter(p=>`${p.name} ${p.character}`.toLocaleLowerCase().includes(needle));
    $('onlineCount').textContent=snapshot.online;$('playingCount').textContent=snapshot.playing;$('pausedCount').textContent=snapshot.paused;
    $('longCount').textContent=all.filter(p=>p.hero==='long').length;$('caierCount').textContent=all.filter(p=>p.hero==='caier').length;
    const rows=document.createDocumentFragment();
    for(const p of players){
      const row=document.createElement('tr');
      const identity=cell(row,'',undefined,'identity');
      const avatar=document.createElement('span');avatar.className=`avatar ${p.hero}`;avatar.textContent=p.hero==='long'?'✧':'☾';avatar.setAttribute('aria-hidden','true');
      const name=document.createElement('div');name.className='name';name.textContent=p.name;
      if(p.tabs>1){const sub=document.createElement('span');sub.className='sub';sub.textContent=`${p.tabs} 个游戏标签页`;name.append(sub)}
      identity.append(avatar,name);
      const character=cell(row,'人物',p.character,'character');
      const scene=document.createElement('span');scene.className='sub';scene.textContent=p.hero==='long'?'晨光圣殿':'月夜城塔';character.append(scene);
      const status=document.createElement('span');status.className=`status ${p.mode}`;status.textContent=modes[p.mode]||'在线';cell(row,'状态').append(status);
      cell(row,'分数',String(p.score));cell(row,'时长',duration(p.online_seconds));
      const seconds=Math.max(0,Math.floor(snapshot.updated_at-p.last_seen));cell(row,'报到',seconds<3?'刚刚':`${seconds} 秒前`);
      rows.append(row);
    }
    $('players').replaceChildren(rows);$('playerTable').hidden=players.length===0;$('empty').hidden=players.length>0;
    $('emptyTitle').textContent=needle?'没有匹配的玩家':'还没有玩家在线';
    $('emptyText').textContent=needle?'换个昵称或人物名称试试。':'打开游戏，填写昵称后就能在这里看到自己。';
  }
  async function refresh(){
    if(pending||expired)return;
    pending=true;$('refresh').disabled=true;
    try{
      const response=await fetch('/api/admin/online',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(response.status===403){
        expired=true;snapshot=null;$('players').replaceChildren();$('playerTable').hidden=true;$('empty').hidden=false;
        ['onlineCount','playingCount','pausedCount','longCount','caierCount'].forEach(id=>$(id).textContent='—');
        $('emptyTitle').textContent='管理员登录已失效';$('emptyText').textContent='请重新打开你的管理员专用链接。';
        throw new Error('请使用带 token 的专用链接重新进入后台。');
      }
      if(!response.ok)throw new Error('服务暂时无法响应，将自动重试。');
      snapshot=await response.json();render();$('panel').classList.remove('stale');$('notice').hidden=true;$('sync').dataset.state='ok';
      $('sync').textContent=`已连接 · ${new Date(snapshot.updated_at*1000).toLocaleTimeString('zh-CN',{hour12:false})} 更新`;
    }catch(error){
      $('panel').classList.add('stale');$('sync').dataset.state='error';$('sync').textContent=expired?'登录已失效':'连接中断 · 等待重连';
      $('notice').hidden=false;$('notice').textContent=expired?error.message:'暂时无法更新在线状态，显示的是上次结果；恢复连接后会自动刷新。';
      if(!snapshot&&!expired){$('emptyTitle').textContent='暂时无法连接';$('emptyText').textContent='请确认本地游戏服务正在运行。'}
    }finally{pending=false;$('refresh').disabled=expired}
  }
  $('search').addEventListener('input',render);$('refresh').addEventListener('click',refresh);
  $('logout').addEventListener('click',async()=>{
    $('logout').disabled=true;
    try{const response=await fetch('/api/admin/logout',{method:'POST',signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error();location.replace('/')}
    catch(_){$('logout').disabled=false;$('notice').hidden=false;$('notice').textContent='退出失败，请在服务恢复后重试。'}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  refresh();setInterval(refresh,3000);
})();
