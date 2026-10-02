# 神印 · 双境试炼

游戏现仅运行在 [GitHub Pages](https://chenfenghrf.github.io/holy-wing-trial/)。管理员 Site 已关闭公开访问，所有旧页面及统计接口均返回 HTTP 410；不读取管理员凭证，不访问数据库，不再处理 IP 或在线状态。

`src/game.html` 为独立游戏，保留双人物、不同场景、6 秒防御和龙皓晨每局 3～4 支飞箭，以及浏览器本地的独立最高分。已移除昵称管理、在线报到、IP 统计和管理员跳转。旧 token 链接会清除 token 后留在游戏页面。

```sh
npm ci
npm run build
npm test
node test/game.cjs src/game.html
```

`build.mjs` 只构建停用响应，不打包管理员页面或游戏。GitHub Pages 根目录的 index.html 与 src/game.html 保持一致。数据库结构和已发布的迁移保留原样，历史后台源码可从 Git 历史恢复；不会自动重新启用。
