import { Settings } from "../types";
import { STOPWORDS } from "./embed";

export async function aiChat(system: string, user: string, s: Settings): Promise<string> {
  if (!s.apiKey || !s.baseURL || !s.model) {
    return "（演示）未配置 API Key，无法调用真实模型。请在「设置」中填入 OpenAI 兼容的 Key / BaseURL / Model。";
  }
  const hname = s.apiHeader || "Authorization";
  const authVal = hname === "Authorization" ? `Bearer ${s.apiKey}` : s.apiKey;
  const r = await fetch(`${s.baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [hname]: authVal },
    body: JSON.stringify({
      model: s.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`API ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return j.choices[0].message.content as string;
}

// 选区浮框的 AI 动作种类：总结 / 翻译 / 解释 / 大纲 / 问题
export type AiActionKind = "summary" | "translate" | "explain" | "outline" | "questions";

const ACTION_SYS: Record<AiActionKind, string> = {
  summary:
    "你是一个严谨的中文阅读助手。请结合【所在章节】上下文，对【选中内容】做简洁总结，突出核心观点、论据与可迁移要点。不要复述原文，用自己的话。",
  translate:
    "你是一个翻译助手。将【选中内容】翻译为通顺的简体中文，保留专业术语（可附原文术语），不要额外解释。若原文已是中文，则润色为更通顺的白话。",
  explain:
    "你是一个善于讲解的老师。针对【选中内容】做通俗解释：①核心含义 ②所需背景 ③难点/易错点 ④与现实或其他知识的联系。用中文，分点但简洁。",
  outline:
    "你是阅读助手。基于【选中内容】提炼结构化大纲：用分级要点列表呈现，只列要点、不做长段展开。用中文。",
  questions:
    "你是阅读助手。基于【选中内容】生成 3-5 个用于自我检测的理解性问题（引发思考，不直接给答案），帮助复习与检验掌握程度。用中文。",
};

function actionUser(kind: AiActionKind, selected: string, chapter: string): string {
  if (kind === "summary") {
    return `【所在章节】\n${chapter}\n\n【选中内容】\n${selected}\n\n请总结：`;
  }
  if (kind === "outline") {
    return `【上下文（可选）】\n${chapter}\n\n【待提炼内容】\n${selected}\n\n请提炼大纲：`;
  }
  return `【章节上下文（可选）】\n${chapter}\n\n【选中内容】\n${selected}\n\n请处理：`;
}

export async function runAiAction(
  kind: AiActionKind,
  selected: string,
  chapter: string,
  s: Settings
): Promise<string> {
  try {
    return await aiChat(ACTION_SYS[kind], actionUser(kind, selected, chapter), s);
  } catch (e: any) {
    return `（演示·未连到模型：${e.message}）\n\n[${kind}] 选中内容：\n${selected.slice(0, 220)}…`;
  }
}

export async function summarize(selected: string, chapter: string, s: Settings): Promise<string> {
  return runAiAction("summary", selected, chapter, s);
}

export interface QACard { front: string; back: string; }

// 基于选中内容生成一张「问题—答案」复习卡（用于闪卡）
export async function aiGenerateCard(selected: string, chapter: string, s: Settings): Promise<QACard> {
  const system =
    "你是复习卡片生成器。基于【选中内容】生成一张用于自我检测的记忆卡片。严格只按以下格式输出，不要任何额外说明：\nQ: <一个考察对这段内容理解的问题>\nA: <简洁准确的答案>";
  const user = `【章节上下文】\n${chapter}\n\n【选中内容】\n${selected}`;
  try {
    const r = await aiChat(system, user, s);
    const m = r.match(/Q:\s*([\s\S]*?)\n\s*A:\s*([\s\S]*)/);
    if (m) return { front: m[1].trim(), back: m[2].trim() };
    return { front: selected.slice(0, 160), back: r.trim() };
  } catch (e: any) {
    return { front: selected.slice(0, 160), back: "（演示卡·未连到模型）" + selected.slice(0, 80) };
  }
}

export async function askAI(question: string, context: string, s: Settings): Promise<string> {
  const system = "你是阅读助手，请基于【上下文】回答用户关于这段文字的问题，简洁、准确、用中文。";
  const user = `【上下文】\n${context}\n\n【问题】\n${question}`;
  try {
    return await aiChat(system, user, s);
  } catch (e: any) {
    return `（演示·未连到模型：${e.message}）`;
  }
}

/** 获取 OpenAI 兼容端点的可用模型列表（用于「获取模型」按钮） */
export async function fetchModels(baseURL: string, apiKey: string, headerName: string): Promise<string[]> {
  if (!baseURL) return [];
  const hname = headerName || "Authorization";
  const authVal = hname === "Authorization" ? `Bearer ${apiKey}` : apiKey;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers[hname] = authVal;
  try {
    const r = await fetch(`${baseURL.replace(/\/$/, "")}/models`, { headers });
    if (!r.ok) return [];
    const j = await r.json();
    const list = (j.data || j.models || []) as any[];
    return list
      .map((m) => (typeof m === "string" ? m : m.id || m.name || ""))
      .filter(Boolean)
      .map(String);
  } catch {
    return [];
  }
}

// 从一批「原文片段 + 边注/总结」中，让 AI 提炼概念及其关系，返回 JSON
// 输出约定：{ "concepts": [{"name": "...", "members": [原文片段序号 0-based]}, ...], "links": [{"a": 概念名, "b": 概念名, "rel": "关系"}] }
export async function aiExtractConcepts(input: { text: string; note?: string }[], s: Settings): Promise<{ concepts: { name: string; members: number[] }[]; links: { a: string; b: string; rel: string }[] }> {
  const system =
    "你是知识梳理助手。我会给你若干【阅读片段】及其【边注/总结】。请提炼出这本书的「核心概念 / 中心思想 / 关键技术术语」——即真正有助于理解本书内容的关键词，而不是代词、连接词、虚词或泛泛的套话。\n" +
    "严禁把以下这类词当作概念：这个、就是、我们、你们、他们、自己、一个、一种、这些、那些、但是、因为、所以、如果、可以、需要、进行、通过 等。\n" +
    "严格只输出一个 JSON 对象，格式：\n" +
    "{\"concepts\":[{\"name\":\"概念名(简短、有意义、2-8字，如『心流状态』『边际成本』)\",\"members\":[相关片段的编号数组,0-based]}],\"links\":[{\"a\":\"概念A\",\"b\":\"概念B\",\"rel\":\"关系描述\"}]}\n" +
    "概念不要超过 12 个；members 用片段编号；不要输出任何 JSON 以外的文字。";
  const user = input
    .map((it, i) => `【片段 ${i}】${it.text}${it.note ? `\n边注：${it.note}` : ""}`)
    .join("\n\n");
  try {
    const r = await aiChat(system, user, s);
    const m = r.match(/\{[\s\S]*\}/);
    if (!m) return { concepts: [], links: [] };
    const parsed = JSON.parse(m[0]);
    const concepts = (parsed.concepts || []).filter(
      (c: any) => c && c.name && c.name.trim().length >= 2 && !STOPWORDS.has(c.name.trim())
    );
    const validNames = new Set(concepts.map((c: any) => c.name));
    const links = (parsed.links || []).filter(
      (l: any) => l && validNames.has(l.a) && validNames.has(l.b)
    );
    return { concepts, links };
  } catch {
    return { concepts: [], links: [] };
  }
}

// 流式调用：逐 token 回调 onToken，返回完整文本（用于「思考中」进度条 + 实时显示）
export async function aiChatStream(
  system: string,
  user: string,
  s: Settings,
  onToken: (t: string) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!s.apiKey || !s.baseURL || !s.model) {
    const tip = "（演示）未配置 API Key，无法调用真实模型。请在「设置」中填入 OpenAI 兼容的 Key / BaseURL / Model。";
    onToken(tip);
    return tip;
  }
  const hname = s.apiHeader || "Authorization";
  const authVal = hname === "Authorization" ? `Bearer ${s.apiKey}` : s.apiKey;
  const r = await fetch(`${s.baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [hname]: authVal },
    body: JSON.stringify({
      model: s.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      stream: true,
    }),
    signal,
  });
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => "");
    throw new Error(`API ${r.status}: ${t.slice(0, 200)}`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onToken(delta);
        }
      } catch {
        /* 跳过非 JSON 行 */
      }
    }
  }
  return full;
}

export async function runAiActionStream(
  kind: AiActionKind,
  selected: string,
  chapter: string,
  s: Settings,
  onToken: (t: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return aiChatStream(ACTION_SYS[kind], actionUser(kind, selected, chapter), s, onToken, signal);
}

export async function askAIStream(
  question: string,
  context: string,
  s: Settings,
  onToken: (t: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const system = "你是阅读助手，请基于【上下文】回答用户关于这段文字的问题，简洁、准确、用中文。";
  const user = `【上下文】\n${context}\n\n【问题】\n${question}`;
  return aiChatStream(system, user, s, onToken, signal);
}
