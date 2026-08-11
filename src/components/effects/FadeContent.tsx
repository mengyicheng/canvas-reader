import React from "react";

/** React Bits 风格「淡入」——挂载时从下方轻微上浮淡入。 */
export function FadeContent({
  children,
  className = "",
  delay = 0,
  y = 12,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <div
      className={`fx-fade ${className}`}
      style={{ animationDelay: `${delay}ms`, ["--fx-y" as any]: `${y}px` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
