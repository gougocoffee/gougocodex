import { Schema } from "effect"
import { createEffect, createMemo, createSignal, For, Show, onCleanup, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useQueries } from "@tanstack/solid-query"
import type { SessionInfo } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { ScrollView } from "@opencode/ui/scroll-view"
import { homeSessionsQuery } from "@/home/sessions/queries"
import { useLanguage } from "@/runtime/i18n/language"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal, useServerCtx } from "@/runtime/server/runtime"
import { getRelativeTime } from "@/shell/time"
import { useLayout } from "@/shell/state/layout"
import { createProjectSessionActions } from "@/shell/tabs/project-sessions"
import { useTabs, type Tab } from "@/shell/tabs/tabs"
import { sessionLabel } from "@/session/title"
import { isSidebarSessionActivity, mergeSidebarSessions } from "./sidebar-sessions"
import "./tab-nav.css"

const TASK_STEP = 5

// Old fields stay in the schema so a persisted sidebar.organize blob written by earlier versions still decodes.
const SidebarState = Persistence.struct({
  projectsCollapsed: Schema.Boolean,
  tasksCollapsed: Persistence.fallback(Schema.Boolean, () => false),
  recentsCollapsed: Persistence.fallback(Schema.Boolean, () => false),
  expanded: Persistence.record(Schema.Boolean),
  order: Persistence.record(Schema.mutable(Schema.Array(Schema.String))),
})

/** Tracks session activity on every server, and keeps a preview tab once its session does something. */
export function createSidebarActivityListener() {
  const tabs = useTabs()

  const global = useGlobal()

  // Keep a preview tab once its session shows activity. Ordering comes from the shared data layer, so this listener
  // only decides when a preview has become worth keeping.
  createEffect(() => {
    global.servers.list().forEach((conn) => {
      const server = ServerConnection.key(conn)
      const ctx = global.serverCtx(server)

      if (!ctx) return
      onCleanup(
        ctx.data.listen(({ details }) => {
          if (!isSidebarSessionActivity(details)) return
          const sessionID = details.data.sessionID
          const preview = tabs.preview()

          if (
            preview?.server === server &&
            (preview.sessionId === sessionID || preview.sessionId === ctx.data.session.root(sessionID))
          )
            tabs.keepPreview()
        }),
      )
    })
  })
}

// Resolved once for the whole sidebar, so the header and every task row agree on the connection.
function useSidebarConnection(currentTab: () => Tab | undefined) {
  const servers = useServers()

  const layout = useLayout()

  return createMemo(
    () =>
      servers.visible.find(
        (conn) => ServerConnection.key(conn) === (currentTab()?.server ?? layout.home.selection().server),
      ) ?? servers.visible[0],
  )
}

/**
 * The sidebar is a single 任务 list: every root conversation of this server, newest first, with its age on the right.
 * Projects no longer get their own rows or section; the hidden tab strip still owns the tab shortcuts.
 */
export function SidebarOrganized(props: {
  currentTab: Tab | undefined
  children: (highlightActive: Accessor<boolean>) => JSX.Element
}) {
  const language = useLanguage()

  createSidebarActivityListener()

  const connection = useSidebarConnection(() => props.currentTab)

  const ctx = useServerCtx(connection)

  const sessionActions = createProjectSessionActions()

  const recentQueries = useQueries(() => ({ queries: [homeSessionsQuery(connection(), ctx())] }))

  const [state, setState] = persisted(Persist.global("sidebar.organize"), SidebarState, {
    projectsCollapsed: false,
    tasksCollapsed: false,
    recentsCollapsed: false,
    expanded: {},
    order: {},
  })

  // How many rows the list shows before "查看更多", and whether the whole list is expanded.
  const [view, setView] = createStore({ expanded: false })

  // Labels read the clock, so "3分钟前" keeps counting while the window stays open.
  const [now, setNow] = createSignal(Date.now())

  const clock = setInterval(() => setNow(Date.now()), 60_000)

  onCleanup(() => clearInterval(clock))

  const [local, setLocal] = createStore<{
    thumbTrack: HTMLDivElement | undefined
    hoverTarget: HTMLDivElement | undefined
  }>({ thumbTrack: undefined, hoverTarget: undefined })

  const server = createMemo(() => {
    const conn = connection()

    return conn ? ServerConnection.key(conn) : undefined
  })

  const tasks = createMemo(() => {
    const current = ctx()

    if (!current) return []

    const fetched = recentQueries[0]?.data?.() ?? []

    return current.data.session
      .apply(mergeSidebarSessions(fetched, current.data.session.known()))
      .filter((session) => !session.parentID && session.time.archived === undefined)
      .sort((a, b) => b.time.updated - a.time.updated)
  })

  const visibleTasks = () => (view.expanded ? tasks() : tasks().slice(0, TASK_STEP))

  const taskTime = (session: SessionInfo) => {
    now()

    return getRelativeTime(new Date(session.time.updated).toISOString(), language.t, language.intl())
  }

  const taskActive = (session: SessionInfo) => {
    const tab = props.currentTab

    return tab?.type === "session" && tab.server === server() && tab.sessionId === session.id
  }

  const openTask = (session: SessionInfo) => {
    const conn = connection()

    if (!conn) return

    sessionActions.openProjectSession(conn, session.location.directory, session, { preview: true })
  }

  return (
    <div
      ref={(element) => setLocal("hoverTarget", element)}
      class="relative flex min-h-0 flex-1 flex-col [app-region:no-drag]"
    >
      <div
        ref={(element) => setLocal("thumbTrack", element)}
        class="pointer-events-none absolute inset-y-0 z-10 w-3"
        style={{
          "inset-inline-end": "calc(-1 * (var(--sidebar-inset-end, 3px) + var(--shell-inline-inset, 8px)))",
        }}
      />
      <ScrollView class="min-h-0 flex-1" thumbContainer={local.thumbTrack} thumbHoverTarget={local.hoverTarget}>
        <div class="flex flex-col gap-3">
          <section class="flex shrink-0 flex-col gap-1">
            <div class="group flex h-7 w-full shrink-0 items-center gap-1 ps-2 pe-1">
              <button
                type="button"
                class="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[8px] text-start text-[13px] leading-4 text-v2-text-text-muted focus-visible:outline-none"
                aria-expanded={!state.tasksCollapsed}
                onClick={() => setState("tasksCollapsed", (value) => !value)}
              >
                <span class="min-w-0 truncate">{language.t("sidebar.organize.tasks")}</span>
                <Show when={tasks().length > 0}>
                  <span class="shrink-0 text-v2-text-text-faint">({tasks().length})</span>
                </Show>
                <Icon
                  name="fill-triangle-down"
                  size="small"
                  class="shrink-0 text-v2-icon-icon-muted transition-transform"
                  classList={{ "-rotate-90 rtl:rotate-90": state.tasksCollapsed }}
                />
              </button>
            </div>
            <Show when={!state.tasksCollapsed}>
              <Show
                when={tasks().length > 0}
                fallback={
                  <div class="px-2 pb-1 text-[13px] leading-4 text-v2-text-text-faint">
                    {language.t("sidebar.organize.empty")}
                  </div>
                }
              >
                <div class="flex min-w-0 flex-col gap-0.5">
                  <For each={visibleTasks()}>
                    {(session) => (
                      <button
                        type="button"
                        data-active={taskActive(session) ? "" : undefined}
                        title={sessionLabel(session)}
                        class="flex h-8 w-full shrink-0 items-center gap-2 rounded-[8px] px-2 text-start text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none data-[active]:bg-v2-overlay-simple-overlay-hover"
                        onClick={() => openTask(session)}
                      >
                        <span class="min-w-0 flex-1 truncate" dir="auto">
                          {sessionLabel(session)}
                        </span>
                        <span class="shrink-0 text-[11px] leading-[var(--line-height-compact)] text-v2-text-text-faint">
                          {taskTime(session)}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
                <Show when={tasks().length > TASK_STEP}>
                  <button
                    type="button"
                    class="ms-2 flex h-7 w-fit items-center rounded-[6px] px-1 text-[13px] leading-4 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                    onClick={() => setView("expanded", (value) => !value)}
                  >
                    {view.expanded
                      ? language.t("sidebar.organize.showLess")
                      : language.t("sidebar.organize.showMoreCount", { count: tasks().length - TASK_STEP })}
                  </button>
                </Show>
              </Show>
            </Show>
          </section>
          {/* The 最近 section is gone: the strip stays mounted (tab shortcuts, route sync) but never shows. */}
          <div class="hidden" aria-hidden="true">
            {props.children(() => true)}
          </div>
        </div>
      </ScrollView>
    </div>
  )
}
