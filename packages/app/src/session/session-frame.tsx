import type { ParentProps } from "solid-js"

export function SessionRouteFrame(props: ParentProps) {
  return <div class="relative flex size-full flex-col">{props.children}</div>
}

export function SessionPanelFrame(props: ParentProps) {
  return (
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-v2-background-bg-base">{props.children}</div>
  )
}
