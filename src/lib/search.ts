import { Chapter, Doc, Para, Settings } from "../types";
import { cosine, embedQuery, tokenize } from "./embed";

export interface SearchHit {
  paraId: string;
  docId: string;
  docTitle: string;
  chapterTitle: string;
  text: string;
  score: number; // 综合分（语义 0.7 + 关键词 0.3）
  semantic: number; // 余弦相似度（无向量时为 0）
  matched: boolean; // 全文命中（子串）
}

interface ParaRef {
  doc: Doc;
  chapter: Chapter;
  para: Para;
}

/**
 * 跨书检索：语义向量召回 + 全文/词表匹配，结果按书名分组由 UI 处理。
 * - 向量可用时：查询文本嵌入后与每段向量求余弦，保留 >= 阈值 的段落。
 * - 无论向量模式：再做全文子串匹配与词表重叠加分，保证 keywords 相关性。
 */
export async function searchLibrary(
  query: string,
  vectors: Record<string, number[]>,
  docs: Doc[],
  vocab: string[],
  mode: "real" | "local",
  settings: Settings,
  topK = 30
): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const qv = await embedQuery(q, settings, vocab, mode);
  const ql = q.toLowerCase();

  // 建立 paraId -> {doc, chapter, para} 反查表（一次遍历）
  const lookup: Record<string, ParaRef> = {};
  for (const d of docs) {
    for (const c of d.chapters) {
      for (const p of c.paragraphs) lookup[p.id] = { doc: d, chapter: c, para: p };
    }
  }

  const qTokens = new Set(tokenize(q));
  const hits: SearchHit[] = [];

  for (const [paraId, vec] of Object.entries(vectors)) {
    const ref = lookup[paraId];
    if (!ref) continue;

    const sem = qv ? cosine(qv, vec) : 0;
    const textL = ref.para.text.toLowerCase();
    const kw = textL.includes(ql);

    let overlap = 0;
    if (qTokens.size) {
      const pTokens = new Set(tokenize(ref.para.text));
      qTokens.forEach((t) => {
        if (pTokens.has(t)) overlap++;
      });
    }
    const kwScore = kw ? 1 : overlap / Math.max(1, qTokens.size);

    // 过滤：语义未达阈值且全文未命中且无词表重叠 => 跳过
    if (sem < settings.similarityThreshold && !kw && overlap === 0) continue;

    const score = sem * 0.7 + kwScore * 0.3;
    hits.push({
      paraId,
      docId: ref.doc.id,
      docTitle: ref.doc.title,
      chapterTitle: ref.chapter.title,
      text: ref.para.text,
      score,
      semantic: sem,
      matched: kw,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}
