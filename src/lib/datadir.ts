// 数据目录（向量/缓存落盘）管理。
// 对应需求 q-2：向量按「书名键」存到用户选定的固定位置（不要 C 盘），过大提前预警。
// 浏览器端没有真实文件系统，dataDir 恒为 null，仍走存档 JSON（#37）。
// 所有 Tauri 调用都做特性检测 + try/catch，失败不阻塞主流程。

import { isTauri } from "./platform";

// 单本书向量超过此体积即预警（默认 50MB）。用户要求「向量多大需提前说明」。
export const VECTOR_WARN_BYTES = 50 * 1024 * 1024;

export function isDataDirSupported(): boolean {
  return isTauri();
}

// 存储键：用完整 docId（含同名消歧的父目录哈希），避免两本同名书（不同目录）
// 在 dataDir 里落到同一目录、向量互相覆盖。dataDir 是本机缓存，跨机重连由存档(#37)负责。
function storageKeyOfDocId(docId: string): string {
  return docId;
}

// 把 paraId 为键的向量，按书名键分组：Record<bookKey, Record<paraId, number[]>>
export function groupVectorsByBook(vectors: Record<string, number[]>): Record<string, Record<string, number[]>> {
  const out: Record<string, Record<string, number[]>> = {};
  for (const paraId of Object.keys(vectors)) {
    const docId = paraId.includes("#") ? paraId.slice(0, paraId.indexOf("#")) : paraId;
    const bk = storageKeyOfDocId(docId);
    (out[bk] ||= {})[paraId] = vectors[paraId];
  }
  return out;
}

export function estimateBytes(obj: unknown): number {
  return new TextEncoder().encode(JSON.stringify(obj)).length;
}

export function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// 弹出文件夹选择对话框，默认要求非系统盘。返回绝对路径；取消返回 null。
// 选了 C 盘则抛 "DATA_DIR_ON_C"，由调用方提示用户另选。
export async function pickDataDir(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const sel = (await open({
    directory: true,
    title: "选择阅读数据存放目录（建议非系统盘，如 D:/WanderRead）",
    multiple: false,
  })) as string | null;
  if (!sel) return null;
  // Windows 下拒绝任何落在 C 盘的路径（含子目录，如 C:\MyData\WanderRead），不仅盘符根
  if (/^[A-Za-z]:/i.test(sel) && sel[0].toUpperCase() === "C") {
    throw new Error("DATA_DIR_ON_C");
  }
  return sel;
}

async function ensureDir(dir: string): Promise<void> {
  const { mkdir } = await import("@tauri-apps/plugin-fs");
  await mkdir(dir, { recursive: true } as any);
}

// 把单本书的向量写入 <dataDir>/<bookKey>/vectors.json，返回体积与是否超阈值
export async function saveBookVectors(
  dataDir: string,
  bookKey: string,
  vectors: Record<string, number[]>,
): Promise<{ bytes: number; warn: boolean }> {
  const dir = `${dataDir}/${bookKey}`;
  await ensureDir(dir);
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  const payload = JSON.stringify({ vectors });
  const bytes = estimateBytes({ vectors });
  await writeTextFile(`${dir}/vectors.json`, payload);
  return { bytes, warn: bytes > VECTOR_WARN_BYTES };
}

// 读取单本书的向量缓存；不存在/损坏返回 null
export async function loadBookVectors(
  dataDir: string,
  bookKey: string,
): Promise<Record<string, number[]> | null> {
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const txt = await readTextFile(`${dataDir}/${bookKey}/vectors.json`);
    const j = JSON.parse(txt);
    return j && typeof j.vectors === "object" ? j.vectors : null;
  } catch {
    return null;
  }
}

// 一次性把全部向量按书名落盘；返回超阈值书名列表（供预警）
export async function persistAllVectors(
  dataDir: string,
  vectors: Record<string, number[]>,
): Promise<string[]> {
  const grouped = groupVectorsByBook(vectors);
  const warned: string[] = [];
  for (const bk of Object.keys(grouped)) {
    const r = await saveBookVectors(dataDir, bk, grouped[bk]);
    if (r.warn) warned.push(bk);
  }
  return warned;
}

// 从磁盘按当前文库书名键载入向量缓存（启动加速，避免重复建向量）
export async function loadAllVectors(
  dataDir: string,
  bookKeys: string[],
): Promise<Record<string, number[]> | null> {
  const merged: Record<string, number[]> = {};
  for (const bk of bookKeys) {
    const v = await loadBookVectors(dataDir, bk);
    if (v) Object.assign(merged, v);
  }
  return Object.keys(merged).length ? merged : null;
}
