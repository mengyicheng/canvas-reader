import React, { useEffect, useRef, useState } from "react";

function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node;
  while (el && el !== document.body) {
    const s = getComputedStyle(el);
    const scrollable =
      (s.overflowY === "auto" || s.overflowY === "scroll" || s.overflow === "auto" || s.overflow === "scroll") &&
      el.scrollHeight > el.clientHeight;
    if (scrollable) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * React Bits 风格「滚动揭示」——进入视口（或所在滚动容器）时淡入。
 * - 默认带轻微上浮（transform）；当包裹的是 position:absolute 元素（如画布节点）时，
 *   需传 fade 用「仅透明度」变体，避免外层 transform 变成绝对定位元素的包含块而错位。
 * 健壮性：不支持 IntersectionObserver / 用户偏好减少动效 / 首屏已在视口 时立即显示；
 * 另有 1.2s 兜底定时器，确保内容绝不会卡在不可见状态。
 */
export function ScrollReveal({
  children,
  className = "",
  y = 16,
  delay = 0,
  fade = false,
}: {
  children: React.ReactNode;
  className?: string;
  y?: number;
  delay?: number;
  fade?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const root = findScrollParent(el.parentElement);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        });
      },
      { root, threshold: 0.05, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(el);
    const t = window.setTimeout(() => setShown(true), 1200);
    return () => {
      observer.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  const base = fade ? "fx-reveal-fade" : "fx-reveal";
  const style = fade
    ? ({ animationDelay: `${delay}ms` } as React.CSSProperties)
    : ({ ["--fx-y" as any]: `${y}px`, animationDelay: `${delay}ms` } as React.CSSProperties);

  return (
    <div ref={ref} className={`${base} ${shown ? "in" : ""} ${className}`} style={style}>
      {children}
    </div>
  );
}
