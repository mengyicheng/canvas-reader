import { useState, ReactNode } from "react";
import { Doc } from "../types";
import { ImportedFile } from "../lib/platform";
import { docIdFor } from "../lib/parse";
import { buildFileTree, TreeNode } from "../lib/tree";
import { BlurText } from "./effects/BlurText";

export type View = "reader" | "canvas" | "settings" | "review" | "concepts" | "library";

export default function Sidebar({
  open = false,
  variant = "drawer",
  library,
  docs,
  currentDocId,
  view,
  embedMode,
  onImport,
  onSelectFile,
  onView,
  onHome,
  onExportAll,
  onExportArchive,
  onImportArchive,
  onClose,
}: {
  open?: boolean;
  variant?: "drawer" | "column";
  library: ImportedFile[];
  docs: Doc[];
  currentDocId: string | null;
  view: View;
  embedMode: "real" | "local" | null;
  onImport: () => void;
  onSelectFile: (f: ImportedFile) => void;
  onView: (v: View) => void;
  onHome: () => void;
  onExportAll: () => void;
  onExportArchive: () => void;
  onImportArchive: () => void;
  onClose: () => void;
}) {
  const tree = buildFileTree(library);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNode(node: TreeNode, depth: number): ReactNode {
    const pad = 8 + depth * 14;
    if (node.type === "folder") {
      const isOpen = expanded.has(node.path);
      return (
        <div key={node.path}>
          <div
            className="tree-row folder"
            style={{ paddingLeft: pad }}
            onClick={() => toggle(node.path)}
          >
            <span className="tree-caret">{isOpen ? "▾" : "▸"}</span>
            <span className="tree-ico">📁</span>
            <span className="tree-name">{node.name}</span>
          </div>
          {isOpen && node.children?.map((c) => renderNode(c, depth + 1))}
        </div>
      );
    }
    const f = node.file!;
    const id = docIdFor(f.path);
    const opened = docs.some((d) => d.id === id);
    return (
      <div
        key={node.path}
        className={"tree-row file" + (id === currentDocId ? " active" : "")}
        style={{ paddingLeft: pad + 14 }}
        onClick={() => { onSelectFile(f); onClose(); }}
      >
        <span className="tree-ico">{f.ext === ".epub" ? "📕" : f.ext === ".pdf" ? "📗" : "📄"}</span>
        <span className="tree-name">{node.name.replace(/\.[^.]+$/, "")}</span>
        <span className="tree-ext">{f.ext}</span>
        {!opened && <span className="doc-dot" title="未解析，点击打开">·</span>}
      </div>
    );
  }

  return (
    <>
      <div className={"drawer-mask " + (open ? "show" : "")} onClick={onClose} aria-hidden />
      <aside className={variant === "column" ? "drawer sidebar-col" : "drawer " + (open ? "show" : "")}>
        <div className="drawer-head">
          <div className="brand"><BlurText text="画布阅读" /></div>
          <button className="drawer-close" onClick={onClose} title="关闭">✕</button>
        </div>
        <button className="import-btn" onClick={onImport}>＋ 导入读书库</button>
        <div className="drawer-row">
          <button className="export-btn" onClick={onExportAll} disabled={docs.length === 0} title="导出整库为 Obsidian Markdown">
            ⬇ 导出 MD
          </button>
          <button className="export-btn" onClick={onExportArchive} title="导出读书存档（含笔记/进度/向量）">
            ⬇ 存档
          </button>
        </div>
        <button className="export-btn ghost-archive" onClick={onImportArchive} title="导入读书存档 JSON">
          ⬆ 导入存档
        </button>

        {/* 主导航已上移至顶部 TopNav（阅读/画布/复习/概念/设置），避免重复 */}

        <div className="doc-list">
          <div className="doc-list-h">我的文库（{library.length}）</div>
          {tree.map((n) => renderNode(n, 0))}
          {library.length === 0 && (
            <div className="hint">点击「＋ 导入读书库」选择文件夹（含子文件夹）。点文件夹可逐层展开，点文件打开书籍。</div>
          )}
        </div>

        <div className="embed-badge">
          向量：{embedMode ? (embedMode === "real" ? "真实模型" : "本地关键词(演示)") : "未建"}
        </div>
      </aside>
    </>
  );
}
