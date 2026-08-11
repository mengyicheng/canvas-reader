/**
 * CursorGlow — 跟随鼠标的柔和光晕。
 * 默认暗色主题下暖金色泽（径向渐变 + 大模糊 + screen 混合）。
 */
import { useEffect, useRef } from "react";

export function CursorGlow() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { el.style.display = "none"; return; }
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx, cy = ty;
    let raf = 0;
    function onMove(e: MouseEvent) { tx = e.clientX; ty = e.clientY; }
    function tick() {
      cx += (tx - cx) * 0.13;
      cy += (ty - cy) * 0.13;
      el!.style.transform = `translate(${cx - 260}px, ${cy - 260}px)`;
      raf = requestAnimationFrame(tick);
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("mousemove", onMove); };
  }, []);
  return <div ref={ref} className="fx-cursor" aria-hidden />;
}
