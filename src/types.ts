// 语义块类型：EPUB 重排版后，每段内容带一个 kind，
// 阅读器据此套用不同排版（标题/正文/引用/列表/图片/分割线/表格）。
export type BlockKind =
  | "p"
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "quote" | "li" | "img" | "hr" | "table" | "code";

// 行内富文本片段：保留 EPUB 里的加粗/斜体强调（不影响 text 纯文本，AI/反链仍用 text）
export interface RichSeg {
  t: string;
  b?: boolean; // 加粗
  i?: boolean; // 斜体
}

export interface Para {
  id: string;
  docId: string;
  chapterId: string;
  index: number;
  text: string;                 // 纯文本（用于搜索/反链/AI；图片时为 alt）
  kind?: BlockKind;             // 默认 "p"
  src?: string;                 // 图片 data URI
  alt?: string;                 // 图片替代文本
  rows?: string[][];            // 表格：行 → 单元格
  rich?: RichSeg[];             // 行内格式（加粗/斜体）；缺省时阅读器回退到 text
}

export interface Chapter {
  id: string;
  title: string;
  paragraphs: Para[];
}

export interface Doc {
  id: string;
  title: string;
  type: string;
  chapters: Chapter[];
}

export interface Annotation {
  id: string;
  paraId: string;
  type: "human" | "ai_summary" | "highlight";
  text: string;
  createdAt: number;
}

// 书签：标记某个段落位置，跨会话留存，点击可跳回（复用 scrollToParaId 机制）
export interface Bookmark {
  id: string;
  docId: string;
  paraId: string;       // 定位到的段落（anchor 用 data-para-id）
  chapterId: string;
  chapterTitle: string; // 冗余存章节标题，列表里直接显示
  snippet: string;      // 该段摘要文字，便于列表预览
  note?: string;        // 可选备注
  createdAt: number;
}

export interface Backlink {
  id: string;
  fromParaId: string;
  toParaId: string;
  score: number;
  confirmed: boolean;
  createdAt: number;
}

// 闪卡（间隔重复复习）。front=提示/问题，back=答案；SM-2 调度。
export interface Flashcard {
  id: string;
  docId: string;
  paraId: string;
  front: string;        // 提示/问题
  back: string;         // 答案
  sourceText?: string;  // 原文片段（上下文）
  createdAt: number;
  due: number;          // 下次复习时间戳
  interval: number;     // 间隔天数
  ease: number;         // SM-2 难度系数，默认 2.5
  reps: number;         // 连续正确次数
}

// 概念图谱：AI 从边注/反链提炼出的「概念」节点，以及它们之间的关联
export interface ConceptNode {
  id: string;
  label: string;          // 概念名 / 段落摘要
  kind: "concept" | "para";
  docId?: string;         // kind=para 时指向原文
  paraId?: string;
  x?: number;             // 布局坐标（力导向计算后填入）
  y?: number;
}
export interface ConceptEdge {
  from: string;           // 节点 id
  to: string;             // 节点 id
  label?: string;         // 关系描述
}
export interface ConceptGraph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  aiGenerated: boolean;   // 是否来自 AI 提炼（false=从反链/词表自动构建）
}

export type EmbedProvider = "ollama" | "openai";

export interface Settings {
  apiKey: string;
  baseURL: string;
  model: string;
  embedProvider: EmbedProvider;
  embedBaseURL: string;
  embedModel: string;
  similarityThreshold: number;
  topK: number;
  embedMode: "prefull" | "lazy";
  apiHeader: string;
  theme: "light" | "dark";
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  embedProvider: "ollama",
  embedBaseURL: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  similarityThreshold: 0.7,
  topK: 5,
  embedMode: "lazy",
  apiHeader: "Authorization",
  theme: "dark",
};

// ===== 阅读排版偏好（参考微信读书）=====
export type PaperTheme = "default" | "eye" | "sepia" | "pink" | "night";

export const FONT_STACKS: Record<string, string> = {
  system: '-apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  serif: '"Songti SC", "SimSun", "Noto Serif SC", serif',
  sans: '"PingFang SC", "Microsoft YaHei", "Heiti SC", sans-serif',
  kai: '"Kaiti SC", "KaiTi", "STKaiti", "Noto Serif SC", serif',
  fangsong: '"FangSong", "STFangsong", "仿宋", "Noto Serif SC", serif',
};

export interface ReaderPrefs {
  fontSize: number; // 正文字号 px
  fontFamily: keyof typeof FONT_STACKS | string;
  lineHeight: number;
  paraSpacing: number; // 段间距 px
  pageWidth: number; // 页宽 px（阅读列最大宽度）
  paper: PaperTheme;
  bold: boolean; // 加粗正文
  indent: boolean; // 段首缩进 2em（中文排版习惯）
  justify: boolean; // 两端对齐
  letterSpacing: number; // 字间距 px
  bionic: boolean; // 仿生阅读：每段首字加粗，加速眼球捕捉
  autopace: number; // 自动滚动速度 px/秒，0 = 关闭
  focus: boolean; // 聚焦模式：淡出视口中心以外的段落
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  fontSize: 18,
  fontFamily: "system",
  lineHeight: 1.85,
  paraSpacing: 8,
  pageWidth: 760,
  paper: "default",
  bold: false,
  indent: true,
  justify: true,
  letterSpacing: 0,
  bionic: false,
  autopace: 0,
  focus: false,
};

export function fontStack(key: string): string {
  return FONT_STACKS[key] || FONT_STACKS.system;
}

export function allParas(doc: Doc): Para[] {
  return doc.chapters.flatMap((c) => c.paragraphs);
}

export function paraId(docId: string, chapterIdx: number, paraIdx: number): string {
  return `${docId}#c${chapterIdx}p${paraIdx}`;
}

export function findPara(docs: Doc[], paraId: string): Para | undefined {
  for (const d of docs) {
    for (const c of d.chapters) {
      for (const p of c.paragraphs) if (p.id === paraId) return p;
    }
  }
  return undefined;
}

export function findDoc(docs: Doc[], docId: string): Doc | undefined {
  return docs.find((d) => d.id === docId);
}
