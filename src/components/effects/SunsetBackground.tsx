/**
 * SunsetBackground — 暖橙日落三色光斑（替代原极光蓝紫版）。
 * 用三团径向渐变 缓慢漂移 + screen 混合，模拟日落天空的暖光层。
 * 适合深棕夜色背景，绝不刺眼。
 */
import { useEffect, useRef } from "react";

export function SunsetBackground() {
  const ref = useRef<HTMLDivElement | null>(null);
  // 让 prefers-reduced-motion 用户免于动画（CSS 也会做，这里只是 JS hook）
  useEffect(() => {}, []);
  return (
    <div ref={ref} className="fx-sunset" aria-hidden>
      <div className="fx-sun-b b1" />
      <div className="fx-sun-b b2" />
      <div className="fx-sun-b b3" />
      <div className="fx-sun-grain" />
    </div>
  );
}
