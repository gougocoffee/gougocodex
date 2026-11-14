import { createSignal } from "solid-js"

/**
 * Codex-style empty-state hero: the product mark above a large, quiet headline.
 * Sits where the animated opencode wordmark used to render.
 *
 * The mark is interactive, the way Codex's is: hovering lifts it, and clicking
 * replays a short squash-and-settle so it feels alive without being noisy.
 */
export function CodexHero(props: { glyphSize?: number; project?: string } = {}) {
  const [pulse, setPulse] = createSignal(0)
  const size = props.glyphSize ?? 40

  // Clearing the counter first lets the next click restart the animation from zero.
  const replay = () => {
    setPulse(0)
    requestAnimationFrame(() => setPulse((n) => n + 1))
  }

  return (
    <div class="flex select-none flex-col items-center justify-center gap-8 text-center">
      <button
        type="button"
        aria-label="gougocodex"
        class="group grid cursor-pointer place-items-center transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-95"
        onClick={replay}
      >
        <img
          src="/assets/logo.png"
          alt=""
          draggable={false}
          class="w-auto opacity-90 transition-opacity duration-200 group-hover:opacity-100"
          style={{ height: `${size}px` }}
          classList={{ "motion-safe:animate-[codex-hero-pulse_520ms_cubic-bezier(0.34,1.56,0.64,1)]": pulse() > 0 }}
          aria-hidden="true"
        />
      </button>
      <h1 class="text-[32px] leading-[1.2] text-[#1a1a1a]" style={{ "font-weight": "400", "letter-spacing": "-0.01em" }}>
        {props.project ? `在 ${props.project} 里做点什么？` : "想做点什么？"}
      </h1>
    </div>
  )
}
