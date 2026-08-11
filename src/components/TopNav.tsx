/**
 * TopNav — 顶部水平导航（暗色 navbar），替换原左侧 Sidebar 顶部。
 * 品牌手写体（Bricolage 重 + 手写副）/ 水平菜单 / 导入按钮 / 主题切换 / 抽屉触发。
 */
import type { ReactNode } from "react";
import { View } from "./Sidebar";
import { ImportedFile } from "../lib/platform";
import { Doc } from "../types";
import { SearchHit } from "../lib/search";

export default function TopNav({
  library,
  docs,
  currentDocId,
  view,
  embedMode,
  onImport,
  onView,
  onHome,
  onOpenDrawer,
  onSelectFile,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  searchHits,
  searchOpen,
  onPickHit,
  onCloseSearch,
}: {
  library: ImportedFile[];
  docs: Doc[];
  currentDocId: string | null;
  view: View;
  embedMode: "real" | "local" | null;
  onImport: () => void;
  onView: (v: View) => void;
  onHome: () => void;
  onOpenDrawer: () => void;
  onSelectFile: (f: ImportedFile) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: (q: string) => void;
  searchHits: SearchHit[];
  searchOpen: boolean;
  onPickHit: (h: SearchHit) => void;
  onCloseSearch: () => void;
}) {
  return (
    <header className="topnav">
      {/* 左：品牌 + 主题切换 */}
      <div className="topnav-left">
        <button className="brand-btn" onClick={onHome} title="返回文库（首屏）">
          <span className="brand-mark">📖</span>
          <span className="brand-script">Wander &amp; Read</span>
          <span className="brand-sub">画布阅读</span>
        </button>
      </div>

      {/* 中：水平菜单（仿参考图：DESTINATIONS / STORIES / JOURNAL / ABOUT） */}
      <nav className="topnav-menu">
        <button className={view === "reader" ? "active" : ""} onClick={() => onView("reader")}>
          <i>✦</i>阅读
        </button>
        <button className={view === "canvas" ? "active" : ""} onClick={() => onView("canvas")}>
          <i>✦</i>画布
        </button>
        <button className={view === "review" ? "active" : ""} onClick={() => onView("review")}>
          <i>✦</i>复习
        </button>
        <button className={view === "concepts" ? "active" : ""} onClick={() => onView("concepts")}>
          <i>✦</i>概念
        </button>
        <button className={view === "settings" ? "active" : ""} onClick={() => onView("settings")}>
          <i>✦</i>设置
        </button>
      </nav>

      {/* 中右：跨书检索（语义 + 全文） */}
      <div className="topnav-search">
        <div className="search-box">
          <span className="search-ico">🔍</span>
          <input
            className="search-input"
            type="text"
            placeholder="跨书检索…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSearchSubmit(searchQuery); if (e.key === "Escape") onCloseSearch(); }}
          />
          {searchQuery && (
            <button className="search-clear" onClick={onCloseSearch} title="清除">✕</button>
          )}
        </div>
        {searchOpen && searchHits.length > 0 && (
          <div className="search-results">
            {groupHits(searchHits).map(([docId, title, items]) => (
              <div className="search-group" key={docId}>
                <div className="search-group-title">📚 {title} <span className="search-group-count">{items.length}</span></div>
                {items.map((h) => (
                  <button className="search-hit" key={h.paraId} onClick={() => onPickHit(h)}>
                    <span className="search-hit-ch">{h.chapterTitle}</span>
                    <span className="search-hit-text">{h.matched ? highlight(h.text, searchQuery) : h.text.slice(0, 90)}</span>
                    <span className="search-hit-score">{(h.score * 100).toFixed(0)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        {searchOpen && searchQuery && searchHits.length === 0 && (
          <div className="search-results"><div className="search-empty">没有匹配的段落</div></div>
        )}
      </div>

      {/* 右：导入按钮（仿参考图 LET'S PLAN CTA） */}
      <div className="topnav-right">
        <button className="import-cta" onClick={onImport}>
          LET'S READ <span className="arrow">→</span>
        </button>
      </div>
    </header>
  );
}

function groupHits(hits: SearchHit[]): [string, string, SearchHit[]][] {
  const groups: [string, string, SearchHit[]][] = [];
  for (const h of hits) {
    const last = groups[groups.length - 1];
    if (last && last[0] === h.docId) last[2].push(h);
    else groups.push([h.docId, h.docTitle, [h]]);
  }
  return groups;
}

function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text.slice(0, 90);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 90);
  const end = Math.min(text.length, i + q.length);
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, end)}</mark>
      {text.slice(end, end + 60)}
      {text.length > end + 60 ? "…" : ""}
    </>
  );
}
