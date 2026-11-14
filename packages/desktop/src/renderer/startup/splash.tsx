import type { Platform } from "@opencode/app/desktop"
import { onCleanup, onMount, Show } from "solid-js"
import "./splash.css"

const dogUrl = new URL("./dog.png", import.meta.url).href

export function LoadingSplash(props: {
  deep: boolean
  firstLaunch: boolean
  platform: Platform
  drawingPaused: boolean
  onDrawStart: () => void
  onDrawEnd: () => void
}) {
  onMount(() => {
    if (!props.drawingPaused) return
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")

    const start = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return
      props.onDrawStart()

      if (motion.matches) props.onDrawEnd()
    }

    window.addEventListener("focus", start)
    document.addEventListener("visibilitychange", start)
    motion.addEventListener("change", start)
    start()
    onCleanup(() => {
      window.removeEventListener("focus", start)
      document.removeEventListener("visibilitychange", start)
      motion.removeEventListener("change", start)
    })
  })

  return (
    <Show
      when={props.firstLaunch}
      fallback={
        <div
          data-component="startup-splash"
          class="h-dvh w-screen flex flex-col items-center justify-center"
          classList={{
            "bg-v2-background-bg-deep": props.deep,
            "bg-v2-background-bg-base": !props.deep,
          }}
        >
          <div class="splash-dog" style={{ "--dog-url": `url("${dogUrl}")` }} aria-hidden="true">
            <div class="splash-dog-base" />
            <div class="splash-dog-shine splash-dog-shine-loop" />
          </div>
        </div>
      }
    >
      <div
        data-component="first-launch-splash"
        data-drawing={props.drawingPaused ? "pending" : "running"}
        aria-hidden="true"
        class="h-dvh w-screen bg-v2-background-bg-base flex flex-col items-center justify-center"
      >
        <div class="splash-dog" style={{ "--dog-url": `url("${dogUrl}")` }}>
          <div class="splash-dog-base" />
          <div
            class="splash-dog-shine splash-dog-shine-once"
            onAnimationEnd={(event) => {
              if (event.animationName === "splash-shine-once") props.onDrawEnd()
            }}
          />
        </div>
      </div>
    </Show>
  )
}
