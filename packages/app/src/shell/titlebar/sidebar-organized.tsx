import { Schema } from "effect"
import { createEffect, createMemo, createSignal, For, Show, onCleanup, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useQueries, useQueryClient } from "@tanstack/solid-query"
import type { SessionInfo } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { ScrollView } from "@opencode/ui/scroll-view"
import { useDialog } from "@opencode/ui/context/dialog"
import { homeSessionsQuery, archivedSessionsQuery } from "@/home/sessions/queries"
import { ProjectDeleteDialog } from "@/home/projects/delete-dialog"
import { ProjectMenuItems } from "@/home/projects/menu"
import { useLanguage } from "@/runtime/i18n/language"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { usePlatform } from "@/runtime/platform/platform"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal, useServerCtx } from "@/runtime/server/runtime"
import { getRelativeTime } from "@/shell/time"
import { useLayout } from "@/shell/state/layout"
import { showToast } from "@/shell/notifications/toast"
import { createProjectSessionActions } from "@/shell/tabs/project-sessions"
import { useTabs, type Tab } from "@/shell/tabs/tabs"
import { createSessionRenamer } from "@/session/commands/rename-session"
import { sessionLabel } from "@/session/title"
import { notifySessionTabsRemoved } from "./session-events"
import { RenameDialog } from "./project-session-row"
import { isSidebarSessionActivity, mergeSidebarSessions } from "./sidebar-sessions"
import "./tab-nav.css"

const TASK_STEP = 5

// Old fields stay in the schema so a persisted sidebar.organize blob written by earlier versions still decodes.
const SidebarState = Persistence.struct({
  projectsCollapsed: Schema.Boolean,
  tasksCollapsed: Persistence.fallback(Schema.Boolean, () => false),
  archivedCollapsed: Persistence.fallback(Schema.Boolean, () => true),
  recentsCollapsed: Persistence.fallback(Schema.Boolean, () => false),
  expanded: Persistence.record(Schema.Boolean),
  order: Persistence.record(Schema.mutable(Schema.Array(Schema.String))),
  pinned: Persistence.array(Schema.String),
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
 * Each row has its "…" menu (also on right click); removing a task goes through the task delete confirmation dialog.
 */
export function SidebarOrganized(props: {
  currentTab: Tab | undefined
  children: (highlightActive: Accessor<boolean>) => JSX.Element
}) {
  const language = useLanguage()

  const platform = usePlatform()

  const dialog = useDialog()

  const queryClient = useQueryClient()

  const rename = createSessionRenamer()

  createSidebarActivityListener()

  const connection = useSidebarConnection(() => props.currentTab)

  const ctx = useServerCtx(connection)

  const sessionActions = createProjectSessionActions()

  const recentQueries = useQueries(() => ({
    queries: [homeSessionsQuery(connection(), ctx()), archivedSessionsQuery(connection(), ctx())],
  }))

  const [state, setState] = persisted(Persist.global("sidebar.organize"), SidebarState, {
    projectsCollapsed: false,
    tasksCollapsed: false,
    archivedCollapsed: true,
    recentsCollapsed: false,
    expanded: {},
    order: {},
    pinned: [],
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
    const pinned = state.pinned

    return current.data.session
      .apply(mergeSidebarSessions(fetched, current.data.session.known()))
      .filter((session) => !session.parentID && session.time.archived === undefined)
      .sort((a, b) => {
        const ai = pinned.indexOf(a.id)
        const bi = pinned.indexOf(b.id)

        if (ai !== -1 || bi !== -1) {
          if (ai === -1) return 1

          if (bi === -1) return -1

          return ai - bi
        }

        return b.time.updated - a.time.updated
      })
  })

  const visibleTasks = () => (view.expanded ? tasks() : tasks().slice(0, TASK_STEP))

  // Archived sessions come from the second query; newest-archived first so the most recently hidden one is on top.
  const archivedTasks = createMemo(() => {
    const fetched = recentQueries[1]?.data?.() ?? []

    return fetched
      .filter((session) => !session.parentID && session.time.archived !== undefined)
      .sort((a, b) => (b.time.archived ?? 0) - (a.time.archived ?? 0))
  })

  const archiveTime = (session: SessionInfo) => {
    now()

    return getRelativeTime(
      new Date(session.time.archived ?? session.time.updated).toISOString(),
      language.t,
      language.intl(),
    )
  }

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

  const pinTask = (session: SessionInfo) =>
    setState("pinned", (ids) =>
      ids.includes(session.id) ? ids.filter((id) => id !== session.id) : [session.id, ...ids],
    )

  const renameTask = (session: SessionInfo) => {
    const key = server()

    if (!key) return

    dialog.show(() => (
      <RenameDialog title={sessionLabel(session)} onRename={(title) => rename(key, session, title)} />
    ))
  }

  const shareTask = (session: SessionInfo) => {
    void Promise.resolve(platform.writeClipboardText?.(session.location.directory)).then(() =>
      showToast({ title: language.t("project.menu.share.done") }),
    )
  }

  const revealTask = (session: SessionInfo) => {
    void platform.revealPath?.(session.location.directory)
  }

  const openTaskWindow = () => {
    void platform.runDesktopMenuAction?.("window.new")
  }

  const archiveTask = (session: SessionInfo) => {
    const current = ctx()

    const conn = connection()

    const key = server()

    if (!current || !conn || !key) return

    void current.sdk.api.session.update({ sessionID: session.id, archived: true }).then(() => {
      current.data.session.forget(session.id)
      void queryClient.invalidateQueries({ queryKey: ["home-sessions", conn], exact: true })
      notifySessionTabsRemoved({
        server: key,
        directory: session.location.directory,
        sessionIDs: [session.id],
      })
    })
  }

  const deleteTask = (session: SessionInfo) => {
    const current = ctx()

    const conn = connection()

    const key = server()

    if (!current || !conn || !key) return

    dialog.show(() => (
      <ProjectDeleteDialog
        onConfirm={() => {
          void current.data.session.remove(session.id).then(() => {
            queryClient.setQueryData<SessionInfo[]>(["home-sessions", conn], (list) =>
              list?.filter((item) => item.id !== session.id),
            )
            void queryClient.invalidateQueries({ queryKey: ["home-sessions", conn], exact: true })
            notifySessionTabsRemoved({
              server: key,
              directory: session.location.directory,
              sessionIDs: [session.id],
            })
            showToast({ title: language.t("project.delete.done") })
          })
        }}
      />
    ))
  }

  const unarchiveTask = (session: SessionInfo) => {
    const current = ctx()

    const conn = connection()

    const key = server()

    if (!current || !conn || !key) return

    void current.sdk.api.session.update({ sessionID: session.id, archived: false }).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["home-sessions", conn], exact: true })
      void queryClient.invalidateQueries({ queryKey: ["archived-sessions", conn], exact: true })
    })
  }

  const deleteArchivedTask = (session: SessionInfo) => {
    const current = ctx()

    const conn = connection()

    const key = server()

    if (!current || !conn || !key) return

    dialog.show(() => (
      <ProjectDeleteDialog
        onConfirm={() => {
          void current.data.session.remove(session.id).then(() => {
            queryClient.setQueryData<SessionInfo[]>(["archived-sessions", conn], (list) =>
              list?.filter((item) => item.id !== session.id),
            )
            void queryClient.invalidateQueries({ queryKey: ["archived-sessions", conn], exact: true })
            void queryClient.invalidateQueries({ queryKey: ["home-sessions", conn], exact: true })
            notifySessionTabsRemoved({
              server: key,
              directory: session.location.directory,
              sessionIDs: [session.id],
            })
            showToast({ title: language.t("project.delete.done") })
          })
        }}
      />
    ))
  }

  function TaskRow(row: { session: SessionInfo }) {
    const session = () => row.session

    const [menu, setMenu] = createStore({ open: false })

    // LocalProject only needs a worktree; the session's directory is enough for the menu's folder actions.
    const project = () => ({ worktree: session().location.directory })

    return (
      <div
        class="group/task relative flex h-8 w-full shrink-0 items-center rounded-[8px] pe-1 hover:bg-v2-overlay-simple-overlay-hover has-[:focus-visible]:bg-v2-overlay-simple-overlay-hover"
        classList={{ "bg-v2-overlay-simple-overlay-hover": taskActive(session()) }}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu("open", true)
        }}
        onKeyDown={(event) => {
          if (event.key !== "ContextMenu" && (event.key !== "F10" || !event.shiftKey)) return
          event.preventDefault()
          setMenu("open", true)
        }}
      >
        <button
          type="button"
          class="flex h-full min-w-0 flex-1 items-center gap-2 rounded-[8px] bg-transparent ps-2 text-start text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-base focus-visible:outline-none"
          title={sessionLabel(session())}
          onClick={() => openTask(session())}
        >
          <span class="min-w-0 flex-1 truncate" dir="auto">
            {sessionLabel(session())}
          </span>
          <span class="shrink-0 text-[11px] leading-[var(--line-height-compact)] text-v2-text-text-faint">
            {taskTime(session())}
          </span>
        </button>
        <span
          data-task-action
          data-menu={menu.open}
          class="hover-reveal flex shrink-0 items-center ps-1 group-hover/task:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100"
        >
          <Menu
            gutter={6}
            modal={false}
            placement="bottom-end"
            open={menu.open}
            onOpenChange={(open) => setMenu("open", open)}
          >
            <Menu.Trigger
              as={IconButton}
              variant="ghost-muted"
              size="small"
              icon={<Icon name="outline-dots" />}
              aria-label={language.t("common.moreOptions")}
            />
            <Menu.Portal>
              <Menu.Content>
                <Show when={connection()}>
                  {(conn) => (
                    <ProjectMenuItems
                      server={conn()}
                      project={project()}
                      unread={false}
                      canImportSession={false}
                      canRevealProject={() => !!platform.revealPath}
                      onPinProject={() => pinTask(session())}
                      onShareProject={() => shareTask(session())}
                      onOpenProjectWindow={openTaskWindow}
                      onRevealProject={() => revealTask(session())}
                      onEditProject={() => renameTask(session())}
                      onArchiveProject={() => archiveTask(session())}
                      onDeleteProject={() => deleteTask(session())}
                    />
                  )}
                </Show>
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        </span>
      </div>
    )
  }

  function ArchivedTaskRow(row: { session: SessionInfo }) {
    const session = () => row.session

    return (
      <div class="group/task relative flex h-8 w-full shrink-0 items-center rounded-[8px] pe-1 hover:bg-v2-overlay-simple-overlay-hover">
        <div class="flex h-full min-w-0 flex-1 items-center gap-2 rounded-[8px] ps-2 text-start text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
          <span class="min-w-0 flex-1 truncate" dir="auto">
            {sessionLabel(session())}
          </span>
          <span class="shrink-0 text-[11px] leading-[var(--line-height-compact)] text-v2-text-text-faint">
            {archiveTime(session())}
          </span>
        </div>
        <span class="hover-reveal flex shrink-0 items-center ps-1 group-hover/task:opacity-100 focus-within:opacity-100">
          <IconButton
            variant="ghost-muted"
            size="small"
            icon={<Icon name="refresh" />}
            aria-label={language.t("sidebar.inbox.unarchive")}
            onClick={() => unarchiveTask(session())}
          />
          <IconButton
            variant="ghost-muted"
            size="small"
            icon={<Icon name="trash" />}
            aria-label={language.t("common.delete")}
            onClick={() => deleteArchivedTask(session())}
          />
        </span>
      </div>
    )
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
                  <For each={visibleTasks()}>{(session) => <TaskRow session={session} />}</For>
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
          <Show when={archivedTasks().length > 0}>
            <section class="flex shrink-0 flex-col gap-1">
              <div class="group flex h-7 w-full shrink-0 items-center gap-1 ps-2 pe-1">
                <button
                  type="button"
                  class="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[8px] text-start text-[13px] leading-4 text-v2-text-text-muted focus-visible:outline-none"
                  aria-expanded={!state.archivedCollapsed}
                  onClick={() => setState("archivedCollapsed", (value) => !value)}
                >
                  <span class="min-w-0 truncate">{language.t("sidebar.inbox.section.archived")}</span>
                  <Show when={archivedTasks().length > 0}>
                    <span class="shrink-0 text-v2-text-text-faint">({archivedTasks().length})</span>
                  </Show>
                  <Icon
                    name="fill-triangle-down"
                    size="small"
                    class="shrink-0 text-v2-icon-icon-muted transition-transform"
                    classList={{ "-rotate-90 rtl:rotate-90": state.archivedCollapsed }}
                  />
                </button>
              </div>
              <Show when={!state.archivedCollapsed}>
                <div class="flex min-w-0 flex-col gap-0.5">
                  <For each={archivedTasks()}>{(session) => <ArchivedTaskRow session={session} />}</For>
                </div>
              </Show>
            </section>
          </Show>
          {/* The 最近 section is gone: the strip stays mounted (tab shortcuts, route sync) but never shows. */}
          <div class="hidden" aria-hidden="true">
            {props.children(() => true)}
          </div>
        </div>
      </ScrollView>
    </div>
  )
}
