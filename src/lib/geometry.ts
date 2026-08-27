/** Small SVG helpers shared by every hand-drawn instrument in the app. */

export type Point = { x: number; y: number };

/**
 * Trig results are not bit-identical between Node and the browser, and an SVG
 * path that differs in its 15th decimal is still a hydration mismatch. Every
 * coordinate this module emits is quantised so both sides agree exactly.
 */
const q = (n: number) => Math.round(n * 1000) / 1000;

/** Angles are degrees clockwise from 12 o'clock. */
export function polar(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): Point {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: q(cx + radius * Math.cos(rad)), y: q(cy + radius * Math.sin(rad)) };
}

export function arcPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = Math.abs(endAngle - startAngle);
  // A full circle cannot be drawn with one arc command.
  if (sweep >= 359.999) {
    const top = polar(cx, cy, radius, 0);
    const bottom = polar(cx, cy, radius, 180);
    return [
      `M ${top.x} ${top.y}`,
      `A ${radius} ${radius} 0 1 1 ${bottom.x} ${bottom.y}`,
      `A ${radius} ${radius} 0 1 1 ${top.x} ${top.y}`,
    ].join(" ");
  }
  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, endAngle);
  const largeArc = sweep > 180 ? 1 : 0;
  const clockwise = endAngle > startAngle ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${clockwise} ${end.x} ${end.y}`;
}

/** Catmull-Rom -> cubic bezier, for weight lines that read as a trend not a zigzag. */
export function smoothPath(points: Point[], tension = 0.35): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1 = {
      x: q(p1.x + ((p2.x - p0.x) / 6) * tension * 2),
      y: q(p1.y + ((p2.y - p0.y) / 6) * tension * 2),
    };
    const c2 = {
      x: q(p2.x - ((p3.x - p1.x) / 6) * tension * 2),
      y: q(p2.y - ((p3.y - p1.y) / 6) * tension * 2),
    };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function regularPolygon(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation = 0,
): Point[] {
  return Array.from({ length: sides }, (_, i) =>
    polar(cx, cy, radius, rotation + (360 / sides) * i),
  );
}

export const toPolyPoints = (points: Point[]) =>
  points.map((p) => `${p.x},${p.y}`).join(" ");
