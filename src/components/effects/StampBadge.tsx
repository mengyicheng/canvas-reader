/**
 * StampBadge — 圆形复古徽章，可慢速旋转。
 * 在 Hero 右下角做"印章"装饰用。
 */
export function StampBadge({
  label,
  sublabel = "EST · 2026",
  size = 120,
  spin = false,
  className,
}: {
  label: string;
  sublabel?: string;
  size?: number;
  spin?: boolean;
  className?: string;
}) {
  // 圆周文字（环形带衬线字）
  const ringText = `${label} · ${sublabel} · `;
  return (
    <div
      className={"fx-stamp " + (spin ? "spin" : "") + " " + (className || "")}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="fx-stamp-svg">
        <defs>
          <path id="stampRing" d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
        </defs>
        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="1 3" />
        <text fontSize="7" letterSpacing="2" fill="currentColor" fontFamily="serif">
          <textPath href="#stampRing" startOffset="0">{ringText.repeat(3)}</textPath>
        </text>
        <text x="50" y="48" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor" fontFamily="serif">{label}</text>
        <text x="50" y="62" textAnchor="middle" fontSize="6" letterSpacing="1.2" fill="currentColor">{sublabel}</text>
        {/* 中心十字星 */}
        <g transform="translate(50,72)" stroke="currentColor" strokeWidth="0.7">
          <line x1="-3" y1="0" x2="3" y2="0" />
          <line x1="0" y1="-3" x2="0" y2="3" />
        </g>
      </svg>
    </div>
  );
}
