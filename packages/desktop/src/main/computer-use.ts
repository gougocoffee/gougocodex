// gougocodex 内置电脑操控服务。
//
// 关键：操控动作必须由 Electron 主进程（gougocodex.app）派生执行。opencode 的后台 CLI
// 是独立二进制，由它派生 osascript / CGEvent 会被系统判定为未授权 client，导致按键被拒。
// 这里在主进程内监听一个本地 Unix socket，把 computer_use 插件的动作接过来执行，
// 让 macOS 的辅助功能 / 屏幕录制授权直接归属于 gougocodex.app 本身。

import net from "node:net"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { desktopCapturer, systemPreferences } from "electron"

const packaged = (process.resourcesPath || "").includes(".app/Contents/Resources")
const SOCK = packaged ? "/tmp/gougocodex-computer-use.sock" : "/tmp/gougocodex-computer-use-dev.sock"

function resolveCli(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath || "", "computer-use", "macos-use"),
    path.join(process.cwd(), "packages/desktop/resources/computer-use/macos-use"),
    path.join(process.env.HOME || "", ".config/opencode/bin/macos-use"),
  ]
  return candidates.find((p) => p && fs.existsSync(p))
}

function start() {
  const CLI = resolveCli()
  if (!CLI) return

  try {
    fs.unlinkSync(SOCK)
  } catch {}

  const server = net.createServer((conn) => {
    let buf = ""
    let replied = false
    const send = (payload: unknown) => {
      if (replied) return
      replied = true
      try {
        conn.end(JSON.stringify(payload) + "\n")
      } catch {}
    }

    conn.on("data", (chunk) => {
      buf += chunk.toString("utf8")
      if (!buf.includes("\n")) return

      let req: { action?: string; args?: string[] }
      try {
        req = JSON.parse(buf.split("\n")[0])
      } catch {
        return send({ ok: false, error: "invalid json", via: "app" })
      }

      const action = String(req.action ?? "")
      const args = (req.args ?? []).map(String)

      // Automation runs as this app, so the system grants (Accessibility, Screen Recording) belong to it.
      // Report them here and let Electron raise the native prompts when asked.
      if (action === "permission") {
        const prompt = args.includes("prompt")
        const accessibility = systemPreferences.isTrustedAccessibilityClient(prompt)
        const screen = systemPreferences.getMediaAccessStatus("screen")

        if (prompt && screen !== "granted") {
          // Touching the capturer is what makes macOS show the Screen Recording prompt.
          void desktopCapturer
            .getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } })
            .catch(() => {})
        }

        send({ ok: accessibility && screen === "granted", accessibility, screen, via: "app" })
        return
      }

      const child = spawn(CLI, [action, ...args], {
        env: { ...process.env, LANG: "zh_CN.UTF-8", LC_ALL: "zh_CN.UTF-8" },
        stdio: ["ignore", "pipe", "pipe"],
      })

      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (d) => (stdout += d.toString()))
      child.stderr.on("data", (d) => (stderr += d.toString()))
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {}
      }, 65000)

      child.on("error", (err) => {
        clearTimeout(timer)
        send({ ok: false, error: String(err), via: "app" })
      })
      child.on("close", (code) => {
        clearTimeout(timer)
        send({
          ok: code === 0,
          exit: code,
          output: stdout.trim(),
          stderr: stderr.trim().slice(0, 2000),
          via: "app",
        })
      })
    })
    conn.on("error", () => {})
  })

  server.on("error", () => {})
  server.listen(SOCK, () => {
    try {
      fs.chmodSync(SOCK, 0o600)
    } catch {}
  })
}

start()
