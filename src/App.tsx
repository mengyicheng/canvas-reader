import { useEffect, useMemo, useState, useRef } from "react";





import { createPortal } from "react-dom";





import { Doc, Annotation, Backlink, Settings, findDoc, Flashcard, ConceptGraph, ConceptNode, ConceptEdge, ReaderPrefs, Bookmark } from "./types";





import { pickAndRead, saveTextFile, saveJsonFile, pickJsonFile, rebuildFromRoot, ImportedFile, isTauri } from "./lib/platform";





import { parseFile, docIdFor, bookKey } from "./lib/parse";

import {
  pickDataDir, persistAllVectors, loadAllVectors, VECTOR_WARN_BYTES, formatMB, isDataDirSupported,
} from "./lib/datadir";





import { buildDocEmbeddings, buildVocab, searchBacklinks, BacklinkCandidate, STOPWORDS } from "./lib/embed";
import { searchLibrary, SearchHit } from "./lib/search";





import { summarize, askAI, runAiAction, AiActionKind, aiGenerateCard, aiExtractConcepts, runAiActionStream, askAIStream } from "./lib/ai";





import {





  loadPersistedSync, loadPersistedAsync, persistDebounced, serialize, deserialize, scheduleCard,





  restoreArchive, PersistState, ReadProgress,





} from "./lib/store";





import Sidebar, { View } from "./components/Sidebar";





import TopNav from "./components/TopNav";





import { Hero } from "./components/Hero";





import Reader from "./components/Reader";





import ReaderRail, { RailTab, ChatMsg, DocAnno } from "./components/ReaderRail";





import CanvasView from "./components/CanvasView";





import SettingsView from "./components/Settings";





import ReadingSettings from "./components/ReadingSettings";





import ReviewView from "./components/ReviewView";





import ConceptGraphView from "./components/ConceptGraphView";
import LibraryView from "./components/LibraryView";





import SelectionPopup, { SelectionInfo, PopupAction } from "./components/SelectionPopup";





import { SunsetBackground } from "./components/effects/SunsetBackground";





import { FilmGrain } from "./components/effects/FilmGrain";





import { CursorGlow } from "./components/effects/CursorGlow";





import { FadeContent } from "./components/effects/FadeContent";





import { BlurText } from "./components/effects/BlurText";











export default function App() {





  const [init] = useState(loadPersistedSync);





  const [library, setLibrary] = useState<ImportedFile[]>([]);





  const [libraryRoot, setLibraryRoot] = useState<string | null>(init.libraryRoot);





  const [docs, setDocs] = useState<Doc[]>([]);





  const [currentDocId, setCurrentDocId] = useState<string | null>(null);





  const [view, setView] = useState<View>("reader");





  const [settings, setSettings] = useState<Settings>(init.settings);





  const [readerPrefs, setReaderPrefs] = useState<ReaderPrefs>(init.readerPrefs);





  const [readingSettingsOpen, setReadingSettingsOpen] = useState(false);





  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>(init.annotations);





  const [backlinks, setBacklinks] = useState<Backlink[]>(init.backlinks);





  const [flashcards, setFlashcards] = useState<Flashcard[]>(init.flashcards);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>(init.bookmarks || []);





  const [concepts, setConcepts] = useState<ConceptGraph>(init.concepts || { nodes: [], edges: [], aiGenerated: false });





  const [extractingConcepts, setExtractingConcepts] = useState(false);





  const [vectors, setVectors] = useState<Record<string, number[]>>({});





  const [vocab, setVocab] = useState<string[]>(init.vocab);





  const [embedMode, setEmbedMode] = useState<"real" | "local" | null>(init.embedMode);

  // 向量/缓存落盘目录（用户选定的固定非系统盘位置）；浏览器端恒为 null
  const [dataDir, setDataDir] = useState<string | null>(init.dataDir);





  const [importing, setImporting] = useState(false);





  const [build, setBuild] = useState<{ active: boolean; done: number; total: number; label: string }>({ active: false, done: 0, total: 0, label: "" });





  const [toast, setToast] = useState<string | null>(null);





  const [drawerOpen, setDrawerOpen] = useState(false);











  const [popup, setPopup] = useState<SelectionInfo | null>(null);





  const [sel, setSel] = useState<SelectionInfo | null>(null);





  const [railTab, setRailTab] = useState<RailTab>("toc");
  const [railOpen, setRailOpen] = useState(true);
  const [railWidth, setRailWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("railWidth");
      const n = saved ? parseInt(saved, 10) : 0;
      return n >= 280 && n <= 680 ? n : 340;
    } catch { return 340; }
  });
  useEffect(() => { try { localStorage.setItem("railWidth", String(railWidth)); } catch {} }, [railWidth]);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);





  const [scrollToParaId, setScrollToParaId] = useState<string | null>(null);
  const [scrollToChapterId, setScrollToChapterId] = useState<string | null>(null);

  // 跨书检索（语义 + 全文）
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTimer = useRef<number | null>(null);











  const [candidates, setCandidates] = useState<BacklinkCandidate[]>([]);





  const [blLoading, setBlLoading] = useState(false);





  const [summary, setSummary] = useState("");





  const [sumLoading, setSumLoading] = useState(false);





  const [askAnswer, setAskAnswer] = useState("");





  const [askLoading, setAskLoading] = useState(false);





  const [readProgress, setReadProgress] = useState<Record<string, ReadProgress>>(init.readProgress);











  // 用 ref 保证异步流程里读到最新文档/向量，避免闭包陈旧





  const docsRef = useRef(docs); docsRef.current = docs;





  const vectorsRef = useRef(vectors); vectorsRef.current = vectors;

  const dataDirRef = useRef(dataDir); dataDirRef.current = dataDir;

  const vocabRef = useRef(vocab); vocabRef.current = vocab;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const selRef = useRef(sel); selRef.current = sel;





  const readProgressRef = useRef(readProgress); readProgressRef.current = readProgress;





  const parseCache = useRef<Record<string, Doc>>({});





  const parsingRef = useRef<Record<string, Promise<Doc>>>({});





  const buildingRef = useRef(false);





  const builtRef = useRef<{ vectors: Record<string, number[]>; docs: Doc[]; mode: "real" | "local" } | null>(null);











  useEffect(() => { document.body.dataset.theme = "dark"; }, []);











  // 选择向量/缓存落盘目录（仅桌面端；网页端走浏览器本地，此功能不可用）
  async function handlePickDataDir() {
    if (!isDataDirSupported()) {
      showToast("数据目录功能仅桌面端可用；网页端向量自动随存档存入浏览器本地");
      return;
    }
    try {
      const dir = await pickDataDir();
      if (!dir) return; // 用户取消
      setDataDir(dir);
      showToast("已设置数据目录：" + dir + "（向量将按书名存于此，便于备份/换机）");
    } catch (e: any) {
      if (e && e.message === "DATA_DIR_ON_C") { showToast("请勿选择 C 盘，请选其他盘符的目录"); return; }
      showToast("选择目录失败：" + (e?.message || e));
    }
  }

  function handleClearDataDir() {
    setDataDir(null);
    showToast("已取消数据目录（向量回到随存档自动保存）");
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2800); }





  function updateSettings(patch: Partial<Settings>) {





    setSettings((prev) => { const next = { ...prev, ...patch }; return next; });





  }





  function updateReaderPrefs(patch: Partial<ReaderPrefs>) {





    setReaderPrefs((prev) => ({ ...prev, ...patch }));





  }





  // 主题固定为深色（已移除亮色切换，避免配色不搭）











  function rebuildVocabFrom(list: Doc[]) {





    setVocab(buildVocab(list.flatMap((d) => d.chapters.flatMap((c) => c.paragraphs))));





  }











  // 解析去重：同一 doc 只解析一次（修复 F：openFile 与 ensureLibraryVectors 重复 parseFile 竞态）





  async function getOrParseDoc(file: ImportedFile): Promise<Doc> {





    const id = docIdFor(file.path);





    const cached = parseCache.current[id] || docsRef.current.find((d) => d.id === id);





    if (cached) return cached;





    if (parsingRef.current[id]) return parsingRef.current[id];





    const p = parseFile(file).then((doc) => { parseCache.current[id] = doc; return doc; });





    parsingRef.current[id] = p;





    return p;





  }











  async function ensureLibraryVectors(): Promise<{ vectors: Record<string, number[]>; docs: Doc[]; mode: "real" | "local" }> {





    if (buildingRef.current && builtRef.current) return builtRef.current;





    if (library.length === 0) return { vectors: vectorsRef.current, docs: docsRef.current, mode: embedMode ?? "local" };





    buildingRef.current = true;





    try {





      setBuild({ active: true, done: 0, total: library.length, label: "准备中…" });





      const localDocs = [...docsRef.current];





      const localVectors: Record<string, number[]> = { ...vectorsRef.current };

      // 若已配置数据目录，先按书名从磁盘读取向量缓存，跳过重复建向量（启动加速）
      if (dataDirRef.current && isTauri()) {
        try {
          // 用完整 docId（含同名消歧的父目录哈希）作为缓存键，与落盘分组一致
          const keys = library.map((f) => docIdFor(f.path));
          const cached = await loadAllVectors(dataDirRef.current, keys);
          if (cached) Object.assign(localVectors, cached);
        } catch {}
      }





      let mode: "real" | "local" = embedMode ?? "local";





      for (let i = 0; i < library.length; i++) {





        const f = library[i];





        setBuild((b) => ({ ...b, done: i, label: `解析 ${f.name} (${i + 1}/${library.length})` }));





        let doc = localDocs.find((d) => d.id === docIdFor(f.path));





        if (!doc) { doc = await getOrParseDoc(f); localDocs.push(doc); }





        if (!Object.keys(localVectors).some((k) => k.startsWith(doc!.id + "#"))) {





          const r = await buildDocEmbeddings(doc!, settings, vocab);





          Object.assign(localVectors, r.vectors);





          mode = r.mode;





        }





      }





      setDocs(localDocs);





      setVectors(localVectors);





      rebuildVocabFrom(localDocs);





      setEmbedMode(mode);





      builtRef.current = { vectors: localVectors, docs: localDocs, mode };

      // 把向量按书名落盘到数据目录（便于备份/换机/跨会话复用）
      if (dataDirRef.current && isTauri()) {
        void persistAllVectors(dataDirRef.current, localVectors).then((warned) => {
          if (warned.length) {
            showToast("⚠ 部分书籍向量较大（> " + formatMB(VECTOR_WARN_BYTES) + "），已照常保存，注意备份占用");
          }
        });
      }





      setBuild({ active: false, done: library.length, total: library.length, label: "" });





      if (mode === "local") showToast("已用本地关键词向量（演示）");





      return builtRef.current;





    } finally {





      buildingRef.current = false;





    }





  }











  async function handleImport() {
    try {





    const { files, root } = await pickAndRead();





    if (files.length === 0) return;





    setLibrary((prev) => {





      const seen = new Set(prev.map((f) => f.path));





      return [...prev, ...files.filter((f) => !seen.has(f.path))];





    });





    if (root) setLibraryRoot(root);





    const firstNew = files.find((f) => !docsRef.current.some((d) => d.id === docIdFor(f.path))) || files[0];





    openFile(firstNew);





    setDrawerOpen(false);





    if (settings.embedMode === "prefull") ensureLibraryVectors(); // 后台非阻塞
    } catch (e: any) {
      showToast("导入失败：" + (e?.message || e));
    }





  }











  async function openFile(file: ImportedFile) {





    const id = docIdFor(file.path);





    const existing = docsRef.current.find((d) => d.id === id);





    if (existing) { setCurrentDocId(id); setView("reader"); scrollToSaved(id); return; }





    setImporting(true);





    try {





      const parsed = await getOrParseDoc(file);





      setDocs((prev) => [...prev.filter((d) => d.id !== parsed.id), parsed]);





      rebuildVocabFrom([...docsRef.current, parsed]);





      setCurrentDocId(parsed.id);





      setView("reader");





      scrollToSaved(parsed.id);





    } catch (e: any) { showToast("打开失败：" + e.message); }





    finally { setImporting(false); }





  }











  function openFileById(docId: string) {





    const f = library.find((x) => docIdFor(x.path) === docId);





    if (f) openFile(f);





  }











  function scrollToSaved(id: string) {





    const rp = readProgressRef.current[id];





    if (rp?.paraId) setScrollToParaId(rp.paraId);





  }











  // 返回文库（无 currentDoc 时显示首屏）





  function goHome() { setCurrentDocId(null); setView("reader"); setDrawerOpen(false); }











  function onProgress(docId: string, paraId: string) {





    setReadProgress((prev) => {





      const cur = prev[docId];





      if (cur && cur.paraId === paraId) return prev;





      return { ...prev, [docId]: { paraId, ts: Date.now() } };





    });





  }











  function onSelect(s: SelectionInfo) {





    setPopup(s); setSel(s); setScrollToParaId(s.paraId);





    // 修复 D：新选区清空上一轮结果，避免串台





    setSummary(""); setAskAnswer(""); setCandidates([]);





  }





  function onAction(a: PopupAction) {





    if (!popup) return;
    if (a === "bookmark") {
      addBookmark(popup.paraId);
      setRailTab("bookmarks");
      setRailOpen(true);
      return;
    }
    if (a === "highlight") {
      addHighlight(popup.paraId, popup.text);
      setPopup(null);
      return;
    }





    setSel(popup);





    setPopup(null);





    setRailOpen(true);
    const tabMap: Record<string, RailTab> = { annotate: "annotate", backlink: "backlinks", ask: "ask", aifeat: "aifeat" };
    setRailTab(tabMap[a] || "toc");





    if (a === "backlink") runBacklinks();





    // 5 个 AI 预设功能（总结/翻译/解释/大纲/问题）已并入「AI 功能」侧栏 tab，
    // 由该 tab 内的按钮通过 onChat(kind) 触发，不再从选区浮框直连。





    // aiKinds moved above (summary included)





    // dead code removed: runAiActionKind replaced by railAsk above





  }











  async function runAiActionKind(kind: AiActionKind) {





    if (!sel) return;





    setSumLoading(true); setSummary(""); setAskAnswer("");





    const s = await runAiAction(kind, sel.text, chapterTextOf(sel.docId, sel.paraId), settings);





    setSummary(s); setSumLoading(false);





  }





  function closePanel() { setRailOpen(false); setSummary(""); setAskAnswer(""); setCandidates([]); }





  function togglePin() { setRailOpen((v) => !v); }











  function saveAnnotation(text: string) {





    if (!sel) return;





    const t = text.trim();
    // 没写文字就保存 => 自动做成「划线」（用选中文字）
    if (!t) { addHighlight(sel.paraId, sel.text); return; }

    const ann: Annotation = { id: "a_" + Math.random().toString(36).slice(2, 9), paraId: sel.paraId, type: "human", text: t, createdAt: Date.now() };





    setAnnotations((prev) => { const next = { ...prev, [sel.paraId]: [...(prev[sel.paraId] || []), ann] }; return next; });





    // 修复 C：边注不再自动生成闪卡；闪卡由「生成复习卡」显式创建







  }

  // 划线：type=highlight 的 annotation，记录选中文字（落盘与边注同机制）
  function addHighlight(paraId: string, text: string) {
    const t = (text || "").trim();
    if (t.length < 1) return;
    const ann: Annotation = { id: "h_" + Math.random().toString(36).slice(2, 9), paraId, type: "highlight", text: t, createdAt: Date.now() };
    setAnnotations((prev) => ({ ...prev, [paraId]: [...(prev[paraId] || []), ann] }));
    showToast("已划线");
  }

  // 删除某段某条边注/划线
  function deleteAnnotation(paraId: string, annId: string) {
    setAnnotations((prev) => {
      const list = prev[paraId] || [];
      const next = list.filter((a) => a.id !== annId);
      const np = { ...prev };
      if (next.length) np[paraId] = next;
      else delete np[paraId];
      return np;
    });
  }











  // 书签：在当前文档的某段落位置打标记，跨会话留存，点击可跳回
  function addBookmark(paraId: string) {
    if (!currentDoc) return;
    for (const c of currentDoc.chapters) {
      const p = c.paragraphs.find((pp) => pp.id === paraId);
      if (p) {
        if (bookmarks.some((b) => b.paraId === paraId)) {
          showToast("该段已有书签");
          return;
        }
        const bm: Bookmark = {
          id: "bm_" + Math.random().toString(36).slice(2, 9),
          docId: p.docId,
          paraId: p.id,
          chapterId: c.id,
          chapterTitle: c.title,
          snippet: p.text.slice(0, 60),
          createdAt: Date.now(),
        };
        setBookmarks((prev) => [...prev, bm]);
        showToast("已添加书签 ★");
        return;
      }
    }
  }
  function removeBookmark(id: string) {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    showToast("已删除书签");
  }
  function toggleBookmark(paraId: string) {
    const existing = bookmarks.find((b) => b.paraId === paraId);
    if (existing) removeBookmark(existing.id);
    else addBookmark(paraId);
  }

  function addCard(paraId: string, docId: string, front: string, back: string) {





    setFlashcards((prev) => {





      if (prev.some((c) => c.paraId === paraId && c.back === back)) return prev;





      const card: Flashcard = {





        id: "fc_" + Math.random().toString(36).slice(2, 9),





        docId, paraId, front, back, sourceText: front,





        createdAt: Date.now(), due: Date.now(), interval: 0, ease: 2.5, reps: 0,





      };





      return [...prev, card];





    });





  }











  async function runBacklinks() {





    if (!sel) return;





    setBlLoading(true);





    const built = await ensureLibraryVectors();





    const res = searchBacklinks(sel.paraId, sel.docId, built.vectors, built.docs, settings);





    setCandidates(res);





    setBlLoading(false);





  }











  function confirmBacklink(c: BacklinkCandidate) {





    if (!sel) return;





    setBacklinks((prev) => {





      if (prev.some((b) => b.fromParaId === sel.paraId && b.toParaId === c.paraId)) return prev;





      const b: Backlink = { id: "b_" + Math.random().toString(36).slice(2, 9), fromParaId: sel.paraId, toParaId: c.paraId, score: c.score, confirmed: true, createdAt: Date.now() };





      const next = [...prev, b]; return next;





    });





  }











  function chapterTextOf(docId: string, paraId: string): string {





    const d = findDoc(docsRef.current, docId);





    if (!d) return "";





    for (const c of d.chapters) if (c.paragraphs.some((p) => p.id === paraId)) return c.paragraphs.map((p) => p.text).join("\n\n");





    return "";





  }











  // 整篇文章文本（用于 AI 对话上下文）
  function docTextOf(docId: string): string {
    const d = findDoc(docsRef.current, docId);
    if (!d) return "";
    return d.chapters.map((c) => c.paragraphs.map((p) => p.text).join("\n\n")).join("\n\n");
  }

  // 常驻栏 AI 对话：上下文 = 当前文章 + 选中文字
  const aiTimerRef = useRef<number | null>(null);
  async function railAsk(q: string, kind?: AiActionKind) {
    if (!currentDoc) return;
    const docCtx = docTextOf(currentDoc.id);
    const selCtx = selRef.current?.text || "";
    const id = "chat_" + Math.random().toString(36).slice(2, 8);
    const msg: ChatMsg = { id, q, a: "", kind };
    setChatMessages((m) => [...m, msg]);
    setChatLoading(true);
    setAiProgress(3);
    if (aiTimerRef.current) window.clearInterval(aiTimerRef.current);
    aiTimerRef.current = window.setInterval(() => {
      setAiProgress((p) => (p < 92 ? Math.min(92, p + Math.max(0.5, (92 - p) * 0.06)) : p));
    }, 130);
    try {
      let full = "";
      const onToken = (t: string) => {
        full += t;
        setChatMessages((m) => m.map((x) => (x.id === id ? { ...x, a: full } : x)));
      };
      if (kind) {
        await runAiActionStream(kind, selCtx || q, docCtx, settingsRef.current, onToken);
      } else {
        const context = docCtx + (selCtx ? "\n\n【选中内容】\n" + selCtx : "");
        await askAIStream(q, context, settingsRef.current, onToken);
      }
      setAiProgress(100);
    } catch (e: any) {
      setChatMessages((m) => m.map((x) => (x.id === id ? { ...x, a: "（错误：" + e.message + "）" } : x)));
      setAiProgress(0);
    } finally {
      if (aiTimerRef.current) window.clearInterval(aiTimerRef.current);
      setChatLoading(false);
      setTimeout(() => setAiProgress(0), 700);
    }
  }

  // 常驻栏：跳转到章节
  function onJumpChapter(chapterId: string) { setScrollToChapterId(chapterId); }
  // 常驻栏：跳转到段落
  function onJumpPara(paraId: string) { setScrollToParaId(paraId); }

  function findPara(paraId: string) {





    for (const d of docsRef.current) {





      for (const c of d.chapters) {





        const p = c.paragraphs.find((pp) => pp.id === paraId);





        if (p) return p;





      }





    }





    return undefined;





  }











  // 修复 A：概念图谱除反链外，也把「有边注的段落」作为节点，写笔记即生长图谱；并更新 vocab 更新





  function buildConceptGraph(docs: Doc[], bls: Backlink[], vocab: string[], anns: Record<string, Annotation[]>): ConceptGraph {





    const nodes: ConceptNode[] = [];





    const edges: ConceptEdge[] = [];





    const seenPara = new Set<string>();





    const addPara = (paraId: string) => {





      if (seenPara.has(paraId)) return;





      const p = docs.flatMap((d) => d.chapters.flatMap((c) => c.paragraphs)).find((pp) => pp.id === paraId);





      if (!p) return;





      const d = findDoc(docs, p.docId);





      nodes.push({ id: "para:" + paraId, label: p.text.slice(0, 12), kind: "para", docId: p.docId, paraId });





      seenPara.add(paraId);





    };





    for (const b of bls.filter((x) => x.confirmed)) {





      addPara(b.fromParaId); addPara(b.toParaId);





      edges.push({ from: "para:" + b.fromParaId, to: "para:" + b.toParaId });





    }





    // 有边注的段落也入图（即便尚未确认反链）





    for (const pid of Object.keys(anns)) if (anns[pid]?.length) addPara(pid);





    const topTerms = vocab.filter((t) => t.length >= 2 && !STOPWORDS.has(t)).slice(0, 8);





    for (const term of topTerms) {





      const cid = "term:" + term;





      let linked = 0;





      for (const d of docs) {





        for (const c of d.chapters) {





          for (const p of c.paragraphs) {





            if (linked >= 4) break;





            if (p.text.includes(term)) {





              if (!seenPara.has(p.id)) addPara(p.id);





              if (!nodes.some((n) => n.id === cid)) nodes.push({ id: cid, label: term, kind: "concept" });





              if (!edges.some((e) => e.from === cid && e.to === "para:" + p.id))





                edges.push({ from: cid, to: "para:" + p.id });





              linked++;





            }





          }





          if (linked >= 4) break;





        }





        if (linked >= 4) break;





      }





    }





    return { nodes: nodes.slice(0, 80), edges, aiGenerated: false };





  }











  async function runSummary() {





    if (!sel) return;





    setSumLoading(true);





    const s = await summarize(sel.text, chapterTextOf(sel.docId, sel.paraId), settings);





    setSummary(s); setSumLoading(false); setAskAnswer("");





  }











  async function handleAsk(q: string) {





    if (!sel) return;





    setAskLoading(true);





    const a = await askAI(q, sel.text + "\n\n" + chapterTextOf(sel.docId, sel.paraId), settings);





    setAskAnswer(a); setAskLoading(false);





  }











  function saveSummaryAsAnnotation() {





    if (!sel || !summary) return;





    const ann: Annotation = { id: "a_" + Math.random().toString(36).slice(2, 9), paraId: sel.paraId, type: "ai_summary", text: summary, createdAt: Date.now() };





    setAnnotations((prev) => ({ ...prev, [sel.paraId]: [...(prev[sel.paraId] || []), ann] }));





    // 不再自动建卡（见 saveAnnotation 说明）





    showToast("AI 总结已存入边注");





  }











  async function generateCardWithAI() {





    if (!sel) return;





    setSumLoading(true);





    const qa = await aiGenerateCard(sel.text, chapterTextOf(sel.docId, sel.paraId), settings);





    setSumLoading(false);





    addCard(sel.paraId, sel.docId, qa.front, qa.back);





    showToast("已生成复习卡");





  }











  function rateCard(id: string, quality: number) {





    setFlashcards((prev) => prev.map((c) => (c.id === id ? scheduleCard(c, quality) : c)));





  }











  useEffect(() => {





    setConcepts((prev) => (prev.aiGenerated ? prev : buildConceptGraph(docsRef.current, backlinks, vocab, annotations)));





    // eslint-disable-next-line react-hooks/exhaustive-deps





  }, [backlinks, vocab, annotations]);











  async function extractConceptsWithAI() {





    const items: { text: string; note?: string; docId: string; paraId: string }[] = [];





    for (const d of docsRef.current) {





      for (const c of d.chapters) {





        for (const p of c.paragraphs) {





          const anns = annotations[p.id] || [];





          if (anns.length) items.push({ text: p.text.slice(0, 300), note: anns.map((a) => a.text).join("；"), docId: d.id, paraId: p.id });





        }





      }





    }





    if (items.length === 0) { showToast("先在读时写几条边注，再提炼概念？"); return; }





    setExtractingConcepts(true);





    const capped = items.slice(0, 25);





    const res = await aiExtractConcepts(capped.map((it) => ({ text: it.text, note: it.note })), settings);





    setExtractingConcepts(false);





    if (!res.concepts.length) { showToast("AI 未返回概念（检查 API 设置）"); return; }





    const nodes: ConceptNode[] = [];





    const edges: ConceptEdge[] = [];





    res.concepts
      .filter((c) => c.name && c.name.trim().length >= 2 && !STOPWORDS.has(c.name.trim()))
      .forEach((c, ci) => {





      const cid = "concept:" + ci;





      nodes.push({ id: cid, label: c.name, kind: "concept" });





      c.members.forEach((mi) => {





        const it = capped[mi];





        if (!it) return;





        const pid = "para:" + it.paraId;





        if (!nodes.some((n) => n.id === pid))





          nodes.push({ id: pid, label: it.text.slice(0, 12), kind: "para", docId: it.docId, paraId: it.paraId });





        edges.push({ from: cid, to: pid });





      });





    });





    res.links.forEach((l) => {





      const a = res.concepts.findIndex((c) => c.name === l.a);





      const b = res.concepts.findIndex((c) => c.name === l.b);





      if (a >= 0 && b >= 0) edges.push({ from: "concept:" + a, to: "concept:" + b, label: l.rel });





    });





    setConcepts({ nodes, edges, aiGenerated: true });





    showToast("AI 已提炼 " + res.concepts.length + " 个概念");





  }











  function backlinkCount(paraId: string): number {





    return backlinks.filter((b) => b.confirmed && (b.fromParaId === paraId || b.toParaId === paraId)).length;





  }











  const confirmedForPanel = useMemo(() => {





    if (!sel) return [];





    return backlinks.filter((b) => b.confirmed && b.fromParaId === sel.paraId).map((b) => {





      const d = docsRef.current.flatMap((x) => x.chapters.flatMap((c) => c.paragraphs)).find((p) => p.id === b.toParaId);





      return { paraId: b.toParaId, score: b.score, docTitle: findDoc(docsRef.current, d?.docId || "")?.title || "", text: d?.text || "" };





    });





  }, [backlinks, sel]);











  // 修复 G：画布/图谱/复习里双击或「回到原文」时，若文档尚未解析，先解析再打开





  async function openPara(docId: string, paraId: string) {





    const doc = findDoc(docsRef.current, docId);





    if (!doc) {





      const f = library.find((x) => docIdFor(x.path) === docId);





      if (f) { await openFile(f); }





      else { showToast("未找到原文文件，请确认该文档仍在读书库中"); return; }





    }





    setCurrentDocId(docId); setView("reader"); setScrollToParaId(paraId); setDrawerOpen(false);





  }











  function onOpenPara(docId: string, paraId: string) { openPara(docId, paraId); }

  // 概念图谱：删除选中的节点（及相连边），落盘持久化
  function deleteConceptNodes(ids: string[]) {
    if (!ids.length) return;
    const set = new Set(ids);
    setConcepts((prev) => ({
      ...prev,
      aiGenerated: true, // 标记为用户整理过的图，避免启发式重建把删掉的节点加回来
      nodes: prev.nodes.filter((n) => !set.has(n.id)),
      edges: prev.edges.filter((e) => !set.has(e.from) && !set.has(e.to)),
    }));
  }

  // 跨书检索：输入即防抖触发（local 直接算；real 模式下由用户回车触发避免频繁 API 调用）
  function runSearch(q: string) {
    const query = q.trim();
    if (!query) { setSearchHits([]); setSearchOpen(false); return; }
    setSearchOpen(true);
    const doSearch = async () => {
      const res = await searchLibrary(
        query,
        vectorsRef.current,
        docsRef.current,
        vocabRef.current,
        embedMode ?? "local",
        settingsRef.current
      );
      setSearchHits(res);
    };
    if ((embedMode ?? "local") === "real") {
      // real 模式不防抖，回车才查（避免每次按键打 API）
      void doSearch();
    } else {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
      searchTimer.current = window.setTimeout(() => void doSearch(), 200);
    }
  }

  function pickSearchHit(hit: SearchHit) {
    openPara(hit.docId, hit.paraId);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchHits([]);
  }











  function docToObsidian(d: Doc): string {





    const allParas = docsRef.current.flatMap((x) => x.chapters.flatMap((c) => c.paragraphs));





    let md = `---\ntitle: ${d.title}\ntype: 画布阅读导出\nsource: 画布阅读\n---\n\n# ${d.title}\n\n`;





    for (const c of d.chapters) {





      md += `## ${c.title}\n\n`;





      for (const p of c.paragraphs) {





        md += p.text + "\n\n";





        const aList = annotations[p.id] || [];





        for (const a of aList) {





          const callout = a.type === "ai_summary" ? "abstract" : "note";





          const label = a.type === "ai_summary" ? "AI 总结" : "边注";





          const date = new Date(a.createdAt).toISOString().slice(0, 10);





          md += `> [!${callout}] ${label}）${date}）\n> ${a.text.replace(/\n/g, "\n> ")}\n\n`;





        }





        const blList = backlinks.filter((b) => b.confirmed && b.fromParaId === p.id);





        if (blList.length) {





          md += `> [!info] 反向链接（跨文章）\n`;





          for (const b of blList) {





            const t = allParas.find((pp) => pp.id === b.toParaId);





            if (t) {





              const td = findDoc(docsRef.current, t.docId);





              md += `> - [[${td?.title || "未命名"}]]（${b.score.toFixed(2)}）：${t.text.slice(0, 80)}…\n`;





            }





          }





          md += "\n";





        }





      }





    }





    return md;





  }











  async function downloadMd(content: string, name: string): Promise<boolean> {





    return saveTextFile(content, name);





  }











  async function exportObsidian(doc?: Doc) {





    const all = docsRef.current;





    if (doc) {





      const ok = await downloadMd(docToObsidian(doc), doc.title + ".md");





      showToast(ok ? "已导出当前文章（Obsidian 格式）" : "已取消导出");





    } else {





      const parts = all.map((d) => docToObsidian(d));





      const ok = await downloadMd(parts.join("\n\n---\n\n"), "画布阅读_全部文库.md");





      showToast(ok ? `已导出整库（${all.length} 篇，Obsidian 格式）` : "已取消导出");





    }





  }











  // ---------- startup recovery ----------





  function buildState(): PersistState {





    return {





      version: 2,





      settings, readerPrefs, annotations, backlinks, flashcards,





      library: library.map((f) => ({ path: f.path, name: f.name, ext: f.ext })),





      libraryRoot,





      vocab, embedMode,





      readProgress,





      lastDocId: currentDocId,





      concepts,
      bookmarks,

      dataDir,





      books: library.map((f) => ({





        key: bookKey(f.name.replace(/\.[^.]+$/, "")),





        title: f.name.replace(/\.[^.]+$/, ""),





        docId: docIdFor(f.path),





      })),





    };





  }





  async function handleExportArchive() {





    await saveJsonFile(serialize(buildState()), "画布阅读_读书存档.json");





    showToast("已导出读书存档（含笔记/进度/向量）");





  }





  async function handleImportArchive() {




    const txt = await pickJsonFile();




    if (!txt) return;




    try {




      let curLib = library;




      if (curLib.length === 0) {




        const picked = await pickAndRead();




        if (picked.files.length) {




          curLib = picked.files;




          setLibrary(picked.files);




          if (picked.root) setLibraryRoot(picked.root);




        }




      }




      const metaNow = curLib.map((f) => ({ path: f.path, name: f.name, ext: f.ext }));




      const s = restoreArchive(txt, metaNow);




      setSettings(s.settings); setReaderPrefs(s.readerPrefs); setAnnotations(s.annotations);




      setBacklinks(s.backlinks); setFlashcards(s.flashcards);




      setVocab(s.vocab); setEmbedMode(s.embedMode); setReadProgress(s.readProgress);




      setConcepts(s.concepts || { nodes: [], edges: [], aiGenerated: false });




      if (s.libraryRoot) setLibraryRoot(s.libraryRoot);




      showToast("已导入存档：按书名重连笔记/进度/向量（文库 " + curLib.length + " 本）");




    } catch (e: any) { showToast("存档解析失败：" + e.message); }




  }











  // ---------- 启动恢复 ----------





  useEffect(() => {





    let cancelled = false;





    (async () => {





      // Tauri：从 AppData 文件异步读回全部持久化数据（边注/反链/设置/进度/文库根/向量目录等）。
      // 同步阶段 init 在 Tauri 下为空，必须走异步文件读取，否则重开应用后什么都恢复不了——
      // 这也是桌面端「重开同一本书能看到之前的边注」的关键。
      if (isTauri()) {
        try {
          const s = await loadPersistedAsync();
          if (cancelled) return;
          if (s) {
            setSettings(s.settings); setReaderPrefs(s.readerPrefs); setAnnotations(s.annotations);
            setBacklinks(s.backlinks); setFlashcards(s.flashcards); setBookmarks(s.bookmarks || []);
            setVocab(s.vocab); setEmbedMode(s.embedMode); setReadProgress(s.readProgress);
            setConcepts(s.concepts || { nodes: [], edges: [], aiGenerated: false });
            setDataDir(s.dataDir ?? null);
            if (s.libraryRoot) {
              const files = await rebuildFromRoot(s.libraryRoot);
              if (cancelled) return;
              setLibrary(files); setLibraryRoot(s.libraryRoot);
              if (s.lastDocId) {
                const f = files.find((x) => docIdFor(x.path) === s.lastDocId);
                if (f) openFile(f);
              }
            }
            return;
          }
        } catch { /* 忽略，走下方手动导入分支 */ }
      }

      // Tauri：若保存过读书库根目录，自动重建文库并恢复上次在读的书（自动加载）





      if (isTauri() && init.libraryRoot) {





        try {





          const files = await rebuildFromRoot(init.libraryRoot);





          if (cancelled) return;





          setLibrary(files); setLibraryRoot(init.libraryRoot);





          if (init.lastDocId) {





            const f = files.find((x) => docIdFor(x.path) === init.lastDocId);





            if (f) openFile(f);





          }





        } catch { /* 忽略，等待用户手动导入 */ }





      }





      // 浏览器：文件需用户重新导入；笔记/进度/向量已在 init 中恢复





    })();





    return () => { cancelled = true; };





    // eslint-disable-next-line react-hooks/exhaustive-deps





  }, []);











  // 自动持久化（防抖）：任何相关状态变化都落盘





  useEffect(() => {





    persistDebounced(buildState());





    // eslint-disable-next-line react-hooks/exhaustive-deps





  }, [settings, readerPrefs, annotations, backlinks, flashcards, bookmarks, library, libraryRoot, vocab, embedMode, readProgress, currentDocId, concepts]);











  const currentDoc = currentDocId ? findDoc(docsRef.current, currentDocId) : null;





  const selAnns = sel ? annotations[sel.paraId] || [] : [];

  // 常驻栏用：当前书的全部边注（按章节→段落顺序）
  const docAnnotations: DocAnno[] = useMemo(() => {
    if (!currentDoc) return [];
    const out: DocAnno[] = [];
    for (const c of currentDoc.chapters) {
      for (const p of c.paragraphs) {
        const list = annotations[p.id] || [];
        for (const ann of list) out.push({ ann, chapterTitle: c.title, paraId: p.id, snippet: p.text.slice(0, 50) });
      }
    }
    return out;
  }, [currentDoc, annotations]);

  // 常驻栏用：当前书的已确认反链
  const docBacklinks = useMemo(() => {
    if (!currentDoc) return [];
    const ids = new Set(currentDoc.chapters.flatMap((c) => c.paragraphs).map((p) => p.id));
    return backlinks.filter((b) => b.confirmed && (ids.has(b.fromParaId) || ids.has(b.toParaId)));
  }, [backlinks, currentDoc]);

  // 常驻栏用：当前书的全部书签
  const docBookmarks = useMemo(() => {
    if (!currentDoc) return [];
    return bookmarks.filter((b) => b.docId === currentDoc.id);
  }, [bookmarks, currentDoc]);

  // 性能优化：把「逐段 filter 反链」预计算成 O(1) 的 Map，避免每段渲染都跑 O(反链数)
  const blCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of docBacklinks) {
      if (b.fromParaId) m.set(b.fromParaId, (m.get(b.fromParaId) || 0) + 1);
      if (b.toParaId) m.set(b.toParaId, (m.get(b.toParaId) || 0) + 1);
    }
    return m;
  }, [docBacklinks]);

  // 性能优化：把「逐段 bookmarks.some」预计算成 O(1) 的 Set
  const bookmarkSet = useMemo(() => new Set(docBookmarks.map((b) => b.paraId)), [docBookmarks]);











  // 视图显示逻辑：阅读模式且有 currentDoc → 阅读视图；阅读模式且没有 currentDoc → Hero 首屏





  const showHero = view === "reader" && !currentDoc;





  const showRead = view === "reader" && !!currentDoc;





  const hasSavedData = !!(init.lastDocId || Object.keys(init.annotations).length > 0 || init.flashcards.length > 0);











  return (





    <>





      <SunsetBackground />





      <CursorGlow />





      <FilmGrain opacity={0.12} />











      <div className="app">





        <TopNav





          library={library}





          docs={docs}





          currentDocId={currentDocId}





          view={view}





          embedMode={embedMode}










          onImport={handleImport}





          onView={(v) => { setView(v); if (v !== "reader") setDrawerOpen(false); }}





          onHome={goHome}





          onOpenDrawer={() => setDrawerOpen(true)}





          onSelectFile={openFile}






          searchQuery={searchQuery}
          onSearchChange={(q) => { setSearchQuery(q); runSearch(q); }}
          onSearchSubmit={(q) => runSearch(q)}
          searchHits={searchHits}
          searchOpen={searchOpen}
          onPickHit={pickSearchHit}
          onCloseSearch={() => { setSearchOpen(false); setSearchHits([]); }}





        />











        <div className="app-body">
          {/* 文库常驻左栏：桌面端始终可见；窄屏由 CSS 隐藏，改用抽屉 */}
          <Sidebar
            variant="column"
            library={library}
            docs={docs}
            currentDocId={currentDocId}
            view={view}
            embedMode={embedMode}
            onImport={handleImport}
            onSelectFile={openFile}
            onView={(v) => { setView(v); }}
            onHome={goHome}
            onExportAll={() => exportObsidian(undefined)}
            onExportArchive={handleExportArchive}
            onImportArchive={handleImportArchive}
            onClose={() => {}}
          />

        <Sidebar





          open={drawerOpen}





          library={library}





          docs={docs}





          currentDocId={currentDocId}





          view={view}





          embedMode={embedMode}





          onImport={handleImport}





          onSelectFile={openFile}





          onView={(v) => { setView(v); setDrawerOpen(false); }}





          onHome={goHome}





          onExportAll={() => exportObsidian(undefined)}





          onExportArchive={handleExportArchive}





          onImportArchive={handleImportArchive}





          onClose={() => setDrawerOpen(false)}





        />











        <main className="main">





          {importing && <div className="overlay">读取中…?</div>}





          {build.active && (





            <div className="overlay">





              <div className="build-box">





                <div className="build-label">{build.label}</div>





                <div className="progress"><div className="bar" style={{ width: `${build.total ? Math.round((build.done / build.total) * 100) : 0}%` }} /></div>





                <div className="muted">{build.done} / {build.total}</div>





              </div>





            </div>





          )}











          {showHero && (





            <Hero





              library={library}





              docs={docs}





              flashcards={flashcards}





              concepts={concepts}





              hasSavedData={hasSavedData}





              onImport={handleImport}





              onHome={goHome}





              onView={(v) => { setView(v); setDrawerOpen(false); }}





              onSelectFile={openFile}





            />





          )}











          {!showHero && view === "settings" && (<FadeContent key="settings" className="view-fade"><SettingsView settings={settings} update={updateSettings} dataDir={dataDir} onPickDataDir={handlePickDataDir} onClearDataDir={handleClearDataDir} onExportArchive={handleExportArchive} onImportArchive={handleImportArchive} /></FadeContent>)}





          {!showHero && view === "canvas" && (<FadeContent key="canvas" className="view-fade"><CanvasView docs={docs} backlinks={backlinks} annotations={annotations} onOpenPara={onOpenPara} /></FadeContent>)}





          {!showHero && view === "review" && (<FadeContent key="review" className="view-fade"><ReviewView flashcards={flashcards} docs={docs} onRate={rateCard} onOpenPara={onOpenPara} /></FadeContent>)}





          {!showHero && view === "concepts" && (





            <FadeContent key="concepts" className="view-fade"><ConceptGraphView graph={concepts} extracting={extractingConcepts} onExtract={extractConceptsWithAI} onOpenPara={onOpenPara} onDeleteNodes={deleteConceptNodes} /></FadeContent>
          )}

          {!showHero && view === "library" && (
            <FadeContent key="library" className="view-fade">
              <LibraryView
                library={library}
                docs={docs}
                currentDocTitle={currentDoc?.title}
                onSelectFile={openFile}
                onImport={handleImport}
                onResume={() => setView("reader")}
              />
            </FadeContent>
          )}












          {showRead && (





            <FadeContent key="reader" className="view-fade">





              <div className="read-bar">





                <button className="ghost back-lib" onClick={goHome} title="返回文库">← 文库</button>





                <BlurText text={currentDoc!.title} />





                <div className="read-bar-actions">





                  <button className="ghost aa" onClick={() => setReadingSettingsOpen((v) => !v)} title="阅读设置（字号/背景/行距…）">Aa</button>





                  <button className="ghost" onClick={() => exportObsidian(currentDoc || undefined)}>导出 MD</button>





                </div>





              </div>





              <div





                className={"read-scroll paper-" + readerPrefs.paper}





                onMouseDown={() => readingSettingsOpen && setReadingSettingsOpen(false)}





              >





                <Reader





                  doc={currentDoc!}





                  annotations={annotations}





                  blCountMap={blCountMap}





                  panelPinned={railOpen}





                  prefs={readerPrefs}





                  onSelect={onSelect}










                  onProgress={onProgress}





                  scrollToParaId={scrollToParaId}
                  scrollToChapterId={scrollToChapterId}
                  bookmarkSet={bookmarkSet}
                  onToggleBookmark={toggleBookmark}





                />





                {readingSettingsOpen && (





                  <ReadingSettings





                    prefs={readerPrefs}





                    onChange={updateReaderPrefs}





                    onClose={() => setReadingSettingsOpen(false)}





                  />





                )}





              </div>





            </FadeContent>





          )}











                  </main>

          {view === "reader" && currentDoc && (
            <ReaderRail
              open={railOpen}
              onClose={() => setRailOpen(false)}
              onToggle={() => setRailOpen((v) => !v)}
              width={railWidth}
              onResize={setRailWidth}
              doc={currentDoc}
              docAnnotations={docAnnotations}
              docBacklinks={docBacklinks}
              candidates={candidates}
              blLoading={blLoading}
              runBacklinks={runBacklinks}
              confirmBacklink={confirmBacklink}
              sel={sel}
              chatMessages={chatMessages}
              chatLoading={chatLoading}
              aiProgress={aiProgress}
              onChat={railAsk}
              onJumpChapter={onJumpChapter}
              onJumpPara={onJumpPara}
              onSaveAnnotation={saveAnnotation}
              onDeleteAnnotation={deleteAnnotation}
              docBookmarks={docBookmarks}
              onRemoveBookmark={removeBookmark}
              activeTab={railTab}
              onTab={setRailTab}
            />
          )}
        </div>











        {summary && (





          <button className="save-sum-btn" onClick={saveSummaryAsAnnotation}>存入边注</button>





        )}











        {toast && <div className="toast">{toast}</div>}





      </div>











      {/* 选区弹框：渲染到 body，避免被阅读区鼠标事件重触发（修复弹框跟随鼠标） */}





      {popup && createPortal(





        <SelectionPopup sel={popup} onAction={onAction} onClose={() => setPopup(null)} />,





        document.body





      )}





    </>





  );





}





