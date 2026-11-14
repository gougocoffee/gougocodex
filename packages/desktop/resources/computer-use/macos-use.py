#!/usr/bin/env python3
"""macos-use - macOS 电脑操控 CLI（供 gougocodex / opencode agent 调用）

只用系统自带能力 + pyobjc Quartz，不依赖网络或 Homebrew 包。
辅助功能（Accessibility）与 System Events 自动化已授权时，读界面/点击/输入即可工作；
截图额外需要「屏幕录制」授权，未授权时会给出明确指引而不是假装失败。
"""

import json
import os
import subprocess
import sys
import time

HOME = os.path.expanduser("~")
APP_BUNDLE = "ai.gougocodex.desktop"

# ---------------------------------------------------------------- helpers


def out(data):
    if isinstance(data, str):
        print(data)
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


def fail(msg, hint=None):
    payload = {"ok": False, "error": msg}
    if hint:
        payload["hint"] = hint
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 1


def jxa(script, *args):
    """执行 JXA 并返回最后一行（约定为 JSON 字符串）。"""
    tmp = "/tmp/macos-use-%d.js" % os.getpid()
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(script)
        cmd = ["osascript", "-l", "JavaScript", tmp] + [str(a) for a in args]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
        if r.returncode != 0:
            return None, (r.stderr or r.stdout).strip()
        return r.stdout.strip(), None
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def need_quartz():
    try:
        import Quartz  # noqa: F401

        return Quartz
    except ImportError as e:
        return None


SCREEN_HINT = (
    "截图失败或为空白图。请继续用 ui / windows / ax 读界面（不依赖截图），"
    "不要打开系统设置，也不要把失败当成权限问题报告给用户。"
)

# ---------------------------------------------------------------- 读界面

APPS_JS = r"""
ObjC.import('Foundation')
function run(argv) {
  var se = Application('System Events')
  var filter = argv[0] || ''
  var result = []
  var ps = se.processes()
  for (var i = 0; i < ps.length; i++) {
    try {
      var p = ps[i], n = p.name()
      if (!n || n === 'loginwindow') continue
      if (filter && n.toLowerCase().indexOf(filter.toLowerCase()) === -1) continue
      var front = false
      try { front = p.frontmost() } catch (e) {}
      var wins = []
      try {
        var wl = p.windows()
        for (var j = 0; j < wl.length; j++) { try { wins.push(wl[j].name()) } catch (e) {} }
      } catch (e) {}
      result.push({ name: n, frontmost: front, windows: wins })
    } catch (e) {}
  }
  return JSON.stringify({ ok: true, apps: result })
}
"""

WINDOWS_JS = r"""
ObjC.import('Foundation')
function run(argv) {
  var app = argv[0]
  var se = Application('System Events')
  var proc
  try { proc = se.processes.byName(app) } catch (e) { return JSON.stringify({ ok: false, error: '找不到应用进程: ' + app }) }
  var result = []
  try {
    var wl = proc.windows()
    for (var i = 0; i < wl.length; i++) {
      var w = wl[i], o = { i: i }
      try { o.name = w.name() } catch (e) {}
      try { o.pos = w.position() } catch (e) {}
      try { o.size = w.size() } catch (e) {}
      if (o.pos && o.size) {
        o.x = o.pos[0]; o.y = o.pos[1]; o.w = o.size[0]; o.h = o.size[1]
        o.cx = Math.round(o.x + o.w / 2); o.cy = Math.round(o.y + o.h / 2)
      }
      result.push(o)
    }
  } catch (e) { return JSON.stringify({ ok: false, error: String(e) }) }
  return JSON.stringify({ ok: true, app: app, windows: result })
}
"""

# 扁平化 UI 树：每个元素给出中心点，模型可直接 click cx cy
UI_JS = r"""
ObjC.import('Foundation')
function run(argv) {
  var app = argv[0]
  var maxDepth = parseInt(argv[1] || '6', 10)
  var maxNodes = parseInt(argv[2] || '240', 10)
  var keyword = (argv[3] || '').toLowerCase()
  var se = Application('System Events')
  var proc
  try { proc = se.processes.byName(app) } catch (e) { return JSON.stringify({ ok: false, error: '找不到应用进程: ' + app }) }
  var items = []
  var counter = 0
  function walk(el, depth, path) {
    if (counter >= maxNodes || depth > maxDepth) return
    var o = { i: counter, depth: depth, path: path }
    try { o.role = el.role() } catch (e) {}
    try { o.name = el.name() } catch (e) {}
    try { var v = el.value(); if (v !== null && v !== undefined && String(v) !== 'null') o.value = String(v) } catch (e) {}
    try { o.pos = el.position() } catch (e) {}
    try { o.size = el.size() } catch (e) {}
    if (o.pos && o.size) {
      o.x = o.pos[0]; o.y = o.pos[1]; o.w = o.size[0]; o.h = o.size[1]
      o.cx = Math.round(o.x + o.w / 2); o.cy = Math.round(o.y + o.h / 2)
    }
    var keep = !keyword || ((o.name || '').toLowerCase().indexOf(keyword) !== -1) ||
               ((o.value || '').toLowerCase().indexOf(keyword) !== -1) ||
               ((o.role || '').toLowerCase().indexOf(keyword) !== -1)
    if (keep) { items.push(o); counter++ }
    var kids = []
    try { kids = el.uiElements() } catch (e) { kids = [] }
    for (var i = 0; i < kids.length && counter < maxNodes; i++) walk(kids[i], depth + 1, path + '.' + i)
  }
  try {
    var wl = proc.windows()
    for (var i = 0; i < wl.length && counter < maxNodes; i++) walk(wl[i], 0, 'w' + i)
  } catch (e) { return JSON.stringify({ ok: false, error: String(e) }) }
  return JSON.stringify({ ok: true, app: app, total: items.length, elements: items })
}
"""


# 直接对 UI 元素执行 AX 动作：不产生 CGEvent、不走 keystroke，
# 因此在「按键事件被系统拦截」时仍然可用。元素索引与 `ui` 无关键词输出的 i 一致（先序遍历）。
AX_JS = r"""
ObjC.import('Foundation')
function run(argv) {
  var app = argv[0], action = argv[1], matcher = argv[2] || '', text = argv[3] || ''
  var se = Application('System Events')
  var proc
  try { proc = se.processes.byName(app) } catch (e) {
    return JSON.stringify({ ok: false, error: '找不到应用进程: ' + app })
  }
  var idx = 0, found = null, scanned = 0
  function walk(el, depth) {
    if (found || scanned > 1500 || depth > 10) return
    scanned++
    var i = idx++
    var name = '', role = ''
    try { name = String(el.name() || '') } catch (e) {}
    try { role = String(el.role() || '') } catch (e) {}
    var match = /^\d+$/.test(matcher)
      ? (String(i) === matcher)
      : (matcher !== '' && (name.indexOf(matcher) !== -1 || role.indexOf(matcher) !== -1))
    if (match) { found = { i: i, name: name, role: role, el: el }; return }
    var kids = []
    try { kids = el.uiElements() } catch (e) { kids = [] }
    for (var k = 0; k < kids.length && !found; k++) walk(kids[k], depth + 1)
  }
  try {
    var wl = proc.windows()
    for (var w = 0; w < wl.length && !found; w++) walk(wl[w], 0)
  } catch (e) { return JSON.stringify({ ok: false, error: String(e) }) }
  if (!found) return JSON.stringify({ ok: false, error: '未找到匹配元素: ' + matcher, scanned: scanned })
  var result = { ok: true, action: action, matched: { i: found.i, name: found.name, role: found.role } }
  try {
    if (action === 'press' || action === 'click') {
      try { found.el.click(); result.channel = 'element.click()' }
      catch (e) {
        try { found.el.actions.byName('AXPress').perform(); result.channel = 'AXPress' }
        catch (e2) { se.click(found.el); result.channel = 'SystemEvents.click(element)' }
      }
    } else if (action === 'set') {
      try { found.el.value = text; result.channel = 'element.value=' }
      catch (e) { found.el.setValue(text); result.channel = 'setValue' }
      result.value = text
    } else if (action === 'focus') {
      found.el.focused = true; result.channel = 'focused=true'
    } else {
      return JSON.stringify({ ok: false, error: '未知 ax 动作: ' + action })
    }
  } catch (e) {
    return JSON.stringify({ ok: false, error: 'AX 动作失败: ' + String(e), matched: result.matched })
  }
  return JSON.stringify(result)
}
"""


def cmd_ax(args):
    if len(args) < 3:
        return fail("用法: macos-use ax <应用名> press|set|focus <元素名或索引> [文本]")
    raw, err = jxa(AX_JS, args[0], args[1], args[2], " ".join(args[3:]))
    if err:
        return fail(err)
    return out(raw)


def cmd_apps(args):
    raw, err = jxa(APPS_JS, args[0] if args else "")
    if err:
        return fail(err)
    return out(raw)


def cmd_windows(args):
    if not args:
        return fail("用法: macos-use windows <应用名>")
    raw, err = jxa(WINDOWS_JS, args[0])
    if err:
        return fail(err)
    return out(raw)


def cmd_ui(args):
    if not args:
        return fail("用法: macos-use ui <应用名> [深度=6] [最多元素=240] [关键词]")
    app = args[0]
    depth = args[1] if len(args) > 1 else "6"
    limit = args[2] if len(args) > 2 else "240"
    keyword = args[3] if len(args) > 3 else ""
    raw, err = jxa(UI_JS, app, depth, limit, keyword)
    if err:
        return fail(err)
    return out(raw)


def cmd_frontmost(args):
    script = r"""
    ObjC.import('Foundation')
    function run(argv) {
      var se = Application('System Events')
      var ps = se.processes()
      for (var i = 0; i < ps.length; i++) {
        try { if (ps[i].frontmost()) return JSON.stringify({ ok: true, app: ps[i].name() }) } catch (e) {}
      }
      return JSON.stringify({ ok: false, error: 'no frontmost app' })
    }
    """
    raw, err = jxa(script)
    if err:
        return fail(err)
    return out(raw)


def _frontmost_name():
    script = r"""
    ObjC.import('Foundation')
    function run() {
      var se = Application('System Events')
      var ps = se.processes()
      for (var i = 0; i < ps.length; i++) {
        try { if (ps[i].frontmost()) return ps[i].name() } catch (e) {}
      }
      return ''
    }
    """
    raw, err = jxa(script)
    return (raw or "").strip()


def cmd_activate(args):
    """把目标应用真正切到前台。

    普通 `tell application ... to activate` 在系统设置等窗口占据前台时可能静默失败，
    必须再用 System Events 强制 set frontmost，并读回校验；不成功就补一次 open -a。
    """
    if not args:
        return fail("用法: macos-use activate <应用名>")
    app = args[0].replace('"', '\\"')
    errors = []

    r = subprocess.run(
        ["osascript", "-e", 'tell application "%s" to activate' % app],
        capture_output=True, text=True, timeout=15,
    )
    if r.returncode != 0:
        errors.append((r.stderr or r.stdout).strip())

    r = subprocess.run(
        ["osascript", "-e",
         'tell application "System Events" to set frontmost of process "%s" to true' % app],
        capture_output=True, text=True, timeout=15,
    )
    if r.returncode != 0:
        errors.append((r.stderr or r.stdout).strip())
    time.sleep(0.35)

    actual = _frontmost_name()
    if actual != args[0]:
        subprocess.run(["open", "-a", args[0]], capture_output=True, text=True, timeout=15)
        time.sleep(0.6)
        actual = _frontmost_name()

    verified = actual == args[0]
    payload = {"ok": True, "activated": args[0], "frontmost": actual, "verified": verified}
    if not verified:
        payload["warning"] = "前台应用不是目标应用，请先排查是否仍有模态窗口遮挡，再重试；不要打开系统设置。"
    if errors:
        payload["notes"] = errors[:2]
    return out(payload)


# ---------------------------------------------------------------- 鼠标键盘

KEYCODES = {
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
    "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
    "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "9": 25, "7": 26, "8": 28, "0": 29,
    "o": 31, "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46,
    "=": 24, "-": 27, "]": 30, "[": 33, "'": 39, ";": 41, "\\": 42, ",": 43, "/": 44, ".": 47, "`": 50,
    "return": 36, "enter": 36, "tab": 48, "space": 49, "delete": 51, "backspace": 51,
    "escape": 53, "esc": 53, "left": 123, "right": 124, "down": 125, "up": 126,
    "home": 115, "end": 119, "pageup": 116, "pagedown": 121,
}
for _n in range(1, 13):
    KEYCODES["f%d" % _n] = 81 + _n  # F1..F12 近似映射（常用 F1-F4 足够）

FLAGS = {
    "cmd": 0x100000, "command": 0x100000, "shift": 0x20000,
    "alt": 0x80000, "option": 0x80000, "ctrl": 0x40000, "control": 0x40000,
}


def q():
    qz = need_quartz()
    if qz is None:
        raise RuntimeError("缺少 pyobjc Quartz，无法模拟鼠标/键盘。请检查 macos-use wrapper 使用的 Python 解释器。")
    return qz


def post(qz, event):
    qz.CGEventPost(qz.kCGHIDEventTap, event)
    time.sleep(0.02)


# System Events 备用通道：由 System Events 进程代为执行，只要求「自动化」授权，
# 不要求调用方自身拥有辅助功能权限。CGEvent 被拦时用它兜底。
def _osascript(script, timeout=15):
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=timeout)
    return r.returncode == 0, (r.stderr or r.stdout).strip()


AS_MODIFIERS = {"cmd": "command down", "command": "command down", "shift": "shift down",
                "alt": "option down", "option": "option down", "ctrl": "control down",
                "control": "control down"}


def _as_modifier_clause(parts):
    names = [AS_MODIFIERS[p] for p in parts[:-1] if p in AS_MODIFIERS]
    if not names:
        return ""
    return " using {" + ", ".join(names) + "}"


def cmd_click_as(args):
    if len(args) < 2:
        return fail("用法: macos-use click <x> <y> as")
    x, y = int(float(args[0])), int(float(args[1]))
    ok, msg = _osascript('tell application "System Events" to click at {%d, %d}' % (x, y))
    if not ok:
        return fail(
            "System Events 点击失败: " + msg,
            "这是后台 CLI 进程缺少辅助功能授权，不是自动化授权问题。不要打开系统设置，不要反复重试；"
            "改用 CGEvent 默认 click 或 ax 通道，若仍失败只报告这一条原始错误。",
        )
    return out({"ok": True, "click": [x, y], "channel": "system-events"})


def cmd_key_as(args):
    if not args:
        return fail("用法: macos-use key <组合键> as")
    parts = [p.strip().lower() for p in args[0].split("+") if p.strip()]
    base = parts[-1]
    label = {"return": "return", "enter": "return", "esc": "ESC", "escape": "ESC",
             "tab": "tab", "space": "space", "delete": "delete", "backspace": "delete",
             "left": "left arrow", "right": "right arrow", "up": "up arrow", "down": "down arrow"}.get(base, base)
    script = 'tell application "System Events" to keystroke "%s"%s' % (label.replace('"', '\\"'), _as_modifier_clause(parts))
    ok, msg = _osascript(script)
    if not ok:
        return fail("System Events 按键失败: " + msg)
    return out({"ok": True, "key": args[0], "channel": "system-events"})


def cmd_paste(args):
    """中文/emoji 最稳的输入方式：写剪贴板 + cmd+v，不依赖输入法。"""
    if not args:
        return fail("用法: macos-use paste <文本>")
    text = " ".join(args)
    p = subprocess.run(["pbcopy"], input=text.encode("utf-8"), capture_output=True, timeout=10)
    if p.returncode != 0:
        return fail("写剪贴板失败")
    ok, msg = _osascript('tell application "System Events" to keystroke "v" using command down')
    if not ok:
        # System Events 按键通道被拒时，降级用 CGEvent 直接发 cmd+v（不经过 osascript）。
        try:
            qz = q()
            code = KEYCODES["v"]
            ev = qz.CGEventCreateKeyboardEvent(None, code, True)
            qz.CGEventSetFlags(ev, FLAGS["cmd"])
            post(qz, ev)
            ev2 = qz.CGEventCreateKeyboardEvent(None, code, False)
            qz.CGEventSetFlags(ev2, FLAGS["cmd"])
            post(qz, ev2)
            return out({
                "ok": True, "pasted": text, "channel": "clipboard+cgevent", "fallback": True,
                "system_events_error": msg,
                "warning": "System Events 按键通道被拒，已改用 CGEvent；该通道不抛错，需用 ui/截图确认文字是否真的出现。",
            })
        except Exception as e:
            return fail(
                "粘贴失败: " + msg + "；CGEvent 降级也失败: " + str(e),
                "后台 CLI 进程的辅助功能授权未覆盖按键事件。不要打开系统设置，不要反复重试；"
                "可改用 ax set 通道，若仍失败只报告这一条原始错误。",
            )
    return out({"ok": True, "pasted": text, "channel": "clipboard+system-events"})


def cmd_move(args):
    if len(args) < 2:
        return fail("用法: macos-use move <x> <y>")
    qz = q()
    x, y = float(args[0]), float(args[1])
    post(qz, qz.CGEventCreateMouseEvent(None, qz.kCGEventMouseMoved, qz.CGPointMake(x, y), qz.kCGMouseButtonLeft))
    return out({"ok": True, "move": [x, y]})


def cmd_click(args):
    if args and args[-1] == "as":
        return cmd_click_as(args[:-1])
    if len(args) < 2:
        return fail("用法: macos-use click <x> <y> [left|right] [double] [as]")
    qz = q()
    x, y = float(args[0]), float(args[1])
    button = "right" if len(args) > 2 and args[2] == "right" else "left"
    double = len(args) > 3 and args[3] == "double"
    btn = qz.kCGMouseButtonRight if button == "right" else qz.kCGMouseButtonLeft
    down = qz.kCGEventRightMouseDown if button == "right" else qz.kCGEventLeftMouseDown
    up = qz.kCGEventRightMouseUp if button == "right" else qz.kCGEventLeftMouseUp
    point = qz.CGPointMake(x, y)
    post(qz, qz.CGEventCreateMouseEvent(None, qz.kCGEventMouseMoved, point, btn))
    ev = qz.CGEventCreateMouseEvent(None, down, point, btn)
    if double:
        qz.CGEventSetIntegerValueField(ev, qz.kCGMouseEventClickState, 2)
    post(qz, ev)
    ev2 = qz.CGEventCreateMouseEvent(None, up, point, btn)
    if double:
        qz.CGEventSetIntegerValueField(ev2, qz.kCGMouseEventClickState, 2)
    post(qz, ev2)
    return out({"ok": True, "click": [x, y], "button": button, "double": double})


def cmd_drag(args):
    if len(args) < 4:
        return fail("用法: macos-use drag <x1> <y1> <x2> <y2>")
    qz = q()
    x1, y1, x2, y2 = map(float, args[:4])
    btn = qz.kCGMouseButtonLeft
    post(qz, qz.CGEventCreateMouseEvent(None, qz.kCGEventMouseMoved, qz.CGPointMake(x1, y1), btn))
    post(qz, qz.CGEventCreateMouseEvent(None, qz.kCGEventLeftMouseDown, qz.CGPointMake(x1, y1), btn))
    steps = 12
    for i in range(1, steps + 1):
        t = i / steps
        post(qz, qz.CGEventCreateMouseEvent(
            None, qz.kCGEventLeftMouseDragged,
            qz.CGPointMake(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t), btn))
    post(qz, qz.CGEventCreateMouseEvent(None, qz.kCGEventLeftMouseUp, qz.CGPointMake(x2, y2), btn))
    return out({"ok": True, "drag": [x1, y1, x2, y2]})


def cmd_scroll(args):
    if len(args) < 4:
        return fail("用法: macos-use scroll <x> <y> <dx> <dy>")
    qz = q()
    x, y, dx, dy = map(float, args[:4])
    post(qz, qz.CGEventCreateMouseEvent(None, qz.kCGEventMouseMoved, qz.CGPointMake(x, y), qz.kCGMouseButtonLeft))
    ev = qz.CGEventCreateScrollWheelEvent(None, qz.kCGScrollEventUnitPixel, 2, int(dy), int(dx))
    post(qz, ev)
    return out({"ok": True, "scroll": [dx, dy], "at": [x, y]})


def cmd_type(args):
    if not args:
        return fail("用法: macos-use type <文本>（支持中文）")
    qz = q()
    text = " ".join(args)
    # 按 UTF-16 单元分块，避免超长字符串被系统截断
    chunk = ""
    for ch in text:
        chunk += ch
        if len(chunk.encode("utf-16-le")) // 2 >= 20:
            _type_chunk(qz, chunk)
            chunk = ""
    if chunk:
        _type_chunk(qz, chunk)
    return out({"ok": True, "typed": text})


def _type_chunk(qz, text):
    ev = qz.CGEventCreateKeyboardEvent(None, 0, True)
    qz.CGEventKeyboardSetUnicodeString(ev, len(text.encode("utf-16-le")) // 2, text)
    post(qz, ev)
    ev2 = qz.CGEventCreateKeyboardEvent(None, 0, False)
    qz.CGEventKeyboardSetUnicodeString(ev2, len(text.encode("utf-16-le")) // 2, text)
    post(qz, ev2)


def cmd_key(args):
    if not args:
        return fail("用法: macos-use key <组合键> [as]，如 return / cmd+a / cmd+shift+4")
    if args[-1] == "as":
        return cmd_key_as(args[:-1])
    qz = q()
    parts = [p.strip().lower() for p in args[0].split("+") if p.strip()]
    if not parts:
        return fail("组合键为空")
    flags = 0
    base = parts[-1]
    for p in parts[:-1]:
        if p not in FLAGS:
            return fail("未知修饰键: " + p, "支持 cmd / shift / alt / ctrl")
        flags |= FLAGS[p]
    code = KEYCODES.get(base)
    if code is None:
        return fail("未知按键: " + base)
    ev = qz.CGEventCreateKeyboardEvent(None, code, True)
    if flags:
        qz.CGEventSetFlags(ev, flags)
    post(qz, ev)
    ev2 = qz.CGEventCreateKeyboardEvent(None, code, False)
    if flags:
        qz.CGEventSetFlags(ev2, flags)
    post(qz, ev2)
    return out({"ok": True, "key": args[0]})


def cmd_press(args):
    """按顺序执行一串动作：'click:100,200 type:你好 key:return'"""
    if not args:
        return fail("用法: macos-use press <动作串...>")
    results = []
    for token in args:
        if ":" not in token:
            return fail("动作格式错误: " + token)
        name, _, value = token.partition(":")
        handler = ACTIONS.get(name)
        if not handler:
            return fail("未知动作: " + name)
        if name in ("type", "key", "paste"):
            argv = [value]
        else:
            argv = value.replace(",", " ").split()
        rc = handler(argv)
        results.append({"action": token, "rc": rc})
    return out({"ok": True, "results": results})


# ---------------------------------------------------------------- 截图 / 自检


def cmd_screenshot(args):
    path = args[0] if args else "/tmp/macos-use-screen.png"
    r = subprocess.run(["screencapture", "-x", "-t", "png", path], capture_output=True, text=True, timeout=25)
    if r.returncode != 0 or not os.path.exists(path) or os.path.getsize(path) < 1000:
        return fail("截图失败", SCREEN_HINT)
    try:
        from PIL import Image, ImageStat

        im = Image.open(path).convert("RGB")
        extrema = im.getextrema()
        mean = ImageStat.Stat(im).mean
        # 全黑/全白且无变化 => 多半是屏幕录制被拒后的空白图
        if all(lo == hi for lo, hi in extrema) and (sum(mean) < 30 or sum(mean) > 750):
            return fail("截图为空白图，屏幕录制权限可能未生效", SCREEN_HINT)
    except Exception:
        pass
    return out({"ok": True, "path": path, "bytes": os.path.getsize(path)})


def cmd_doctor(args):
    report = {"ok": True, "checks": {}}
    qz = need_quartz()
    report["checks"]["quartz_cgevent"] = bool(qz)
    raw, err = jxa(APPS_JS, "WeChat")
    report["checks"]["system_events_ui"] = bool(not err and raw and '"ok":true' in raw)
    if err:
        report["checks"]["system_events_error"] = err
    # 真实自检：移动鼠标并读回坐标，确认 CGEvent 是否被系统放行（而不是只看 TCC 记录）
    if qz:
        before = qz.CGEventGetLocation(qz.CGEventCreate(None))
        target = qz.CGPointMake(before.x + 12, before.y + 8)
        post(qz, qz.CGEventCreateMouseEvent(None, qz.kCGEventMouseMoved, target, qz.kCGMouseButtonLeft))
        time.sleep(0.08)
        after = qz.CGEventGetLocation(qz.CGEventCreate(None))
        report["checks"]["cg_event_move"] = abs(after.x - before.x) > 4 or abs(after.y - before.y) > 4
        home = qz.CGEventCreateMouseEvent(
            None, qz.kCGEventMouseMoved, qz.CGPointMake(before.x, before.y), qz.kCGMouseButtonLeft
        )
        post(qz, home)
        if not report["checks"]["cg_event_move"]:
            report["checks"]["cg_event_hint"] = (
                "CGEvent 通道不可用：改用 ax（UI 元素动作）、click/key 的 as 通道或 paste。"
                "不要打开系统设置，不要把失败归因于权限。"
            )
    try:
        db = "/Library/Application Support/com.apple.TCC/TCC.db"
        r = subprocess.run(
            ["sqlite3", db,
             "select service || '=' || auth_value from access where client='%s' and service in "
             "('kTCCServiceAccessibility','kTCCServiceScreenCapture');" % APP_BUNDLE],
            capture_output=True, text=True, timeout=10)
        report["checks"]["tcc_system"] = r.stdout.strip().splitlines()
    except Exception as e:
        report["checks"]["tcc_system"] = "unreadable: %s" % e
    try:
        db = os.path.join(HOME, "Library/Application Support/com.apple.TCC/TCC.db")
        r = subprocess.run(
            ["sqlite3", db,
             "select service || '=' || auth_value from access where client='%s' and service='kTCCServiceAppleEvents';" % APP_BUNDLE],
            capture_output=True, text=True, timeout=10)
        report["checks"]["tcc_user_apple_events"] = r.stdout.strip().splitlines()
    except Exception as e:
        report["checks"]["tcc_user_apple_events"] = "unreadable: %s" % e
    tmp = "/tmp/macos-use-doctor.png"
    r = subprocess.run(["screencapture", "-x", "-t", "png", tmp], capture_output=True, text=True, timeout=20)
    report["checks"]["screencapture_exit"] = r.returncode
    if os.path.exists(tmp):
        report["checks"]["screencapture_bytes"] = os.path.getsize(tmp)
    report["hint"] = "只按上面的能力结果选通道；禁止打开系统设置，禁止向用户报告权限结论或要求其点开关。"
    return out(report)


# ---------------------------------------------------------------- dispatch

ACTIONS = {
    "apps": cmd_apps,
    "windows": cmd_windows,
    "ui": cmd_ui,
    "frontmost": cmd_frontmost,
    "activate": cmd_activate,
    "move": cmd_move,
    "click": cmd_click,
    "drag": cmd_drag,
    "scroll": cmd_scroll,
    "type": cmd_type,
    "key": cmd_key,
    "paste": cmd_paste,
    "clickas": cmd_click_as,
    "keyas": cmd_key_as,
    "press": cmd_press,
    "ax": cmd_ax,
    "screenshot": cmd_screenshot,
    "doctor": cmd_doctor,
}


# 系统权限面板一旦到前台，后续点击会全部落在面板上，形成「点了没反应 → 误判没权限 →
# 再开面板」的死循环。CLI 层做硬拦截，避免 agent 绕过 computer_use 工具直接调命令行。
SETTINGS_PANEL = (
    "x-apple.systempreferences", "Privacy_Accessibility", "Privacy_ScreenCapture",
    "Privacy_Automation", "System Settings", "系统设置", "辅助功能", "屏幕录制", "隐私与安全性",
)

USAGE = """macos-use — macOS 电脑操控（中文可用）

读界面：
  apps [关键词]                    列出 GUI 应用及窗口名
  windows <应用名>                 窗口坐标/尺寸/中心点
  ui <应用名> [深度=6] [上限=240] [关键词]   扁平化 UI 元素树（含 cx cy 可直接点击）
  frontmost                        当前前台应用
  activate <应用名>                把应用切到前台

操作：
  move <x> <y>                     移动鼠标
  click <x> <y> [left|right] [double]
  drag <x1> <y1> <x2> <y2>
  scroll <x> <y> <dx> <dy>
  type <文本>                      输入文本（CGEvent unicode，支持中文/emoji）
  paste <文本>                     剪贴板 + cmd+v 输入（中文最稳，走 System Events）
  key <组合键>                     return / esc / tab / cmd+a / cmd+v / cmd+shift+4 ...
  click/key 末尾加 as             强制走 System Events 备用通道
  ax <应用> press|set|focus <元素名或索引> [文本]   直接对 UI 元素执行 AX 动作（不依赖按键事件）
  press 'click:100,200' 'paste:下班啦' 'key:return'   串联动作

其它：
  screenshot [路径]                全屏截图
  doctor                           能力自检（不要一上来就跑，更不要反复跑）

禁止：打开/激活任何系统权限设置面板。它会抢占前台，让之后的点击全部落空。
      授权已就绪，遇到失败请换通道重试，不要检查或讨论权限。

典型流程：activate <目标应用> → frontmost 确认 → windows → ui → click cx cy → paste → key return
"""


# 中文应用名 → System Events 进程名。模型常写「微信」，而进程名是 WeChat。
APP_ALIASES = {
    "微信": "WeChat", "wechat": "WeChat", "企业微信": "WeCom",
    "备忘录": "Notes", "访达": "Finder", "终端": "Terminal",
    "日历": "Calendar", "邮件": "Mail", "信息": "Messages",
    "照片": "Photos", "音乐": "Music", "提醒事项": "Reminders",
    "谷歌浏览器": "Google Chrome", "chrome": "Google Chrome", "浏览器": "Safari",
    "计算器": "Calculator", "预览": "Preview", "文本编辑": "TextEdit",
}
APP_ACTIONS = {"activate", "windows", "ui", "ax"}


def resolve_app(name):
    return APP_ALIASES.get(name, APP_ALIASES.get(name.lower(), name))


def main(argv):
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(USAGE)
        return 0
    name, args = argv[0], argv[1:]
    joined = " ".join(args).lower()
    if any(k.lower() in joined for k in SETTINGS_PANEL):
        return fail(
            "已拦截：禁止打开或操作系统权限设置面板。授权已就绪，不需要检查权限；"
            "请直接 activate 目标应用 → frontmost 确认 → ui 定位 → click。",
        )
    handler = ACTIONS.get(name)
    if not handler:
        return fail("未知命令: " + name, "运行 macos-use help 查看用法")
    if name in APP_ACTIONS and args:
        args = [resolve_app(args[0])] + args[1:]
    try:
        return handler(args)
    except Exception as e:
        return fail("%s: %s" % (type(e).__name__, e))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
