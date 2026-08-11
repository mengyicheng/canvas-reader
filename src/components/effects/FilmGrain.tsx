/**
 * FilmGrain — 全屏胶片颗粒叠加。
 * 用 base64 内联的小 SVG turbulence 平铺，避免外链依赖。
 * pointer-events:none 不会拦点击；mix-blend-mode: overlay 让颗粒随暗变暗、随亮变亮。
 */
export function FilmGrain({ opacity = 0.12 }: { opacity?: number }) {
  // 极小的 SVG 噪点（feTurbulence + feColorMatrix）
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>` +
      `<filter id='n'>` +
      `<feTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2' stitchTiles='stitch'/>` +
      `<feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 0'/>` +
      `</filter>` +
      `<rect width='100%' height='100%' filter='url(#n)'/>` +
      `</svg>`,
  );
  const url = `url("data:image/svg+xml;charset=utf-8,${svg}")`;
  return (
    <div
      className="fx-grain"
      aria-hidden
      style={{
        opacity,
        backgroundImage: url,
      }}
    />
  );
}
