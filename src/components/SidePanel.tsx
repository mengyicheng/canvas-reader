import { useState } from "react";
import { Annotation, Settings } from "../types";
import { BacklinkCandidate } from "../lib/embed";
import { SelectionInfo } from "./SelectionPopup";

export type PanelMode =
  | "annotate" | "backlinks" | "ask"
  | "summary" | "translate" | "explain" | "outline" | "questions";

// 这些模式都展示 AI 结果（summary 状态）
const AI_MODES: PanelMode[] = ["summary", "translate", "explain", "outline", "questions"];

export default function SidePanel({
  open,
  pinned,
  mode,
  sel,
  annotations,
  backlinkCandidates,
  backlinkLoading,
  confirmed,
  summary,
  summaryLoading,
  askAnswer,
  askLoading,
  onClose,
  onTogglePin,
  onSaveAnnotation,
  onRunBacklinks,
  onConfirmBacklink,
  onRunSummary,
  onAsk,
  onGenerateCard,
}: {
  open: boolean;
  pinned: boolean;
  mode: PanelMode | null;
  sel: SelectionInfo | null;
  annotations: Annotation[];
  backlinkCandidates: BacklinkCandidate[];
  backlinkLoading: boolean;
  confirmed: { paraId: string; score: number; docTitle: string; text: string }[];
  summary: string;
  summaryLoading: boolean;
  askAnswer: string;
  askLoading: boolean;
  onClose: () => void;
  onTogglePin: () => void;
  onSaveAnnotation: (text: string) => void;
  onRunBacklinks: () => void;
  onConfirmBacklink: (c: BacklinkCandidate) => void;
  onRunSummary: () => void;
  onAsk: (q: string) => void;
  onGenerateCard: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");

  if (!open || !mode || !sel) return null;

  const titleMap: Record<PanelMode, string> = {
    annotate: "边注",
    backlinks: "反向链接",
    ask: "询问 AI",
    summary: "AI 总结",
    translate: "AI 翻译",
    explain: "AI 解释",
    outline: "AI 大纲",
    questions: "AI 问题",
  };

  return (
    <aside className={"side-panel" + (open ? " open" : "") + (pinned ? " pinned" : "")}>
      <div className="sp-head">
        <span>{titleMap[mode]}</span>
        <div className="sp-actions">
          <button className="mini" onClick={onTogglePin} title="常驻/收缩">
            {pinned ? "收缩" : "常驻"}
          </button>
          <button className="mini" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      <div className="sp-quote">“{sel.text.slice(0, 120)}{sel.text.length > 120 ? "…" : ""}”</div>

      <div className="sp-body">
        {mode === "annotate" && (
          <>
            {annotations.length > 0 && (
              <div className="ann-list">
                {annotations.map((a) => (
                  <div key={a.id} className={"ann " + a.type}>
                    {a.type === "ai_summary" && <span className="ann-tag">AI</span>}
                    {a.text}
                  </div>
                ))}
              </div>
            )}
            <textarea
              placeholder="写下你的边注…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="sp-btns">
              <button
                onClick={() => {
                  if (draft.trim()) {
                    onSaveAnnotation(draft.trim());
                    setDraft("");
                  }
                }}
              >
                保存边注
              </button>
              <button className="ghost" onClick={onRunSummary}>
                AI 总结本段
              </button>
              <button className="ghost" onClick={onGenerateCard} title="用 AI 把这段变成问答复习卡">
                🃏 生成复习卡
              </button>
            </div>
          </>
        )}

        {mode === "backlinks" && (
          <>
            <button className="full" onClick={onRunBacklinks} disabled={backlinkLoading}>
              {backlinkLoading ? "检索中…" : "检索库内相似段落"}
            </button>
            {confirmed.length > 0 && (
              <div className="bl-section">
                <div className="bl-h">已确认</div>
                {confirmed.map((b) => (
                  <div key={b.paraId} className="bl-item confirmed">
                    <div className="bl-meta">{b.docTitle} · {b.score.toFixed(2)}</div>
                    <div className="bl-text">{b.text.slice(0, 90)}…</div>
                  </div>
                ))}
              </div>
            )}
            <div className="bl-section">
              <div className="bl-h">候选（跨文章）</div>
              {backlinkCandidates.length === 0 && !backlinkLoading && (
                <div className="hint">暂无候选，可先检索；或调低设置中的相似度阈值。</div>
              )}
              {backlinkCandidates.map((c) => (
                <div key={c.paraId} className="bl-item">
                  <div className="bl-meta">
                    {c.docTitle} · {c.chapterTitle} · <b>{c.score.toFixed(2)}</b>
                  </div>
                  <div className="bl-text">{c.text.slice(0, 90)}…</div>
                  <button className="mini" onClick={() => onConfirmBacklink(c)}>
                    确认连接
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {AI_MODES.includes(mode) && (
          <>
            <div className="sp-result">
              {summaryLoading ? "AI 处理中…" : summary || "（点击浮框中的动作生成）"}
            </div>
            <button className="ghost full" onClick={onGenerateCard} disabled={summaryLoading} title="把这段变成问答复习卡">
              🃏 生成复习卡
            </button>
          </>
        )}

        {mode === "ask" && (
          <>
            <textarea
              placeholder="问点什么？基于当前选中段落…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button
              className="full"
              disabled={askLoading}
              onClick={() => question.trim() && onAsk(question.trim())}
            >
              {askLoading ? "思考中…" : "提问"}
            </button>
            {askAnswer && <div className="sp-result">{askAnswer}</div>}
          </>
        )}
      </div>
    </aside>
  );
}
