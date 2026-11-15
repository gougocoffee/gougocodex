import { createSignal, For, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon, type IconProps } from "@opencode/ui/icon"
import { Popover } from "@opencode/ui/popover"
import { Tooltip } from "@opencode/ui/tooltip"
import { useLanguage } from "@/runtime/i18n/language"
import type { ComposerPermission } from "./model"

// The composer's permission chip. The pill reads "Default permission" until full access is on, and turning full
// access on goes through a confirmation checklist first; turning it off is immediate, because it only restores the
// confirmation steps.
export function ComposerPermissionControl(props: { permission: ComposerPermission; onClose: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [open, setOpen] = createSignal(false)

  const enabled = () => props.permission.enabled()

  const label = () => language.t(enabled() ? "composer.permissions.fullAccess.label" : "composer.permissions.default.label")

  const toggle = (value: boolean) => {
    if (value === enabled()) return

    if (!value) {
      props.permission.set(false)

      return
    }

    setOpen(false)
    dialog.show(() => <ConfirmFullAccessDialog onConfirm={() => props.permission.set(true)} />)
  }

  return (
    <Popover
      placement="top"
      open={open()}
      onOpenChange={(next) => {
        setOpen(next)

        if (!next) props.onClose()
      }}
      class="w-[268px]"
      trigger={
        <button
          type="button"
          data-action="composer-permission"
          data-control-type="popover"
          data-state={enabled() ? "on" : "off"}
          aria-label={label()}
          aria-expanded={open()}
          class="flex h-[26px] min-w-0 max-w-[60cqw] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border bg-white px-2.5 text-[12px] leading-4 whitespace-nowrap transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          classList={{
            "border-v2-border-border-muted": !enabled(),
            "border-v2-state-fg-danger": enabled(),
          }}
        >
          <Icon
            name="warning"
            size="small"
            classList={{
              "shrink-0": true,
              "text-v2-state-fg-danger": enabled(),
              "text-v2-icon-icon-muted": !enabled(),
            }}
          />
          <bdi
            class="min-w-0 truncate [font-weight:440]"
            classList={{
              "text-v2-state-fg-danger": enabled(),
              "text-v2-text-text-muted": !enabled(),
            }}
          >
            {label()}
          </bdi>
          <Icon
            name="chevron-down"
            size="small"
            class="shrink-0 text-v2-icon-icon-muted transition-transform duration-150"
            classList={{ "rotate-180": open() }}
          />
        </button>
      }
    >
      <p class="text-[12px] leading-[18px] text-v2-text-text-muted" dir="auto">
        {language.t(enabled() ? "composer.permissions.fullAccess.on" : "composer.permissions.fullAccess.off")}
      </p>
      <div class="my-3 h-px w-full bg-v2-border-border-muted" />
      <div class="flex items-center justify-between gap-3">
        <span class="min-w-0 flex-1 text-[13px] leading-4 [font-weight:440] text-v2-text-text-base" dir="auto">
          {language.t("composer.permissions.fullAccess.label")}
        </span>
        <Tooltip
          placement="top"
          appearance="standard"
          contentClass="max-w-[260px] whitespace-normal"
          value={language.t("composer.permissions.fullAccess.tooltip")}
        >
          <PermissionSwitch checked={enabled()} onChange={toggle} />
        </Tooltip>
      </div>
      <Show when={!props.permission.projectScoped()}>
        <p class="mt-3 text-[11px] leading-4 text-v2-text-text-faint" dir="auto">
          {language.t("composer.permissions.fullAccess.serverWide")}
        </p>
      </Show>
    </Popover>
  )
}

// An iOS-shaped switch: the red track means full access is on, and the white thumb slides across. The geometry and
// colours are inline because the shared button/token styles paint this control with the system accent (blue).
function PermissionSwitch(props: { checked: boolean; onChange: (value: boolean) => void }) {
  const language = useLanguage()

  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={language.t("composer.permissions.fullAccess.label")}
      data-component="permission-switch"
      data-checked={props.checked}
      onClick={() => props.onChange(!props.checked)}
      style={{
        position: "relative",
        display: "block",
        flex: "none",
        width: "36px",
        height: "20px",
        padding: "0",
        border: "0",
        "border-radius": "999px",
        outline: "none",
        cursor: "pointer",
        background: props.checked ? "#d64545" : "#e5e5e5",
        transition: "background-color 160ms ease-out",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "2px",
          left: "2px",
          width: "16px",
          height: "16px",
          "border-radius": "999px",
          background: "#ffffff",
          "box-shadow": "0 1px 2px rgba(0, 0, 0, 0.22)",
          transform: props.checked ? "translateX(16px)" : "translateX(0)",
          transition: "transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1)",
        }}
      />
    </button>
  )
}

// What full access actually unlocks. The dialog spells it out instead of asking for blind consent.
const permissionScopes: ReadonlyArray<{ icon: IconProps["name"]; title: string; description: string }> = [
  {
    icon: "folder",
    title: "composer.permissions.confirm.files.title",
    description: "composer.permissions.confirm.files.description",
  },
  {
    icon: "terminal",
    title: "composer.permissions.confirm.terminal.title",
    description: "composer.permissions.confirm.terminal.description",
  },
  {
    icon: "outline-globe",
    title: "composer.permissions.confirm.network.title",
    description: "composer.permissions.confirm.network.description",
  },
]

function ConfirmFullAccessDialog(props: { onConfirm: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [agreed, setAgreed] = createSignal(false)

  const close = () => dialog.close()

  const confirm = () => {
    if (!agreed()) return
    dialog.close()
    props.onConfirm()
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={
            <span class="flex items-center gap-2">
              <Icon name="warning" class="shrink-0 text-v2-state-fg-danger" />
              {language.t("composer.permissions.confirm.title")}
            </span>
          }
          description={language.t("composer.permissions.confirm.description")}
        />
      </DialogHeader>
      <DialogBody>
        <div class="flex flex-col" style={{ padding: "0 16px", gap: "16px" }}>
          <div
            class="flex flex-col"
            style={{ "background-color": "#f5f5f5", "border-radius": "12px", padding: "14px 16px", gap: "14px" }}
          >
            <For each={permissionScopes}>
              {(scope) => (
                <div class="flex items-start" style={{ gap: "10px" }}>
                  <Icon name={scope.icon} size="small" class="shrink-0 text-v2-icon-icon-base" style={{ "margin-top": "3px" }} />
                  <div class="flex min-w-0 flex-col" style={{ gap: "3px" }}>
                    <span style={{ "font-size": "13px", "line-height": "18px", "font-weight": "500", color: "#0d0d0d" }} dir="auto">
                      {language.t(scope.title)}
                    </span>
                    <span style={{ "font-size": "12px", "line-height": "18px", color: "#5d5d5d" }} dir="auto">
                      {language.t(scope.description)}
                    </span>
                  </div>
                </div>
              )}
            </For>
          </div>
          <Checkbox
            appearance="compact"
            checked={agreed()}
            onChange={setAgreed}
            // The shared checkbox paints itself with the system accent, which this build still resolves to blue.
            style={{ "--v2-background-bg-accent": "#0d0d0d" } as Record<string, string>}
          >
            {language.t("composer.permissions.confirm.checkbox")}
          </Checkbox>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          size="large"
          onClick={close}
          style={{ "border-radius": "999px", "padding-left": "18px", "padding-right": "18px" }}
        >
          {language.t("common.cancel")}
        </Button>
        <Button
          variant="danger"
          size="large"
          disabled={!agreed()}
          onClick={confirm}
          style={{ "border-radius": "999px", "padding-left": "18px", "padding-right": "18px" }}
        >
          {language.t("composer.permissions.confirm.action")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
