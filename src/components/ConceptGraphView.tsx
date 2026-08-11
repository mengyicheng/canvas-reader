import { useEffect, useMemo, useRef, useState } from "react";
import { ConceptGraph, ConceptNode } from "../types";

const W = 920;
const H = 620;

// 估算文字像素宽度（中文按全宽 ~13px，英文/数字 ~7px，空格更窄）
function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    w += c > 255 ? 13 : c === 32 ? 4 : 7;
  }
  return w;
}
// 按"全宽单位"截断长标签（中文算 1，英文算 0.55），避免溢出节点
function fitLabel(s: string, maxUnits: number): string {
  const unitsOf = (ch: string) => (ch.charCodeAt(0) > 255 ? 1 : 0.55);
  let units = 0;
  const chars = [...s];
  for (const ch of chars) units += unitsOf(ch);
  if (units <= maxUnits) return s;
  let acc = 0;
  let out = "";
  for (const ch of chars) {
    const u = unitsOf(ch);
    if (acc + u > maxUnits - 0.8) break;
    acc += u;
    out += ch;
  }
  return out + "…";
}

// 简单力导向布局：排斥 + 弹簧 + 向心，跑固定迭代次数（图规模小，同步即可）
function layout(nodes: ConceptNode[], edges: { from: string; to: string }[]): Record<string, { x: number; y: number }> {
  const n = nodes.length;
  const pos: Record<string, { x: number; y: number }> = {};
  nodes.forEach((nd, i) => {
    const ang = (i / Math.max(1, n)) * Math.PI * 2;
    pos[nd.id] = { x: W / 2 + Math.cos(ang) * 240, y: H / 2 + Math.sin(ang) * 200 };
  });
  const idx: Record<string, number> = {};
  nodes.forEach((nd, i) => (idx[nd.id] = i));
  for (let it = 0; it < 280; it++) {
    const disp: Record<string, { x: number; y: number }> = {};
    nodes.forEach((nd) => (disp[nd.id] = { x: 0, y: 0 }));
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const pa = pos[nodes[a].id], pb = pos[nodes[b].id];
        let dx = pa.x - pb.x, dy = pa.y - pb.y;
        let d = Math.hypot(dx, dy) || 0.01;
        const rep = 9000 / (d * d);
        disp[nodes[a].id].x += (dx / d) * rep;
        disp[nodes[a].id].y += (dy / d) * rep;
        disp[nodes[b].id].x -= (dx / d) * rep;
        disp[nodes[b].id].y -= (dy / d) * rep;
      }
    }
    for (const e of edges) {
      const ia = idx[e.from], ib = idx[e.to];
      if (ia === undefined || ib === undefined) continue;
      const pa = pos[nodes[ia].id], pb = pos[nodes[ib].id];
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const k = (d - 140) * 0.04;
      disp[nodes[ia].id].x += (dx / d) * k;
      disp[nodes[ia].id].y += (dy / d) * k;
      disp[nodes[ib].id].x -= (dx / d) * k;
      disp[nodes[ib].id].y -= (dy / d) * k;
    }
    for (const nd of nodes) {
      const p = pos[nd.id], dp = disp[nd.id];
      const dl = Math.hypot(dp.x, dp.y) || 0.01;
      const step = Math.min(dl, 12);
      p.x += (dp.x / dl) * step + (W / 2 - p.x) * 0.012;
      p.y += (dp.y / dl) * step + (H / 2 - p.y) * 0.012;
      p.x = Math.max(40, Math.min(W - 40, p.x));
      p.y = Math.max(40, Math.min(H - 40, p.y));
    }
  }
  return pos;
}

export default function ConceptGraphView({
  graph,
  extracting,
  onExtract,
  onOpenPara,
  onDeleteNodes,
}: {
  graph: ConceptGraph;
  extracting: boolean;
  onExtract: () => void;
  onOpenPara: (docId: string, paraId: string) => void;
  onDeleteNodes: (ids: string[]) => void;
}) {
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(() => layout(graph.nodes, graph.edges));
  const posRef = useRef(pos); posRef.current = pos;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(pan); panRef.current = pan;
  const [mode, setMode] = useState<"pan" | "select">("pan");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ type: "pan" | "node" | "marquee"; id?: string; grab?: { x: number; y: number }; startSvg?: { x: number; y: number }; startPan?: { x: number; y: number }; startClient?: { x: number; y: number }; cur?: { x: number; y: number } } | null>(null);
  const movedRef = useRef(false);

  // 图变化（如 AI 提炼）后重算布局
  useEffect(() => { setPos(layout(graph.nodes, graph.edges)); setSelected(new Set()); }, [graph]);

  // 屏幕坐标 -> 视图坐标（考虑 viewBox 平移 + meet 缩放）
  function svgPoint(e: MouseEvent): { x: number; y: number } {
    const r = svgRef.current!.getBoundingClientRect();
    const scale = Math.min(r.width / W, r.height / H);
    const offX = (r.width - W * scale) / 2;
    const offY = (r.height - H * scale) / 2;
    const vb = panRef.current;
    return {
      x: (e.clientX - r.left - offX) / scale + vb.x,
      y: (e.clientY - r.top - offY) / scale + vb.y,
    };
  }

  // 平移 / 框选（背景拖拽）
  function onDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    movedRef.current = false;
    const p = svgPoint(e as unknown as MouseEvent);
    if (mode === "pan") {
      dragRef.current = { type: "pan", startSvg: p, startPan: { ...panRef.current }, startClient: { x: e.clientX, y: e.clientY } };
    } else {
      dragRef.current = { type: "marquee", startSvg: p, cur: p };
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  function onMove(e: MouseEvent) {
    const d = dragRef.current; if (!d) return;
    const p = svgPoint(e);
    movedRef.current = true;
    if (d.type === "pan") {
      // 用「屏幕位移 / 缩放」直接换算 pan，避免引用当前 pan 造成的累积漂移
      const r = svgRef.current!.getBoundingClientRect();
      const scale = Math.min(r.width / W, r.height / H) || 1;
      const dx = (e.clientX - d.startClient!.x) / scale;
      const dy = (e.clientY - d.startClient!.y) / scale;
      setPan({ x: d.startPan!.x - dx, y: d.startPan!.y - dy });
    } else if (d.type === "marquee") {
      d.cur = p;
      setMarquee({ x0: d.startSvg!.x, y0: d.startSvg!.y, x1: p.x, y1: p.y });
    }
  }
  function onUp() {
    const d = dragRef.current;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (d && d.type === "marquee") {
      const a = d.startSvg!, b = d.cur!;
      const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
      if (maxX - minX > 5 || maxY - minY > 5) {
        const inside = graph.nodes
          .filter((nd) => { const np = posRef.current[nd.id]; return np && np.x >= minX && np.x <= maxX && np.y >= minY && np.y <= maxY; })
          .map((nd) => nd.id);
        setSelected(new Set(inside));
      } else {
        setSelected(new Set());
      }
      setMarquee(null);
    }
    dragRef.current = null;
  }

  // 节点拖动
  function onNodeDown(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    e.preventDefault();
    movedRef.current = false;
    const p = svgPoint(e as unknown as MouseEvent);
    const np = posRef.current[id];
    dragRef.current = { type: "node", id, grab: { x: p.x - np.x, y: p.y - np.y } };
    window.addEventListener("mousemove", onMoveNode);
    window.addEventListener("mouseup", onUpNode);
  }
  function onMoveNode(e: MouseEvent) {
    const d = dragRef.current; if (!d || d.type !== "node") return;
    const p = svgPoint(e);
    movedRef.current = true;
    setPos((prev) => ({ ...prev, [d.id!]: { x: p.x - d.grab!.x, y: p.y - d.grab!.y } }));
  }
  function onUpNode() {
    window.removeEventListener("mousemove", onMoveNode);
    window.removeEventListener("mouseup", onUpNode);
    dragRef.current = null;
  }

  function selectNode(id: string, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(shift ? prev : []);
      if (shift) { if (next.has(id)) next.delete(id); else next.add(id); }
      else next.add(id);
      return next;
    });
  }

  function deleteSelected() {
    if (selected.size === 0) return;
    onDeleteNodes(Array.from(selected));
    setSelected(new Set());
  }

  const edgeSet = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    graph.edges.forEach((e) => {
      (m[e.from] ||= new Set()).add(e.to);
      (m[e.to] ||= new Set()).add(e.from);
    });
    return m;
  }, [graph]);
  const neighbors = hover ? edgeSet[hover] || new Set<string>() : null;
  const selCount = selected.size;

  return (
    <div className="concept-view">
      <div className="concept-head">
        <div>
          <h2>概念图谱</h2>
          <p className="muted">
            {graph.aiGenerated
              ? "由 AI 从你的边注/反链提炼的概念与关系"
              : "由跨文章反链 + 关键词自动构建（配好 API 后可一键 AI 提炼概念）"}
            {" · "}共 {graph.nodes.length} 节点 / {graph.edges.length} 连线
          </p>
        </div>
        <div className="cg-toolbar">
          <div className="cg-mode">
            <button className={mode === "pan" ? "active" : ""} onClick={() => setMode("pan")} title="拖动空白处平移整张图">✋ 平移</button>
            <button className={mode === "select" ? "active" : ""} onClick={() => setMode("select")} title="拖拽框选节点">▢ 框选</button>
          </div>
          <button className="cg-del" disabled={selCount === 0} onClick={deleteSelected}>
            删除选中{selCount ? ` (${selCount})` : ""}
          </button>
          <button className="ghost" onClick={onExtract} disabled={extracting}>
            {extracting ? "AI 提炼中…" : "✨ AI 提炼概念"}
          </button>
        </div>
      </div>

      <div className="cg-hint muted">
        {mode === "pan"
          ? "拖空白处平移整张图 · 拖节点移动分支 · 双击段落节点打开原文"
          : "拖拽框选节点后点「删除选中」移除；按住 Shift 多选"}
      </div>

      {graph.nodes.length === 0 ? (
        <div className="concept-empty">
          还没有可成图的内容。先确认一些跨文章<b>反向链接</b>，或在阅读时写几条<b>边注</b>，图谱会从这些关联自动生长。
        </div>
      ) : (
        <svg
          ref={svgRef}
          className={"concept-svg mode-" + mode}
          viewBox={`${pan.x} ${pan.y} ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          onMouseDown={onDown}
        >
          {/* 连线 */}
          {graph.edges.map((e, i) => {
            const a = pos[e.from], b = pos[e.to];
            if (!a || !b) return null;
            const active = hover === e.from || hover === e.to;
            const inSel = selected.has(e.from) || selected.has(e.to);
            return (
              <line
                key={i}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                className={"cg-edge" + (active ? " active" : "") + (inSel ? " sel" : "")}
                stroke={active ? "var(--accent)" : "var(--border)"}
                strokeWidth={active ? 2.2 : 1}
                opacity={hover && !active ? 0.25 : 0.8}
              />
            );
          })}
          {/* 框选矩形 */}
          {marquee && (
            <rect
              className="cg-marquee"
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
            />
          )}
          {/* 节点 */}
          {graph.nodes.map((nd) => {
            const p = pos[nd.id];
            if (!p) return null;
            const isConcept = nd.kind === "concept";
            const dim = hover && !(neighbors && neighbors.has(nd.id));
            const isSel = selected.has(nd.id);
            const common = {
              key: nd.id,
              transform: `translate(${p.x},${p.y})`,
              className: "cg-node " + (isConcept ? "concept" : "para") + (isSel ? " selected" : "") + (hover === nd.id ? " hover" : ""),
              opacity: dim ? 0.3 : 1,
              onMouseEnter: () => setHover(nd.id),
              onMouseLeave: () => setHover(null),
              onMouseDown: (e: React.MouseEvent) => onNodeDown(e, nd.id),
              onClick: (e: React.MouseEvent) => { if (movedRef.current) return; e.stopPropagation(); selectNode(nd.id, (e as unknown as MouseEvent).shiftKey); },
              onDoubleClick: () => { if (!isConcept && nd.docId && nd.paraId) onOpenPara(nd.docId, nd.paraId); },
              style: { cursor: mode === "pan" ? (isConcept ? "grab" : "pointer") : "pointer" as const },
            };
            if (isConcept) {
              const disp = fitLabel(nd.label, 14);
              const w = Math.max(70, Math.min(260, textWidth(disp) + 26));
              return (
                <g {...common}>
                  <rect x={-w / 2} y={-17} width={w} height={34} rx={17} />
                  <text y={5} textAnchor="middle" className="cg-label">{disp}</text>
                </g>
              );
            }
            // para 节点：小圆点 + 下方带浅底标签，避免与连线/其他文字重叠看不清
            const disp = fitLabel(nd.label, 16);
            const w = Math.max(60, Math.min(220, textWidth(disp) + 16));
            return (
              <g {...common}>
                <circle r={10} />
                <g transform="translate(0, 19)">
                  <rect x={-w / 2} y={-11} width={w} height={22} rx={11} className="cg-para-tag" />
                  <text y={4} textAnchor="middle" className="cg-label cg-para-label">{disp}</text>
                </g>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
