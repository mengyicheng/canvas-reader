import { useEffect, useRef, useState, useCallback, memo } from "react";
import { Doc, Annotation, ReaderPrefs, fontStack, Para } from "../types";
import type { SelectionInfo } from "./SelectionPopup";

const TEXT_KINDS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "quote", "li"]);

/* ---------- 纯文本渲染（仿生阅读 / 行内富文本），模块级函数，避免随段落重渲染重建 ---------- */

function bionicNodes(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /[一-鿿㐀-䶿]+|[A-Za-z0-9]+|\s+|[^\s]/g;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    const tok = m[0];
    if (/^\s+$/.test(tok)) { out.push(tok); continue; }
    const isWord = /^[A-Za-z0-9]+$/.test(tok);
    const isCjk = /[一-鿿㐀-䶿]/.test(tok);
    if (isWord || isCjk) {
      if (tok.length <= 1) { out.push(tok); continue; }
      const ratio = isCjk ? 0.35 : 0.4;
      const cut = Math.max(1, Math.round(tok.length * ratio));
      out.push(<b key={"b" + k++} className="r-bionic">{tok.slice(0, cut)}</b>);
      out.push(tok.slice(cut));
    } else {
      out.push(tok);
    }
  }
  return out;
}
function renderText(text: string, bionic: boolean): React.ReactNode {
  return bionic ? bionicNodes(text) : text;
}
function renderLines(text: string, bionic: boolean) {
  const parts = text.split("\n");
  return parts.map((part, i) =>
    i === 0 ? renderText(part, bionic) : <span key={i}><br />{renderText(part, bionic)}</span>
  );
}
function renderSegs(segs: import("../types").RichSeg[], bionic: boolean) {
  const out: React.ReactNode[] = [];
  segs.forEach((s, i) => {
    const parts = s.t.split("\n");
    parts.forEach((part, j) => {
      if (j > 0) out.push(<br key={`${i}-br-${j}`} />);
      if (!part) return;
      const cls = (s.b ? "r-b " : "") + (s.i ? "r-i" : "");
      out.push(<span key={`${i}-${j}`} className={cls || undefined}>{renderText(part, bionic)}</span>);
    });
  });
  return out;
}
function renderContent(p: Para, bionic: boolean) {
  if (p.rich && p.rich.length) return renderSegs(p.rich, bionic);
  return renderLines(p.text, bionic);
}

/* ---------- 划线渲染：把 type=highlight 的 annotation 在段落里包成 <mark> ---------- */

// 计算划线在纯文本中的区间（按首次出现匹配，合并重叠）
function hlRanges(text: string, hl: { id: string; text: string }[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const h of hl) {
    const t = (h.text || "").trim();
    if (!t) continue;
    const idx = text.indexOf(t);
    if (idx >= 0) ranges.push([idx, idx + t.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

// 按行渲染，遇划线区间用 <mark> 包裹（正确处理换行）
function renderWithHL(p: Para, ranges: [number, number][], bionic: boolean): React.ReactNode {
  const text = p.text;
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let gi = 0; // 全局索引（含已跳过的 \n）
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const ls = gi;
    const le = ls + line.length;
    const lineRanges = ranges
      .filter((r) => r[1] > ls && r[0] < le)
      .map((r) => [Math.max(r[0], ls) - ls, Math.min(r[1], le) - ls] as [number, number]);
    const segs: React.ReactNode[] = [];
    let i = 0;
    let k = 0;
    for (const [s, e] of lineRanges) {
      if (s > i) segs.push(renderText(line.slice(i, s), bionic));
      segs.push(<mark key={"hl" + li + "-" + k++} className="hl">{renderText(line.slice(s, e), bionic)}</mark>);
      i = e;
    }
    if (i < line.length) segs.push(renderText(line.slice(i), bionic));
    out.push(
      <span key={"l" + li}>
        {segs}
        {li < lines.length - 1 ? <br /> : null}
      </span>
    );
    gi = le + 1; // +1 跳过 \n
  }
  return out;
}
function textClass(kind?: string): string {
  if (!kind || kind === "p") return "para-text r-p";
  if (kind === "quote") return "para-text r-quote";
  if (kind === "li") return "para-text r-li";
  if (/^h[1-6]$/.test(kind)) return "para-text r-" + kind;
  return "para-text r-p";
}

/* ---------- 单段：memo 化，App 任意状态变化不会让它无谓重渲染 ---------- */

const ParaView = memo(function ParaView({
  p,
  anns,
  bl,
  marked,
  bionic,
  onToggle,
  onSelect,
}: {
  p: Para;
  anns: Annotation[];
  bl: number;
  marked: boolean;
  bionic: boolean;
  onToggle: (id: string) => void;
  onSelect: (sel: SelectionInfo) => void;
}) {
  const kind = p.kind || "p";
  const hl = anns.filter((a) => a.type === "highlight");
  const ranges = hl.length ? hlRanges(p.text, hl) : [];
  return (
    <div
      className={"para" + (marked ? " bookmarked" : "")}
      data-para-id={p.id}
      data-doc-id={p.docId}
      data-chapter-id={p.chapterId}
    >
      <button
        className={"para-bm-btn" + (marked ? " on" : "")}
        title={marked ? "取消书签" : "加书签"}
        onClick={(e) => { e.stopPropagation(); onToggle(p.id); }}
      >
        {marked ? "★" : "☆"}
      </button>
      {kind === "img" && p.src && (
        <img className="para-img" src={p.src} alt={p.alt || ""} />
      )}
      {kind === "hr" && <hr className="para-hr" />}
      {kind === "code" && (
        <pre className="para-code">{p.text}</pre>
      )}
      {kind === "table" && p.rows && p.rows.length > 0 && (
        <table className="para-table">
          <tbody>
            {p.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci2) => (
                  <td key={ci2}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {TEXT_KINDS.has(kind) && (
        <p className={textClass(kind)}>
          {ranges.length ? renderWithHL(p, ranges, bionic) : renderContent(p, bionic)}
        </p>
      )}
      {bl > 0 && <span className="bl-badge" title="已确认的反向链接">🔗 {bl}</span>}
      {anns.length > 0 && (
        <div className="ann-list">
          {anns.map((a) => (
            <div key={a.id} className={"ann " + a.type}>
              {a.type === "ai_summary" && <span className="ann-tag">AI</span>}
              {a.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

/* ---------- Reader 容器 ---------- */

export default function Reader({
  doc,
  annotations,
  blCountMap,
  panelPinned,
  prefs,
  onSelect,
  onProgress,
  scrollToParaId,
  scrollToChapterId,
  bookmarkSet,
  onToggleBookmark,
}: {
  doc: Doc;
  annotations: Record<string, Annotation[]>;
  blCountMap: Map<string, number>;
  panelPinned: boolean;
  prefs: ReaderPrefs;
  onSelect: (sel: SelectionInfo) => void;
  onProgress: (docId: string, paraId: string) => void;
  scrollToParaId: string | null;
  scrollToChapterId: string | null;
  bookmarkSet: Set<string>;
  onToggleBookmark: (paraId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pacing, setPacing] = useState(false);

  // 用 ref 持有最新回调，派生出「永远稳定」的回调传给 ParaView，避免回调变化击穿 memo
  const cbRef = useRef({ onSelect, onToggleBookmark });
  cbRef.current = { onSelect, onToggleBookmark };
  const stableSelect = useCallback((sel: SelectionInfo) => cbRef.current.onSelect(sel), []);
  const stableToggle = useCallback((id: string) => cbRef.current.onToggleBookmark(id), []);

  // 打开书后恢复到上次阅读位置（依赖 doc.id；先回顶，避免沿用上一本的滚动位置到文章底部）
  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current.closest(".read-scroll") as HTMLElement | null;
    if (!container) return;
    container.scrollTop = 0;
    const target = scrollToParaId;
    if (!target) return;
    let tries = 0;
    let raf = 0;
    const attempt = () => {
      const el = ref.current?.querySelector(`[data-para-id="${target}"]`) as HTMLElement | null;
      if (el) {
        const top = el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2;
        container.scrollTop = Math.max(0, top);
        return;
      }
      if (tries++ < 40) raf = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(raf);
  }, [doc.id, scrollToParaId]);

  // 目录跳章：点击右侧栏章节列表后滚动到对应 chapter section
  useEffect(() => {
    if (!scrollToChapterId || !ref.current) return;
    const el = ref.current.querySelector(`[data-chapter-id="${scrollToChapterId}"]`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [scrollToChapterId]);

  // 自动滚动（autopace）：按设定速度平滑下滚，到底自动停止
  useEffect(() => {
    if (!pacing || prefs.autopace <= 0) return;
    const container = ref.current?.closest(".read-scroll") as HTMLElement | null;
    if (!container) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      container.scrollTop += prefs.autopace * dt;
      if (container.scrollTop + container.clientHeight < container.scrollHeight - 1) {
        raf = requestAnimationFrame(step);
      } else {
        setPacing(false);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pacing, prefs.autopace]);

  // 自动滚动：autopace>0 即自动开始，=0 即停止（无需额外点按钮）
  useEffect(() => {
    setPacing(prefs.autopace > 0);
  }, [prefs.autopace]);

  // 聚焦模式：淡出视口中心以外的段落，强化专注（rAF 节流，避免每次 scroll 全量扫描）
  useEffect(() => {
    const container = ref.current?.closest(".read-scroll") as HTMLElement | null;
    if (!container) return;
    if (!prefs.focus) {
      container.querySelectorAll(".para.focus-dim, .para.focus-active").forEach((e) => e.classList.remove("focus-dim", "focus-active"));
      return;
    }
    const update = () => {
      const paras = Array.from(ref.current?.querySelectorAll(".para") || []) as HTMLElement[];
      const mid = container.scrollTop + container.clientHeight / 2;
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const p of paras) {
        const r = p.getBoundingClientRect();
        const cm = r.top + r.height / 2;
        const dist = Math.abs(cm - mid);
        if (dist < bestDist) { bestDist = dist; best = p; }
      }
      paras.forEach((p) => {
        const active = p === best;
        p.classList.toggle("focus-dim", !active);
        p.classList.toggle("focus-active", active);
      });
    };
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => container.removeEventListener("scroll", onScroll);
  }, [prefs.focus, doc.id]);

  // 阅读进度上报：滚动时把视口顶部可见段落上报（rAF 节流）
  const onProgressRef = useRef(onProgress); onProgressRef.current = onProgress;
  useEffect(() => {
    const container = ref.current?.closest(".read-scroll") as HTMLElement | null;
    if (!container) return;
    let last = "";
    const report = () => {
      const paras = Array.from(ref.current?.querySelectorAll(".para") || []) as HTMLElement[];
      const line = container.scrollTop + 80;
      let topId = "";
      for (const p of paras) {
        const r = p.getBoundingClientRect();
        if (r.top <= line) topId = p.dataset.paraId || "";
        else break;
      }
      if (topId && topId !== last) { last = topId; onProgressRef.current(doc.id, topId); }
    };
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { report(); ticking = false; });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    report();
    return () => container.removeEventListener("scroll", onScroll);
  }, [doc.id]);

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length < 2) return;
    let node: Node | null = sel.anchorNode;
    let el: HTMLElement | null = null;
    while (node) {
      if (node instanceof HTMLElement && node.dataset.paraId) {
        el = node;
        break;
      }
      node = node.parentNode;
    }
    if (!el) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    onSelect({
      paraId: el.dataset.paraId!,
      docId: el.dataset.docId!,
      chapterId: el.dataset.chapterId!,
      text,
      x: Math.min(rect.right + 6, window.innerWidth - 230),
      y: Math.max(rect.top - 44, 8),
    });
  }

  const bionic = !!prefs.bionic;

  return (
    <div
      className="reader"
      ref={ref}
      onMouseUp={handleMouseUp}
      style={{
        fontSize: prefs.fontSize + "px",
        fontFamily: fontStack(prefs.fontFamily),
        lineHeight: prefs.lineHeight,
        maxWidth: prefs.pageWidth + "px",
        ["--r-para-gap" as any]: prefs.paraSpacing + "px",
        ["--r-bold" as any]: prefs.bold ? "700" : "400",
        ["--r-indent" as any]: prefs.indent ? "2em" : "0",
        ["--r-align" as any]: prefs.justify ? "justify" : "left",
        ["--r-letter" as any]: prefs.letterSpacing + "px",
      } as React.CSSProperties}
    >
      <h1 className="doc-title">{doc.title}</h1>
      {doc.chapters.map((c) => (
        <section key={c.id} className="chapter" data-chapter-id={c.id}>
          <h2 className="chapter-title">{c.title}</h2>
          {c.paragraphs.map((p) => (
            <ParaView
              key={p.id}
              p={p}
              anns={annotations[p.id] || []}
              bl={blCountMap.get(p.id) || 0}
              marked={bookmarkSet.has(p.id)}
              bionic={bionic}
              onToggle={stableToggle}
              onSelect={stableSelect}
            />
          ))}
        </section>
      ))}
      {prefs.autopace > 0 && (
        <button className="autopace-btn" onClick={() => setPacing((v) => !v)} title="自动滚动（autopace）">
          {pacing ? "⏸ 暂停" : "▶ 自动滚动"}
        </button>
      )}
    </div>
  );
}
