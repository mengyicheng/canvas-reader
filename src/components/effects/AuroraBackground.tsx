import React from "react";

/**
 * React Bits 风格「极光背景」——固定于视口背后、三团缓慢漂移的渐变光斑。
 * 纯 CSS 动画，不依赖任何三方库，Tauri(WebView2) 可正常渲染。
 */
export function AuroraBackground({ className = "" }: { className?: string }) {
  return (
    <div className={`fx-aurora ${className}`} aria-hidden="true">
      <span className="fx-aurora-b b1" />
      <span className="fx-aurora-b b2" />
      <span className="fx-aurora-b b3" />
    </div>
  );
}
