import { Schema } from "effect"
import { createEffect, createMemo, Show, onCleanup, untrack, type Accessor, type JSX } from "solid-js"
import { Key } from "@solid-primitives/keyed"
import { createStore } from "solid-js/store"
import { DragDropProvider, PointerSensor } from "@dnd-kit/solid"
import { isSortable, useSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { ScrollView } from "@opencode/ui/scroll-view"
import { displayName } from "@opencode/ui/project-avatar"
import { useDialog } from "@opencode/ui/context/dialog"
import { createProjectActions } from "@/home/projects/actions"
import { ProjectDeleteDialog } from "@/home/projects/delete-dialog"
import { ProjectMenuItems } from "@/home/projects/menu"
import { usePlatform } from "@/runtime/platform/platform"
import { showToast } from "@/shell/notifications/toast"
import { arrayMove } from "@/runtime/array-move"
import { useLanguage } from "@/runtime/i18n/language"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal, useServerCtx } from "@/runtime/server/runtime"
import type { Project } from "@/runtime/server/types"
import { useCommand } from "@/shell/commands/command"
import { useLayout } from "@/shell/state/layout"
import { useTabs, type Tab } from "@/shell/tabs/tabs"
import "./tab-nav.css"
import { isSidebarSessionActivity } from "./sidebar-sessions"
import { CreateProjectDialog } from "./create-project-dialog"

const SidebarState = Persistence.struct({
  projectsCollapsed: Schema.Boolean,
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

// Resolved once for the whole sidebar, so the section headers and the project rows always agree on the connection.
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

export function SidebarOrganized(props: {
  currentTab: Tab | undefined
  children: (highlightActive: Accessor<boolean>) => JSX.Element
}) {
  const language = useLanguage()

  const tabs = useTabs()

  createSidebarActivityListener()

  const connection = useSidebarConnection(() => props.currentTab)

  const ctx = useServerCtx(connection)

  const command = useCommand()

  const dialog = useDialog()

  const projectsReady = () => !!ctx()?.sync.project.ready()

  const projectCount = () => ctx()?.projects.used().length ?? 0

  const [local, setLocal] = createStore<{
    thumbTrack: HTMLDivElement | undefined
    hoverTarget: HTMLDivElement | undefined
  }>({ thumbTrack: undefined, hoverTarget: undefined })

  const [state, setState, , ready] = persisted(Persist.global("sidebar.organize"), SidebarState, {
    projectsCollapsed: false,
    recentsCollapsed: false,
    expanded: {},
    order: {},
  })

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
          <Show when={projectsReady()}>
            <section class="flex shrink-0 flex-col gap-1">
              <div class="group flex h-7 w-full shrink-0 items-center gap-1 ps-2 pe-1">
                <button
                  type="button"
                  class="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[8px] text-start text-[13px] leading-4 text-v2-text-text-muted focus-visible:outline-none"
                  aria-expanded={!state.projectsCollapsed}
                  onClick={() => setState("projectsCollapsed", (value) => !value)}
                >
                  <span class="min-w-0 truncate">{language.t("sidebar.organize.projects")}</span>
                  <Icon
                    name="fill-triangle-down"
                    size="small"
                    class="shrink-0 text-v2-icon-icon-muted transition-transform"
                    classList={{ "-rotate-90 rtl:rotate-90": state.projectsCollapsed }}
                  />
                </button>
                <span class="flex shrink-0 items-center gap-1">
                  <Menu gutter={6} placement="bottom-end">
                    <Menu.Trigger
                      as={IconButton}
                      variant="ghost-muted"
                      size="small"
                      icon={<Icon name="outline-dots" />}
                      aria-label={language.t("common.moreOptions")}
                    />
                    <Menu.Portal>
                      <Menu.Content>
                        <Menu.Item onSelect={() => setState("projectsCollapsed", true)}>
                          {language.t("sidebar.organize.collapseAll")}
                        </Menu.Item>
                        <Menu.Item
                          onSelect={() => {
                            setState("projectsCollapsed", false)
                            setState("expanded", {})
                          }}
                        >
                          {language.t("sidebar.organize.expandAll")}
                        </Menu.Item>
                        <Menu.Item
                          onSelect={() => {
                            const conn = connection()

                            if (conn) dialog.show(() => <CreateProjectDialog connection={conn} />)
                          }}
                        >
                          {language.t("session.new.project.new")}
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu>
                  <IconButton
                    icon={<Icon name="plus" />}
                    variant="ghost-muted"
                    size="small"
                    aria-label={language.t("session.new.project.new")}
                    onClick={() => {
                      const conn = connection()

                      if (conn) dialog.show(() => <CreateProjectDialog connection={conn} />)
                    }}
                  />
                </span>
              </div>
              <Show when={!state.projectsCollapsed}>
                <Show
                  when={projectCount() > 0}
                  fallback={
                    <div class="px-2 pb-1 text-[13px] leading-4 text-v2-text-text-faint">
                      {language.t("sidebar.organize.noProjects")}
                    </div>
                  }
                >
                  <div class="flex min-w-0 flex-col gap-1">
                    <ProjectList
                      connection={connection()}
                      state={state}
                      ready={ready()}
                      onReorder={(server, ids) => setState("order", server, ids)}
                      onToggleExpanded={(id) => setState("expanded", id, (value) => value === false)}
                    />
                  </div>
                </Show>
              </Show>
            </section>
          </Show>
          <div class="flex shrink-0 flex-col gap-1" classList={{ hidden: tabs.store.length === 0 }}>
            <Show when={projectsReady()}>
              {/* Names the tabs the way the project header names the rows above them. */}
              <div class="group flex h-7 items-center gap-1 ps-2 pe-1">
                <button
                  type="button"
                  class="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[8px] text-start text-[13px] leading-4 text-v2-text-text-muted focus-visible:outline-none"
                  aria-expanded={!state.recentsCollapsed}
                  onClick={() => setState("recentsCollapsed", (value) => !value)}
                >
                  <span class="min-w-0 truncate">{language.t("sidebar.organize.recents")}</span>
                  <Icon
                    name="fill-triangle-down"
                    size="small"
                    class="shrink-0 text-v2-icon-icon-muted transition-transform"
                    classList={{ "-rotate-90 rtl:rotate-90": state.recentsCollapsed }}
                  />
                </button>
                <span class="flex shrink-0 items-center">
                  <IconButton
                    icon={<Icon name="edit" />}
                    variant="ghost-muted"
                    size="small"
                    aria-label={language.t("command.session.new")}
                    onClick={() => command.trigger("tab.new")}
                  />
                </span>
              </div>
            </Show>
            {/* The empty strip still owns tab shortcuts; only its visual section is hidden. */}
            <div classList={{ hidden: state.recentsCollapsed }}>{props.children(() => true)}</div>
          </div>
        </div>
      </ScrollView>
    </div>
  )
}

function ProjectList(props: {
  connection: ServerConnection.Any | undefined
  state: typeof SidebarState.Type
  ready: boolean
  onReorder: (server: string, ids: string[]) => void
  onToggleExpanded: (id: string) => void
}) {
  const servers = useServers()

  const projectActions = createProjectActions()

  const connection = () => props.connection

  const ctx = useServerCtx(connection)

  const server = () => {
    const conn = connection()

    return conn ? ServerConnection.key(conn) : undefined
  }

  const projects = createMemo(() => {
    const list = ctx()?.projects.used() ?? []

    const order = props.state.order[server() ?? ""] ?? []

    return [
      ...order.flatMap((id) => list.find((project) => project.id === id) ?? []),
      ...list.filter((project) => !order.includes(project.id)),
    ]
  })

  // Freeze the initial order, then append newly used projects instead of following last activity.
  createEffect(() => {
    const key = server()

    if (!props.ready || !servers.hydrated() || !key || !ctx()?.sync.project.ready()) return
    const ids = projects().map((project) => project.id)

    const saved = props.state.order[key] ?? []

    if (ids.length === saved.length && ids.every((id, index) => id === saved[index])) return
    untrack(() => props.onReorder(key, ids))
  })

  return (
    <>
      <Show when={connection()}>
        {(conn) => (
          <DragDropProvider
            sensors={[
              PointerSensor.configure({
                activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
                preventActivation: (event) =>
                  event.target instanceof Element && !!event.target.closest("[data-project-action]"),
              }),
            ]}
            modifiers={[RestrictToVerticalAxis]}
            plugins={(defaults) => [
              ...defaults.filter((plugin) => plugin !== Accessibility),
              Feedback.configure({ dropAnimation: null }),
            ]}
            onDragEnd={(event) => {
              const source = event.operation.source

              if (event.canceled || !isSortable(source) || source.initialIndex === source.index) return
              props.onReorder(
                ServerConnection.key(conn()),
                arrayMove(
                  projects().map((project) => project.id),
                  source.initialIndex,
                  source.index,
                ),
              )
            }}
          >
            <Key each={projects()} by={(project) => `${ServerConnection.key(conn())}:${project.id}`}>
              {(project, index) => (
                <ProjectRow
                  project={project()}
                  server={conn()}
                  actions={projectActions}
                  index={index()}
                  onPin={() => {
                    const ids = projects().map((entry) => entry.id)

                    props.onReorder(ServerConnection.key(conn()), [
                      project().id,
                      ...ids.filter((id) => id !== project().id),
                    ])
                  }}
                />
              )}
            </Key>
          </DragDropProvider>
        )}
      </Show>
    </>
  )
}

function ProjectRow(props: {
  project: Project
  server: ServerConnection.Any
  actions: ReturnType<typeof createProjectActions>
  index: number
  onPin: () => void
}) {
  const language = useLanguage()

  const platform = usePlatform()

  const dialog = useDialog()

  const [menu, setMenu] = createStore({ open: false })

  const sortable = useSortable({
    get id() {
      return props.project.id
    },
    get index() {
      return props.index
    },
  })

  const hide = () => props.actions.hide(props.server, props.project)

  return (
    <div class="relative flex shrink-0 flex-col">
      <div
        ref={sortable.ref}
        class="group/project relative flex h-7 min-w-0 shrink-0 items-center rounded-[8px] pe-1 hover:bg-v2-overlay-simple-overlay-hover has-[:focus-visible]:bg-v2-overlay-simple-overlay-hover"
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
          class="flex h-full min-w-0 flex-1 shrink-0 cursor-default items-center gap-2 rounded-[8px] bg-transparent pe-2 ps-2 text-start text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-base transition-colors duration-[120ms] ease-in-out focus-visible:outline-none"
          onClick={() => props.actions.openNewSession(props.server, props.project.worktree)}
        >
          <Icon name="folder" size="small" class="shrink-0 text-v2-icon-icon-muted" />
          <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" dir="auto">
            {displayName(props.project)}
          </span>
        </button>
        <span
          data-project-action
          data-menu={menu.open}
          class="hover-reveal flex shrink-0 items-center gap-1 group-hover/project:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100"
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
                <ProjectMenuItems
                  server={props.server}
                  project={props.project}
                  unread={props.actions.hasUnread(props.server, props.project)}
                  canImportSession={props.actions.canImportSession}
                  importingSession={props.actions.importingSession()}
                  canRevealProject={props.actions.canReveal}
                  onPinProject={props.onPin}
                  onShareProject={(_server, project) => {
                    void Promise.try(() => platform.writeClipboardText?.(project.worktree)).then(() =>
                      showToast({ title: language.t("project.menu.share.done") }),
                    )
                  }}
                  onOpenProjectWindow={() => {
                    void platform.runDesktopMenuAction?.("window.new")
                  }}
                  onEditProject={props.actions.edit}
                  onRevealProject={props.actions.reveal}
                  onArchiveProject={hide}
                  onDeleteProject={() =>
                    dialog.show(() => (
                      <ProjectDeleteDialog
                        onConfirm={() => {
                          hide()
                          showToast({ title: language.t("project.delete.done") })
                        }}
                      />
                    ))
                  }
                />
              </Menu.Content>
            </Menu.Portal>
          </Menu>
          <IconButton
            icon={<Icon name="edit" />}
            variant="ghost-muted"
            size="small"
            aria-label={language.t("command.session.new")}
            onClick={() => props.actions.openNewSession(props.server, props.project.worktree)}
          />
        </span>
      </div>
    </div>
  )
}
