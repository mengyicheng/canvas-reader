/**
 * CountUp — 数字从 0 滚到 target（requestAnimationFrame + 缓出）。
 * 适合 Hero 数据条、统计卡片。
 * 触发方式：进入视口时（基于 ref + ResizeObserver 不可靠，改用 mount-once 简单稳定）。
 */
import { useEffect, useRef, useState } from "react";

export function CountUp({
  target,
  suffix = "",
  prefix = "",
  duration = 1600,
  decimals = 0,
  className,
}: {
  target: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  decimals?: number;
  className?: string;
}) {
  const [val, setVal] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    function step(ts: number) {
      if (start.current === null) start.current = ts;
      const elapsed = ts - start.current;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(target * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  const display = decimals === 0 ? Math.round(val) : val.toFixed(decimals);
  return (
    <span className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
