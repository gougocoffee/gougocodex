import { createEffect } from "solid-js"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection } from "@/runtime/server/registry"
import { useLayout } from "@/shell/state/layout"
import { useTabs } from "@/shell/tabs/tabs"

/**
 * Codex has no separate landing page: the app always sits in a chat. Opening Home hands the
 * user straight to a real new-session draft, so there is one composer instead of two.
 */
export function Home() {
  const layout = useLayout()
  const global = useGlobal()
  const tabs = useTabs()

  createEffect(() => {
    const selection = layout.home.selection()
    const connections = global.servers.list()
    const conn = connections.find((item) => ServerConnection.key(item) === selection.server) ?? connections[0]

    if (!conn) return
    const key = ServerConnection.key(conn)
    const projects = global.serverCtx(key)?.projects

    if (!projects) return
    const project =
      projects.list().find((item) => item.worktree === selection.directory) ?? projects.last() ?? projects.list()[0]

    if (!project) return
    const existing = tabs.store.find(
      (tab) => tab.type === "draft" && tab.server === key && tab.directory === project.worktree,
    )

    if (existing) {
      tabs.select(existing)
      return
    }

    // An untouched draft in the same directory is reused, so repeated visits never pile up empty tabs.
    void tabs.newDraft({ server: key, directory: project.worktree })
  })

  return <div data-slot="home-panel" class="relative flex min-h-0 flex-1 self-stretch overflow-hidden bg-v2-background-bg-base" />
}
