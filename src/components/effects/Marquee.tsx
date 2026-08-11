/**
 * Marquee — 顶部无限循环跑马灯。
 * 子元素在条带里水平移动，循环无缝（复制两份并位移 50%）。
 */
import { ReactNode } from "react";

export function Marquee({
  children,
  speed = 30,
  className,
}: {
  children: ReactNode;
  speed?: number; // 每秒位移像素
  className?: string;
}) {
  return (
    <div
      className={"fx-marquee " + (className || "")}
      style={{ ["--marquee-speed" as any]: `${speed}s` }}
      aria-hidden
    >
      <div className="fx-marquee-track">{children}</div>
      <div className="fx-marquee-track" aria-hidden>{children}</div>
    </div>
  );
}
