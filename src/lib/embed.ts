import { Doc, Para, Settings } from "../types";

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const ascii = lower.match(/[a-z0-9]{2,}/g);
  if (ascii) tokens.push(...ascii);
  const cjk = lower.match(/[一-鿿]/g);
  if (cjk) for (let i = 0; i < cjk.length - 1; i++) tokens.push(cjk[i] + cjk[i + 1]);
  return tokens;
}

function l2(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // 两者均已归一化 => 点积即余弦
}

// 停用词（代词 / 连接词 / 虚词 / 泛化套话）：从词表与概念中提取时过滤，避免「这个 / 就是 / 我们 / 一个」等无用词混入
export const STOPWORDS = new Set<string>([
  // 代词 / 指示
  "这个", "那个", "这些", "那些", "我们", "你们", "他们", "她们", "它们", "咱们",
  "自己", "自我", "本身", "大家", "别人", "什么", "怎么", "怎样", "如何", "为什么",
  "哪儿", "哪里", "谁", "哪个", "哪些", "这儿", "那儿", "这时", "那时", "这里", "那里",
  // 连词 / 副词 / 虚词
  "一个", "一种", "一些", "一样", "以及", "或者", "并且", "而且", "但是", "不过",
  "因为", "所以", "如果", "虽然", "于是", "其中", "对于", "关于", "由于", "从而",
  "进而", "加以", "予以", "通过", "进行", "成为", "具有", "存在", "需要", "可以",
  "能够", "应该", "没有", "不是", "就是", "还是", "已经", "然后", "现在", "同时",
  "此外", "另外", "总之", "其实", "当然", "比如", "例如", "等等", "之类", "而言",
  "来说", "方面", "问题", "情况", "过程", "一般", "主要", "重要", "关键", "实际",
  "具体", "基本", "相对", "一定", "有些", "某些", "任何", "每个", "各个", "各种",
  "目前", "未来", "当前", "本质", "特点", "功能", "作用", "意义", "价值", "目标",
  "原因", "目的", "首先", "其次", "最后", "这种", "那种", "这样", "那样", "可能",
  "一定", "不断", "渐渐", "似乎", "好像", "大概", "也许", "或许", "甚至", "以致",
  "使得", "显得", "看来", "听说", "据说", "所谓", "一下", "一点", "一直", "起来",
  "出来", "过来", "进去", "下去", "上来", "的话", "的时候",
  // 英文停用词
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "her", "was",
  "one", "our", "out", "who", "his", "has", "had", "with", "this", "that", "from",
  "they", "will", "would", "there", "their", "what", "which", "when", "where", "have",
  "been", "were", "said", "each", "does", "than", "into", "more", "some", "such",
]);

export function buildVocab(paras: Para[]): string[] {
  const cnt: Record<string, number> = {};
  for (const p of paras) for (const t of tokenize(p.text)) if (!STOPWORDS.has(t)) cnt[t] = (cnt[t] || 0) + 1;
  return Object.entries(cnt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1500)
    .map((x) => x[0]);
}

export function tfVector(text: string, vocab: string[]): number[] {
  const idx: Record<string, number> = {};
  vocab.forEach((w, i) => (idx[w] = i));
  const v = new Array(vocab.length).fill(0);
  for (const t of tokenize(text)) if (t in idx) v[idx[t]] += 1;
  return l2(v);
}

async function realEmbed(text: string, s: Settings): Promise<number[] | null> {
  try {
    if (s.embedProvider === "openai") {
      if (!s.embedBaseURL || !s.embedModel) return null;
      const r = await fetch(`${s.embedBaseURL.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.apiKey}` },
        body: JSON.stringify({ model: s.embedModel, input: text }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      return l2(j.data[0].embedding as number[]);
    } else {
      const base = s.embedBaseURL || "http://localhost:11434";
      const r = await fetch(`${base.replace(/\/$/, "")}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: s.embedModel || "nomic-embed-text", prompt: text }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      return l2(j.embedding as number[]);
    }
  } catch {
    return null;
  }
}

/** 为单篇文章构建向量（real 或 local），供「懒加载」模式按需调用 */
export async function buildDocEmbeddings(
  doc: Doc,
  s: Settings,
  globalVocab: string[]
): Promise<{ vectors: Record<string, number[]>; mode: "real" | "local" }> {
  const paras = doc.chapters.flatMap((c) => c.paragraphs);
  const vectors: Record<string, number[]> = {};
  if (paras.length === 0) return { vectors, mode: "local" };
  const wantReal = s.embedProvider === "openai" ? !!(s.embedBaseURL && s.embedModel) : true;
  if (wantReal) {
    const t = await realEmbed(paras[0].text, s);
    if (t) {
      vectors[paras[0].id] = t;
      for (let i = 1; i < paras.length; i++) {
        const e = await realEmbed(paras[i].text, s);
        if (e) vectors[paras[i].id] = e;
      }
      return { vectors, mode: "real" };
    }
  }
  for (const p of paras) vectors[p.id] = tfVector(p.text, globalVocab);
  return { vectors, mode: "local" };
}

/** 把查询文本嵌入成与现有向量同方案的向量（real=API，local=词表 TF） */
export async function embedQuery(
  text: string,
  s: Settings,
  vocab: string[],
  mode: "real" | "local"
): Promise<number[] | null> {
  if (mode === "real") return realEmbed(text, s);
  return tfVector(text, vocab);
}

export interface BacklinkCandidate {
  paraId: string;
  docId: string;
  docTitle: string;
  chapterTitle: string;
  text: string;
  score: number;
}

export function searchBacklinks(
  fromId: string,
  fromDocId: string,
  vectors: Record<string, number[]>,
  docs: Doc[],
  settings: Settings
): BacklinkCandidate[] {
  const fv = vectors[fromId];
  if (!fv) return [];
  const res: BacklinkCandidate[] = [];
  for (const d of docs) {
    if (d.id === fromDocId) continue; // 默认仅跨文章
    for (const c of d.chapters) {
      for (const p of c.paragraphs) {
        const v = vectors[p.id];
        if (!v) continue;
        const score = cosine(fv, v);
        if (score >= settings.similarityThreshold) {
          res.push({
            paraId: p.id,
            docId: d.id,
            docTitle: d.title,
            chapterTitle: c.title,
            text: p.text,
            score,
          });
        }
      }
    }
  }
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, settings.topK);
}
