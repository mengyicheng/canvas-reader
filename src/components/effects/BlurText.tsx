import React from "react";

/**
 * React Bits 风格「模糊逐字揭示」——逐字符从模糊到清晰、依次错峰浮现。
 * 适合标题 / 品牌名等短文本。
 */
export function BlurText({
  text,
  className = "",
  step = 45,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  step?: number;
  as?: React.ElementType;
}) {
  const chars = Array.from(text);
  return (
    <Tag className={`fx-blurtext ${className}`}>
      {chars.map((ch, i) => (
        <span key={i} style={{ animationDelay: `${i * step}ms` } as React.CSSProperties}>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </Tag>
  );
}
