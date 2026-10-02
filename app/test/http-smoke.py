"""Functional HTTP check. Never print tokens, cookies, or private URLs."""
import json,sys,urllib.request,urllib.error,http.cookiejar,uuid
from pathlib import Path
base=sys.argv[1].rstrip('/')
key=Path(sys.argv[2]).read_text().strip() if len(sys.argv)>2 else json.loads(Path('wrangler.local.json').read_text())['vars']['ADMIN_TOKEN']

def client():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

def request(c,path,data=None):
    r=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers={} if data is None else {'Origin':base,'Content-Type':'application/json'})
    try:
        with c.open(r,timeout=20) as out:return out.status,out.read(),out.headers
    except urllib.error.HTTPError as error:return error.code,error.read(),error.headers

owner,guest,guest2=client(),client(),client()
for path in ['/admin/','/admin.js','/api/admin/online']:
    assert request(guest,path)[0]==403,path
status,body,headers=request(owner,'/?token='+key)
assert status==200,('owner login',status)
assert key.encode() not in body
assert 'HttpOnly' in headers.get('Set-Cookie','')
if base.startswith('https:'):assert 'Secure' in headers.get('Set-Cookie','')
assert request(owner,'/admin/')[0]==200
for c in [guest,guest2]:
    status,body,_=request(c,'/api/session');assert status==200
    assert json.loads(body)=={'presence':True,'admin':False}
visitor,session=uuid.uuid4().hex,uuid.uuid4().hex
p={'visitor':visitor,'session':session,'name':'发布验证访客','hero':'long','mode':'playing','score':4}
assert request(guest,'/api/presence/heartbeat',p)[0]==200
p2=p|{'hero':'caier','name':'发布验证访客二','mode':'paused'}
assert request(guest2,'/api/presence/heartbeat',p2)[0]==200
status,body,_=request(owner,'/api/admin/online');assert status==200
snapshot=json.loads(body)
assert any(x['name']==p['name'] and x['score']==4 and x['mode']=='playing' for x in snapshot['players'])
assert any(x['name']==p2['name'] and x['mode']=='paused' for x in snapshot['players'])
assert request(guest,'/api/admin/online')[0]==403
for c in [guest,guest2]:assert request(c,'/api/presence/leave',{'visitor':visitor,'session':session})[0]==200
body=request(owner,'/api/admin/online')[1]
assert all(x['name'] not in [p['name'],p2['name']] for x in json.loads(body)['players'])
assert request(owner,'/api/admin/logout',{})[0]==200
assert request(owner,'/api/admin/online')[0]==403
print(json.dumps({'passed':True,'checks':['anonymous denied','owner token login','protected dashboard','signed guest sessions','two independent players','status and scores','leave cleanup','logout revocation']},ensure_ascii=False))
