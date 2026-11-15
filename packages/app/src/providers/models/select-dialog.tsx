import { Popover } from "@kobalte/core/popover"
import { effortLabel } from "@/composer/model-label"
import {
  Component,
  ComponentProps,
  createEffect,
  createMemo,
  createSignal,
  For,
  JSX,
  Show,
  Suspense,
  lazy,
  on,
  onCleanup,
  onMount,
  untrack,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal, type ModelSelection } from "@/providers/models/selection"
import { isFreeModel } from "@/providers/models/models"
import { useDialog } from "@opencode/ui/context/dialog"
import { popularProviders } from "@/providers/catalog/providers"
import { Button } from "@opencode/ui/button"
import { Badge } from "@opencode/ui/badge"
import { Dialog, DialogBody, DialogTitle } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { SearchHighlight, SearchList, type SearchListHandle, type SearchListRow } from "@opencode/ui/search-list"
import { Tooltip } from "@opencode/ui/tooltip"
import { TextInput } from "@opencode/ui/text-input"
import { ModelTooltip } from "./tooltip"
import { modelCatalog, modelRatio } from "./model-descriptions"
import { useLanguage } from "@/runtime/i18n/language"
import { ExternalLink } from "@/runtime/platform/external-link"
import { useData } from "@/runtime/server/current"
import { useWorkspaceLocation } from "@/workspaces/location"
import { createModelUsage, ModelUsageTag } from "@/usage/model"
import {
  createModelDrawerState,
  selectDrawerLoaded,
  selectDrawerOpen,
  selectDrawerRestoreTrigger,
  transitionModelDrawer,
  type ModelDrawerEvent,
} from "./select-dialog-machine"
import { matchKeybind, parseKeybind } from "@/shell/commands/command"
import { createEventListener } from "@solid-primitives/event-listener"
import { matchesModelSearch } from "./search"
import { SettingsList } from "@/settings/list"
import {
  CONSOLE_GROUP_KEY,
  consoleModelGroup,
  ProviderModelIcon,
  ProviderModelSections,
} from "@/providers/models/provider-group"
import "@/settings/settings.css"
import "@/shell/commands/dialog.css"
import "./select-dialog.css"

const MobilePanelDrawer = lazy(async () => {
  const { MobilePanelDrawer } = await import("@/shell/mobile-panel-drawer")

  return { default: MobilePanelDrawer }
})

type ModelState = ModelSelection

type ModelItem = ReturnType<ModelState["list"]>[number]

const favoriteKeybind = parseKeybind("mod+f")

const modelKey = (model: ModelItem) => `${model.provider.id}:${model.id}`

const sortModelGroups = (a: { category: string; items: ModelItem[] }, b: { category: string; items: ModelItem[] }) => {
  const aIndex = popularProviders.indexOf(a.category)
  const bIndex = popularProviders.indexOf(b.category)
  const aPopular = aIndex >= 0
  const bPopular = bIndex >= 0

  if (aPopular && !bPopular) return -1

  if (!aPopular && bPopular) return 1

  if (aPopular && bPopular) return aIndex - bIndex

  return a.items[0].provider.name.localeCompare(b.items[0].provider.name)
}

const ModelList: Component<{
  mobile?: boolean
  open?: boolean
  provider?: string
  onSelect: () => void
  model?: ModelState
}> = (props) => {
  const language = useLanguage()
  const usage = createModelUsage({ refresh: true })

  const controller = createModelSelectorController({
    model: props.model,
    provider: () => props.provider,
    onSelect: props.onSelect,
  })

  const [store, setStore] = createStore<{
    search: string
    active: string
    collapsed: Record<string, boolean>
  }>({
    search: "",
    active: "",
    collapsed: {},
  })

  const models = createMemo(() => controller.models(store.search))
  const modelGroups = createMemo(() => controller.groups(models()))
  const managed = createMemo(() => consoleModelGroup(controller.all()))
  const expanded = (provider: string) => store.search.length > 0 || !store.collapsed[provider]
  const managedIDs = createMemo(() => new Set(managed()?.providers.map((provider) => provider.id) ?? []))

  // Rows in display order: ProviderModelSections nests every managed provider at the first one's position.
  const visibleModels = () => {
    const groups = modelGroups()
    const first = groups.findIndex((group) => managedIDs().has(group.category))

    return groups.flatMap((group, index) => {
      if (!managedIDs().has(group.category)) return expanded(group.category) ? group.items : []

      if (index !== first || !expanded(CONSOLE_GROUP_KEY)) return []

      return groups
        .filter((item) => managedIDs().has(item.category) && expanded(item.category))
        .flatMap((item) => item.items)
    })
  }

  let scrollRef: HTMLDivElement | undefined

  const setSearch = (value: string) => {
    setStore("search", value)
    const first = visibleModels()[0]
    setStore("active", first ? modelKey(first) : "")
  }

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return
        setSearch("")
        scrollRef?.scrollTo(0, 0)
      },
    ),
  )

  const moveActive = (delta: number) => {
    const keys = visibleModels().map(modelKey)

    if (keys.length === 0) return
    const index = keys.indexOf(store.active)
    const start = index === -1 ? (delta > 0 ? -1 : 0) : index
    setStore("active", keys[(start + delta + keys.length) % keys.length])
    queueMicrotask(() => {
      scrollRef
        ?.querySelector<HTMLElement>(`[data-option-key="${CSS.escape(store.active)}"]`)
        ?.scrollIntoView({ block: "nearest" })
    })
  }

  const selectActive = () => {
    const item = visibleModels().find((item) => modelKey(item) === store.active)

    if (item) controller.select(item)
  }

  function ModelRows(props: { items: ModelItem[]; mobile?: boolean }) {
    return (
      <SettingsList variant="catalog">
        <For each={props.items}>
          {(item) => (
            <button
              type="button"
              data-component="settings-row"
              data-option-key={modelKey(item)}
              aria-pressed={controller.current() === modelKey(item)}
              class="-mx-4 w-[calc(100%+32px)] px-4 text-start first:rounded-t-lg last:rounded-b-lg hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
              classList={{ "bg-v2-overlay-simple-overlay-hover": store.active === modelKey(item) }}
              onMouseEnter={() => setStore("active", modelKey(item))}
              onMouseLeave={() => setStore("active", "")}
              onClick={() => controller.select(item)}
            >
              <div data-slot="settings-row-copy">
                <div data-slot="settings-row-title" class="flex items-center gap-2">
                  <span class="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-neutral-100">
                    <ProviderModelIcon provider={item.provider} class="size-[13px] text-neutral-700" />
                  </span>
                  <Tooltip
                    inactive={props.mobile}
                    placement="right-start"
                    gutter={12}
                    openDelay={0}
                    value={<ModelTooltip model={item} latest={item.latest} free={isFreeModel(item)} v2 />}
                  >
                    <span class="min-w-0 truncate">{item.name}</span>
                  </Tooltip>
                  <Show when={isFreeModel(item)}>
                    <Badge class="shrink-0">{language.t("model.tag.free")}</Badge>
                  </Show>
                  <Show when={item.latest}>
                    <Badge class="shrink-0">{language.t("model.tag.latest")}</Badge>
                  </Show>
                  <Show when={usage(item)}>{(value) => <ModelUsageTag usage={value()} />}</Show>
                </div>
              </div>
              <div data-slot="settings-row-control" class="size-4">
                <Show when={controller.current() === modelKey(item)}>
                  <Icon name="check" size="small" class="shrink-0 text-v2-icon-icon-base" />
                </Show>
              </div>
            </button>
          )}
        </For>
      </SettingsList>
    )
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div data-slot="model-selector-search" class="shrink-0 pt-px pb-3" classList={{ "px-4": !props.mobile }}>
        <TextInput
          type="search"
          appearance="base"
          class="!w-full self-stretch"
          placeholder={language.t("dialog.model.search.placeholder")}
          value={store.search}
          autofocus={!props.mobile}
          spellcheck={false}
          autocorrect="off"
          autocomplete="off"
          autocapitalize="off"
          onInput={(event) => setSearch(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.altKey || event.metaKey) return

            if (event.key === "ArrowDown") {
              event.preventDefault()
              moveActive(1)

              return
            }

            if (event.key === "ArrowUp") {
              event.preventDefault()
              moveActive(-1)

              return
            }

            if (event.key === "Enter" && !event.isComposing) {
              event.preventDefault()
              selectActive()
            }
          }}
          aria-label={language.t("dialog.model.search.placeholder")}
          showClearButton={!!store.search}
          clearIcon="circle-xmark"
          clearLabel={language.t("common.clear")}
          onClearClick={() => setSearch("")}
        />
      </div>
      <div class="relative min-h-0" classList={{ "flex-1": !props.mobile }}>
        <div
          ref={(element) => (scrollRef = element)}
          class="settings-panel settings-models pt-1 pb-4"
          classList={{ "h-full px-4": !props.mobile, "max-h-[min(360px,40dvh)]": props.mobile }}
        >
          <Show
            when={models().length > 0}
            fallback={<div class="settings-models-status">{language.t("dialog.model.empty")}</div>}
          >
            <ProviderModelSections
              groups={modelGroups()}
              managed={managed()}
              expanded={expanded}
              disabled={store.search.length > 0}
              onExpandedChange={(key, value) => setStore("collapsed", key, !value)}
              rows={(items) => <ModelRows items={items} mobile={props.mobile} />}
            />
          </Show>
        </div>
      </div>
    </div>
  )
}

type ModelSelectorTriggerProps = Omit<ComponentProps<typeof Popover.Trigger>, "as" | "ref">

type ModelSelectorTrigger = (props: ModelSelectorTriggerProps) => JSX.Element

// Phones pick models from a drawer; wider screens use DialogSelectModel.
export function ModelSelectorDrawer(props: {
  provider?: string
  model?: ModelState
  trigger: ModelSelectorTrigger
  onClose?: () => void
}) {
  const dialog = useDialog()
  const location = useWorkspaceLocation()

  const controller = createModelSelectorController({
    model: props.model,
    provider: () => props.provider,
    onSelect: () => props.onClose?.(),
  })

  const chatgptPlan = createChatgptPlan(controller.current)

  const manage = async () => {
    const { DialogManageModels } = await import("./manage")
    void dialog.show(() => <DialogManageModels />)
  }

  const connect = async () => {
    const { DialogConnectProvider } = await import("@/providers/connect/dialog")
    void dialog.show(() => <DialogConnectProvider directory={location().directory} selection={props.model} />)
  }

  return (
    <ModelDrawer
      trigger={props.trigger}
      onManage={manage}
      model={props.model}
      provider={props.provider}
      onConnect={connect}
      chatgptPlan={chatgptPlan()}
      onClose={() => props.onClose?.()}
    />
  )
}

function ModelDrawer(props: {
  trigger: ModelSelectorTrigger
  model?: ModelState
  provider?: string
  chatgptPlan?: boolean
  onClose: () => void
  onManage: () => void
  onConnect?: () => void
}) {
  const language = useLanguage()
  const [drawer, setDrawer] = createSignal(createModelDrawerState())
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  const dispatch = (event: ModelDrawerEvent) => {
    const next = transitionModelDrawer(untrack(drawer), event)
    setDrawer(next.state)
    next.effects.forEach((effect) => {
      if (effect.type === "schedule-close-timeout") {
        clearTimeout(closeTimer)
        closeTimer = setTimeout(() => dispatch({ type: "close.timed-out", attempt: effect.attempt }), effect.delayMs)

        return
      }

      if (effect.type === "cancel-close-timeout") return clearTimeout(closeTimer)

      if (effect.action === "manage") return props.onManage()

      if (effect.action === "connect") return props.onConnect?.()
      queueMicrotask(props.onClose)
    })
  }

  onCleanup(() => {
    clearTimeout(closeTimer)
    dispatch({ type: "disposed" })
  })

  let trigger: HTMLDivElement | undefined
  let content: HTMLDivElement | undefined

  return (
    <>
      <div ref={trigger} class="min-w-0">
        {props.trigger({
          "aria-haspopup": "dialog",
          get "aria-expanded"() {
            return selectDrawerOpen(drawer())
          },
          onClick: () => dispatch({ type: "opened" }),
        })}
      </div>
      <Show when={selectDrawerLoaded(drawer())}>
        <Suspense>
          <MobilePanelDrawer
            hideHeader
            title={language.t("dialog.model.select.title")}
            open={selectDrawerOpen(drawer())}
            onOpenChange={(open) => dispatch({ type: open ? "opened" : "dismissed" })}
            initialFocus={() => content}
            returnFocus={() => trigger?.querySelector("button") ?? undefined}
            onFinalFocus={(event) => {
              if (!selectDrawerRestoreTrigger(drawer())) event.preventDefault()
            }}
            onContentPresentChange={(present) => {
              if (!present) dispatch({ type: "hidden" })
            }}
          >
            <div
              ref={content}
              tabIndex={-1}
              data-slot="model-selector-drawer"
              class="flex min-h-0 flex-col gap-2 outline-none"
            >
              <div class="flex min-h-0 flex-col">
                <ModelList
                  mobile
                  open={selectDrawerOpen(drawer())}
                  model={props.model}
                  provider={props.provider}
                  onSelect={() => dispatch({ type: "action.selected", action: "select" })}
                />
              </div>
              <div data-slot="model-selector-actions" class="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  class="w-full !h-10 !justify-start"
                  icon="outline-sliders"
                  onClick={() => dispatch({ type: "action.selected", action: "manage" })}
                >
                  {language.t("dialog.model.manage")}
                </Button>
                <Show when={props.onConnect}>
                  <Button
                    variant="ghost"
                    class="w-full !h-10 !justify-start"
                    icon="plus"
                    onClick={() => dispatch({ type: "action.selected", action: "connect" })}
                  >
                    {language.t("command.provider.connect")}
                  </Button>
                </Show>
                <Show when={props.chatgptPlan}>
                  <div class="flex min-h-10 items-center gap-2 border-t border-v2-border-border-muted px-3 py-2 text-[13px] leading-5 text-v2-text-text-base">
                    <ProviderModelIcon provider={{ id: "openai", name: "OpenAI" }} class="shrink-0" />
                    <span class="min-w-0 flex-1 truncate">{language.t("dialog.model.chatgptPlan")}</span>
                    <ExternalLink
                      href="https://chatgpt.com/settings/usage"
                      class="flex shrink-0 items-center gap-1 rounded-sm text-v2-text-text-muted no-underline hover:text-v2-text-text-base focus-visible:outline focus-visible:outline-2"
                    >
                      {language.t("dialog.model.chatgptManageUsage")}
                      <Icon name="arrow-up-right" size="small" />
                    </ExternalLink>
                  </div>
                </Show>
              </div>
            </div>
          </MobilePanelDrawer>
        </Suspense>
      </Show>
    </>
  )
}

function createModelSelectorController(input: {
  provider: () => string | undefined
  model?: ModelState
  onSelect: () => void
}) {
  const model = input.model ?? useLocal().model

  const allModels = createMemo(() =>
    model
      .list()
      .filter((item) => model.visible({ modelID: item.id, providerID: item.provider.id }))
      .filter((item) => (input.provider() ? item.provider.id === input.provider() : true)),
  )

  return {
    all: () => model.list().filter((item) => (input.provider() ? item.provider.id === input.provider() : true)),
    models: (search: string) => {
      const query = search.trim()

      const filtered = query
        ? allModels().filter((item) => matchesModelSearch(query, [item.name, item.id, item.provider.name]))
        : allModels()

      return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    },
    groups: (models: ModelItem[]) => {
      const byProvider = new Map<string, ModelItem[]>()

      for (const item of models) {
        byProvider.set(item.provider.id, [...(byProvider.get(item.provider.id) ?? []), item])
      }

      return Array.from(byProvider, ([category, items]) => ({ category, items })).sort(sortModelGroups)
    },
    current: () => {
      const value = model.current()

      return value ? modelKey(value) : undefined
    },
    select: (item: ModelItem, variant?: string | null) => {
      model.set({ modelID: item.id, providerID: item.provider.id }, { recent: true })

      if (variant !== undefined) model.variant.set(variant ?? undefined)
      input.onSelect()
    },
    variant: (item: ModelItem) => model.variant.current({ providerID: item.provider.id, modelID: item.id }),
    favorites: () => model.favorite.list().filter((item) => !input.provider() || item.provider.id === input.provider()),
    toggleFavorite: (item: ModelItem) => model.favorite.toggle({ providerID: item.provider.id, modelID: item.id }),
  }
}

type ModelRow = { id: string; item: ModelItem }

function createChatgptPlan(current: () => string | undefined) {
  const data = useData()
  const location = useWorkspaceLocation()

  return () => {
    if (!current()?.startsWith("openai:")) return false

    const connection = data.location.integration
      .list(location().ref)
      ?.find((integration) => integration.id === "openai")?.connections[0]

    return connection?.type === "credential" && connection.method === "oauth"
  }
}

function ChatgptPlanFooter() {
  const language = useLanguage()

  return (
    <>
      <div class="h-px bg-v2-border-border-muted" />
      <div class="flex min-h-10 items-center gap-2 px-3 py-2 text-[13px] leading-5 text-v2-text-text-base">
        <ProviderModelIcon provider={{ id: "openai", name: "OpenAI" }} class="shrink-0" />
        <span class="min-w-0 flex-1 truncate">{language.t("dialog.model.chatgptPlan")}</span>
        <ExternalLink
          href="https://chatgpt.com/settings/usage"
          class="flex shrink-0 items-center gap-1 rounded-sm text-v2-text-text-muted no-underline hover:text-v2-text-text-base focus-visible:outline focus-visible:outline-2"
        >
          {language.t("dialog.model.chatgptManageUsage")}
          <Icon name="arrow-up-right" size="small" />
        </ExternalLink>
      </div>
    </>
  )
}

export function DialogSelectModel(props: { provider?: string; model?: ModelState }) {
  const dialog = useDialog()
  const language = useLanguage()

  const controller = createModelSelectorController({
    model: props.model,
    provider: () => props.provider,
    onSelect: () => dialog.close(),
  })

  const chatgptPlan = createChatgptPlan(controller.current)

  // `navigated`: the arrows have moved through the results since the query last changed.
  const [query, setQuery] = createStore({ search: "", navigated: false })
  const [staged, setStaged] = createStore<Record<string, string | null>>({})
  // The intro card belongs to the row under the pointer: `top` is that row's offset in the panel.
  const [hovered, setHovered] = createStore<{ id: string | undefined; top: number }>({ id: undefined, top: 0 })

  let list: SearchListHandle<ModelRow> | undefined
  let scroller: HTMLDivElement | undefined
  let panel: HTMLDivElement | undefined
  let card: HTMLDivElement | undefined
  let leaveTimer: ReturnType<typeof setTimeout> | undefined

  // "默认" lists the whole catalog, "自定义" narrows it to the user's favorites,
  // mirroring the two tabs at the top of Codex's model menu.
  const [tab, setTab] = createSignal<"default" | "custom">("default")
  const rows = createMemo((): ModelRow[] => {
    const favorites = tab() === "custom" ? new Set(controller.favorites().map(modelKey)) : undefined

    return controller
      .groups(controller.models(query.search))
      .flatMap((group) => group.items)
      .filter((item) => !favorites || favorites.has(modelKey(item)))
      .map((item) => ({ id: modelKey(item), item }))
  })

  const rowItem = (id: string | undefined) => (id ? rows().find((row) => row.id === id)?.item : undefined)
  const hoveredItem = () => rowItem(hovered.id)

  const variantsOf = (item: ModelItem) => Object.keys(item.variants ?? {})

  const variant = (item: ModelItem) =>
    modelKey(item) in staged ? (staged[modelKey(item)] ?? undefined) : controller.variant(item)

  const choose = (item: ModelItem, value?: string | null) =>
    controller.select(item, value === undefined ? staged[modelKey(item)] : value)

  const setSearch = (value: string) => setQuery({ search: value, navigated: false })

  const manage = async () => {
    const { DialogManageModels } = await import("./manage")
    void dialog.show(() => <DialogManageModels />)
  }

  // The card sits at the hovered row's height, clamped so it never overruns the panel.
  const placeCard = () => {
    const id = hovered.id

    if (!id || !panel) return
    const row = scroller?.querySelector<HTMLElement>(
      `[data-slot="search-list-row"][data-option-key="${CSS.escape(id)}"]`,
    )

    if (!row) return
    const rect = row.getBoundingClientRect()
    const limit = Math.max(0, panel.clientHeight - (card?.offsetHeight ?? 0) - 4)
    setHovered("top", Math.min(Math.max(0, rect.top - panel.getBoundingClientRect().top - 4), limit))
  }

  const enterRow = (id: string) => {
    clearTimeout(leaveTimer)
    if (hovered.id !== id) setHovered("id", id)
    queueMicrotask(placeCard)
  }

  // Leaving waits a beat so crossing the gap into the card does not close it.
  const leaveRow = () => {
    clearTimeout(leaveTimer)
    leaveTimer = setTimeout(() => setHovered("id", undefined), 160)
  }

  const holdCard = () => clearTimeout(leaveTimer)

  // A new card is a new height: place it once it has rendered.
  createEffect(on(() => hovered.id, () => requestAnimationFrame(placeCard), { defer: true }))

  onCleanup(() => {
    clearTimeout(leaveTimer)
  })

  // A picker, not a page: it hangs off the composer like Codex's, instead of opening in the middle of the window.
  // It clears the send button on the right and stops just above the composer's control row.
  onMount(() => {
    const container = panel?.closest<HTMLElement>('[data-slot="dialog-container"]')
    const trigger = document.querySelector<HTMLElement>('[data-action="composer-model"]')

    if (!container || !trigger) return
    const composer = trigger.closest<HTMLElement>('[data-component="composer"]') ?? trigger
    const submit = composer.querySelector<HTMLElement>('[data-action="composer-submit"]')
    const anchor = submit?.getBoundingClientRect()
    const composerRight = composer.getBoundingClientRect().right
    // Matching Qoder: the panel stops short of the send button instead of covering the far right of the composer.
    const right = anchor ? window.innerWidth - anchor.left + 32 : window.innerWidth - composerRight + 56

    container.style.right = `${Math.max(12, Math.round(right))}px`
    container.style.bottom = `${Math.max(12, Math.round(window.innerHeight - trigger.getBoundingClientRect().top + 6))}px`
  })

  // The search field keeps focus for the dialog's life: a click anywhere else in the dialog, the rows, the scroll area
  // or the card, leaves it there, so the arrow keys always move the highlight instead of scrolling a container.
  const field = () => scroller?.querySelector<HTMLInputElement>('[data-slot="text-input-v2-input"]') ?? undefined

  const inDialog = (target: EventTarget | null) => target instanceof Node && !!panel?.contains(target)

  createEventListener(
    document,
    "mousedown",
    (event: MouseEvent) => {
      if (inDialog(event.target) && event.target !== field()) event.preventDefault()
    },
    { capture: true },
  )

  createEventListener(document, "focusin", (event: FocusEvent) => {
    if (inDialog(event.target) && event.target !== field()) field()?.focus({ preventScroll: true })
  })

  const onKeyDown = (event: KeyboardEvent, active: ModelRow | undefined) => {
    if (matchKeybind(favoriteKeybind, event)) {
      if (!active) return
      event.preventDefault()
      controller.toggleFavorite(active.item)
      // The model moves between Favorites and its group under the same key, so the highlight follows it.
      list?.setActive(active.id)

      return
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      setQuery("navigated", true)

      return
    }

    if (event.metaKey || event.altKey || event.ctrlKey) return

    // While searching, left and right edit the query until the arrows have moved through the results.
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && (!query.search || query.navigated)) {
      const item = active?.item

      if (!item || variantsOf(item).length === 0) return
      event.preventDefault()
      const options = [undefined, ...variantsOf(item)]
      const direction = (event.key === "ArrowRight") !== (language.direction() === "rtl") ? 1 : -1
      const index = options.indexOf(variant(item))
      setStaged(modelKey(item), options[(index + direction + options.length) % options.length] ?? null)
    }
  }

  const Row = (row: { model: ModelRow; attrs: SearchListRow }) => {
    const item = () => row.model.item
    const selected = () => controller.current() === modelKey(item())

    return (
      <button
        type="button"
        {...row.attrs}
        data-option-key={row.model.id}
        aria-current={selected() ? "true" : undefined}
        onMouseMove={(event) => {
          // A still cursor must not take the highlight while the arrow keys scroll rows beneath it.
          if (event.movementX === 0 && event.movementY === 0) return

          row.attrs.onMouseMove(event)
          enterRow(row.model.id)
        }}
        onMouseLeave={leaveRow}
      >
        <span data-slot="model-dialog-name">
          <ProviderModelIcon provider={item().provider} modelName={item().name} class="size-4 shrink-0" />
          <span class="min-w-0 truncate">
            <SearchHighlight text={item().name} />
          </span>
          <Show when={modelCatalog(item()).isNew}>
            <span data-slot="model-new-badge">New</span>
          </Show>
        </span>
        {/* Codex shows the relative cost at the right edge of every row, not just the active one. */}
        <span data-slot="model-dialog-variant">
          <span class="truncate">{modelRatio(item(), isFreeModel(item())) ?? ""}</span>
        </span>
      </button>
    )
  }

  return (
    <Dialog class="command-palette model-dialog" size="large" containerClass="model-dialog-shell">
      <div class="sr-only">
        <DialogTitle>{language.t("dialog.model.select.title")}</DialogTitle>
      </div>
      <div ref={(element) => (panel = element)} data-slot="model-dialog-split">
        <DialogBody class="command-palette-body">
          <div data-slot="model-dialog-tabs">
            <button
              type="button"
              data-slot="model-dialog-tab"
              data-active={tab() === "default" ? "" : undefined}
              onClick={() => setTab("default")}
            >
              默认
            </button>
            <button
              type="button"
              data-slot="model-dialog-tab"
              data-active={tab() === "custom" ? "" : undefined}
              onClick={() => setTab("custom")}
            >
              自定义
            </button>
          </div>
          {/* Scrolling moves the rows under the card, so it is placed again as they move. */}
          <div
            class="contents"
            ref={(element) => {
              scroller = element
              createEventListener(element, "scroll", placeCard, { capture: true })
            }}
          >
            <SearchList
              ref={(handle) => (list = handle)}
              query={query.search}
              onQuery={setSearch}
              placeholder={language.t("dialog.model.search.placeholder")}
              items={rows()}
              key={(row) => row.id}
              empty={language.t("dialog.model.empty")}
              onSelect={(row) => choose(row.item)}
              onKeyDown={onKeyDown}
            >
              {(row, attrs) => <Row model={row()} attrs={attrs} />}
            </SearchList>
          </div>
          <Show when={chatgptPlan()}>
            <ChatgptPlanFooter />
          </Show>
          <div data-slot="model-dialog-footer">
            <button
              type="button"
              onClick={() => {
                void manage()
              }}
            >
              <Icon name="settings-gear" size="small" />
              <span>模型管理</span>
            </button>
          </div>
        </DialogBody>
        {/* The intro card belongs to the row under the pointer and floats beside the list, as Codex's does. */}
        <Show when={hoveredItem()}>
          {(item) => (
            <div
              ref={(element) => {
                card = element
                placeCard()
              }}
              data-component="menu-v2-content"
              data-slot="model-dialog-flyout"
              style={{ top: `${hovered.top}px` }}
              onMouseEnter={holdCard}
              onMouseLeave={leaveRow}
            >
              <div data-slot="model-detail-card">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="min-w-0 truncate text-[15px] font-semibold leading-5 text-[#1a1a1a]">{item().name}</span>
                  <Show when={modelCatalog(item()).isNew}>
                    <span data-slot="model-new-badge">New</span>
                  </Show>
                  <Show when={isFreeModel(item())}>
                    <span data-slot="model-new-badge">免费</span>
                  </Show>
                </div>
                {/* Vendor description, taken from the model's official docs. */}
                <Show when={modelCatalog(item()).description}>
                  {(text) => <p data-slot="model-detail-copy">{text()}</p>}
                </Show>
                {/* Free gateway models carry no list price: the vendor table would mislead there. */}
                <Show when={modelCatalog(item()).price}>
                  {(price) => (
                    <Show when={!isFreeModel(item())}>
                      <p data-slot="model-detail-note">官网定价 {price()}</p>
                    </Show>
                  )}
                </Show>
                <Show when={variantsOf(item()).length > 0}>
                  <div data-slot="model-detail-effort">
                    <div data-slot="model-detail-effort-label">
                      <span>思考强度</span>
                      <Tooltip
                        appearance="standard"
                        placement="bottom"
                        gutter={6}
                        value="强度越高，模型思考得越深：回答更稳，但更慢。"
                        ignoreSafeArea={false}
                      >
                        <Icon name="help" size="small" class="text-[#b4b4b4]" />
                      </Tooltip>
                    </div>
                    <div data-slot="model-detail-effort-options">
                      <For each={variantsOf(item())}>
                        {(value) => (
                          <button
                            type="button"
                            data-slot="model-detail-effort-option"
                            data-active={variant(item()) === value ? "" : undefined}
                            onClick={() => choose(item(), value)}
                          >
                            {effortLabel(value)}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          )}
        </Show>
      </div>
    </Dialog>
  )
}
