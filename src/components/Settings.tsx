import { useState } from "react";
import { Settings } from "../types";
import { fetchModels } from "../lib/ai";

const PRESETS = {
  deepseek: { label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat", apiHeader: "Authorization" },
  mimo: { label: "小米 MiMo", baseURL: "https://api.xiaomimimo.com/v1", model: "mimo-v2.5-pro", apiHeader: "api-key" },
} as const;

export default function SettingsView({
  settings,
  update,
  dataDir,
  onPickDataDir,
  onClearDataDir,
  onExportArchive,
  onImportArchive,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  dataDir: string | null;
  onPickDataDir: () => void;
  onClearDataDir: () => void;
  onExportArchive: () => void;
  onImportArchive: () => void;
}) {
  const s = settings;
  const [models, setModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function applyPreset(k: keyof typeof PRESETS) {
    const p = PRESETS[k];
    update({ baseURL: p.baseURL, model: p.model, apiHeader: p.apiHeader });
    setNote(`已填入「${p.label}」预设（BaseURL / 模型 / 鉴权头）。点「获取模型」可拉取真实模型列表。`);
  }

  async function onFetch() {
    setFetching(true);
    setNote(null);
    const list = await fetchModels(s.baseURL, s.apiKey, s.apiHeader);
    setFetching(false);
    setModels(list);
    if (list.length) {
      update({ model: list[0] });
      setNote(`已获取 ${list.length} 个可用模型，默认选第一个：${list[0]}`);
    } else {
      setNote("未获取到模型。请检查 BaseURL、API Key 与网络（部分平台用 api-key 而非 Bearer 鉴权）。");
    }
  }

  return (
    <div className="settings">
      <h1>API 接入设置</h1>

      <section>
        <h3>AI 对话 / 总结</h3>
        <div className="preset-row">
          <span>一键预设：</span>
          <button className="ghost" type="button" onClick={() => applyPreset("deepseek")}>DeepSeek</button>
          <button className="ghost" type="button" onClick={() => applyPreset("mimo")}>小米 MiMo</button>
        </div>
        <label>API Key
          <input value={s.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder="sk-... 或 tp-..." />
        </label>
        <label>BaseURL（OpenAI 兼容）
          <input value={s.baseURL} onChange={(e) => update({ baseURL: e.target.value })} placeholder="https://api.deepseek.com/v1" />
        </label>
        <label>模型
          <input value={s.model} onChange={(e) => update({ model: e.target.value })} placeholder="deepseek-chat" list="model-options" />
          <datalist id="model-options">{models.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        <button className="ghost" type="button" disabled={fetching} onClick={onFetch}>
          {fetching ? "获取中…" : "获取可用模型"}
        </button>
        <p className="tip">鉴权头：<b>{s.apiHeader}</b>。DeepSeek/OpenAI 用 <code>Authorization</code>（Bearer）；小米 MiMo 用 <code>api-key</code>。点预设会自动切换。</p>
        {note && <p className="tip" style={{ color: "var(--accent)" }}>{note}</p>}
      </section>

      <section>
        <h3>语义向量（反向链接用）</h3>
        <div className="radio-row">
          <label><input type="radio" checked={s.embedProvider === "ollama"} onChange={() => update({ embedProvider: "ollama" })} /> 本地 Ollama（免费离线）</label>
          <label><input type="radio" checked={s.embedProvider === "openai"} onChange={() => update({ embedProvider: "openai" })} /> OpenAI 兼容 API（快但花钱）</label>
        </div>
        <label>Embedding BaseURL
          <input value={s.embedBaseURL} onChange={(e) => update({ embedBaseURL: e.target.value })} placeholder={s.embedProvider === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1"} />
        </label>
        <label>Embedding 模型
          <input value={s.embedModel} onChange={(e) => update({ embedModel: e.target.value })} placeholder={s.embedProvider === "ollama" ? "nomic-embed-text" : "text-embedding-3-small"} />
        </label>
        <p className="tip">若两项都未配置或调用失败，将自动回退到本地关键词向量（演示可用，跨文相似度较粗）。</p>
      </section>

      <section>
        <h3>反链检索</h3>
        <label>相似度阈值：{s.similarityThreshold.toFixed(2)}
          <input type="range" min={0.3} max={0.95} step={0.05} value={s.similarityThreshold} onChange={(e) => update({ similarityThreshold: parseFloat(e.target.value) })} />
        </label>
        <label>Top-K 候选数
          <input type="number" min={1} max={20} value={s.topK} onChange={(e) => update({ topK: parseInt(e.target.value) || 5 })} />
        </label>
      </section>

      <section>
        <h3>建向量时机</h3>
        <div className="radio-row">
          <label><input type="radio" checked={s.embedMode === "prefull"} onChange={() => update({ embedMode: "prefull" })} /> 全库预建（导入后后台静默建立）</label>
          <label><input type="radio" checked={s.embedMode === "lazy"} onChange={() => update({ embedMode: "lazy" })} /> 懒加载（首次反链时再建，推荐）</label>
        </div>
        <p className="tip">
          全库预建：<b>利</b>反链秒出；<b>弊</b>导入后需后台处理（有进度提示）。<br />
          懒加载：导入零等待，首次反链某文时后台建向量（有进度提示）。
        </p>
      </section>

      <section>
        <h3>向量储存位置（桌面端）</h3>
        <p className="tip">
          向量是反链 / 概念图谱的计算结果，体积可能很大。默认随读书存档一起自动保存；
          你也可以指定一个<b>固定目录（建议非系统盘）</b>，向量会按「书名」分文件夹落盘，
          换电脑时连同存档一起拷贝即可一步恢复。
        </p>
        <div className="preset-row">
          <span style={{ wordBreak: "break-all", opacity: 0.85 }}>{dataDir || "（未设置，向量仅随存档保存）"}</span>
        </div>
        <div className="preset-row">
          <button className="ghost" type="button" onClick={onPickDataDir}>选择数据目录</button>
          {dataDir && <button className="ghost" type="button" onClick={onClearDataDir}>清除</button>}
        </div>
        <p className="tip">⚠ 单本书向量超过 50MB 时会提示你注意备份占用。网页端无真实文件系统，此功能不可用。</p>
      </section>

      <section>
        <h3>读书存档（自动 + 手动）</h3>
        <p className="tip">
          所有笔记、阅读进度、反链与向量都会<b>自动保存</b>（桌面端写入应用数据目录，网页端写入浏览器本地）。
          你也可以手动导出一份 JSON 存档随身备份，或换设备时导入恢复。
        </p>
        <div className="preset-row">
          <button className="ghost" type="button" onClick={onExportArchive}>⬇ 导出读书存档</button>
          <button className="ghost" type="button" onClick={onImportArchive}>⬆ 导入读书存档</button>
        </div>
      </section>
    </div>
  );
}
