import { useMemo, useRef, useState } from "react";
import { Doc, Annotation, Backlink } from "../types";
import { ScrollReveal } from "./effects/ScrollReveal";

export default function CanvasView({
  docs,
  backlinks,
  annotations,
  onOpenPara,
}: {
  docs: Doc[];
  backlinks: Backlink[];
  annotations: Record<string, Annotation[]>;
  onOpenPara: (docId: string, paraId: string) => void;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(40);
  const [ty, setTy] = useState(40);
  const [selected, setSelected] = useState<string | null>(null);
  // 用户拖动的节点位置覆盖（键为 paraId），未拖动的节点用自动布局坐标
  const [posOverride, setPosOverride] = useState<Record<string, { x: number; y: number }>>({});
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const nodeDrag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const { pos, edges, annPara } = useMemo(() => {
    const paraMap = new Map<string, { text: string; docId: string; docTitle: string }>();
    for (const d of docs)
      for (const c of d.chapters)
        for (const p of c.paragraphs)
          paraMap.set(p.id, { text: p.text, docId: d.id, docTitle: d.title });

    const nodeSet = new Set<string>();
    for (const k of Object.keys(annotations)) nodeSet.add(k);
    for (const b of backlinks) {
      nodeSet.add(b.fromParaId);
      nodeSet.add(b.toParaId);
    }

    const confirmed = backlinks.filter((b) => b.confirmed);
    const edges = confirmed
      .filter((b) => nodeSet.has(b.fromParaId) && nodeSet.has(b.toParaId))
      .map((b) => ({ from: b.fromParaId, to: b.toParaId, score: b.score }));

    // 布局：按文章分列，节点纵向堆叠
    const pos = new Map<string, { x: number; y: number; label: string; docTitle: string }>();
    const byDoc = new Map<string, string[]>();
    for (const id of nodeSet) {
      const info = paraMap.get(id);
      if (!info) continue;
      if (!byDoc.has(info.docId)) byDoc.set(info.docId, []);
      byDoc.get(info.docId)!.push(id);
    }
    const docList = docs.filter((d) => byDoc.has(d.id));
    docList.forEach((d, di) => {
      const ids = byDoc.get(d.id)!;
      ids.forEach((id, ni) => {
        pos.set(id, {
          x: di * 360 + 120,
          y: ni * 92 + 80,
          label: (paraMap.get(id)?.text || "").slice(0, 60),
          docTitle: d.title,
        });
      });
    });

    const annPara = new Set(Object.keys(annotations));
    return { pos, edges, annPara, paraMap };
  }, [docs, backlinks, annotations]);

  const findPara = (id: string) =>
    docs.flatMap((d) => d.chapters.flatMap((c) => c.paragraphs)).find((x) => x.id === id);

  if (pos.size === 0) {
    return (
      <div className="canvas-empty">
        画布暂无节点。回到阅读态，给段落写边注或确认反向链接后，这里会生长出你的知识网络。
      </div>
    );
  }

  function onNodeMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation(); // 阻止冒泡到画布，避免触发整图平移
    const ef = posOverride[id] ?? pos.get(id);
    if (!ef) return;
    nodeDrag.current = { id, sx: e.clientX, sy: e.clientY, ox: ef.x, oy: ef.y, moved: false };
  }

  function onMove(e: React.MouseEvent) {
    if (nodeDrag.current) {
      const dx = e.clientX - nodeDrag.current.sx;
      const dy = e.clientY - nodeDrag.current.sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) nodeDrag.current.moved = true;
      const nx = nodeDrag.current.ox + dx / scale;
      const ny = nodeDrag.current.oy + dy / scale;
      const id = nodeDrag.current.id;
      setPosOverride((o) => ({ ...o, [id]: { x: nx, y: ny } }));
      return;
    }
    if (drag.current) {
      setTx(drag.current.tx + (e.clientX - drag.current.x));
      setTy(drag.current.ty + (e.clientY - drag.current.y));
    }
  }

  function onUp() {
    if (nodeDrag.current) {
      // 仅单击（未拖动）→ 选中节点；拖动过 → 保留新位置，不跳原文
      if (!nodeDrag.current.moved) setSelected(nodeDrag.current.id);
      nodeDrag.current = null;
    }
    drag.current = null;
  }

  return (
    <div
      className="canvas"
      onWheel={(e) => {
        const f = e.deltaY < 0 ? 1.1 : 0.9;
        setScale((s) => Math.min(2.5, Math.max(0.3, s * f)));
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        setSelected(null);
        drag.current = { x: e.clientX, y: e.clientY, tx, ty };
      }}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={() => {
        if (nodeDrag.current) nodeDrag.current = null;
        drag.current = null;
      }}
    >
      <div className="canvas-world" style={{ transform: `translate(${tx}px,${ty}px) scale(${scale})` }}>
        <svg className="canvas-edges">
          {edges.map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(26,188,156,0.6)"
                strokeWidth={1 + e.score}
              />
            );
          })}
        </svg>
        {Array.from(pos.entries()).map(([id, p], ni) => {
          const ef = posOverride[id] ?? p;
          const anns = annotations[id] || [];
          return (
            <ScrollReveal key={id} className="node-reveal" delay={ni * 50} fade>
            <div
              className={
                "node" +
                (annPara.has(id) ? " has-ann" : "") +
                (selected === id ? " selected" : "")
              }
              style={{ left: ef.x, top: ef.y }}
              title={p.docTitle}
              onMouseDown={(e) => onNodeMouseDown(e, id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                const info = findPara(id);
                if (info) onOpenPara(info.docId, id);
              }}
            >
              <div className="node-doc">{p.docTitle}</div>
              {anns.length > 0 ? (
                <>
                  <div className={"node-ann" + (anns[0].type === "ai_summary" ? " ai" : "")}>
                    {anns[0].type === "ai_summary" && <span className="ann-tag">AI</span>}
                    {anns[0].text}
                  </div>
                  {anns.length > 1 && <div className="node-more">＋{anns.length - 1} 条边注</div>}
                </>
              ) : (
                <div className="node-text">{p.label}</div>
              )}
            </div>
            </ScrollReveal>
          );
        })}
      </div>
      <div className="canvas-hint">滚轮缩放 · 空白拖拽平移 · 拖动节点移动 · 单击选中 · 双击回原文</div>
    </div>
  );
}
