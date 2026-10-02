# 神印 · 双境试炼

GitHub Pages 游戏与独立的在线玩家管理后台。

玩家入口：https://chenfenghrf.github.io/holy-wing-trial/ 。GitHub 直接显示游戏，不跳转。后台部署在独立服务；服务需对外可访问，在线统计才能接收普通玩家的状态。

- 龙皓晨：金色晨光圣殿，每局 3～4 支天降飞箭。
- 圣采儿：月夜城塔，原有影蝠与魔眼。
- E 技能位于左下角；防御触发后无敌 6 秒、冷却 14 秒。
- 玩家可填昵称；管理员查看人物、状态、分数、在线时长及场景人数。
- 在线状态每 10 秒报到。后台正常每 3 秒自动刷新，显示倒计时、上次成功时间与更新次数；超时和临时错误会重试，返回页面或恢复网络时立即同步。超过 90 秒未报到移出名单。
- 后台区分在线访客、选人中、游戏中和暂停；场景卡片只显示正在游戏的访客。匿名访客数量不能直接视为独立真人数量。
- 管理员可查看 IP 大致归属地（国家／地区、城市）、脱敏 IP 和网络名称，按地区搜索，并查看当前在线访客的地区分布。

## 管理员入口

在游戏 URL 后加 `?token=你的生产密钥` 时，页面会清除当前 URL 的密钥并跳转到独立后台验证；也可直接访问后台的 `/?token=你的生产密钥`。服务器验证成功后签发 8 小时的 HttpOnly、Secure、SameSite Cookie，清除地址栏 token 并进入 `/admin/`。
后台页面、脚本、在线名单 API 均要求管理员会话。退出会撤销会话；更换生产密钥会使旧登录失效。
密钥仅存储在托管环境的 `ADMIN_TOKEN` 中，公开源代码不包含生产密钥。

GitHub 玩家使用服务器签发、绑定 GitHub 来源的访客凭证上报，浏览器本地保存以合并同浏览器标签页，不依赖第三方 Cookie。该凭证只能维护自己的在线记录，不能进入管理后台。后台同源游戏保留访客 Cookie 模式。
跨域仅开放 `https://chenfenghrf.github.io` 的访客会话、报到和离开接口；管理接口不允许跨域读取。客户端提交的访客标识不能覆盖其他玩家的在线记录。
昵称、分数、状态由玩家端填写或上报，不构成真实身份或防作弊排行榜。
D1 共享当前在线记录和管理员会话；过期记录在后续请求时清理，不提供历史追踪。

## IP 归属地

只使用 Cloudflare 入口提供的 `CF-Connecting-IP` 与 `request.cf` 地理信息，不调用外部 IP 查询服务，不读取浏览器 GPS，不接受玩家提交的归属地。完整 IP 仅在当前请求中用于脱敏，不写入数据库；IPv4 隐去最后一段，IPv6 只保留前三组。脱敏 IP 和归属地随在线记录过期清理，只能由管理员接口读取。

可用时显示国家／地区、城市和网络名称；平台仅提供国家时只显示国家，无法识别时明确显示“暂未识别”。本地预览显示“本地网络”，避免将开发工具的模拟城市当作真实位置。归属地代表网络出口的大致位置，代理、VPN 和运营商出口可能影响结果，不能用于判断真实住址或独立真人数量。

平台字段说明：[Cloudflare Request metadata](https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties) 与 [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/)。

## 开发与测试

Node.js 22+：

```sh
npm ci
npm run build
npm test
node test/game.cjs src/game.html
node node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config wrangler.local.json --persist-to .wrangler/state --file drizzle/0000_friendly_black_cat.sql
node node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config wrangler.local.json --persist-to .wrangler/state --file drizzle/0001_opposite_sir_ram.sql
node node_modules/wrangler/bin/wrangler.js dev --local --config wrangler.local.json --persist-to .wrangler/state --port 8833
python3 test/http-smoke.py http://127.0.0.1:8833
```

`wrangler.local.json` 中的 token 仅用于本地测试，不用于线上。线上逻辑绑定为 `DB`，配置 `ADMIN_TOKEN` 和 `SITE_ORIGIN` 两个环境变量。

`db/schema.ts` 定义数据库结构；`npm run db:generate` 生成迁移。已发布的迁移保持不变，后续追加迁移。
`src/game.html` 为单文件游戏，`src/admin.html` 与 `src/admin.js` 为受保护后台，`src/worker.mjs` 为服务端；`npm run build` 生成 Worker ESM。
