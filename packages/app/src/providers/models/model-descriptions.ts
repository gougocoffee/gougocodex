import type { ModelSelection } from "./selection"

type ModelInfo = NonNullable<ReturnType<ModelSelection["current"]>>

/**
 * Catalog copy for the model dialog, matched against provider id + model id + display name.
 *
 * Prices come from https://platform.kimi.com/docs/pricing/chat and
 * https://api-docs.deepseek.com/zh-cn/quick_start/pricing/ (¥ per 1M tokens, input / output).
 * The "×" figure is the input price relative to kimi-k3.1-pro (¥13), which is 1× — the same
 * relative-cost column Codex shows next to each model.
 * Descriptions come from https://platform.kimi.com/docs/models and the vendor docs.
 */

export type ModelCatalogEntry = {
  description?: string
  /** Relative cost, e.g. "1×", "0.4×". Free models are handled by `isFreeModel`. */
  ratio?: string
  /** Official list price, shown in the detail card. */
  price?: string
  isNew?: boolean
}

type Entry = ModelCatalogEntry & { keys: string[] }

// Longer ids first: "kimi-k3.1-pro-highspeed" contains "kimi-k3.1-pro".
const ENTRIES: Entry[] = [
  {
    keys: ["kimi-k3.1-pro-highspeed", "k3.1-pro-highspeed", "k3.1 pro highspeed"],
    description: "Kimi K3.1 Pro 的高速版模型，约为 K3.1 Pro 的 2～3 倍速度。",
    ratio: "2×",
    price: "¥26 / ¥136 每百万 token",
    isNew: true,
  },
  {
    keys: ["kimi-k3.1-pro", "k3.1-pro", "k3.1 pro"],
    description:
      "Kimi K3.1 系列的首个模型，也是 Kimi 迄今能力最强的旗舰模型：3 万亿级参数，原生支持视觉理解，100 万 token 上下文窗口，代码、3D 创作、金融研究与建模等能力显著提升。",
    ratio: "1×",
    price: "¥13 / ¥68 每百万 token",
    isNew: true,
  },
  {
    keys: ["kimi-k2.7-code-highspeed", "k2.7-code-highspeed"],
    description: "Kimi K2.7 Code 的高速版，适合高频、低延迟的编码任务。",
    ratio: "0.8×",
    price: "¥13 / ¥54 每百万 token",
  },
  {
    keys: ["kimi-k2.7-code", "k2.7-code"],
    description: "面向编码场景的 K2.7 模型，长上下文与工具调用表现稳定。",
    ratio: "0.5×",
    price: "¥6.50 / ¥27 每百万 token",
  },
  {
    keys: ["kimi-k2.6", "k2.6"],
    description: "Kimi K2.6，通用对话与轻量编码任务均衡。",
    ratio: "0.5×",
    price: "¥6.50 / ¥27 每百万 token",
  },
  {
    keys: ["kimi-k3", "k3-256k", "kimi k3", " k3"],
    description:
      "上一代旗舰模型，全球首个开源的 3 万亿级模型（2.8 万亿参数）；原生支持视觉理解，100 万 token 上下文窗口，面向长程编程、知识工作和深度推理等前沿智能场景而设计。",
    ratio: "1.5×",
    price: "¥20 / ¥100 每百万 token",
  },
  {
    // DeepSeek: https://api-docs.deepseek.com/zh-cn/quick_start/pricing/ — ¥2 input (peak, cache miss)
    // over the ¥13 flagship baseline.
    keys: ["deepseek-v4.1-flash", "deepseek-v4-flash", "v4.1-flash", "v4.1 flash", "v4-flash"],
    description:
      "DeepSeek V4.1 Flash（V4.1-Flash-1017）：通过自反馈强化学习提升了从零构建完整项目的能力，游戏开发、3D 建模等「许愿式」编程任务表现更好；同时缩短任务耗时与输出长度，在多个 Harness 下达到新的性能–费用帕累托最优。原生支持图像理解，1M 上下文、最长输出 384K。",
    ratio: "0.2×",
    price: "¥2 / ¥8 每百万 token（闲时半价）",
  },
  {
    keys: ["deepseek-v4-pro", "v4-pro", "v4 pro"],
    description:
      "DeepSeek V4 Pro 正式版（V4-Pro-0813）：Agent 能力大幅提升，生产环境表现尤为显著；原生支持 OpenAI Responses API 并针对 Codex 做了适配，支持 low / high / max 三档思考强度。1M 上下文、最长输出 384K。",
    ratio: "0.7×",
    price: "¥9 / ¥27 每百万 token（闲时半价）",
  },
  {
    keys: ["网页版", "deepseek-web"],
    description: "免费使用：通过本机桥接调用 DeepSeek 网页版，不消耗 API 额度，有限速保护。",
    ratio: "0×",
  },
  {
    keys: ["deepseek"],
    description: "深度求索（DeepSeek）出品，编码、数学与通用推理表现均衡，Agent 任务与长上下文能力强。",
  },
  {
    keys: ["glm", "zai", "zhipu"],
    description: "智谱 GLM 系列，中英双语能力扎实，适合对话、写作与智能体任务。",
  },
  {
    keys: ["minimax"],
    description: "MiniMax 系列模型，理解与生成均衡，响应速度快。",
  },
  {
    keys: ["mimo", "xiaomi"],
    description: "小米 MiMo 系列，轻量高效，适合高频调用场景。",
  },
  {
    keys: ["nemotron"],
    description: "NVIDIA Nemotron 系列，开源高性能推理模型，数学与代码能力强。",
  },
  {
    keys: ["mistral"],
    description: "Mistral 系列，欧洲出品，轻量高效，多语言支持好。",
  },
  {
    keys: ["gemini", "google"],
    description: "Google Gemini 系列，多模态理解能力强，支持文本、图像与视频输入。",
  },
  {
    keys: ["claude", "anthropic"],
    description: "Anthropic Claude 系列，长文档理解、代码与智能体能力领先。",
  },
  {
    keys: ["gpt", "openai", "o3", "o4"],
    description: "OpenAI GPT 系列，通用能力全面，工具生态成熟。",
  },
  {
    keys: ["grok", "xai"],
    description: "xAI Grok 系列，推理与实时信息处理能力突出。",
  },
  {
    keys: ["qwen", "tongyi", "alibaba"],
    description: "阿里通义千问系列，多语言与工具调用能力全面，综合性能稳。",
  },
  {
    keys: ["step"],
    description: "阶跃星辰 Step 系列，多模态与推理能力兼顾。",
  },
  {
    keys: ["longcat"],
    description: "LongCat 系列，美团出品，长上下文与中文理解能力强。",
  },
  {
    keys: ["ling"],
    description: "Ling 系列，轻量化设计，推理成本友好。",
  },
  {
    keys: ["ring"],
    description: "Ring 系列，超长上下文模型，适合大体量资料处理。",
  },
  {
    keys: ["trinity"],
    description: "Trinity 系列，新一代推理模型，复杂任务表现稳健。",
  },
  {
    keys: ["jev", "iceman", "inkling", "muse", "ember", "beam", "pickle", "flint", "spark"],
    description: "社区精选模型，覆盖不同档位的速度与能力需求。",
  },
]

const haystack = (model: ModelInfo) =>
  `${model.provider.canonical ?? ""} ${model.provider.id} ${model.provider.name} ${model.id} ${model.name}`.toLowerCase()

const lookup = (model: ModelInfo): ModelCatalogEntry | undefined => {
  const text = haystack(model)

  for (const entry of ENTRIES) {
    if (entry.keys.some((key) => text.includes(key))) {
      const { keys: _keys, ...info } = entry

      return info
    }
  }

  return undefined
}

/** The vendor's one-line introduction for a catalog model. */
export function modelDescription(model: ModelInfo): string | undefined {
  return lookup(model)?.description
}

/** Everything the detail column needs: description, relative cost, list price and freshness. */
export function modelCatalog(model: ModelInfo): ModelCatalogEntry {
  return lookup(model) ?? {}
}

/** The label shown at the right edge of a model row. */
export function modelRatio(model: ModelInfo, free: boolean): string | undefined {
  // Free gateway models cost nothing: Codex's list shows them as a zero multiplier
  // while the row still carries the "免费" badge.
  if (free) return "0×"

  return lookup(model)?.ratio
}
