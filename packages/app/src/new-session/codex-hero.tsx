import { For, createSignal, onCleanup } from "solid-js"

/** 云朵气泡的外框：手绘感的波浪边，单线、线条粗一点，像随手画的圈。 */
function cloudPath(cx: number, cy: number, rx: number, ry: number, lobes: number, seed: number) {
  const jitter = (i: number) => {
    const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
    return (v - Math.floor(v) - 0.5) * 0.09
  }
  const point = (i: number) => {
    const a = (i / lobes) * Math.PI * 2
    const k = 1 + jitter(i)
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as const
  }
  let d = `M ${point(0)[0].toFixed(1)} ${point(0)[1].toFixed(1)}`
  for (let i = 1; i <= lobes; i++) {
    const to = point(i % lobes)
    const a = ((i - 0.5) / lobes) * Math.PI * 2
    const bulge = 1.16 + jitter(i + 40) * 0.45
    const c = [cx + Math.cos(a) * rx * bulge, cy + Math.sin(a) * ry * bulge] as const
    d += ` Q ${c[0].toFixed(1)} ${c[1].toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`
  }
  return `${d} Z`
}

const CLOUD = cloudPath(88, 54, 70, 40, 13, 1)

/** 气泡里随机冒出来的代码碎片。 */
const GLYPHS = [
  "</>",
  "{ }",
  "=>",
  "::",
  "0x1",
  "++",
  "->",
  "&&",
  "||",
  "<?php",
  "$i",
  "echo",
  "std::",
  "√",
  "∑",
  "∞",
  "+",
  "-",
  "×",
  "÷",
  "=",
  "1",
  "0",
  "01",
  "10001",
  "&",
  "#",
  "@",
  "*",
  "%",
  "¥",
  "E=mc²",
  "……",
  "!",
]

type Blip = { id: number; glyph: string; x: number; y: number; rot: number; size: number }

let seq = 0

function ThinkingBubble(props: { children: any; onActive?: (on: boolean) => void }) {
  const [blips, setBlips] = createSignal<Blip[]>([])
  let timer: ReturnType<typeof setInterval> | undefined
  const cleanups = new Set<ReturnType<typeof setTimeout>>()

  const spawn = () => {
    const id = ++seq
    setBlips((list) => {
      // 优先挑当前没在画面上的符号，避免一屏里冒出好几个一样的
      const free = GLYPHS.filter((g) => !list.some((b) => b.glyph === g))
      const glyph = (free.length ? free : GLYPHS)[Math.floor(Math.random() * (free.length || GLYPHS.length))]
      const size = Math.random() < 0.3 ? 13.5 : 11
      const glyphW = glyph.length * size * 0.62
      // 在椭圆内部挑点，按字宽收窄可用半径，保证整段符号都落在气泡里
      const rx = 56 - glyphW / 2
      const ry = 27
      let x = 88
      let y = 54
      for (let attempt = 0; attempt < 9; attempt++) {
        const angle = Math.random() * Math.PI * 2
        const limitX = Math.abs(Math.cos(angle)) < 1e-3 ? Infinity : rx / Math.abs(Math.cos(angle))
        const limitY = Math.abs(Math.sin(angle)) < 1e-3 ? Infinity : ry / Math.abs(Math.sin(angle))
        const radius = Math.random() * Math.max(2, Math.min(limitX, limitY))
        x = 88 + radius * Math.cos(angle)
        y = 54 + radius * Math.sin(angle)
        // 跟已经在画面上的符号拉开距离，长符号额外留出半个字宽，避免叠成一坨
        const crowded = list.some((b) => {
          const halfW = (b.glyph.length * b.size * 0.62 + glyphW) / 2
          const dx = Math.abs(b.x - x)
          const dy = Math.abs(b.y - y)
          return dy < 13 && dx < halfW + 3
        })
        if (!crowded) break
      }
      const blip: Blip = {
        id,
        glyph,
        x,
        y,
        rot: -16 + Math.random() * 32,
        size,
      }
      const drop = setTimeout(() => {
        setBlips((current) => current.filter((b) => b.id !== id))
        cleanups.delete(drop)
      }, 1150)
      cleanups.add(drop)
      return [...list.slice(-9), blip]
    })
  }

  const start = () => {
    if (timer) return
    for (let i = 0; i < 5; i++) spawn()
    timer = setInterval(spawn, 80)
    props.onActive?.(true)
  }

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = undefined
    props.onActive?.(false)
  }

  onCleanup(() => {
    stop()
    for (const t of cleanups) clearTimeout(t)
  })

  return (
    <div class="hero-dog" onMouseEnter={start} onMouseLeave={stop} onTouchStart={start}>
      <div class="hero-think" aria-hidden="true">
        <div class="hero-think-body">
          <svg class="hero-think-cloud" viewBox="0 0 176 136" fill="none" aria-hidden="true">
          <path d={CLOUD} class="hero-think-stroke" />
          <circle cx="72" cy="102" r="5" class="hero-think-dot" />
          <circle cx="61" cy="113" r="3.2" class="hero-think-dot" />
          <circle cx="51" cy="123" r="2" class="hero-think-dot" />
          </svg>
          <div class="hero-think-field">
          <For each={blips()}>
            {(blip) => (
              <span
                class="hero-think-blip"
                style={{
                  left: `${blip.x}px`,
                  top: `${blip.y}px`,
                  "--blip-rot": `${blip.rot}deg`,
                  "font-size": `${blip.size}px`,
                }}
              >
                {blip.glyph}
              </span>
            )}
          </For>
          </div>
        </div>
      </div>
      {props.children}
    </div>
  )
}

/**
 * Codex-style empty-state hero: the product mark above a large, quiet headline.
 * Sits where the animated opencode wordmark used to render.
 *
 * The mark is interactive, the way Codex's is: hovering lifts it and pops a
 * hand-drawn thought bubble above it, clicking replays a short squash-and-settle
 * so it feels alive without being noisy.
 */
export function CodexHero(props: { glyphSize?: number; project?: string } = {}) {
  const [pulse, setPulse] = createSignal(0)
  const [blinking, setBlinking] = createSignal(false)
  const size = props.glyphSize ?? 40

  // 悬停思考时每 2 秒眨一次眼
  let blinkTimer: ReturnType<typeof setInterval> | undefined
  let blinkOff: ReturnType<typeof setTimeout> | undefined

  const blink = () => {
    setBlinking(true)
    blinkOff = setTimeout(() => setBlinking(false), 240)
  }

  const toggleBlink = (on: boolean) => {
    if (blinkTimer) clearInterval(blinkTimer)
    if (blinkOff) clearTimeout(blinkOff)
    blinkTimer = undefined
    blinkOff = undefined
    setBlinking(false)
    if (!on) return
    blink()
    blinkTimer = setInterval(blink, 2000)
  }

  onCleanup(() => {
    if (blinkTimer) clearInterval(blinkTimer)
    if (blinkOff) clearTimeout(blinkOff)
  })

  // Clearing the counter first lets the next click restart the animation from zero.
  const replay = () => {
    setPulse(0)
    requestAnimationFrame(() => setPulse((n) => n + 1))
  }

  return (
    <div class="flex select-none flex-col items-center justify-center gap-8 text-center">
      <ThinkingBubble onActive={toggleBlink}>
        <button
          type="button"
          aria-label="gougocodex"
          class="group grid cursor-pointer place-items-center transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-95"
          onClick={replay}
        >
          <span
            class="hero-dog-mark"
            style={{ height: `${size}px` }}
            classList={{ "motion-safe:animate-[codex-hero-pulse_520ms_cubic-bezier(0.34,1.56,0.64,1)]": pulse() > 0 }}
          >
            <img
              src="/assets/logo-eyeless.png"
              alt=""
              draggable={false}
              class="hero-dog-img w-auto opacity-90 transition-opacity duration-200 group-hover:opacity-100"
              aria-hidden="true"
            />
            {/* 眼睛由代码画，闭眼时压成一条线 */}
            <svg
              class="hero-dog-eyes"
              viewBox="0 0 993 736"
              preserveAspectRatio="none"
              classList={{ "hero-dog-eyes--shut": blinking() }}
              aria-hidden="true"
            >
              <ellipse class="hero-eye" cx="339" cy="309.5" rx="25" ry="28.5" />
              <g transform="rotate(-18 565 363)">
                <ellipse class="hero-eye" cx="565" cy="363" rx="26" ry="29" />
              </g>
            </svg>
          </span>
        </button>
      </ThinkingBubble>
      <h1 class="text-[32px] leading-[1.2] text-[#1a1a1a]" style={{ "font-weight": "400", "letter-spacing": "-0.01em" }}>
        {props.project ? `在 ${props.project} 里做点什么？` : "想做点什么？"}
      </h1>
    </div>
  )
}
