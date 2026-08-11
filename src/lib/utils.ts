// 轻量 className 合并工具（shadcn 风格）
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
