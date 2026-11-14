import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { useLanguage } from "@/runtime/i18n/language"

/** Codex confirms the folder before a project may read, edit, or run anything inside it. */
export function TrustFolderDialog(props: { directory: string; onTrust: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()

  return (
    <Dialog fit containerClass="trust-folder-dialog !w-[min(calc(100vw_-_32px),400px)] !rounded-[16px] !bg-v2-background-bg-base">
      <DialogHeader>
        <div class="min-w-0 flex-1 pe-5 text-center text-[20px] leading-7 font-[530] tracking-[-0.3px] text-v2-text-text-base">
          <DialogTitle>{language.t("dialog.folder.trust.title")}</DialogTitle>
        </div>
      </DialogHeader>
      <DialogBody class="flex w-full min-w-0 flex-col">
        <span class="text-[13px] leading-5 text-v2-text-text-muted" dir="ltr">
          {props.directory}
        </span>
        <p class="mt-3 text-[13px] leading-5 text-v2-text-text-base">{language.t("dialog.folder.trust.description")}</p>
        <div class="mt-5 flex flex-col gap-2">
          <Button
            class="w-full"
            variant="contrast"
            onClick={() => {
              dialog.close()
              props.onTrust()
            }}
          >
            {language.t("dialog.folder.trust.confirm")}
          </Button>
          <Button class="w-full" variant="neutral" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
        </div>
      </DialogBody>
    </Dialog>
  )
}
