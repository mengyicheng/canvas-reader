import { Doc } from "../types";
import { ImportedFile } from "../lib/platform";
import { docIdFor } from "../lib/parse";

/**
 * LibraryView — 「我的书籍」网格视图（顶部 Library 菜单进入，而非首屏 Hero）。
 * 展示已导入的书籍卡片，点击打开；顶部可回到当前正在读的书或继续导入。
 */
export default function LibraryView({
  library,
  docs,
  currentDocTitle,
  onSelectFile,
  onImport,
  onResume,
}: {
  library: ImportedFile[];
  docs: Doc[];
  currentDocTitle?: string | null;
  onSelectFile: (f: ImportedFile) => void;
  onImport: () => void;
  onResume: () => void;
}) {
  const openedIds = new Set(docs.map((d) => d.id));

  return (
    <div className="lib-view">
      <div className="lib-view-head">
        <div>
          <h1 className="lib-view-title">我的书籍</h1>
          <p className="lib-view-sub">你的读书库 · 共 {library.length} 个文件</p>
        </div>
        <div className="lib-view-actions">
          {currentDocTitle && (
            <button className="ghost" onClick={onResume} title="回到正在读的书">← 回到《{currentDocTitle}》</button>
          )}
          <button className="import-cta" onClick={onImport}>
            ＋ 导入读书库 <span className="arrow">→</span>
          </button>
        </div>
      </div>

      {library.length === 0 ? (
        <div className="lib-view-empty">
          <div className="lib-empty-ico">📚</div>
          <h2>书房还空着</h2>
          <p>导入一个含 EPUB / PDF 的文件夹，开始你的画布阅读之旅。</p>
          <button className="hero-cta" onClick={onImport}>导入读书库 <span className="arrow">→</span></button>
        </div>
      ) : (
        <div className="lib-grid">
          {library.map((f) => {
            const id = docIdFor(f.path);
            const opened = openedIds.has(id);
            const doc = docs.find((d) => d.id === id);
            const chapCount = doc ? doc.chapters.length : 0;
            return (
              <button key={f.path} className="book-card" onClick={() => onSelectFile(f)}>
                <div className={"book-cover " + (f.ext === ".pdf" ? "pdf" : f.ext === ".epub" ? "epub" : "txt")}>
                  <span className="book-ext">{f.ext.replace(".", "").toUpperCase()}</span>
                  <span className="book-cover-title">{f.name.replace(/\.[^.]+$/, "")}</span>
                </div>
                <div className="book-meta">
                  <div className="book-name">{f.name.replace(/\.[^.]+$/, "")}</div>
                  <div className="book-info">
                    {opened ? (
                      <>{chapCount} 章 · <span className="book-opened">已解析</span></>
                    ) : (
                      <span className="book-unopened">未打开</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
