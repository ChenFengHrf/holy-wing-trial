import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
test('retired Site denies old game, admin and telemetry routes even with existing credentials',async()=>{
  const env=new Proxy({},{get(){assert.fail('Retired service accessed a secret or database')}});
  for(const path of ['/','/?token=old-owner-key','/admin/','/admin.js','/api/session','/api/admin/online','/api/presence/heartbeat','/api/presence/leave','/api/admin/logout']){
    for(const method of ['GET','POST','OPTIONS','HEAD']){
      const request=new Request('https://retired.example'+path,{method,headers:{Origin:'https://chenfenghrf.github.io',Cookie:'trial_admin=old-cookie',Authorization:'Bearer old-visitor-token'},...(method==='POST'?{body:'old game payload'}:{})});
      const response=await worker.fetch(request,env);
      assert.equal(response.status,410);assert.equal(response.headers.get('Cache-Control'),'no-store');
      assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
      const body=await response.text();assert.ok(!body.includes('old-owner-key'));
      if(method==='HEAD')assert.equal(body,'');else if(path.startsWith('/api/'))assert.equal(JSON.parse(body).disabled,true);else assert.match(body,/后台已停用/);
    }
  }
});
