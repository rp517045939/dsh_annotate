# 实测记录

## 2026-10-23 · DSH 0.2.1-rc.2（独立 Web 实例）

环境：用打包 runtime 启动的**独立 DSH Web 实例**（`dsh web --port 3091`，独立 `DSH_HOME`），通过 `dsh plugin add` 安装。没有动当时在用的桌面端。

![插件页](shots/verified-00-plugin.png)
![划词与胶囊](shots/verified-01-select.png)
![批注篮在 composer 卡片内](shots/verified-02-tray.png)
![模型先建计划再逐条处理](shots/verified-04-plan.png)

| 步骤 | 结果 |
|---|---|
| 插件页 | 标题/描述/图标正确，开关为启用 |
| 划词 | 胶囊出现在选区上方；评论层带 locator 与原文；`Ctrl+Enter` 保存 |
| 正文标记 | 蓝色高亮 + 行尾序号角标；刷新后按 messageId + 原文重新解析 |
| 批注篮 | 在 composer 卡片内、编辑器上方；卡片 padding 随托盘高度变化，不遮挡上一行动作条 |
| 预览 | 2 条批注按消息分组、编号连续；协议正文不展示，底部一句话说明会自动附加 |
| 发送 | 作为一条普通用户消息发出；模型据此建了 5 个任务并逐条完成 |
| 正常发送 | 输入框打字后 Enter/点发送：草稿和批注合成一条消息，托盘清空 |
| 清空 | 托盘隐藏、padding 回到 8px、localStorage 归零 |
| 刷新 | 未发送批注恢复（跨 reload） |

## 实测中发现并修掉的问题

1. **主题 token 选错**：`--dsw-alias-brand-primary` 在本主题是近黑色，蓝色是 `--dsw-static-blue-500`；`--dsw-alias-bg-overlay` 是浅灰，surface 改用 `--dsw-alias-bg-layer-1`。
2. **按钮重置覆盖背景**：`.rn-root button{background:none}` 的 specificity 高于 `.rn-pill`，胶囊一度透明；改成 `:where(button)`。
3. **模块内 `CSS` 遮蔽 `window.CSS`**：`const CSS` 是样式字符串，`CSS.highlights` 永远不存在，高亮 API 一直没启用；改用 `window.CSS`。
4. **同一轮多行**：一轮会渲染 user / turn-process / assistant-step / turn-tail 多个 `[data-chat-flow-kind]`，按 turn 取第一个会落到 user 行；改为按 messageId → 同 turn 所有行 → 全部行逐个尝试。
5. **浮动托盘遮挡动作条**：`bottom:100%` 的托盘盖住了最后一条消息的复制/批注按钮（点击被拦截）；改成 composer 卡片内的顶部条 + `padding-top`。
6. **直连发送不可达**：`ctx.get('sessions')` 为 `undefined`，slot hooks 只有 store 快照；实际走 composer 桥，toast 只在确有草稿时提示。
7. **预览不再展示协议正文（用户反馈）**：抽屉只保留总评/逐条列表，底部一句话说明"定位与格式会自动附加"；抽屉改为内容高度，不再占满右侧。
8. **正常发送不带批注（用户反馈）**：原来只有点托盘「发送」才会发批注，直接打字发送会把批注留在队列里；现在在 window 捕获阶段拦截 Enter / 发送按钮，把批注折进草稿再交给宿主发送，发送后清空。监听器挂在插件生命周期而不是组件上，避免 composer 重挂载丢监听。

## 未覆盖

- 回答进行中发送的排队；
- 会话切换过程中的批注归属；
- 移动端触屏。

## 自动化测试

```bash
npm test                        # node --test：发送协议、锚点匹配、槽位注册、locale 回退、存储
node scripts/serve.mjs 4180     # test/dom-harness.html 在真实 Chromium 里验证 fiber 读取与划词锚点
```

`test/dom-harness.html` 打开后页面标题显示 `PASS` 即通过。
