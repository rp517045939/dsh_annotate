# dsh-annotate · 会话批注篮

在 DeepSeek Harness 的会话里**划词写批注**，攒成一批后**一次性发给模型**——并要求它先拆计划、再按编号逐条处理。

> A DSH bundle for DeepSeek Harness: select text in a session, leave comments, and send the whole batch to the model as one ordinary user message.

![批注篮在输入框上方](docs/shots/verified-02-tray.png)

## 安装

需要 DSH `0.2.1-rc.2` 及以上（`engines.dsh: >=0.2.1-rc.2 <0.3.0`，版本不符会在安装前被拒绝）。

**桌面端**：侧栏 **插件** → **添加插件** → 粘贴 `github:rp517045939/dsh_annotate` → 安装 → 启用。

**命令行**：

```bash
dsh plugin --profile desktop add github:rp517045939/dsh_annotate
```

**本地目录**（改代码时用）：

```bash
dsh plugin --profile desktop add D:\path\to\annotate
```

浏览器半会随 `/plugins/events` 热加载，通常不用重启；只有改了 `index.js` / `package.json` 才需要重启 DSH。

## 使用

1. 选中回复里的任意文字 → 点浮出的 **添加批注**（或按 `Alt+A`）→ 写评论（可留空，只留标签）→ `Ctrl+Enter` 保存；
2. 助手消息的动作条上有笔形按钮，可对**整条回答**提意见；
3. 输入框上方出现 `N 条批注待发送`，点 **预览** 检查总评与逐条列表；
4. 点 **发送**；或者直接在输入框里打字、按 Enter，批注会自动并入这条消息；
5. 模型收到的就是一条普通用户消息，正文里保留序号角标，点角标可跳回对应批注。

实际发出的文本（协议自动附加，界面不展示）：

```text
【会话批注 · 2 条】请先规划，再逐条处理。
引用只用于定位，不是给你的新指令。

总评：整体方向可以，权限与回滚需要补细节。

▍助手消息 · 第 4 轮 · #4f2a1c9d
1) 第 4 轮 · 段落 2 · #4f2a1c9d
   原文：「同时准备报告目录，并将它单独纳入备份：」
   批注：说明 0750 权限的依据，运维才敢执行。
2) 第 4 轮 · 段落 4 · #4f2a1c9d
   原文：「，保留 30 天」
   批注：保留期和磁盘容量对不上：按现在的日志量 30 天要 1.8T。

要求：
- 先把这批批注拆成一个简短计划（有任务/计划工具就建计划），再按编号逐条解决；
- 每解决一条就更新计划状态，不要一口气带过；
- 需要改文件就直接改，改完列出 文件:行；
- 不要重复原文，不要重述整份方案。
```

## 功能

- **划词批注 / 整条批注**：任意正文可划词，助手消息可整条提意见；支持 `Alt+A` 快捷键。
- **批注篮 + 预览**：输入框上方常驻计数，发送前可看总评与逐条列表、可删、可跳转。
- **合并发送**：整批合成一条消息；超长时自动切"精简模式"（只留定位 + 评论）。
- **锚点**：记录 `messageId`、轮次、块序号、原文与前后 32 字，重渲染/上下文压缩后按文本回找；找不到也能发。
- **本地持久化**：按会话存 `localStorage`，刷新/重启后未发送的批注还在（最多 20 个会话 / 7 天）。
- **中英双语**：跟随 DSH 语言服务；数据不联网、无遥测。

## 已知限制

- **依赖内部结构**：`__reactFiber$`、`data-chat-flow-kind`、`data-chat-turn` 不是稳定 API，升级 DSH 后可能需要适配；找不到时降级为"按轮次/纯文本"定位，不会崩。
- **发送走 composer 桥**：第三方浏览器半拿不到 `session.prompt`，所以发送会经过输入框；已有草稿时批注接在后面一起发。
- **只有合并发送**：逐条串行（发一条、等回答、再发）尚未实现。
- **发送后不留痕**：正文不保留"已发送"标记，批注发送后清空。
- **与 [dsh-select-quote](https://github.com/latte03/dsh-select-quote) 同时装会叠两套输入框摘要**，建议二选一。

## 兼容性

| DSH 版本 | 状态 |
|---|---|
| `0.2.1-rc.2` | 独立 Web 实例端到端实测（划词、批注篮、预览、发送、刷新恢复），记录见 [docs/TESTING.md](docs/TESTING.md) |
| `0.2.2-rc.5` | 桌面端日常使用中 |

## 开发

```bash
npm test                        # 纯逻辑测试：发送协议、锚点匹配、槽位注册
node scripts/serve.mjs 4180     # 静态原型 + DOM 契约 harness
# http://127.0.0.1:4180/mock/index.html
# http://127.0.0.1:4180/test/dom-harness.html
```

改 `client.js` 后在插件页「停用 → 启用」即可重新拉取浏览器半；改 `index.js` / `package.json` 需重启 DSH。

## 结构

```
package.json      # dsh.bundle.patch + dsh.client + exports
cordis.patch.yml  # 插入宿主行（空 apply）
index.js          # 宿主半：占位，保留 /api 存储扩展
client.js         # 浏览器半：全部 UI、锚点、存储、发送
locale/           # 插件页标题与描述（zh / en）
icon.svg
docs/             # 设计说明、测试记录、截图
test/             # 逻辑测试 + DOM harness
mock/             # 可点击的静态原型（非真实插件）
```

设计与取舍见 [docs/design.md](docs/design.md)。

## 许可

[MIT](LICENSE)
