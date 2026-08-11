import { ImportedFile } from "./platform";

export interface TreeNode {
  type: "folder" | "file";
  name: string;
  path: string; // 文件夹：到该层的相对前缀；文件：完整相对路径
  children?: TreeNode[];
  file?: ImportedFile;
}

// 把平铺的 ImportedFile[]（带相对 path）构建成嵌套文件夹树，支撑「点下一层」逐层展开
export function buildFileTree(files: ImportedFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const prefix = i === 0 ? part : parts.slice(0, i + 1).join("/");
      if (!folderMap.has(prefix)) {
        const node: TreeNode = { type: "folder", name: part, path: prefix, children: [] };
        folderMap.set(prefix, node);
        const parentPrefix = i === 0 ? "" : parts.slice(0, i).join("/");
        const parentChildren = parentPrefix ? folderMap.get(parentPrefix)!.children! : root;
        parentChildren.push(node);
      }
    }
    const fileName = parts[parts.length - 1];
    const parentPrefix = parts.length > 1 ? parts.slice(0, parts.length - 1).join("/") : "";
    const parentChildren = parentPrefix ? folderMap.get(parentPrefix)!.children! : root;
    parentChildren.push({ type: "file", name: fileName, path: f.path, file: f });
  }
  return root;
}
