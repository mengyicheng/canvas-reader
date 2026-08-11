import { useState, useRef } from "react";
import { Doc, Annotation, Backlink, Bookmark } from "../types";
import Markdown from "./Markdown";
import type { BacklinkCandidate } from "../lib/embed";
import type { SelectionInfo } from "./SelectionPopup";
import type { AiActionKind } from "../lib/ai";

export type RailTab = "toc" | "annotate" | "backlinks" | "ask" | "aifeat" | "bookmarks";

export interface ChatMsg { id: string; q: string; a: string; kind?: string }

export interface DocAnno {
  ann: Annotation;
  chapterTitle: string;
  paraId: string;
  snippet: string;
}

const TAB_LABELS: Record<RailTab, string> = {
  toc: "章节",
  annotate: "边注",
  backlinks: "反链",
  ask: "询问 AI",
  aifeat: "AI 功能",
  bookmarks: "书签",
};

// AI 功能面板：每个动作的「背景范围」与悬停解释
// scope: "book" = 以整本书为上下文背景；"sel" = 仅基于你选中的内容
const AIFeatItems: { kind: AiActionKind; label: string; scope: "book" | "sel"; tip: string }[] = [
  {
    kind: "summary",
    label: "AI 总结",
    scope: "book",
    tip: "基于你选中的内容，并参考【整本书】作为背景，用你自己的话总结核心观点、论据与可迁移要点。",
  },
  {
    kind: "translate",
    label: "翻译",
    scope: "sel",
    tip: "只翻译你选中的这一句/段，不依赖全书背景。原文非中文则译为中文，已是中文则润色为通顺白话。",
  },
  {
    kind: "explain",
    label: "解释",
    scope: "book",
    tip: "针对你选中的内容做通俗讲解（核心含义 / 所需背景 / 难点易错点 / 与现实或其他知识的联系），参考全书背景。",
  },
  {
    kind: "outline",
    label: "大纲",
    scope: "book",
    tip: "把你选中的内容提炼为结构化要点大纲，参考全书背景。",
  },
  {
    kind: "questions",
    label: "问题",
    scope: "book",
    tip: "基于你选中的内容生成 3–5 个用于自测的理解性问题，参考全书背景。",
  },
];

const ACTION_LABELS: Record<string, string> = {
  summary: "AI 总结",
  translate: "AI 翻译",
  explain: "AI 解释",
  outline: "AI 大纲",
  questions: "AI 问题",
};

export default function ReaderRail({
  open,
  onClose,
  onToggle,
  width,
  onResize,
  doc,
  docAnnotations,
  docBacklinks,
  candidates,
  blLoading,
  runBacklinks,
  confirmBacklink,
  sel,
  chatMessages,
  chatLoading,
  aiProgress,
  onChat,
  onJumpChapter,
  onJumpPara,
  onSaveAnnotation,
  onDeleteAnnotation,
  docBookmarks,
  onRemoveBookmark,
  activeTab,
  onTab,
}: {
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
  width: number;
  onResize: (w: number) => void;
  doc: Doc;
  docAnnotations: DocAnno[];
  docBacklinks: Backlink[];
  candidates: BacklinkCandidate[];
  blLoading: boolean;
  runBacklinks: () => void;
  confirmBacklink: (c: BacklinkCandidate) => void;
  sel: SelectionInfo | null;
  chatMessages: ChatMsg[];
  chatLoading: boolean;
  aiProgress: number;
  onChat: (q: string, kind?: AiActionKind) => void;
  onJumpChapter: (chapterId: string) => void;
  onJumpPara: (paraId: string) => void;
  onSaveAnnotation: (text: string) => void;
  onDeleteAnnotation: (paraId: string, annId: string) => void;
  docBookmarks: Bookmark[];
  onRemoveBookmark: (id: string) => void;
  activeTab: RailTab;
  onTab: (t: RailTab) => void;
}) {
  const [draft, setDraft] = useState("");
  const [chatInput, setChatInput] = useState("");

  const resizing = useRef<{ x: number; w: number } | null>(null);
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = { x: e.clientX, w: width };
    const move = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const dw = resizing.current.x - ev.clientX; // 向左拖 => 变宽
      onResize(Math.max(280, Math.min(680, resizing.current.w + dw)));
    };
    const up = () => {
      resizing.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  if (!open) return null;

  return (
    <aside className="reader-rail" style={{ width }}>
      <div className="rail-resizer" onMouseDown={startResize} title="拖动调整宽度" />
      <div className="rail-header">
        <div className="rail-tabs">
          {(Object.keys(TAB_LABELS) as RailTab[]).map((t) => (
            <button
              key={t}
              className={"rail-tab" + (activeTab === t ? " active" : "")}
              onClick={() => onTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <button className="rail-close" onClick={onToggle} title="收起侧栏">
          ✕
        </button>
      </div>

      <div className="rail-body">
        {/* ── 章节目录 ── */}
        {activeTab === "toc" && (
          <div className="rail-section">
            <div className="rail-section-title">{doc.title}</div>
            {doc.chapters.map((c, i) => (
              <button
                key={c.id}
                className="rail-toc-item"
                onClick={() => onJumpChapter(c.id)}
              >
                <span className="rail-toc-idx">{i + 1}</span>
                <span className="rail-toc-title">{c.title}</span>
                <span className="rail-toc-count">{c.paragraphs.length} 段</span>
              </button>
            ))}
            {doc.chapters.length === 0 && (
              <div className="rail-empty">暂无章节</div>
            )}
          </div>
        )}

        {/* ── 全书边注 ── */}
        {activeTab === "annotate" && (
          <div className="rail-section">
            {sel && (
              <div className="rail-quick-add">
                <div className="rail-sel-hint">
                  选中："{" "}
                  <em>{sel.text.slice(0, 50)}{sel.text.length > 50 ? "…" : ""}</em>
                  {" "}
                </div>
                <textarea
                  placeholder="为选中文字写边注…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  className="mini"
                  onClick={() => {
                    onSaveAnnotation(draft);
                    setDraft("");
                  }}
                  title={draft.trim() ? "保存边注" : "空内容将自动存为划线"}
                >
                  {draft.trim() ? "保存边注" : "存为划线"}
                </button>
              </div>
            )}
            <div className="rail-section-title">
              全书边注（{docAnnotations.length}）
            </div>
            {docAnnotations.length === 0 && (
              <div className="rail-empty">暂无边注，选中文字后可添加</div>
            )}
            {docAnnotations.map((da) => (
              <div
                key={da.ann.id}
                className={"rail-ann-item" + (da.ann.type === "highlight" ? " is-hl" : "")}
                onClick={() => onJumpPara(da.paraId)}
              >
                <div className="rail-ann-meta">
                  {da.ann.type === "ai_summary" && <span className="ann-tag">AI</span>}
                  {da.ann.type === "highlight" && <span className="ann-tag hl-tag">划线</span>}
                  <span className="rail-ann-ch">{da.chapterTitle}</span>
                  <button
                    className="rail-ann-del"
                    title="删除"
                    onClick={(e) => { e.stopPropagation(); onDeleteAnnotation(da.paraId, da.ann.id); }}
                  >✕</button>
                </div>
                <div className="rail-ann-text">{da.ann.text.slice(0, 80)}{da.ann.text.length > 80 ? "…" : ""}</div>
                {da.ann.type !== "highlight" && <div className="rail-ann-snip">"{da.snippet}"</div>}
              </div>
            ))}
          </div>
        )}

        {/* ── 反向链接 ── */}
        {activeTab === "backlinks" && (
          <div className="rail-section">
            <button
              className="rail-action-btn"
              onClick={runBacklinks}
              disabled={blLoading || !sel}
            >
              {blLoading ? "检索中…" : "检索相似段落"}
            </button>
            {candidates.length > 0 && (
              <>
                <div className="rail-section-title">候选（跨书）</div>
                {candidates.map((c) => (
                  <div key={c.paraId} className="rail-bl-item">
                    <div className="rail-bl-meta">
                      {c.docTitle} · {c.chapterTitle} · <b>{c.score.toFixed(2)}</b>
                    </div>
                    <div className="rail-bl-text">{c.text.slice(0, 80)}…</div>
                    <button className="mini" onClick={() => confirmBacklink(c)}>
                      确认连接
                    </button>
                  </div>
                ))}
              </>
            )}
            <div className="rail-section-title">
              已确认（{docBacklinks.length}）
            </div>
            {docBacklinks.map((b) => (
              <div key={b.id} className="rail-bl-item confirmed">
                <div className="rail-bl-text">{b.fromParaId} → {b.toParaId} · {b.score.toFixed(2)}</div>
                <button className="mini" onClick={() => onJumpPara(b.toParaId)}>
                  跳转
                </button>
              </div>
            ))}
            {docBacklinks.length === 0 && candidates.length === 0 && !blLoading && (
              <div className="rail-empty">暂无反链，选中文字后可检索</div>
            )}
          </div>
        )}

        {/* ── AI 对话 ── */}
        {activeTab === "ask" && (
          <div className="rail-section rail-chat">
            <div className="rail-ctx-note" title="以你选中的文字为问题背景，并向 AI 自由提问；模型同时会参考【整本书】作为上下文。">
              基于当前文章：《{doc.title}》
              {sel && <> · 选中："{" "}<em>{sel.text.slice(0, 30)}…</em>{" "}</>}
              <span className="scope-badge scope-book">全书背景</span>
            </div>
            <div className="rail-chat-messages">
              {chatMessages.map((m) => (
                <div key={m.id} className={"rail-msg " + (m.kind ? "ai-action" : "")}>
                  <div className="rail-msg-q">
                    {m.kind ? ACTION_LABELS[m.kind] || m.kind : m.q}
                  </div>
                  <div className="rail-msg-a"><Markdown text={m.a} /></div>
                </div>
              ))}
              {chatLoading && chatMessages.length > 0 && !chatMessages[chatMessages.length - 1].a && (
                <div className="rail-msg">
                  <div className="rail-msg-q">{chatMessages[chatMessages.length - 1].q}</div>
                  <div className="rail-msg-a loading">
                    <div className="rail-progress"><div className="rail-progress-bar" style={{ width: aiProgress + "%" }} /></div>
                    思考中 {Math.round(aiProgress)}%
                  </div>
                </div>
              )}
              {chatMessages.length === 0 && !chatLoading && (
                <div className="rail-empty">问点什么？AI 自动以当前文章为基础</div>
              )}
            </div>
            <div className="rail-chat-input">
              <textarea
                placeholder="提问…（基于当前文章）"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (chatInput.trim()) { onChat(chatInput.trim()); setChatInput(""); }
                  }
                }}
              />
              <button
                className="mini"
                onClick={() => { if (chatInput.trim()) { onChat(chatInput.trim()); setChatInput(""); } }}
                disabled={chatLoading}
              >
                发送
              </button>
            </div>
          </div>
        )}

        {/* ── AI 功能（总结/翻译/解释/大纲/问题） ── */}
        {activeTab === "aifeat" && (
          <div className="rail-section rail-aifeat">
            <div className="rail-section-title">AI 功能</div>
            <div className="rail-aifeat-hint">
              先选中正文中的一段文字，再点下方按钮。每个功能对「背景范围」已标注：
              <span className="scope-badge scope-book">全书</span> 表示会参考整本书，
              <span className="scope-badge scope-sel">选中</span> 表示只看你选中的内容。
            </div>
            {!sel && (
              <div className="rail-empty">请先在正文里选中一段文字，再使用以下功能。</div>
            )}
            <div className="rail-aifeat-grid">
              {AIFeatItems.map((it) => (
                <button
                  key={it.kind}
                  className="rail-aifeat-btn"
                  disabled={!sel || chatLoading}
                  title={it.tip}
                  onClick={() => { onChat("", it.kind); onTab("ask"); }}
                >
                  <span className="rail-aifeat-label">{it.label}</span>
                  <span className={"scope-badge scope-" + it.scope}>
                    {it.scope === "book" ? "全书" : "选中"}
                  </span>
                </button>
              ))}
            </div>
            <div className="rail-aifeat-note">
              运行结果会显示在「询问 AI」对话里，可继续追问。
            </div>
          </div>
        )}
        {/* ── 书签 ── */}
        {activeTab === "bookmarks" && (
          <div className="rail-section">
            <div className="rail-section-title">书签（{docBookmarks.length}）</div>
            {docBookmarks.length === 0 && (
              <div className="rail-empty">暂无书签，选中文字点「书签」或鼠标悬停段首 ★ 添加</div>
            )}
            {docBookmarks
              .slice()
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((b) => (
                <div key={b.id} className="rail-bm-item" onClick={() => onJumpPara(b.paraId)}>
                  <div className="rail-bm-meta">
                    <span className="rail-bm-ch">📍 {b.chapterTitle}</span>
                  </div>
                  <div className="rail-bm-text">
                    {b.snippet.slice(0, 80)}{b.snippet.length > 80 ? "…" : ""}
                  </div>
                  <button
                    className="mini"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveBookmark(b.id);
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </aside>
  );
}
