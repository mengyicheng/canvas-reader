import { Settings, DEFAULT_SETTINGS, ReaderPrefs, DEFAULT_READER_PREFS, Annotation, Backlink, Flashcard, ConceptGraph, Bookmark } from "../types";
import { isTauri } from "./platform";
import { bookKey, docIdFor } from "./parse";

// ============================================================
// 单一持久化结构（替代原先散落的 localStorage 键）。
// 所有需要跨会话保留的数据都收拢到这里，统一版本号 + 迁移。
// ============================================================

const VERSION = 2;
const LS_KEY = "cr_app_v2";
const FILE_NAME = "library.json";

export interface ImportedFileMeta {
  path: string; // 相对路径（含文件名），如 "小说/三体/三体.epub"
  name: string; // 文件名（不含路径）
  ext: string; // 扩展名（含点），如 ".epub"
}

export interface ReadProgress {
  paraId: string;
  ts: number;
}

export interface ArchiveBook {
  key: string; // bookKey(书名)，用于跨机器/路径重连
  title: string;
  docId: string;
}

export interface PersistState {
  version: number;
  settings: Settings;
  readerPrefs: ReaderPrefs;
  annotations: Record<string, Annotation[]>;
  backlinks: Backlink[];
  flashcards: Flashcard[];
  bookmarks: Bookmark[];
  library: ImportedFileMeta[];
  libraryRoot: string | null; // Tauri 下保存的读书库根目录，启动时可自动重建文库
  vocab: string[];
  embedMode: "real" | "local" | null;
  readProgress: Record<string, ReadProgress>;
  lastDocId: string | null; // 上次在读的书，启动自动重开
  concepts: ConceptGraph | null; // AI 提炼的概念图谱（可持久化，避免每次重算）
  books: ArchiveBook[]; // 每本书的 书名键↔docId 映射，存档导入时按书名重连笔记/向量
  dataDir: string | null; // 向量/缓存落盘目录（用户选定，固定非系统盘），浏览器端恒为 null
}

export function emptyState(): PersistState {
  return {
    version: VERSION,
    settings: { ...DEFAULT_SETTINGS },
    readerPrefs: { ...DEFAULT_READER_PREFS },
    annotations: {},
    backlinks: [],
    flashcards: [],
    bookmarks: [],
    library: [],
    libraryRoot: null,
    vocab: [],
    embedMode: null,
    readProgress: {},
    lastDocId: null,
    concepts: null,
    books: [],
    dataDir: null,
  };
}

// 旧版（v1）散键迁移到单一结构。之后若再加字段，只改这里。
export function migrate(raw: any): PersistState {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  if (raw.settings && typeof raw.settings === "object") base.settings = { ...DEFAULT_SETTINGS, ...raw.settings };
  if (raw.readerPrefs && typeof raw.readerPrefs === "object") base.readerPrefs = { ...DEFAULT_READER_PREFS, ...raw.readerPrefs };
  if (raw.annotations && typeof raw.annotations === "object") base.annotations = raw.annotations;
  if (Array.isArray(raw.backlinks)) base.backlinks = raw.backlinks;
  if (Array.isArray(raw.flashcards)) base.flashcards = raw.flashcards;
  if (Array.isArray(raw.bookmarks)) base.bookmarks = raw.bookmarks;
  if (Array.isArray(raw.library)) base.library = raw.library.filter((f: any) => f && typeof f.path === "string");
  if (typeof raw.libraryRoot === "string") base.libraryRoot = raw.libraryRoot;
  if (Array.isArray(raw.vocab)) base.vocab = raw.vocab;
  if (raw.embedMode === "real" || raw.embedMode === "local") base.embedMode = raw.embedMode;
  if (raw.readProgress && typeof raw.readProgress === "object") base.readProgress = raw.readProgress;
  if (typeof raw.lastDocId === "string") base.lastDocId = raw.lastDocId;
  if (raw.concepts && Array.isArray(raw.concepts.nodes)) base.concepts = raw.concepts;
  if (Array.isArray(raw.books)) base.books = raw.books;
  if (typeof raw.dataDir === "string") base.dataDir = raw.dataDir;
  base.version = VERSION;
  return base;
}

// ---------- 浏览器兜底（localStorage，同步） ----------
// 兼容旧版散键（cr_settings / cr_annotations / …）：首次升级时把旧数据并入新结构，避免「数据都没了」
function migrateLegacy(): PersistState | null {
  try {
    const get = (k: string) => {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    };
    if (!localStorage.getItem("cr_settings") && !localStorage.getItem("cr_annotations")) return null;
    return migrate({
      settings: get("cr_settings"),
      readerPrefs: get("cr_reader_prefs"),
      annotations: get("cr_annotations"),
      backlinks: get("cr_backlinks"),
      flashcards: get("cr_flashcards"),
    });
  } catch {
    return null;
  }
}

function loadSync(): PersistState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {}
  const legacy = migrateLegacy();
  if (legacy) {
    // 立即落盘为新结构，下次直接走新键
    try { localStorage.setItem(LS_KEY, JSON.stringify(legacy)); } catch {}
    return legacy;
  }
  return emptyState();
}
function saveSync(s: PersistState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch (e) {
    console.warn("保存失败（localStorage 可能超限）：", e);
  }
}

// ---------- Tauri（文件落盘，异步） ----------
// 关键坑：Tauri v2 的 writeTextFile 不会自动创建父目录。首次运行时
// AppData 下的应用目录（Roaming/com.canvasreader.app）还不存在，直接写会静默失败
// → 磁盘无文件、重启丢数据。因此先 appDataDir() 拿绝对路径，mkdir 建目录再写。
async function appDataFile(): Promise<string> {
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  const dir = await appDataDir();
  return join(dir, FILE_NAME);
}
async function loadFile(): Promise<PersistState | null> {
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const file = await appDataFile();
    const txt = await readTextFile(file);
    return migrate(JSON.parse(txt));
  } catch (e) {
    // 文件不存在（首次运行）属正常，其他错误也静默降级为空结构
    if (!(e && String(e).includes("NotFound")) && !(e && String(e).includes("no such file")))
      console.warn("[persist] 读取 library.json 失败：", e);
    return null;
  }
}
async function saveFile(s: PersistState) {
  try {
    const { writeTextFile, mkdir } = await import("@tauri-apps/plugin-fs");
    const { appDataDir } = await import("@tauri-apps/api/path");
    const dir = await appDataDir();
    await mkdir(dir, { recursive: true }); // 确保应用目录存在
    const file = await appDataFile();
    await writeTextFile(file, JSON.stringify(s));
  } catch (e) {
    // 失败必须可见，否则会误以为已保存
    console.warn("[persist] 写入 AppData/library.json 失败（本次数据未落盘）：", e);
  }
}

// ---------- 对外 API ----------
export function loadPersistedSync(): PersistState {
  if (isTauri()) {
    // Tauri 下优先走文件（异步），同步阶段先给空结构，init 时再异步覆盖
    return emptyState();
  }
  return loadSync();
}

export async function loadPersistedAsync(): Promise<PersistState | null> {
  if (!isTauri()) return null; // 浏览器已在 sync 阶段拿到
  const fromFile = await loadFile();
  if (fromFile) return fromFile;
  // 兜底：文件尚未生成（首次运行 / 或之前因目录未创建导致写入失败）时，
  // 尝试从 WebView 的 localStorage 备份恢复，避免历史边注/反链白写。
  try {
    const legacy = loadSync();
    if (
      legacy &&
      (Object.keys(legacy.annotations).length ||
        legacy.backlinks.length ||
        legacy.library.length ||
        legacy.vocab.length)
    )
      return legacy;
  } catch {}
  return null;
}

export function persistNow(s: PersistState) {
  saveSync(s);
  if (isTauri()) void saveFile(s);
}

export function serialize(s: PersistState): string {
  return JSON.stringify(s, null, 2);
}

export function deserialize(txt: string): PersistState {
  return migrate(JSON.parse(txt));
}

// 把 paraId(= docId#c..p..) 中的旧 docId 前缀替换为新 docId（换机/路径不同后重连用）
function remapParaId(paraId: string, map: Record<string, string>): string {
  const i = paraId.indexOf("#");
  if (i < 0) return paraId;
  const oldDoc = paraId.slice(0, i);
  const nd = map[oldDoc];
  return nd ? nd + paraId.slice(i) : paraId;
}

// 存档恢复：把笔记/反链/闪卡/进度/概念图里的旧 docId 按「书名(bookKey)」重连到当前文库。
// 这样即使换机器、文件夹路径变了，只要书名一致，数据就能一步到位接回。
export function restoreArchive(txt: string, currentLibrary: ImportedFileMeta[]): PersistState {
  const s = migrate(JSON.parse(txt));
  const cur = currentLibrary.map((m) => ({
    key: bookKey(m.name.replace(/\.[^.]+$/, "")),
    docId: docIdFor(m.path),
  }));
  // 旧 docId → 书名键
  const oldBooks: { docId: string; key: string }[] = (s.books && s.books.length)
    ? s.books.map((b) => ({ docId: b.docId, key: b.key }))
    : (s.library || []).map((m) => ({
        docId: docIdFor(m.path),
        key: bookKey(m.name.replace(/\.[^.]+$/, "")),
      }));
  const map: Record<string, string> = {};
  for (const ob of oldBooks) {
    const c = cur.find((x) => x.key === ob.key);
    if (c && c.docId !== ob.docId) map[ob.docId] = c.docId;
  }

  const annotations: Record<string, Annotation[]> = {};
  for (const [pid, list] of Object.entries(s.annotations || {})) {
    const np = remapParaId(pid, map);
    annotations[np] = list.map((a) => ({ ...a, paraId: remapParaId(a.paraId, map) }));
  }
  const backlinks = (s.backlinks || []).map((b) => ({
    ...b,
    fromParaId: remapParaId(b.fromParaId, map),
    toParaId: remapParaId(b.toParaId, map),
  }));
  const flashcards = (s.flashcards || []).map((c) => ({
    ...c,
    docId: map[c.docId] || c.docId,
    paraId: remapParaId(c.paraId, map),
  }));
  const readProgress: Record<string, ReadProgress> = {};
  for (const [d, rp] of Object.entries(s.readProgress || {})) {
    readProgress[map[d] || d] = rp;
  }
  let concepts = s.concepts;
  if (concepts && concepts.nodes) {
    concepts = {
      ...concepts,
      nodes: concepts.nodes.map((n) =>
        n.docId
          ? { ...n, docId: map[n.docId] || n.docId, paraId: n.paraId ? remapParaId(n.paraId, map) : n.paraId }
          : n
      ),
    };
  }
  return {
    ...s,
    annotations,
    backlinks,
    flashcards,
    bookmarks: (s.bookmarks || []).map((b) => ({
      ...b,
      docId: map[b.docId] || b.docId,
      paraId: remapParaId(b.paraId, map),
    })),
    readProgress,
    concepts: concepts || null,
    library: currentLibrary.length ? currentLibrary : (s.library || []),
  };
}

// 简单防抖：避免每次击键/滚动都写盘
let timer: any = null;
export function persistDebounced(s: PersistState, delay = 350) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => persistNow(s), delay);
}

// ---------- 向下兼容的旧散键读取（首次迁移用，可删） ----------
export function loadSettings(): Settings {
  return loadSync().settings;
}
export function loadReaderPrefs(): ReaderPrefs {
  return loadSync().readerPrefs;
}
export function loadAnnotations(): Record<string, Annotation[]> {
  return loadSync().annotations;
}
export function loadBacklinks(): Backlink[] {
  return loadSync().backlinks;
}
export function loadFlashcards(): Flashcard[] {
  return loadSync().flashcards;
}

// SM-2 间隔重复调度：quality 0=重来 3=困难 4=良好 5=简单
export function scheduleCard(c: Flashcard, quality: number): Flashcard {
  const next: Flashcard = { ...c };
  if (quality < 3) {
    next.reps = 0;
    next.interval = 0;
  } else {
    if (next.reps === 0) next.interval = 1;
    else if (next.reps === 1) next.interval = 6;
    else next.interval = Math.round(next.interval * next.ease);
    next.reps += 1;
  }
  next.ease = next.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  next.ease = Math.max(1.3, next.ease);
  const days = quality < 3 ? 0 : next.interval;
  next.due = Date.now() + days * 86400000 + (quality < 3 ? 60000 : 0);
  return next;
}
