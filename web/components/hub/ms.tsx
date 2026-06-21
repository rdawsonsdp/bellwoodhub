import type { CSSProperties } from "react";

/** Material Symbols Rounded glyph. */
export function Ms({
  name,
  size = 18,
  color,
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span className="vkb-ms" style={{ fontSize: size, color, ...style }}>
      {name}
    </span>
  );
}
