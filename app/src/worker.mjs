// This Site has been retired. GitHub Pages is the only active game entrypoint.
const GAME_URL='https://chenfenghrf.github.io/holy-wing-trial/';
const page=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>后台已停用</title><style>body{margin:0;padding:15vh 8vw;background:#f5d582;color:#4b3119;font-family:system-ui,sans-serif;line-height:1.8}main{max-width:560px;margin:auto}a{color:inherit;font-weight:bold}</style><main><h1>后台已停用</h1><p>游戏已保留在 GitHub。在线名单和 IP 统计服务已关闭。</p><a href="${GAME_URL}" rel="noreferrer">进入 GitHub 游戏</a></main></html>`;
export function handle(request){
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
  const api=new URL(request.url).pathname.startsWith('/api/');
  headers['Content-Type']=api?'application/json; charset=utf-8':'text/html; charset=utf-8';
  // No token checks, sessions, database access, IP processing or request-body reads.
  return new Response(request.method==='HEAD'?null:api?JSON.stringify({error:'在线统计服务已停用',disabled:true}):page,{status:410,headers});
}
export default {fetch:handle};
