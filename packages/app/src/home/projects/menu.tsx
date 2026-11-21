import { Show } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { Menu } from "@opencode/ui/menu"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { ServerConnection } from "@/runtime/server/registry"
import type { LocalProject } from "@/shell/state/layout"
import { fileManagerApp } from "./file-manager"
import type { ProjectBrowserTarget } from "./browse"

/** Shared row: icon, label and optional trailing hint, matching the task menu in the reference design. */
function Row(props: { icon: string; label: string }) {
  return (
    <span class="flex min-w-0 flex-1 items-center gap-2">
      <Icon name={props.icon} size="small" class="shrink-0 text-v2-icon-icon-muted" />
      <span class="min-w-0 flex-1 truncate">{props.label}</span>
    </span>
  )
}

export function ProjectMenuItems(props: {
  server: ServerConnection.Any
  project: LocalProject
  unread: boolean
  onViewHistory?: (target: ProjectBrowserTarget) => void
  canImportSession: boolean
  importingSession?: boolean
  onImportSession?: (server: ServerConnection.Any, project: LocalProject) => void
  canRevealProject: (server: ServerConnection.Any) => boolean
  onPinProject: (server: ServerConnection.Any, project: LocalProject) => void
  onShareProject: (server: ServerConnection.Any, project: LocalProject) => void
  onOpenProjectWindow: (server: ServerConnection.Any, project: LocalProject) => void
  onRevealProject: (server: ServerConnection.Any, project: LocalProject) => void
  onEditProject: (server: ServerConnection.Any, project: LocalProject) => void
  onArchiveProject: (server: ServerConnection.Any, project: LocalProject) => void
  onDeleteProject: (server: ServerConnection.Any, project: LocalProject) => void
}) {
  const language = useLanguage()

  const platform = usePlatform()

  const reveal = () =>
    language.t(fileManagerApp(platform.platform === "desktop" ? (platform.os ?? "unknown") : "unknown").actionLabel)

  return (
    <>
      <Menu.Item onSelect={() => props.onPinProject(props.server, props.project)}>
        <Row icon="arrow-up" label={language.t("project.menu.pin")} />
      </Menu.Item>
      <Show when={props.onViewHistory} keyed>
        {(open) => (
          <Menu.Item
            onSelect={() => open({ server: ServerConnection.key(props.server), directory: props.project.worktree })}
          >
            {language.t("project.browse.history")}
          </Menu.Item>
        )}
      </Show>
      <Show when={props.canImportSession && props.onImportSession}>
        <Menu.Item
          disabled={props.importingSession}
          onSelect={() => props.onImportSession?.(props.server, props.project)}
        >
          {language.t("command.session.import")}
        </Menu.Item>
      </Show>
      <Menu.Item onSelect={() => props.onEditProject(props.server, props.project)}>
        <Row icon="edit" label={language.t("project.menu.rename")} />
      </Menu.Item>
      <Menu.Item onSelect={() => props.onShareProject(props.server, props.project)}>
        <Row icon="share" label={language.t("project.menu.share")} />
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item onSelect={() => props.onOpenProjectWindow(props.server, props.project)}>
        <Row icon="expand" label={language.t("project.menu.openWindow")} />
      </Menu.Item>
      <Menu.Item disabled>
        <Row icon="download" label={language.t("project.menu.saveToWorkspace")} />
      </Menu.Item>
      <Show when={props.canRevealProject(props.server)}>
        <Menu.Item onSelect={() => props.onRevealProject(props.server, props.project)}>
          <Row icon="folder" label={reveal()} />
        </Menu.Item>
      </Show>
      <Menu.Item disabled>
        <Row icon="checklist" label={language.t("project.menu.batch")} />
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item onSelect={() => props.onArchiveProject(props.server, props.project)}>
        <Row icon="archive" label={language.t("project.menu.archive")} />
      </Menu.Item>
      <Menu.Item data-variant="critical" onSelect={() => props.onDeleteProject(props.server, props.project)}>
        <Row icon="trash" label={language.t("project.menu.delete")} />
      </Menu.Item>
    </>
  )
}
