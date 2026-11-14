# 第三方组件与许可证

`gougocodex` 基于 [anomalyco/opencode](https://github.com/anomalyco/opencode)（MIT，Copyright (c) 2025 opencode），其许可全文见仓库根目录 [LICENSE](./LICENSE)。本 fork 的修改部分为 Copyright (c) 2026 gougocoffee。

本文件列出打包 `gougocodex.app` 与 `opencode-cli` 时包含的主要第三方组件。各组件完整的许可全文以其随附的 `LICENSE` / `NOTICE` 文件为准；**分发二进制时应随附 `LICENSE` 与本文件**。

## 桌面运行时

| 组件 | 版本 | 许可证 | 说明 |
| --- | --- | --- | --- |
| Electron | 44.9.1 | MIT | 桌面窗口、主进程与渲染进程；许可全文见 `ELECTRON_LICENSE` |
| Chromium（Electron 内置） | 随 Electron 44.9.1 | BSD-3-Clause、MIT、Apache-2.0 等多种 | 完整清单见 `CHROMIUM_LICENSES.html` |
| Bun | 1.4.4 | MIT | JS 运行时与单文件打包；其内置的 JavaScriptCore 等组件另有许可，以 Bun 发布包随附声明为准 |
| Node.js API（Electron 内置） | 随 Electron | MIT | 主进程 API |

`ELECTRON_LICENSE` 与 `CHROMIUM_LICENSES.html` 来自 `node_modules/.bun/electron@*/node_modules/electron/dist/`，在打包时一并放入 `gougocodex.app/Contents/Resources/`。

## 主要运行时依赖

许可证取自各包 `package.json` 的 `license` 字段。

| 包 | 版本 | 许可证 |
| --- | --- | --- |
| solid-js | 1.9.17 | MIT |
| effect | 4.1.0 | MIT |
| @kobalte/core | 0.13.13 | MIT |
| @opentui/core | 0.8.4 | MIT |
| @opentui/solid | 0.8.4 | MIT |
| @opencode/pty | 0.5.2 | MIT |
| @lydell/node-pty | 1.2.0-beta.12 | MIT |
| vite | 7.3.7 | MIT |
| electron-vite | 6.0.0-beta.1 | MIT |
| electron-builder | 26.15.7 | MIT |
| @ai-sdk/openai-compatible | 2.0.41 | Apache-2.0 |

## 根 `package.json` 直接依赖

| 包 | 版本 | 许可证 |
| --- | --- | --- |
| @opencode/plugin | 2.3.0 | MIT |
| @opencode/script | — | MIT |
| @opencode/client | 2.3.0 | MIT |
| typescript | 6.0.2 | Apache-2.0 |
| @typescript/native | 7.1.0-beta | Apache-2.0 |
| @ast-grep/cli | 0.44.0 | MIT |
| @hona/strobe | 0.42.0 | MIT |
| @oxlint/plugins | 1.60.0 | MIT |
| @tsconfig/bun | 1.0.9 | MIT |
| @types/bun | 1.4.3 | MIT |
| @types/mime-types | 3.0.1 | MIT |
| @types/react | 19.2.17 | MIT |
| glob | 13.0.5 | BlueOak-1.0.0 |
| husky | 9.1.7 | MIT |
| oxlint | 1.60.0 | MIT |
| prettier | 3.6.2 | MIT |
| semver | 7.8.5 | ISC |
| turbo | 2.10.2 | MIT |

传递依赖（数百个 npm 包）未逐项列出；每个包自带的 `LICENSE` / `license` 文件随 `node_modules` 一起保留在发布包中。重新生成完整清单：

```bash
bun pm ls --all
# 或扫描所有 node_modules 里的 package.json 的 license 字段
```

## 分发清单

发布 `gougocodex.app` 或 `opencode-cli` 二进制时，请随附：

1. `LICENSE` —— opencode 的 MIT 许可全文（含 `Copyright (c) 2025 opencode`）；
2. `THIRD_PARTY_NOTICES.md` —— 本文件；
3. `ELECTRON_LICENSE` 与 `CHROMIUM_LICENSES.html` —— Electron / Chromium 许可全文；
4. `node_modules` 中各依赖自带的许可证文件（打包时已保留）。

MIT 不授予商标权。`gougocodex` 名称与小狗图标为本 fork 自有；`opencode` 名称、logo 与 `opencode.ai` 归原项目所有。
