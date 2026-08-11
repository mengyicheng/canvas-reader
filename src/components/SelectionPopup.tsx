import React, { useState, useRef, useEffect } from "react";

export type PopupAction =
  | "ask" | "aifeat" | "annotate" | "backlink" | "bookmark" | "highlight";

export interface SelectionInfo {
  paraId: string;
  docId: string;
  chapterId: string;
  text: string;
  x: number;
  y: number;
}

export default function SelectionPopup({
  sel,
  onAction,
  onClose,
}: {
  sel: SelectionInfo;
  onAction: (a: PopupAction) => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ x: sel.x, y: sel.y });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 选择结束后锚定到选区位置，不随鼠标移动（只有按住拖拽手柄才移动）
  // 初始即做视口边界 clamp，避免选区在底部/右侧时浮框溢出屏幕
  useEffect(() => {
    const x = Math.max(8, Math.min(sel.x, window.innerWidth - 250));
    const y = Math.max(8, Math.min(sel.y, window.innerHeight - 170));
    setPos({ x, y });
  }, [sel.x, sel.y]);

  function onDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  }
  function onMove(e: MouseEvent) {
    if (!drag.current) return;
    let nx = e.clientX - drag.current.dx;
    let ny = e.clientY - drag.current.dy;
    nx = Math.max(8, Math.min(nx, window.innerWidth - 250));
    ny = Math.max(8, Math.min(ny, window.innerHeight - 170));
    setPos({ x: nx, y: ny });
  }
  function onUp() { drag.current = null; }

  // Esc 关闭
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 点击弹框外部关闭（点文档其他处不会让它一直挂着）
  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    // 延迟一拍，避免「刚选中文字的 mousedown」立刻把它关掉
    const t = setTimeout(() => document.addEventListener("mousedown", onDocDown), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDocDown); };
  }, [onClose]);

  useEffect(() => {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  });

  return (
    <div
      ref={rootRef}
      className="sel-popup"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <button className="sel-popup-close" onClick={onClose} title="关闭">✕</button>
      <div className="sel-popup-handle" title="拖动我" onMouseDown={onDown}>✥</div>
      <div className="sel-popup-btns">
        <button className="ai-ask-btn" onClick={() => onAction("ask")}>询问 AI</button>
        <button className="ai-feat-btn" onClick={() => onAction("aifeat")} title="总结 / 翻译 / 解释 / 大纲 / 问题（基于选中内容）">AI 功能</button>
        <button onClick={() => onAction("annotate")}>边注</button>
        <button onClick={() => onAction("bookmark")}>书签</button>
        <button className="hl-action" onClick={() => onAction("highlight")}>划线</button>
        <button onClick={() => onAction("backlink")}>反向链接</button>
      </div>
    </div>
  );
}
