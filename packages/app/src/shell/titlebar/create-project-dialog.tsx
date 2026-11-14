import { createSignal } from "solid-js"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { getFilename } from "@opencode/util/path"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { createProjectSessionActions } from "@/shell/tabs/project-sessions"
import { useDirectoryPicker } from "@/workspaces/selection/picker"
import { TrustFolderDialog } from "./trust-folder-dialog"

/** Codex opens its project dialog from the Projects header; the picked folder becomes the project's source. */
export function CreateProjectDialog(props: { connection: ServerConnection.Any }) {
  const language = useLanguage()
  const dialog = useDialog()
  const global = useGlobal()
  const platform = usePlatform()
  const sessions = createProjectSessionActions()
  const pickDirectory = useDirectoryPicker()
  const [directory, setDirectory] = createSignal<string>()
  const [name, setName] = createSignal("")
  const [submitting, setSubmitting] = createSignal(false)

  const customName = () => name().trim().replace(/[/\\]/g, "-")

  // Codex fills the name in for you: an empty form becomes "New project N", numbered after the existing ones.
  const autoName = () => {
    const base = language.t("dialog.project.create.untitled")
    const ctx = global.serverCtx(ServerConnection.key(props.connection))
    const taken = new Set(
      (ctx?.projects.list() ?? []).flatMap((project) => [project.name, getFilename(project.worktree)]),
    )
    let index = 1

    while (taken.has(`${base} ${index}`)) index += 1

    return `${base} ${index}`
  }

  const defaultName = () => {
    const selected = directory()

    return selected ? getFilename(selected) : autoName()
  }

  const folderName = () => customName() || defaultName()

  const pick = () =>
    pickDirectory({
      server: props.connection,
      title: language.t("dialog.project.create.pick"),
      onSelect: (result) => {
        if (typeof result === "string") setDirectory(result)
      },
    })

  async function submit() {
    const ctx = global.serverCtx(ServerConnection.key(props.connection))

    if (!ctx || submitting()) return
    setSubmitting(true)
    try {
      const createFolder = platform.createProjectFolder
      // Codex accepts an empty form: the project gets its own folder in Documents instead of asking for one first.
      const selected = directory() ?? (createFolder ? await createFolder(folderName()) : undefined)

      if (!selected) {
        pick()
        return
      }

      setDirectory(selected)
      dialog.push(() => <TrustFolderDialog directory={selected} onTrust={() => void create(selected)} />)
    } finally {
      setSubmitting(false)
    }
  }

  async function create(selected: string) {
    const ctx = global.serverCtx(ServerConnection.key(props.connection))

    if (!ctx) return
    const project = await ctx.projects.add(selected)

    if (!project) return
    const custom = customName()

    // Only a name the user typed is written, so an existing project's own name is never overwritten by its folder name.
    if (custom && custom !== project.name) {
      const updated = await ctx.sdk.api.project.update({ projectID: project.id, name: custom })
      ctx.sync.project.update(updated)
    }

    dialog.close()
    sessions.openProjectNewSession(props.connection, project.worktree)
  }

  return (
    <Dialog
      fit
      containerClass="create-project-dialog !w-[min(calc(100vw_-_32px),520px)] !rounded-[16px] !bg-v2-background-bg-base"
    >
      <DialogHeader>
        <div class="min-w-0 flex-1 pe-2 text-[20px] leading-7 font-[530] tracking-[-0.3px] text-v2-text-text-base">
          <DialogTitle>{language.t("dialog.project.create.title")}</DialogTitle>
        </div>
      </DialogHeader>
      <DialogBody class="flex w-full min-w-0 flex-col">
        <label class="flex flex-col gap-2">
          <span class="text-[13px] leading-5 text-v2-text-text-base">{language.t("dialog.project.create.name")}</span>
          <span class="relative flex h-9 w-full min-w-0 items-center">
            <Icon name="folder" size="small" class="pointer-events-none absolute start-3 text-v2-icon-icon-muted" />
            <input
              type="text"
              value={name()}
              placeholder={defaultName() || language.t("dialog.project.create.name")}
              aria-label={language.t("dialog.project.create.name")}
              onInput={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                void submit()
              }}
              class="h-full w-full min-w-0 rounded-[10px] border border-v2-border-border-base bg-transparent ps-9 pe-3 text-[13px] leading-5 text-v2-text-text-base outline-none placeholder:text-v2-text-text-muted focus-visible:border-v2-border-border-strong"
            />
          </span>
        </label>
        <span class="mt-4 text-[13px] leading-5 text-v2-text-text-base">{language.t("dialog.project.create.source")}</span>
        <div class="mt-2 flex flex-col items-center gap-2.5 rounded-[12px] border border-v2-border-border-base px-3 py-5">
          <button
            type="button"
            class="flex max-w-full items-center gap-1 rounded-[6px] px-1 text-[13px] leading-5 text-v2-text-text-muted transition-colors hover:text-v2-text-text-base focus-visible:outline-none"
            onClick={pick}
          >
            <span class="min-w-0 truncate">{directory() ?? language.t("dialog.project.create.pick")}</span>
            <Icon name="chevron-down" size="small" class="shrink-0" />
          </button>
          <Button size="small" variant="neutral" icon="folder-plus" onClick={pick}>
            {language.t("dialog.project.create.add")}
          </Button>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button variant="contrast" disabled={submitting()} onClick={() => void submit()}>
          {language.t("dialog.project.create.button")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
