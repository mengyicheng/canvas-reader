@echo off
cd /d "%~dp0"
echo ============================================
echo  canvas_reader - 打包发布版 (Tauri build / release)
echo  当前目录: %CD%
echo ============================================
echo.
echo 首次打包会编译 Release 依赖，请耐心等待几分钟（比 dev 慢）...
echo.
npm run tauri build
echo.
echo [完成] 安装包已生成在：
echo   src-tauri\target\release\bundle\msi\   (MSI 安装包)
echo   src-tauri\target\release\bundle\nsis\  (EXE 安装包，若有启用)
echo   src-tauri\target\release\canvas_reader.exe   (可直接运行的 exe)
echo.
echo 按任意键关闭本窗口。
pause
