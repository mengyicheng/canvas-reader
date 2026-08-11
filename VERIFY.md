# 本机验证清单（Wander & Read · Tauri 桌面端）

沙箱里已通过：`tsc --noEmit` 0 错误 / `vite build` 0 错误 / `cargo check` 编译干净 /
dev server 全部模块 HTTP 200。以下需你在本机（装有 C 链接器）跑真实渲染验证。

## 0. 启动
```powershell
# 推荐：一键验证（类型检查 → 前端构建 → 桌面二进制构建）
npm run verify

# 或直接进开发模式看界面
npm run tauri dev
```
> 若 `npm run verify` 报「找不到链接器」：用 **Developer Command Prompt for VS** 重开，
> 或装 MinGW 并把 gcc 加入 PATH，脚本会自动探测并注入。

## 1. 数据目录（#38 · 非 C 盘向量落盘）
- [ ] 设置页 → 选「数据目录」，对话框**选 C 盘任意文件夹应被拒绝**并提示另选
      （已修：守卫现在覆盖 `C:\任意子目录`，不止盘符根）
- [ ] 选 `D:/WanderRead` 这类非 C 盘目录，确认保存成功
- [ ] 重开应用，确认向量按 `<dataDir>/<docId>/vectors.json` 落盘（每本书一个目录）
- [ ] 某本书向量 > 50MB 时，顶部出现「⚠ 部分书籍向量较大」预警 toast
- [ ] 同名书（不同目录两本）分别落盘到**不同目录**，不互相覆盖（已修）

## 2. 一步全量存档（#37 · 按书名重连）
- [ ] 阅读几本、写边注、确认几条跨文章反链
- [ ] 设置页「导出存档」→ 得到 JSON
- [ ] 清浏览器存储 / 换机器（或 `npm run tauri dev` 重置）/ 重新导入原文件夹重建文库
- [ ] 导入刚才的存档 → 笔记 / 进度 / 向量**按书名一步重连**（文库 N 本）
- [ ] 同名不同路径的书也能正确重连（docId 以书名哈希为主键）

## 3. 三表面导航（#39）
- [ ] 文库**常驻左侧栏**（桌面端始终可见；窄屏 <860px 自动收为顶部抽屉）
- [ ] 顶部导航干净：Library / Canvas / Review / Concepts / Settings
- [ ] 开书只有**单一入口**（点左侧栏文件），无重复开书入口、无 read 视图重载
- [ ] 列栏在 ~900px 宽时不至于挤占正文（如偏窄，告诉我，我调断点）

## 4. 跨书检索（#42）
- [ ] 顶栏搜索框输入关键词 → 下拉按**书名分组**列出命中段落，命中词高亮
- [ ] 语义模式（配好嵌入 API）下，输入相关概念也能召回（回车才查，避免频打 API）
- [ ] 点搜索结果 → 跳到对应书对应段落并滚动定位
- [ ] 文库尚未建完向量时搜索可能空，建完后再搜正常（已知边界）

## 5. 知识表面（#43 · 已确认完整，无需修复）
- [ ] Canvas：写边注/确认反链后，画布长出节点与连线；可缩放/平移/拖动/双击跳原文
- [ ] Concepts：反链足够时自动成图；点「✨ AI 提炼概念」生成概念节点 + 关系
- [ ] 两者均有空状态引导文案

## 6. 浏览器端（对比）
- [ ] 纯 `vite dev` 网页模式：dataDir 恒为 null、向量随存档 JSON 走，其余功能可用

## 已知沙箱限制（非 bug）
- 沙箱无 C 链接器 → 无法出最终二进制；dev server 因 safe-delete 限制需改名 `.vite` 才能起。
- 以上均在你本机正常。

## 改动文件（本轮）
`src/lib/datadir.ts`（C 盘守卫 + 同名书去重）、`src/lib/search.ts`(新)、
`src/lib/embed.ts`(导出 embedQuery/tokenize)、`src/components/TopNav.tsx`(搜索 UI)、
`src/components/Sidebar.tsx`(列栏)、`src/components/Settings.tsx`(数据目录)、
`src/App.tsx`(接线)、`src-tauri/capabilities/default.json`(fs 权限)、
`scripts/verify-build.ps1`(一键验证)、`package.json`(verify 脚本)。
