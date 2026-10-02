# 神印 · 双境试炼

公开游戏与受保护的在线玩家管理后台。

- 龙皓晨：金色晨光圣殿，每局 3～4 支天降飞箭。
- 圣采儿：月夜城塔，原有影蝠与魔眼。
- E 技能位于左下角；防御触发后无敌 6 秒、冷却 14 秒。
- 玩家可填昵称；管理员查看人物、状态、分数、在线时长及场景人数。
- 在线状态每 10 秒报到，后台每 3 秒刷新，超过 90 秒未报到移出名单。

## 管理员入口

访问 `/?token=你的生产密钥`。服务器验证成功后签发 8 小时的 HttpOnly、Secure、SameSite Cookie，清除地址栏 token 并进入 `/admin/`。
后台页面、脚本、在线名单 API 均要求管理员会话。退出会撤销会话；更换生产密钥会使旧登录失效。
密钥仅存储在托管环境的 `ADMIN_TOKEN` 中，公开源代码不包含生产密钥。

匿名玩家使用服务器签发的访客 Cookie；客户端提交的访客标识不能覆盖其他玩家的在线记录。
昵称、分数、状态由玩家端填写或上报，不构成真实身份或防作弊排行榜。
D1 共享当前在线记录和管理员会话；过期记录在后续请求时清理，不提供历史追踪。

## 开发与测试

Node.js 22+：

```sh
npm ci
npm run build
npm test
node test/game.cjs src/game.html
node node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config wrangler.local.json --persist-to .wrangler/state --file drizzle/0000_friendly_black_cat.sql
node node_modules/wrangler/bin/wrangler.js dev --local --config wrangler.local.json --persist-to .wrangler/state --port 8833
python3 test/http-smoke.py http://127.0.0.1:8833
```

`wrangler.local.json` 中的 token 仅用于本地测试，不用于线上。线上逻辑绑定为 `DB`，配置 `ADMIN_TOKEN` 和 `SITE_ORIGIN` 两个环境变量。

`db/schema.ts` 定义数据库结构；`npm run db:generate` 生成迁移。已发布的迁移保持不变，后续追加迁移。
`src/game.html` 为单文件游戏，`src/admin.html` 与 `src/admin.js` 为受保护后台，`src/worker.mjs` 为服务端；`npm run build` 生成 Worker ESM。
