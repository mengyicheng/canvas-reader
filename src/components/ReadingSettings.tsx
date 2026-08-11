import { ReaderPrefs, DEFAULT_READER_PREFS } from "../types";

const PAPERS: { key: ReaderPrefs["paper"]; label: string; swatch: string }[] = [
  { key: "default", label: "默认", swatch: "linear-gradient(135deg,#ffffff,#e9eef2)" },
  { key: "eye", label: "护眼", swatch: "linear-gradient(135deg,#cfe8d4,#a9cdb1)" },
  { key: "sepia", label: "米黄", swatch: "linear-gradient(135deg,#f3e9d2,#d8c9a3)" },
  { key: "pink", label: "淡粉", swatch: "linear-gradient(135deg,#f6e3e3,#e0c2c4)" },
  { key: "night", label: "夜间", swatch: "linear-gradient(135deg,#2a2a2a,#121212)" },
];

const FONTS: { key: string; label: string }[] = [
  { key: "system", label: "系统" },
  { key: "serif", label: "宋体" },
  { key: "sans", label: "黑体" },
  { key: "kai", label: "楷体" },
  { key: "fangsong", label: "仿宋" },
];

export default function ReadingSettings({
  prefs,
  onChange,
  onClose,
}: {
  prefs: ReaderPrefs;
  onChange: (patch: Partial<ReaderPrefs>) => void;
  onClose: () => void;
}) {
  function setFont(d: number) {
    onChange({ fontSize: Math.min(28, Math.max(12, prefs.fontSize + d)) });
  }
  function toggle(key: "bold" | "justify" | "indent" | "bionic" | "focus") {
    onChange({ [key]: !prefs[key] } as Partial<ReaderPrefs>);
  }
  return (
    <div className="reading-settings" onMouseDown={(e) => e.stopPropagation()}>
      <div className="rs-row rs-fontsize">
        <span className="rs-label">字号</span>
        <button className="rs-step" onClick={() => setFont(-1)}>A−</button>
        <span className="rs-value">{prefs.fontSize}</span>
        <button className="rs-step" onClick={() => setFont(1)}>A＋</button>
      </div>

      <div className="rs-row">
        <span className="rs-label">字体</span>
        <div className="rs-fonts">
          {FONTS.map((f) => (
            <button
              key={f.key}
              className={"rs-font" + (prefs.fontFamily === f.key ? " active" : "")}
              onClick={() => onChange({ fontFamily: f.key })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rs-row rs-toggles">
        <span className="rs-label">排版</span>
        <div className="rs-fonts">
          <button className={"rs-font" + (prefs.bold ? " active" : "")} onClick={() => toggle("bold")}>加粗</button>
          <button className={"rs-font" + (prefs.justify ? " active" : "")} onClick={() => toggle("justify")}>两端对齐</button>
          <button className={"rs-font" + (prefs.indent ? " active" : "")} onClick={() => toggle("indent")}>首行缩进</button>
        </div>
      </div>

      <div className="rs-row rs-toggles">
        <span className="rs-label">专注</span>
        <div className="rs-fonts">
          <button className={"rs-font" + (prefs.bionic ? " active" : "")} onClick={() => toggle("bionic")}>仿生</button>
          <button className={"rs-font" + (prefs.focus ? " active" : "")} onClick={() => toggle("focus")}>聚焦</button>
        </div>
      </div>

      <div className="rs-row">
        <span className="rs-label">自动滚</span>
        <input
          type="range" min={0} max={120} step={5}
          value={prefs.autopace}
          onChange={(e) => onChange({ autopace: Number(e.target.value) })}
        />
        <span className="rs-value">{prefs.autopace === 0 ? "关" : prefs.autopace}</span>
      </div>

      <div className="rs-row">
        <span className="rs-label">行间距</span>
        <input
          type="range" min={1.4} max={2.4} step={0.05}
          value={prefs.lineHeight}
          onChange={(e) => onChange({ lineHeight: Number(e.target.value) })}
        />
        <span className="rs-value">{prefs.lineHeight.toFixed(2)}</span>
      </div>

      <div className="rs-row">
        <span className="rs-label">段间距</span>
        <input
          type="range" min={0} max={20} step={1}
          value={prefs.paraSpacing}
          onChange={(e) => onChange({ paraSpacing: Number(e.target.value) })}
        />
        <span className="rs-value">{prefs.paraSpacing}px</span>
      </div>

      <div className="rs-row">
        <span className="rs-label">字间距</span>
        <input
          type="range" min={0} max={3} step={0.5}
          value={prefs.letterSpacing}
          onChange={(e) => onChange({ letterSpacing: Number(e.target.value) })}
        />
        <span className="rs-value">{prefs.letterSpacing}px</span>
      </div>

      <div className="rs-row">
        <span className="rs-label">页宽</span>
        <input
          type="range" min={560} max={960} step={20}
          value={prefs.pageWidth}
          onChange={(e) => onChange({ pageWidth: Number(e.target.value) })}
        />
        <span className="rs-value">{prefs.pageWidth}</span>
      </div>

      <div className="rs-row rs-paper-row">
        <span className="rs-label">背景</span>
        <div className="rs-papers">
          {PAPERS.map((p) => (
            <button
              key={p.key}
              title={p.label}
              className={"rs-paper" + (prefs.paper === p.key ? " active" : "")}
              style={{ background: p.swatch }}
              onClick={() => onChange({ paper: p.key })}
            />
          ))}
        </div>
      </div>

      <button className="rs-reset" onClick={() => onChange({ ...DEFAULT_READER_PREFS })}>
        恢复默认
      </button>
    </div>
  );
}
