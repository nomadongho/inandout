/**
 * geometry.js
 * Collision detection and line-of-sight utilities.
 *
 * All coordinates are in the 0–100 game grid.
 */

// ── Point / rectangle tests ───────────────────────────────────────────────────

/**
 * Return true if point (px, py) is strictly inside rectangle {x, y, w, h}.
 * @param {number} px
 * @param {number} py
 * @param {{x:number, y:number, w:number, h:number}} rect
 * @returns {boolean}
 */
export function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w &&
         py >= rect.y && py <= rect.y + rect.h;
}

/**
 * Return true if point is inside any rectangle in the array.
 * @param {number} px
 * @param {number} py
 * @param {Array<{x,y,w,h}>} rects
 * @returns {boolean}
 */
export function pointInAnyRect(px, py, rects) {
  return rects.some(r => pointInRect(px, py, r));
}

// ── Line segment intersection ─────────────────────────────────────────────────

/**
 * Return true if segment (ax,ay)→(bx,by) intersects segment (cx,cy)→(dx,dy).
 * Uses the signed-area / cross-product method.
 * @returns {boolean}
 */
export function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1x = bx - ax, d1y = by - ay;
  const d2x = dx - cx, d2y = dy - cy;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false; // parallel / collinear
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / cross;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Return true if segment (ax,ay)→(bx,by) crosses rectangle {x, y, w, h}.
 * Checks all 4 edges.  Returns true if either endpoint is inside the rect.
 * @returns {boolean}
 */
export function segmentIntersectsRect(ax, ay, bx, by, rect) {
  const { x, y, w, h } = rect;
  if (pointInRect(ax, ay, rect) || pointInRect(bx, by, rect)) return true;
  const rx2 = x + w, ry2 = y + h;
  return (
    segmentsIntersect(ax, ay, bx, by, x,   y,   rx2, y  ) ||  // top edge
    segmentsIntersect(ax, ay, bx, by, x,   ry2, rx2, ry2) ||  // bottom edge
    segmentsIntersect(ax, ay, bx, by, x,   y,   x,   ry2) ||  // left edge
    segmentsIntersect(ax, ay, bx, by, rx2, y,   rx2, ry2)     // right edge
  );
}

// ── Line of sight ─────────────────────────────────────────────────────────────

/**
 * Return true if (ax,ay) has clear line of sight to (bx,by)
 * — i.e. the segment does NOT cross any wall in the array.
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {Array<{x,y,w,h}>} walls
 * @returns {boolean}
 */
export function hasLineOfSight(ax, ay, bx, by, walls) {
  return !walls.some(r => segmentIntersectsRect(ax, ay, bx, by, r));
}

/**
 * Count the number of walls the segment (ax,ay)→(bx,by) passes through.
 * Used for sound attenuation.
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {Array<{x,y,w,h}>} walls
 * @returns {number}
 */
export function wallsOnSegment(ax, ay, bx, by, walls) {
  let count = 0;
  for (const r of walls) {
    if (segmentIntersectsRect(ax, ay, bx, by, r)) count++;
  }
  return count;
}

// ── Wall-aware movement ───────────────────────────────────────────────────────

/**
 * Try to move from (x, y) by (dx, dy), stopping at walls.
 * Implements axis-split sliding: if the combined move is blocked, try
 * x-only then y-only so the player can slide along wall faces.
 *
 * @param {number} x         current grid x
 * @param {number} y         current grid y
 * @param {number} dx        desired Δx
 * @param {number} dy        desired Δy
 * @param {Array<{x,y,w,h}>} walls
 * @param {number} [margin]  clearance radius around the player centre
 * @returns {{ x: number, y: number }}
 */
export function moveWithCollision(x, y, dx, dy, walls, margin = 1.5) {
  function blocked(nx, ny) {
    for (const r of walls) {
      if (nx >= r.x - margin && nx <= r.x + r.w + margin &&
          ny >= r.y - margin && ny <= r.y + r.h + margin) return true;
    }
    return false;
  }

  const nx = x + dx;
  const ny = y + dy;

  if (!blocked(nx, ny)) return { x: nx, y: ny };
  if (!blocked(nx, y))  return { x: nx, y };
  if (!blocked(x, ny))  return { x,     y: ny };
  return { x, y };
}

// ── Zone queries ──────────────────────────────────────────────────────────────

/**
 * Return 1.0 if point (px, py) is inside any shadow zone, 0 otherwise.
 * @param {number} px
 * @param {number} py
 * @param {Array<{x,y,w,h}>} zones
 * @returns {number}
 */
export function inShadowZone(px, py, zones) {
  return pointInAnyRect(px, py, zones) ? 1.0 : 0.0;
}

/**
 * Return 1.0 if point (px, py) is inside any light zone, 0 otherwise.
 * @param {number} px
 * @param {number} py
 * @param {Array<{x,y,w,h}>} zones
 * @returns {number}
 */
export function inLightZone(px, py, zones) {
  return pointInAnyRect(px, py, zones) ? 1.0 : 0.0;
}
