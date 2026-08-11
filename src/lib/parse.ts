import JSZip from "jszip";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Doc, Chapter, Para, paraId, BlockKind, RichSeg } from "../types";
import { ImportedFile } from "./platform";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

// 归一化书名：小写、去扩展名、去标点/空白，仅保留字母数字（含中文）。
// 用于让「同一本书」在不同机器/不同路径下仍得到相同标识，实现笔记/向量按书名关联。
export function normalizeTitle(t: string): string {
  return t
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

// 由书名得到稳定的「书标识」（不含路径）。换机/清浏览器后，存档按它重连笔记与向量。
export function bookKey(title: string): string {
  const norm = normalizeTitle(title);
  let h = 0;
  for (let i = 0; i < norm.length; i++) h = (h * 31 + norm.charCodeAt(i)) >>> 0;
  return "doc_" + h.toString(36);
}

// 由「相对路径」生成稳定 docId：优先以书名（文件名去扩展名）为主键，
// 仅当不同子目录下存在同名书时，再追加父目录短哈希做消歧，避免误合并。
// 这样同一本书在别的机器/别的路径下仍大概率得到相同 id；即使 id 不同，
// 存档导入也会按 bookKey(书名) 重连。
export function docIdFor(path: string): string {
  const base = path.split("/").pop() || path;
  const title = base.replace(/\.[^.]+$/, "");
  const norm = normalizeTitle(title);
  let h = 0;
  for (let i = 0; i < norm.length; i++) h = (h * 31 + norm.charCodeAt(i)) >>> 0;
  const parent = path.includes("/") ? path.replace(/\/[^/]+$/, "") : "";
  let ph = 0;
  for (let i = 0; i < parent.length; i++) ph = (ph * 31 + parent.charCodeAt(i)) >>> 0;
  return "doc_" + h.toString(36) + (parent ? "_" + ph.toString(36) : "");
}

export async function parseFile(f: ImportedFile): Promise<Doc> {
  const id = docIdFor(f.path);
  const title = f.name.replace(/\.[^.]+$/, "");
  if (f.ext === ".epub") return parseEpub(f, id, title);
  if (f.ext === ".pdf") return parsePdf(f, id, title);
  const text = await f.readText();
  if (f.ext === ".md") return parseMarkdown(text, id, title);
  return parsePlain(text, id, title, f.ext);
}

/* ---------- PDF（用 pdfjs 抽文本，按页分章，按行重组段落） ---------- */

interface PdfRow { y: number; x: number; str: string; }

// 把 pdfjs 的零散文本片段按「行」归并（同一行的 y 坐标相近），再按 y 从上到下、x 从左到右排序
function groupPdfLines(items: any[]): string[] {
  const rows: PdfRow[] = [];
  for (const it of items) {
    if (!it || typeof it.str !== "string") continue;
    const t = it.transform;
    if (!t || t.length < 6) continue;
    rows.push({ y: t[5], x: t[4], str: it.str });
  }
  rows.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: string[] = [];
  let curY: number | null = null;
  let cur = "";
  for (const r of rows) {
    if (curY === null || Math.abs(r.y - curY) > 2.2) {
      if (cur) lines.push(cur.trim());
      cur = r.str;
      curY = r.y;
    } else {
      const needSpace = cur && !cur.endsWith(" ") && r.str && !r.str.startsWith(" ");
      cur += (needSpace ? " " : "") + r.str;
    }
  }
  if (cur) lines.push(cur.trim());
  return lines.filter(Boolean);
}

async function parsePdf(f: ImportedFile, id: string, title: string): Promise<Doc> {
  const bytes = await f.readBytes();
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const chapters: Chapter[] = [];
  let ci = 0;
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const lines = groupPdfLines(content.items as any[]);
    const text = lines.join("\n");
    const paras = splitParagraphs(text);
    const paragraphs: Para[] = paras.map((p, pi) => ({
      id: paraId(id, ci, pi),
      docId: id,
      chapterId: "c" + ci,
      index: pi,
      text: p,
    }));
    if (paragraphs.length) chapters.push({ id: "c" + ci, title: `第 ${pageNum} 页`, paragraphs });
    ci++;
  }
  if (chapters.length === 0) chapters.push({ id: "c0", title: "正文", paragraphs: [] });
  return { id, title, type: ".pdf", chapters };
}

/* ---------- Markdown（Obsidian 风格） ---------- */

function stripFrontmatter(text: string): string {
  const m = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (m) return text.slice(m[0].length);
  return text;
}

// 行内 Markdown → 纯文本（用于 AI / 搜索 / 选区，不含任何标记）
function stripInlineMd(s: string): string {
  if (!s) return "";
  let t = s;
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1"); // 图片 -> 描述
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // 链接 -> 文本
  t = t.replace(/`([^`]+)`/g, "$1"); // 行内代码
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1"); // 加粗
  t = t.replace(/__([^_]+)__/g, "$1"); // 加粗
  t = t.replace(/\*([^*]+)\*/g, "$1"); // 斜体
  t = t.replace(/_([^_]+)_/g, "$1"); // 斜体
  t = t.replace(/<[^>]+>/g, ""); // 残留 HTML 标签
  return t.replace(/\s+/g, " ").trim();
}

// 行内 Markdown → 富文本片段（加粗 / 斜体），供阅读器渲染
function parseInlineRich(s: string): RichSeg[] {
  const segs: RichSeg[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\([^)]*\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) segs.push({ t: s.slice(last, m.index) });
    if (m[2] !== undefined) segs.push({ t: m[2], b: true });
    else if (m[3] !== undefined) segs.push({ t: m[3], b: true });
    else if (m[4] !== undefined) segs.push({ t: m[4], i: true });
    else if (m[5] !== undefined) segs.push({ t: m[5], i: true });
    else if (m[6] !== undefined) segs.push({ t: m[6] });
    else if (m[7] !== undefined) segs.push({ t: m[7] });
    last = re.lastIndex;
  }
  if (last < s.length) segs.push({ t: s.slice(last) });
  return segs.filter((x) => x.t.length > 0);
}

function parseTableRows(lines: string[]): string[][] {
  const rows: string[][] = [];
  for (const ln of lines) {
    const t = ln.trim();
    if (/^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(t)) continue; // 分隔行
    const cells = t.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    rows.push(cells);
  }
  return rows;
}

// Markdown（Obsidian 风格）：保留语义块结构，而非把语法全剥离成纯文本。
// 阅读器已支持 h1–h6 / quote / li / img / hr / table / code 与行内 rich，
// 因此这里解析为结构化 Para，导入后排版与 EPUB 一致。
function parseMarkdown(text: string, id: string, title: string): Doc {
  text = stripFrontmatter(text);
  const lines = text.split(/\r?\n/);
  const chapters: Chapter[] = [];
  let ci = 0;
  let curTitle = title || "正文";
  let chapterParas: Para[] = [];

  const pushPara = (
    kind: BlockKind,
    txt: string,
    rich?: RichSeg[],
    rows?: string[][],
    src?: string,
    alt?: string
  ) => {
    const p: Para = {
      id: paraId(id, ci, chapterParas.length),
      docId: id,
      chapterId: "c" + ci,
      index: chapterParas.length,
      text: txt,
      kind,
    };
    if (rich) p.rich = rich;
    if (rows) p.rows = rows;
    if (src) p.src = src;
    if (alt) p.alt = alt;
    chapterParas.push(p);
  };

  const flushChapter = () => {
    if (chapterParas.length) {
      chapters.push({ id: "c" + ci, title: curTitle, paragraphs: chapterParas });
      ci++;
    }
    chapterParas = [];
  };

  type Block = { type: "p" | "ul" | "ol" | "quote" | "table" | "code"; lines: string[] };
  let block: Block | null = null;

  const flushBlock = () => {
    if (!block) return;
    const b = block;
    block = null;
    if (b.type === "code") {
      pushPara("code", b.lines.join("\n"));
    } else if (b.type === "quote") {
      const txt = b.lines.map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
      pushPara("quote", txt);
    } else if (b.type === "ul" || b.type === "ol") {
      for (const li of b.lines) {
        const t = li.replace(/^\s*([-*+]|\d+\.)\s+/, "");
        pushPara("li", stripInlineMd(t), parseInlineRich(t));
      }
    } else if (b.type === "table") {
      const rows = parseTableRows(b.lines);
      if (rows.length) pushPara("table", "", undefined, rows);
    } else {
      const raw = b.lines.join("\n").trim();
      const paras = raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
      for (const rp of paras) {
        const inline = rp.replace(/\s*\n\s*/g, " ");
        const cleaned = stripInlineMd(inline);
        if (cleaned) pushPara("p", cleaned, parseInlineRich(inline));
      }
    }
  };

  let inFence = false;

  for (const line of lines) {
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      if (!inFence) {
        flushBlock();
        inFence = true;
        block = { type: "code", lines: [] };
      } else {
        inFence = false;
        flushBlock();
      }
      continue;
    }
    if (inFence) {
      block!.lines.push(line);
      continue;
    }

    // 图片：独占一行
    const img = line.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (img) {
      flushBlock();
      pushPara("img", img[1] || "", undefined, undefined, img[2], img[1]);
      continue;
    }

    // 分割线
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushBlock();
      pushPara("hr", "");
      continue;
    }

    // 标题：H1/H2 作为章节分界；H3–H6 作为正文内小标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushBlock();
      const level = h[1].length;
      const htext = stripInlineMd(h[2].trim());
      if (level <= 2) {
        flushChapter();
        curTitle = htext || curTitle;
      } else {
        pushPara(("h" + level) as BlockKind, htext);
      }
      continue;
    }

    // 表格（连续 | 行）
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (block?.type !== "table") {
        flushBlock();
        block = { type: "table", lines: [] };
      }
      block!.lines.push(line.trim());
      continue;
    } else if (block?.type === "table") {
      flushBlock();
    }

    // 引用块
    if (/^\s*>\s?/.test(line)) {
      if (block?.type !== "quote") {
        flushBlock();
        block = { type: "quote", lines: [] };
      }
      block!.lines.push(line);
      continue;
    } else if (block?.type === "quote") {
      flushBlock();
    }

    // 列表
    const li = line.match(/^\s*([-*+]|\d+\.)\s+/);
    if (li) {
      const t = /^\d/.test(li[1]) ? "ol" : "ul";
      if (block?.type !== t) {
        flushBlock();
        block = { type: t, lines: [] };
      }
      block!.lines.push(line);
      continue;
    } else if (block?.type === "ul" || block?.type === "ol") {
      flushBlock();
    }

    // 空行：结束当前段落块
    if (/^\s*$/.test(line)) {
      flushBlock();
      continue;
    }

    // 默认：段落
    if (block?.type !== "p") {
      flushBlock();
      block = { type: "p", lines: [] };
    }
    block!.lines.push(line);
  }

  flushBlock();
  flushChapter();
  if (chapters.length === 0) chapters.push({ id: "c0", title: "正文", paragraphs: [] });
  return { id, title, type: ".md", chapters };
}

/* ---------- 纯文本 ---------- */

function parsePlain(text: string, id: string, title: string, ext: string): Doc {
  const paras = splitParagraphs(text);
  const paragraphs: Para[] = paras.map((p, pi) => ({
    id: paraId(id, 0, pi),
    docId: id,
    chapterId: "c0",
    index: pi,
    text: p,
  }));
  return { id, title, type: ext, chapters: [{ id: "c0", title: "正文", paragraphs }] };
}

/* ---------- EPUB（参考微信读书重排版：丢弃原书样式，仅抽取语义块） ---------- */

interface Block {
  kind: BlockKind;
  text: string;
  rich?: RichSeg[];
  src?: string;
  alt?: string;
  rows?: string[][];
}

// 视为「块级」的标签：遇到会从当前缓冲区起一个新块
const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "header", "footer", "aside", "main", "nav", "address",
  "blockquote", "ul", "ol", "li", "dl", "dt", "dd", "table", "tr", "td", "th", "caption",
  "figure", "figcaption", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "body",
]);
// 直接丢弃、不产生内容的标签
const SKIP_TAGS = new Set(["script", "style", "meta", "link", "head", "title", "base", "colgroup", "col", "tbody", "thead"]);
const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff",
};

async function parseEpub(f: ImportedFile, id: string, title: string): Promise<Doc> {
  const bytes = await f.readBytes();
  const zip = await JSZip.loadAsync(bytes);
  const container = zip.file("META-INF/container.xml");
  if (!container) throw new Error("无效的 epub：缺少 container.xml");
  const xml = await container.async("string");
  const m = xml.match(/full-path="([^"]+)"/);
  if (!m) throw new Error("无效的 epub：找不到 OPF 路径");
  const opfPath = m[1];
  const opfDir = opfPath.includes("/") ? opfPath.replace(/\/[^/]+$/, "") : "";
  const opf = zip.file(opfPath);
  if (!opf) throw new Error("找不到 OPF 文件");
  const opfXml = await opf.async("string");

  // 解析 manifest：捕获 id / href / properties（properties="nav" 即导航/TOC 页，需跳过）
  const manifest: Record<string, string> = {};
  const navIdrefs = new Set<string>();
  const itemRe = /<item\b([^>]*?)\/?>/gi;
  let im: RegExpExecArray | null;
  while ((im = itemRe.exec(opfXml))) {
    const attrs = im[1];
    const idM = attrs.match(/\bid="([^"]+)"/i);
    const hrefM = attrs.match(/\bhref="([^"]+)"/i);
    const propM = attrs.match(/\bproperties="([^"]+)"/i);
    if (!idM || !hrefM) continue;
    manifest[idM[1]] = hrefM[1];
    if (propM && /\bnav\b/i.test(propM[1])) navIdrefs.add(idM[1]);
  }

  const spineBlock = opfXml.match(/<spine[^>]*>([\s\S]*?)<\/spine>/);
  const idrefs: string[] = [];
  if (spineBlock) {
    const irRe = /<itemref\s+[^>]*idref="([^"]+)"/g;
    let r: RegExpExecArray | null;
    while ((r = irRe.exec(spineBlock[1]))) idrefs.push(r[1]);
  }

  const resolve = (p: string) =>
    p.split("/").reduce((acc, part) => {
      if (part === "." || part === "") return acc;
      if (part === "..") return acc.replace(/\/[^/]*$/, "");
      return acc + "/" + part;
    }, "").replace(/^\//, "");

  // 启发式识别「伪标题」：很多 EPUB 不用真正的 <h1>-<h6>，
  // 而是 <p class="chapter"> / <div class="title"> 这类靠 class 假装标题的写法。
  // 微信读书的做法是识别语义而非标签，这里用 class/id/role 关键词 + 长度约束来提拔。
  function headingLevel(el: Element): number {
    const blockKids = Array.from(el.children).filter((c) =>
      BLOCK_TAGS.has(c.tagName.toLowerCase())
    ).length;
    if (blockKids > 0) return 0; // 含块级子元素 → 是容器不是标题
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length < 2 || t.length > 120) return 0; // 太短/太长都不像标题
    const hay = (
      (el.getAttribute("class") || "") + " " +
      (el.getAttribute("id") || "") + " " +
      (el.getAttribute("role") || "")
    ).toLowerCase();
    if (/\b(chapter|chap|title|booktitle|book-title|head|heading|headline|h1|head1)\b/.test(hay)) return 2;
    if (/\b(sect|section|subtitle|sub-head|subhead|sub-title|h2)\b/.test(hay)) return 3;
    const m = hay.match(/\bh([3-6])\b/);
    if (m) return Number(m[1]);
    return 0;
  }

  // 抽取一个 XHTML 文档的语义块：遍历 DOM，丢弃全部 class/style，按语义重排。
  // 用「富文本片段」缓冲区替代纯字符串，保留行内加粗/斜体；并提拔伪标题。
  async function extractBlocks(body: Element, xhtmlDir: string): Promise<Block[]> {
    const blocks: Block[] = [];
    let segs: RichSeg[] = [];
    const textOf = (el: Element) => (el.textContent || "").replace(/\s+/g, " ").trim();

    const flush = (quote: boolean) => {
      if (segs.length === 0) return;
      const plain = segs.map((s) => s.t).join("").replace(/\s+/g, " ").trim();
      if (!plain) { segs = []; return; }
      const hasRich = segs.some((s) => s.b || s.i || s.t.includes("\n"));
      blocks.push({ kind: quote ? "quote" : "p", text: plain, rich: hasRich ? segs : undefined });
      segs = [];
    };

    async function imgDataUri(src: string): Promise<string> {
      const clean = src.split("#")[0].split("?")[0];
      if (!clean) return "";
      const cands = [
        resolve(xhtmlDir ? xhtmlDir + "/" + clean : clean),
        resolve(clean),
        clean.replace(/^\//, ""),
      ];
      for (const c of cands) {
        const zf = zip.file(c);
        if (!zf) continue;
        const ext = (clean.split(".").pop() || "png").toLowerCase();
        const mime = MIME[ext] || "image/png";
        try { const b64 = await zf.async("base64"); return `data:${mime};base64,${b64}`; } catch { /* ignore */ }
      }
      return "";
    }

    async function visit(node: Element, quote: boolean, fmt: { b?: boolean; i?: boolean }) {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
          const v = (child.nodeValue || "").replace(/\s+/g, " ");
          if (v) segs.push({ t: v, ...fmt });
          continue;
        }
        if (child.nodeType !== 1) continue;
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (SKIP_TAGS.has(tag)) continue;
        if (tag === "br") { segs.push({ t: "\n", ...fmt }); continue; }
        if (tag === "img") {
          flush(quote);
          const alt = el.getAttribute("alt") || "";
          const src = el.getAttribute("src") || "";
          const uri = src ? await imgDataUri(src) : "";
          if (uri) blocks.push({ kind: "img", text: alt, src: uri, alt });
          else if (alt) { segs.push({ t: alt, ...fmt }); flush(quote); }
          continue;
        }
        if (tag === "hr") { flush(quote); blocks.push({ kind: "hr", text: "" }); continue; }
        if (/^h[1-6]$/.test(tag)) {
          flush(quote);
          const t = textOf(el);
          if (t) blocks.push({ kind: tag as BlockKind, text: t, rich: [{ t }] });
          continue;
        }
        if (tag === "b" || tag === "strong" || tag === "dt") { await visit(el, quote, { ...fmt, b: true }); continue; }
        if (tag === "i" || tag === "em" || tag === "cite" || tag === "var") { await visit(el, quote, { ...fmt, i: true }); continue; }
        if (tag === "blockquote") { flush(quote); await visit(el, true, fmt); flush(true); continue; }
        if (tag === "ul" || tag === "ol") {
          flush(quote);
          const ordered = tag === "ol";
          let n = 1;
          for (const li of Array.from(el.children)) {
            if (li.tagName.toLowerCase() === "li") {
              const t = textOf(li);
              if (t) { blocks.push({ kind: "li", text: (ordered ? n + ". " : "• ") + t }); n++; }
            } else {
              await visit(li, quote, fmt);
            }
          }
          continue;
        }
        if (tag === "table") {
          flush(quote);
          const rows: string[][] = [];
          for (const tr of Array.from(el.querySelectorAll("tr"))) {
            const cells = Array.from(tr.querySelectorAll("th,td")).map((c) => textOf(c));
            if (cells.length) rows.push(cells);
          }
          const flat = rows.map((r) => r.join(" ｜ ")).join("\n");
          blocks.push({ kind: "table", text: flat, rows });
          continue;
        }
        if (tag === "pre") {
          flush(quote);
          const t = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (t) blocks.push({ kind: "p", text: t, rich: [{ t }] });
          continue;
        }
        // 伪标题提拔（class/id 关键词，且非容器、长度合理）
        const lvl = headingLevel(el);
        if (lvl) {
          flush(quote);
          const t = textOf(el);
          if (t) blocks.push({ kind: ("h" + lvl) as BlockKind, text: t, rich: [{ t }] });
          continue;
        }
        if (BLOCK_TAGS.has(tag)) { flush(quote); await visit(el, quote, fmt); flush(quote); }
        else { await visit(el, quote, fmt); } // 行内标签（span/a/sub/sup）递归以保留强调
      }
    }
    await visit(body, false, {});
    flush(false);
    return blocks;
  }

  function buildChapter(blocks: Block[], ci: number): Chapter | null {
    if (blocks.length === 0) return null;
    // 章节标题取首个标题（含伪标题）；该标题块不再作为正文重复出现
    const hIdx = blocks.findIndex((b) => /^h[1-6]$/.test(b.kind || ""));
    let chTitle = `第${ci + 1}节`;
    if (hIdx >= 0) { chTitle = blocks[hIdx].text; blocks.splice(hIdx, 1); }
    if (blocks.length === 0) return null;
    const paragraphs: Para[] = blocks.map((b, pi) => ({
      id: paraId(id, ci, pi),
      docId: id,
      chapterId: "c" + ci,
      index: pi,
      text: b.text,
      kind: b.kind,
      src: b.src,
      alt: b.alt,
      rows: b.rows,
      rich: b.rich,
    }));
    return { id: "c" + ci, title: chTitle, paragraphs };
  }

  const chapters: Chapter[] = [];
  let ci = 0;
  for (const idref of idrefs) {
    if (navIdrefs.has(idref)) continue; // 跳过导航/TOC 页
    const href = manifest[idref];
    if (!href) continue;
    const file = zip.file(resolve(href));
    if (!file) continue;
    const html = await file.async("string");
    if (/epub:type\s*=\s*["']toc["']/i.test(html) || /<nav[^>]*\bid\s*=\s*["']toc["']/i.test(html)) continue;
    const doc = new DOMParser().parseFromString(html, "application/xhtml+xml");
    const bodyEl = (doc.querySelector("body") || doc.documentElement) as Element | null;
    if (!bodyEl) continue;
    const htmlPath = resolve(href);
    const xhtmlDir = htmlPath.includes("/") ? htmlPath.replace(/\/[^/]+$/, "") : "";
    const blocks = await extractBlocks(bodyEl, xhtmlDir);
    const ch = buildChapter(blocks, ci);
    if (ch) { chapters.push(ch); ci++; }
  }

  // 兜底：spine 为空时，遍历所有 xhtml 文件
  if (chapters.length === 0) {
    const all = Object.values(zip.files).filter((x: any) => !x.dir && /\.x?html?$/i.test(x.name));
    for (const file of all as JSZip.JSZipObject[]) {
      const html = await file.async("string");
      const doc = new DOMParser().parseFromString(html, "application/xhtml+xml");
      const bodyEl = (doc.querySelector("body") || doc.documentElement) as Element | null;
      if (!bodyEl) continue;
      const xhtmlDir = file.name.includes("/") ? file.name.replace(/\/[^/]+$/, "") : "";
      const blocks = await extractBlocks(bodyEl, xhtmlDir);
      const ch = buildChapter(blocks, ci);
      if (ch) { chapters.push(ch); ci++; }
    }
  }
  return { id, title, type: ".epub", chapters };
}
