// 文件导入抽象：Tauri 用原生对话框（避免 webkitdirectory 这类浏览器专属 API），
// 浏览器开发态用 <input> 兜底，保证「网页端 vs 打包端」行为一致。
// 关键改动：每个文件保留「相对路径」(path)，用于构建文件夹树 + 稳定 docId（区分同名文件）。

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface ImportedFile {
  path: string; // 相对路径（含文件名），如 "小说/三体/三体.epub"
  name: string; // 文件名（不含路径）
  ext: string;
  readText(): Promise<string>;
  readBytes(): Promise<Uint8Array>;
}

const SUPPORTED = [".md", ".txt", ".epub", ".pdf"];

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

// 把 Tauri readDir 返回的（可能嵌套的）条目拍平，并计算相对 root 的路径。
// 注意：Tauri v2 递归 readDir 中，子目录条目的 e.path 可能为 undefined（只有 name），
// 因此这里不依赖 e.path，而是用 parentPath + e.name 自行拼出完整路径。
function pushFile(out: ImportedFile[], fullPath: string, name: string, root: string) {
  const rel = fullPath
    .slice(root.length)
    .replace(/^[\\/]/, "")
    .split(/[\\/]/)
    .join("/");
  out.push({
    path: rel,
    name,
    ext: extOf(name),
    readText: () => import("@tauri-apps/plugin-fs").then((m) => m.readTextFile(fullPath)),
    readBytes: () => import("@tauri-apps/plugin-fs").then((m) => m.readFile(fullPath).then((b: any) => new Uint8Array(b as ArrayBuffer))),
  });
}

// 自己逐层下钻，不依赖 Tauri 的 recursive 选项 / children 结构（不同版本语义不一致，
// 曾经导致子文件夹内容读不到），也不依赖 stat 权限。每个条目用 readDir(full) 试探：
// 成功=目录→继续下钻；抛错=文件→看扩展名决定是否收集。路径用 parentPath + e.name 自行
// 拼接，避开 e.path 在某些版本为 undefined 的坑。
async function collectTauri(dir: string, out: ImportedFile[]): Promise<void> {
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const walk = async (parentPath: string) => {
    const entries = await readDir(parentPath);
    for (const e of entries as any[]) {
      const full = parentPath + "/" + e.name;
      let isDir = false;
      try {
        await readDir(full);
        isDir = true;
      } catch {
        isDir = false;
      }
      if (isDir) {
        await walk(full);
        continue;
      }
      const ex = extOf(e.name);
      if (!SUPPORTED.includes(ex)) continue;
      pushFile(out, full, e.name, dir);
    }
  };
  await walk(dir);
}

export async function pickAndRead(): Promise<{ files: ImportedFile[]; root: string | null }> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = (await open({ directory: true, title: "选择你的读书库文件夹" })) as string | null;
    if (!dir) return { files: [], root: null };
    const out: ImportedFile[] = [];
    await collectTauri(dir, out);
    return { files: out, root: dir };
  }
  // 浏览器兜底（开发预览态用 webkitdirectory 选文件夹，体验与 Tauri 一致）
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.setAttribute("webkitdirectory", "");
    inp.setAttribute("directory", "");
    inp.multiple = true;
    inp.accept = ".md,.txt,.epub,.pdf";
    inp.onchange = async () => {
      const files = Array.from(inp.files || []);
      const out: ImportedFile[] = [];
      for (const f of files as File[]) {
        const ex = extOf(f.name);
        if (!SUPPORTED.includes(ex)) continue;
        const rel = (f as any).webkitRelativePath || f.name;
        out.push({
          path: rel,
          name: f.name,
          ext: ex,
          readText: () => f.text(),
          readBytes: () => f.arrayBuffer().then((b) => new Uint8Array(b)),
        });
      }
      resolve({ files: out, root: null });
    };
    inp.click();
  });
}

// Tauri 下根据保存的 root 自动重建文库（启动恢复用）
export async function rebuildFromRoot(root: string): Promise<ImportedFile[]> {
  const out: ImportedFile[] = [];
  await collectTauri(root, out);
  return out;
}

// ---------- 手动导入 / 导出读书存档（JSON） ----------
export async function pickJsonFile(): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const p = (await open({ filters: [{ name: "读书存档", extensions: ["json"] }], title: "选择读书存档" })) as string | null;
    if (!p) return null;
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    return readTextFile(p);
  }
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,application/json";
    inp.onchange = async () => {
      const f = (inp.files || [])[0];
      resolve(f ? await f.text() : null);
    };
    inp.click();
  });
}

// 导出文本到磁盘：桌面端用原生保存对话框 + fs 写盘（a.download 在 webview 里不会真正存盘，
// 会静默失败），浏览器开发态才用 blob + a.download 兜底，保证「网页端 vs 打包端」都能用。
export async function saveTextFile(content: string, defaultName: string): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = (await save({ defaultPath: defaultName, title: "导出 Markdown" })) as string | null;
    if (!path) return false; // 用户取消
    await writeTextFile(path, content);
    return true;
  }
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = defaultName; a.click();
  URL.revokeObjectURL(url);
  return true;
}

// 导出 JSON 存档（自动加载/手动加载两用）
export async function saveJsonFile(content: string, defaultName: string): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = (await save({ defaultPath: defaultName, title: "导出读书存档" })) as string | null;
    if (!path) return false;
    await writeTextFile(path, content);
    return true;
  }
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = defaultName; a.click();
  URL.revokeObjectURL(url);
  return true;
}
