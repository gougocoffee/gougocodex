<h1 align="center">gougocodex</h1>

<p align="center">基于 opencode 的私有分支 —— 界面按 Codex / 豆包 WorkBuddy 风格重做，全中文，桌面版开箱可用。</p>

---

## 这是什么

`gougocodex` 是 [anomalyco/opencode](https://github.com/anomalyco/opencode) 的一个 fork，`dev` 分支持续合并上游，自己的改动集中在**桌面端的界面与交互**：

- 技术栈：Bun monorepo + Electron 桌面壳 + SolidJS 渲染层
- 目标形态：macOS 上双击即用的「编码代理」，不是跑在终端里的 CLI
- 上游同步：当前 `dev` 领先上游 13 个提交、落后 0

## 相比上游做了哪些改动

**界面基调**

- Codex 风格浅色主题：近白画布、发丝级描边、黑色强调色（不用蓝色）、更大的圆角与更软的阴影
- 主题 token 改为非分层规则，避免被后加载的共享 token 表覆盖（此前强调色实际被解析成蓝色）

**模型选择器**

- 列表行补传模型名，按厂商别名映射 logo：`deepseek`、`zhipuai`、`meituan`、`xiaomi`、`nvidia`、`minimax`、`moonshotai`、`alibaba`、`volcengine` 等，最长匹配优先
- 上游自有代号的模型（Flint / Iceman / Inkling 等）没有品牌资源，回退 OpenCode 标

**权限控制**

- 输入框底栏胶囊芯片：「默认权限 / 允许完全访问」，开启态红色文字 + 红描边
- 弹层按状态给说明，分隔线下面是「允许完全访问」+ iOS 开关；开关的几何与配色全部内联，避免系统强调色带来的蓝色焦点环
- 确认弹窗自适应高度：灰底圆角卡片内三条风险说明（文件操作 / 终端命令 / 访问互联网），勾选「我已了解风险」后才能点「允许完全访问」，页脚按钮胶囊化

**中文与排版**

- 应用与组件语言包补全：权限相关文案、消息右键菜单、时间戳等不再回退英文
- 弹窗统一尺寸与内边距；菜单改为 12px 圆角紧凑卡片，分隔线内缩，行高 30px

## 本地构建

需要 Bun 1.4+：

```sh
bun install

# 构建桌面端，产物在 packages/desktop/out
cd packages/desktop
bun node_modules/electron-vite/bin/electron-vite.js build
```

装到本地 app（macOS，已验证流程）：

```sh
rsync -a --delete out/{main,preload,renderer} \
  /Applications/gougocodex.app/Contents/Resources/app/out/
codesign --force --deep --sign - /Applications/gougocodex.app
```

> 替换产物后必须清掉 `~/Library/Application Support/ai.opencode.desktop.dev/{Cache,Code Cache,GPUCache}` 再启动，否则仍会跑旧 bundle；启动时保证 `ELECTRON_RUN_AS_NODE` 未设置，否则 Electron 会退化成 Node。

## 许可

[MIT](LICENSE)，继承上游。上游代码版权归 opencode 作者所有。
