const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const file=process.argv[2]||'work/shenyin-trials/index.html';
const html=fs.readFileSync(file,'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const stored=new Map([['holyWingBest','5']]);
function boot(randomValue=.5,storage=stored){
  const elements=new Map(),tools=new Map(),events={};
  const ctx=new Proxy({}, {get:(_,key)=>key.includes('Gradient')?()=>({addColorStop(){}}):()=>{},set:()=>true});
  function el(id){if(!elements.has(id)){const classes=new Set(),attrs={};elements.set(id,{textContent:'',innerHTML:'',disabled:false,hidden:false,dataset:{},listeners:{},attrs,focus(){},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},getContext:()=>ctx,setAttribute(k,v){attrs[k]=v},addEventListener(type,fn){this.listeners[type]=fn}})}return elements.get(id)}
  const cards=['long','caier'].map(id=>{const card=el('card-'+id);card.dataset.hero=id;return card});
  const sandbox={document:{getElementById:el,querySelectorAll:()=>cards,body:{dataset:{}},addEventListener(){},modelContext:{registerTool:t=>tools.set(t.name,t)}},window:{addEventListener:(type,fn)=>events[type]=fn},AbortController,performance:{now:()=>0},setTimeout:()=>0,requestAnimationFrame(){},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Math:Object.assign(Object.create(Math),{random:()=>randomValue})};
  vm.createContext(sandbox);
  const hook=`window.testTrial={start,action,flap,castSword,togglePause,returnToSelection,selectCharacter,update,draw,drawPortraits,addObstacle,addMonster,addArrow,arrowHitsPlayer,hitsObstacle,spikeExtension,orbPosition,monsterY,state:()=>({mode,hero,player,obstacles,monsters,monsterCount,arrowCount,arrowLimit,nextArrowAt,score,best,elapsed,swordTime,swordCooldown,shadowCooldown,invulnerable}),time:t=>{elapsed=t},invuln:n=>{invulnerable=n},clear:()=>{obstacles=[];monsters=[]}};`;
  vm.runInContext(script.replace('    requestAnimationFrame(loop);\n  })();',hook+'\n  })();'),sandbox);
  return {a:sandbox.window.testTrial,tools,elements,events,body:sandbox.document.body};
}
let {a,tools,elements,events,body}=boot();
assert.equal(a.state().mode,'select');assert.equal(a.state().hero.id,'long');assert.equal(tools.size,7);
for(const t of tools.values())assert.throws(()=>t.execute({bad:true}));
assert.throws(()=>tools.get('select_trial_hero').execute({hero:'constructor'}));
assert.throws(()=>tools.get('cast_trial_skill').execute({}),/unavailable/);
assert.throws(()=>tools.get('jump_trial_hero').execute({}),/Start/);
assert.throws(()=>tools.get('toggle_trial_pause').execute({}),/Start/);
a.action();a.castSword();a.togglePause();assert.equal(a.state().mode,'select');
for(const code of ['Space','KeyE','KeyP'])events.keydown({code,repeat:false,target:{closest:()=>null},preventDefault(){}});
assert.equal(a.state().mode,'select');assert.equal(a.state().swordCooldown,0);
// Typing a nickname must not trigger game shortcuts or toggle sound.
for(const code of ['Space','KeyE','KeyP','KeyM'])events.keydown({code,repeat:false,target:{closest:()=>({tagName:'INPUT'})},preventDefault(){throw new Error('Nickname typing was intercepted')}});
assert.equal(a.state().mode,'select');assert.notEqual(stored.get('holyWingMuted'),'1');
// Choosing a hero changes its scene/skills/best score, but never starts a run.
tools.get('select_trial_hero').execute({hero:'caier'});
assert.equal(a.state().mode,'select');assert.equal(a.state().best,5);
assert.equal(elements.get('sceneName').textContent,'月夜城塔');
assert.equal(elements.get('card-caier').attrs['aria-pressed'],'true');
assert.equal(elements.get('card-long').attrs['aria-pressed'],'false');
a.drawPortraits();assert.equal(a.state().hero.id,'caier');
let state=tools.get('start_trial').execute({});assert.equal(state.character,'圣采儿');assert.equal(state.scene,'月夜城塔');assert.equal(body.dataset.theme,'caier');
assert.equal(elements.get('selectionScreen').hidden,true);assert.equal(elements.get('gameScreen').hidden,false);
assert.throws(()=>tools.get('select_trial_hero').execute({hero:'long'}),/Return/);
a.update(.1);const vy=a.state().player.vy;tools.get('jump_trial_hero').execute({});assert.ok(a.state().player.vy<vy);
state=tools.get('cast_trial_skill').execute({});assert.equal(state.swordSeconds,1.65);assert.equal(state.swordCooldown,9);
assert.throws(()=>tools.get('cast_trial_skill').execute({}),/unavailable/);
tools.get('toggle_trial_pause').execute({});const pause=Object.assign({},a.state(),{y:a.state().player.y});a.update(1);
assert.equal(a.state().player.y,pause.y);assert.equal(a.state().elapsed,pause.elapsed);assert.equal(a.state().swordTime,pause.swordTime);
tools.get('toggle_trial_pause').execute({});assert.equal(a.state().mode,'playing');
// Original Cai Er attack still phases through towers and kills nearby monsters.
a.start();a.addObstacle();a.state().obstacles[0].x=95;a.state().player.y=100;a.castSword();a.update(.001);
assert.equal(a.state().mode,'playing');assert.equal(a.state().shadowCooldown,0);
a.start();a.addMonster();a.state().monsters[0].x=126;a.state().monsters[0].baseY=a.state().player.y;a.castSword();a.update(.001);assert.equal(a.state().monsters.length,0);
tools.get('return_to_character_selection').execute({});assert.equal(a.state().mode,'select');assert.equal(body.dataset.theme,'select');assert.equal(a.state().swordCooldown,0);
tools.get('select_trial_hero').execute({hero:'long'});assert.equal(a.state().best,0);assert.equal(elements.get('sceneName').textContent,'晨光圣殿');
state=tools.get('start_trial').execute({});assert.equal(state.character,'龙皓晨');assert.equal(body.dataset.theme,'long');
assert.equal(elements.get('skillName').textContent,'圣光剑击');
// The knight attack cuts arrows in front and cannot phase through solid pillars.
a.addMonster();assert.equal(a.state().monsters.length,0);
a.addArrow();const front=a.state().monsters[0];front.x=250;front.y=a.state().player.y;
a.addArrow();const behind=a.state().monsters[1];behind.x=75;behind.y=a.state().player.y;
a.castSword();assert.equal(a.state().swordTime,.55);a.update(.001);assert.equal(a.state().monsters.length,1);assert.equal(a.state().monsters[0],behind);
a.start();a.addObstacle();const blocked=a.state().obstacles[0];blocked.x=95;a.state().player.y=100;a.castSword();a.update(.001);assert.equal(a.state().invulnerable,6);assert.ok(a.state().shadowCooldown>13.9);
// Both characters: 6 seconds of immunity, a 14-second recovery, then collisions hurt again.
for(const id of ['long','caier']){
  a.returnToSelection();a.selectCharacter(id);a.start();a.addObstacle();a.addObstacle();a.addObstacle();
  assert.deepEqual(Array.from(a.state().obstacles,x=>x.trap),['none','orb','spikes']);
  const [plain,orb,spikes]=a.state().obstacles;for(const o of [plain,orb,spikes])o.x=84;
  a.state().player.y=(plain.top+plain.bottom)/2;assert.equal(a.hitsObstacle(plain),false);
  const crystal=a.orbPosition(orb);a.state().player.y=crystal.y;assert.equal(a.hitsObstacle(orb),true);
  a.time((Math.PI/2-spikes.seed)/3);a.state().player.y=spikes.top+20;assert.equal(a.hitsObstacle(spikes),true);
  a.start();a.addObstacle();const tower=a.state().obstacles[0];tower.x=95;a.state().player.y=tower.top-10;a.update(.001);
  assert.equal(a.state().mode,'playing');assert.equal(a.state().invulnerable,6);assert.ok(a.state().shadowCooldown>13.9);
  a.clear();
  for(let i=0;i<708;i++){if(a.state().player.y>375&&a.state().player.vy>0)a.flap();a.update(1/120)}
  assert.equal(a.state().mode,'playing');assert.ok(a.state().invulnerable>.09&&a.state().invulnerable<.11);assert.match(elements.get('shadowStatus').textContent,/无敌/);
  for(let i=0;i<13;i++){if(a.state().player.y>375&&a.state().player.vy>0)a.flap();a.update(1/120)}
  assert.equal(a.state().invulnerable,0);assert.ok(a.state().shadowCooldown>7.9&&a.state().shadowCooldown<8.1);
  a.clear();a.addObstacle();a.state().obstacles[0].x=95;a.state().player.y=100;a.update(.001);assert.equal(a.state().mode,'over');
  a.start();a.castSword();a.invuln(100);
  for(let i=0;i<1081;i++){if(a.state().player.y>375&&a.state().player.vy>0)a.flap();a.update(1/120);a.draw()}
  assert.equal(a.state().swordCooldown,0);assert.ok(a.state().score>=3);
  if(id==='caier')assert.ok(a.state().monsters.length>0);else assert.equal(a.state().arrowCount,1);
  a.state().player.y=670;a.update(.001);assert.equal(a.state().mode,'over');a.action();assert.equal(a.state().mode,'playing');assert.equal(a.state().score,0);
}
// Character records remain separate and survive reload; old Cai Er scores migrate automatically.
a.returnToSelection();a.selectCharacter('long');a.start();a.invuln(100);
for(let i=0;i<7;i++){a.addObstacle();a.state().obstacles.at(-1).x=20;a.update(.001)}
assert.equal(Number(stored.get('shenyinLongBest')),7);assert.ok(Number(stored.get('holyWingBest'))>=5);
a.returnToSelection();a.selectCharacter('caier');assert.equal(a.state().best,Number(stored.get('holyWingBest')));
a.selectCharacter('long');assert.equal(a.state().best,7);assert.equal(boot().a.state().best,7);assert.equal(boot().a.state().hero.id,'long');
stored.set('shenyinHero','constructor');assert.equal(boot().a.state().hero.id,'long');stored.set('shenyinHero','long');
events.keydown({code:'KeyM',repeat:false,target:{closest:()=>null}});assert.equal(stored.get('holyWingMuted'),'1');
// Whole-run limits apply to total spawned arrows, even after every arrow leaves the screen.
for(const [rng,limit] of [[.25,3],[.75,4]]){
  const b=boot(rng,new Map()).a;b.start();b.invuln(1000);let previous=0,spawnTimes=[];
  assert.equal(b.state().arrowLimit,limit);
  for(let i=0;i<60*60;i++){
    if(b.state().player.y>375&&b.state().player.vy>0)b.flap();b.update(1/60);
    assert.equal(b.state().mode,'playing');assert.ok(b.state().monsters.every(m=>m.type==='arrow'));
    assert.ok(b.state().monsters.length<=1);
    if(b.state().arrowCount>previous){spawnTimes.push(b.state().elapsed);previous=b.state().arrowCount}
  }
  assert.equal(b.state().arrowCount,limit);assert.equal(b.state().monsters.length,0);assert.equal(b.state().monsterCount,0);
  for(let i=1;i<spawnTimes.length;i++)assert.ok(spawnTimes[i]-spawnTimes[i-1]>=5.5);
  b.addArrow();assert.equal(b.state().arrowCount,limit);assert.equal(b.state().monsters.length,0);
  b.start();assert.equal(b.state().arrowCount,0);assert.equal(b.state().arrowLimit,limit);assert.equal(b.state().monsters.length,0);
  b.returnToSelection();assert.equal(b.state().arrowLimit,0);assert.equal(b.state().nextArrowAt,Infinity);
  b.selectCharacter('caier');b.start();b.invuln(1000);
  for(let i=0;i<30*60;i++){if(b.state().player.y>375&&b.state().player.vy>0)b.flap();b.update(1/60)}
  assert.equal(b.state().arrowCount,0);assert.equal(b.state().arrowLimit,0);assert.ok(b.state().monsterCount>4);
  assert.ok(b.state().monsters.every(m=>m.type==='bat'||m.type==='eye'));
}
// Arrows move downward, stop while paused, and collide along their shafts/tips.
const c=boot(.75,new Map()).a;c.start();c.addArrow();const arrow=c.state().monsters[0],oldY=arrow.y;
c.update(.1);assert.ok(arrow.y>oldY);assert.equal(c.monsterY(arrow),arrow.y);
c.togglePause();const stoppedY=arrow.y;c.update(2);assert.equal(arrow.y,stoppedY);c.togglePause();
arrow.x=c.state().player.x;arrow.y=c.state().player.y-23;arrow.vx=0;assert.equal(c.arrowHitsPlayer(arrow),true);
arrow.x+=25;assert.equal(c.arrowHitsPlayer(arrow),false);
arrow.x=c.state().player.x;arrow.y=c.state().player.y;c.update(.001);
assert.equal(c.state().mode,'playing');assert.equal(c.state().invulnerable,6);assert.ok(c.state().shadowCooldown>13.9);assert.equal(c.state().monsters.length,0);assert.equal(c.state().arrowCount,1);
c.clear();
for(let i=0;i<6.1*120;i++){if(c.state().player.y>375&&c.state().player.vy>0)c.flap();c.update(1/120)}
assert.equal(c.state().invulnerable,0);c.clear();c.addArrow();const deadly=c.state().monsters[0];deadly.x=c.state().player.x;deadly.y=c.state().player.y;c.update(.001);assert.equal(c.state().mode,'over');
console.log(JSON.stringify({passed:true,checks:['character selection and separate scores','both character attacks and cooldowns','Cai Er monsters unchanged','knight sword cuts arrows','3- and 4-arrow caps over 60-second runs','no replacement arrows','sparse spawn intervals','downward arrow motion','pause freezes arrows','shaft and tip collisions','6-second defense against arrows','collision during defense recovery','quota resets on restart and hero change','original tower, crystal, spike and floor collisions','renderers and browser-tool schemas']}));
