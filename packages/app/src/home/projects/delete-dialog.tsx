import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useLanguage } from "@/runtime/i18n/language"

/** Destructive confirmation for removing a project row, worded like the reference task dialog. */
export function ProjectDeleteDialog(props: { onConfirm: () => void }) {
  const dialog = useDialog()

  const language = useLanguage()

  return (
    <Dialog fit>
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={language.t("project.delete.title")}
          description={language.t("project.delete.confirm")}
        />
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" autofocus onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            dialog.close()
            props.onConfirm()
          }}
        >
          {language.t("project.delete.button")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
