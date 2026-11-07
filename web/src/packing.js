/**
 * Conservative, deterministic plate nesting in print millimeters.
 * Coordinates are lower-left bounding-box coordinates, never model origins.
 * Models are only translated and rotated by quarter turns; never resized.
 * Rectangle footprints intentionally leave concavities unused for safety.
 */
const EPS = 1e-7;
const DEFAULTS = Object.freeze({ width: 256, height: 256, margin: 6, gap: 3 });

function config(options = {}) {
  const o = { ...DEFAULTS, maxItems: 1000, maxPlates: 200, ...options };
  for (const k of ['maxItems', 'maxPlates']) if (!Number.isInteger(o[k]) || o[k] < 1) throw new RangeError(`${k} must be a positive integer`);
  for (const k of ['width', 'height']) if (!Number.isFinite(o[k]) || o[k] <= 0) throw new RangeError(`${k} must be positive`);
  for (const k of ['margin', 'gap']) if (!Number.isFinite(o[k]) || o[k] < 0) throw new RangeError(`${k} must be non-negative`);
  if (o.width <= 2 * o.margin || o.height <= 2 * o.margin) throw new RangeError('Margins consume the printable plate');
  o.reserved = (o.reserved || []).map((r) => ({ ...r, x: Number(r.x), y: Number(r.y), width: Number(r.width), height: Number(r.height) }));
  for (const r of o.reserved) if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0) throw new RangeError('Invalid reserved rectangle');
  return o;
}
function intersects(a, b, clearance = 0) {
  return a.x < b.x + b.width + clearance - EPS && a.x + a.width + clearance > b.x + EPS && a.y < b.y + b.height + clearance - EPS && a.y + a.height + clearance > b.y + EPS;
}
function contains(a, b) { return b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.width <= a.x + a.width + EPS && b.y + b.height <= a.y + a.height + EPS; }
function splitFree(free, occupied) {
  const result = [];
  for (const f of free) {
    if (!intersects(f, occupied)) { result.push(f); continue; }
    if (occupied.x > f.x + EPS) result.push({ x: f.x, y: f.y, width: occupied.x - f.x, height: f.height });
    if (occupied.x + occupied.width < f.x + f.width - EPS) result.push({ x: occupied.x + occupied.width, y: f.y, width: f.x + f.width - occupied.x - occupied.width, height: f.height });
    if (occupied.y > f.y + EPS) result.push({ x: f.x, y: f.y, width: f.width, height: occupied.y - f.y });
    if (occupied.y + occupied.height < f.y + f.height - EPS) result.push({ x: f.x, y: occupied.y + occupied.height, width: f.width, height: f.y + f.height - occupied.y - occupied.height });
  }
  const positive = result.filter((r) => r.width > EPS && r.height > EPS);
  return positive.filter((r, i) => !positive.some((s, j) => i !== j && contains(s, r) && (!contains(r, s) || j < i)));
}
function initialFree(o) {
  let free = [{ x: o.margin - o.gap / 2, y: o.margin - o.gap / 2, width: o.width - 2 * o.margin + o.gap, height: o.height - 2 * o.margin + o.gap }];
  for (const r of o.reserved) free = splitFree(free, { x: r.x - o.gap / 2, y: r.y - o.gap / 2, width: r.width + o.gap, height: r.height + o.gap });
  return free;
}
function rotations(item) {
  const requested = item.rotations || (item.allowRotation === false ? [0] : [0, 90]);
  const result = [...new Set(requested.map((r) => ((r % 360) + 360) % 360))];
  if (!result.length || result.some((r) => ![0, 90, 180, 270].includes(r))) throw new RangeError('Only quarter-turn rotations are supported');
  return result;
}
function dimensions(item, rotation) { return rotation % 180 ? [item.height, item.width] : [item.width, item.height]; }
function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (Math.abs(d) > EPS) return d; }
  return 0;
}
function candidate(free, item, o, heuristic) {
  let best = null;
  for (const rotation of rotations(item)) {
    const [width, height] = dimensions(item, rotation);
    const rw = width + o.gap, rh = height + o.gap;
    for (let i = 0; i < free.length; i++) {
      const f = free[i];
      if (rw > f.width + EPS || rh > f.height + EPS) continue;
      const dx = f.width - rw, dy = f.height - rh;
      const score = heuristic === 'area' ? [f.width * f.height - rw * rh, Math.min(dx, dy), f.y, f.x, rotation] : heuristic === 'bottom' ? [f.y + rh, f.x, Math.min(dx, dy), rotation] : [Math.min(dx, dy), Math.max(dx, dy), f.y, f.x, rotation];
      if (!best || compare(score, best.score) < 0) best = { x: f.x + o.gap / 2, y: f.y + o.gap / 2, width, height, rotation, score };
    }
  }
  return best;
}
function inflated(p, gap) { return { x: p.x - gap / 2, y: p.y - gap / 2, width: p.width + gap, height: p.height + gap }; }
function reservedArea(o) {
  const clips = o.reserved.map((r) => ({ x: Math.max(o.margin, r.x), x2: Math.min(o.width - o.margin, r.x + r.width), y: Math.max(o.margin, r.y), y2: Math.min(o.height - o.margin, r.y + r.height) })).filter((r) => r.x2 > r.x && r.y2 > r.y);
  const xs = [...new Set(clips.flatMap((r) => [r.x, r.x2]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const intervals = clips.filter((r) => r.x < xs[i + 1] && r.x2 > xs[i]).map((r) => [r.y, r.y2]).sort((a, b) => a[0] - b[0]);
    let length = 0, end = -Infinity;
    for (const [a, b] of intervals) { length += Math.max(0, b - Math.max(end, a)); end = Math.max(end, b); }
    area += length * (xs[i + 1] - xs[i]);
  }
  return area;
}
function finishPlate(plate, o, index) {
  const usedArea = plate.placements.reduce((n, p) => n + p.width * p.height, 0);
  const availableArea = (o.width - 2 * o.margin) * (o.height - 2 * o.margin) - reservedArea(o);
  return { index, placements: plate.placements, usedArea, availableArea, utilisation: availableArea > 0 ? usedArea / availableArea : 0, remainingArea: Math.max(0, availableArea - usedArea), freeRects: plate.free.map((f) => ({ x: f.x + o.gap / 2, y: f.y + o.gap / 2, width: Math.max(0, f.width - o.gap), height: Math.max(0, f.height - o.gap) })).filter((r) => r.width > EPS && r.height > EPS) };
}
function tryGroup(free, group, o, heuristic) {
  let best = null;
  // A photo's front and back must both fit before committing either one.
  for (const sort of ['area', 'edge', 'height']) {
    const ordered = [...group].sort((a, b) => sort === 'edge' ? Math.max(b.width, b.height) - Math.max(a.width, a.height) || a._index - b._index : sort === 'height' ? b.height - a.height || a._index - b._index : b.width * b.height - a.width * a.height || a._index - b._index);
    let remaining = free, placements = [], failed = false;
    for (const item of ordered) {
      const c = candidate(remaining, item, o, heuristic);
      if (!c) { failed = true; break; }
      const { _index, ...original } = item, { score, ...placement } = c;
      placements.push({ ...original, ...placement });
      remaining = splitFree(remaining, inflated(c, o.gap));
    }
    if (!failed) {
      const score = [Math.max(...placements.map((p) => p.y + p.height)), Math.max(...placements.map((p) => p.x + p.width))];
      if (!best || compare(score, best.score) < 0) best = { free: remaining, placements, score };
    }
  }
  return best;
}
function run(items, o, order, heuristic) {
  const byGroup = new Map();
  for (const item of items) {
    const key = item.groupId === undefined || item.groupId === null ? `single:${item._index}` : `group:${String(item.groupId)}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(item);
  }
  const groups = [...byGroup.values()].sort((a, b) => {
    const score = (g) => {
      const area = g.reduce((n, i) => n + i.width * i.height, 0), edge = Math.max(...g.map((i) => Math.max(i.width, i.height))), short = Math.max(...g.map((i) => Math.min(i.width, i.height)));
      return order === 'edge' ? [edge, area, short] : order === 'height' ? [short, edge, area] : [area, edge, short];
    };
    return -compare(score(a), score(b)) || a[0]._index - b[0]._index;
  });
  const plates = [], rejected = [];
  for (const group of groups) {
    let chosen = null;
    for (let i = 0; i < plates.length; i++) {
      const attempt = tryGroup(plates[i].free, group, o, heuristic);
      if (attempt) { chosen = { i, attempt }; break; }
    }
    if (!chosen && plates.length < o.maxPlates) {
      const attempt = tryGroup(initialFree(o), group, o, heuristic);
      if (attempt) { plates.push({ placements: [], free: [] }); chosen = { i: plates.length - 1, attempt }; }
    }
    if (!chosen) {
      const limit = plates.length >= o.maxPlates;
      for (const item of group) rejected.push({ ...item, reason: limit ? 'plate_limit' : 'no_space', message: limit ? 'Se alcanzó el límite de placas de esta tanda.' : group.length > 1 ? 'Las piezas de este producto no caben juntas en una placa vacía.' : 'La pieza no cabe en una placa vacía con el margen y las zonas reservadas actuales.' });
      continue;
    }
    plates[chosen.i].placements.push(...chosen.attempt.placements);
    plates[chosen.i].free = chosen.attempt.free;
  }
  return { plates: plates.map((p, i) => finishPlate(p, o, i)), rejected };
}

function resultScore(result) {
  const compactness = result.plates.reduce((sum, p) => sum + Math.max(...p.placements.map((r) => r.x + r.width)) * Math.max(...p.placements.map((r) => r.y + r.height)), 0);
  const earlyFill = result.plates.reduce((sum, p, i) => sum + p.usedArea * i, 0);
  return [result.rejected.length, result.plates.length, earlyFill, compactness];
}
/**
 * @param {Array<{id:string,width:number,height:number,allowRotation?:boolean,rotations?:number[]}>} items
 * @returns {{plates:Array,rejected:Array,options:Object,total:number,placed:number}}
 */
export function packItems(items, options = {}) {
  const o = config(options), ids = new Set(), valid = [], invalid = [];
  if (!Array.isArray(items) || items.length > o.maxItems) throw new RangeError(`La tanda admite hasta ${o.maxItems} piezas físicas.`);
  items.forEach((item, _index) => {
    if (item.id === undefined || item.id === null || ids.has(item.id)) throw new Error('Every physical piece needs a unique id');
    ids.add(item.id);
    if (![item.width, item.height].every((n) => Number.isFinite(n) && n > 0)) { invalid.push({ ...item, reason: 'invalid_dimensions', message: 'La pieza no tiene medidas válidas.' }); return; }
    rotations(item);valid.push({ ...item, _index });
  });
  const badGroups = new Set(invalid.filter((i) => i.groupId !== undefined && i.groupId !== null).map((i) => String(i.groupId)));
  for (let i = valid.length - 1; i >= 0; i--) if (badGroups.has(String(valid[i].groupId))) { const { _index, ...item } = valid.splice(i, 1)[0];invalid.push({ ...item, reason: 'incomplete_group', message: 'Otra pieza del mismo producto no tiene medidas válidas.' }); }
  let best = null;
  for (const [order, heuristic] of [['area', 'short'], ['edge', 'short'], ['height', 'short'], ['area', 'area'], ['edge', 'area'], ['area', 'bottom']]) {
    const attempt = run(valid, o, order, heuristic);
    if (!best || compare(resultScore(attempt), resultScore(best)) < 0) best = attempt;
  }
  best ||= { plates: [], rejected: [] };
  const rejected = [...invalid, ...best.rejected.map(({ _index, ...item }) => item)];
  const result = { ...best, rejected, options: o, total: items.length, placed: best.plates.reduce((n, p) => n + p.placements.length, 0) };
  const errors = validateLayout(result.plates, o);
  if (errors.length) throw new Error(`Unsafe packing result: ${errors.join('; ')}`);
  return result;
}
/** Validate actual footprints, plate borders, reserved regions and clearance. */
export function validateLayout(plates, options = {}) {
  const o = config(options), errors = [], ids = new Set(), groups = new Map();
  for (const [plateIndex, plate] of plates.entries()) {
    for (const [i, p] of plate.placements.entries()) {
      if (p.groupId !== undefined && p.groupId !== null) { const g=String(p.groupId);if (groups.has(g) && groups.get(g) !== plateIndex) errors.push(`Product ${g} is split across plates`);groups.set(g,plateIndex); }
      if (ids.has(p.id)) errors.push(`Repeated piece ${p.id}`); ids.add(p.id);
      if (![p.x, p.y, p.width, p.height].every(Number.isFinite) || p.width <= 0 || p.height <= 0) { errors.push(`Invalid placement ${p.id}`); continue; }
      if (p.x < o.margin - EPS || p.y < o.margin - EPS || p.x + p.width > o.width - o.margin + EPS || p.y + p.height > o.height - o.margin + EPS) errors.push(`Piece ${p.id} exceeds plate ${plateIndex + 1}`);
      for (const r of o.reserved) if (intersects(p, r, o.gap)) errors.push(`Piece ${p.id} enters a reserved region`);
      for (const b of plate.placements.slice(i + 1)) if (intersects(p, b, o.gap)) errors.push(`Pieces ${p.id} and ${b.id} overlap or violate clearance`);
    }
  }
  return errors;
}
/**
 * Conservative remaining capacity for one *specific* candidate size, without
 * moving current placements. The maximum count is limited for responsiveness.
 */
export function capacityFor(plate, candidateItem, options = {}) {
  const o = config(options), maxCount = options.maxCount ?? 250;
  if (![candidateItem.width, candidateItem.height].every((n) => Number.isFinite(n) && n > 0)) return { count: 0, placements: [], capped: false };
  if (validateLayout([plate], o).length) throw new Error('Cannot estimate capacity for an unsafe plate');
  let free = initialFree(o);
  for (const p of plate.placements) free = splitFree(free, inflated(p, o.gap));
  const placements = [];
  while (placements.length < maxCount) {
    const c = candidate(free, candidateItem, o, 'short'); if (!c) break;
    const { score, ...p } = c;placements.push(p);free = splitFree(free, inflated(c, o.gap));
  }
  return { count: placements.length, placements, capped: placements.length === maxCount && !!candidate(free, candidateItem, o, 'short') };
}
/** Remaining capacity for a complete multi-piece product, e.g. photo front/back. */
export function capacityForGroup(plate, candidateItems, options = {}) {
  const o = config(options), maxCount = options.maxCount ?? 250;
  if (!candidateItems.length || candidateItems.some((p) => ![p.width, p.height].every((n) => Number.isFinite(n) && n > 0))) return { count: 0, placements: [], capped: false };
  if (validateLayout([plate], o).length) throw new Error('Cannot estimate capacity for an unsafe plate');
  let free = initialFree(o);
  for (const p of plate.placements) free = splitFree(free, inflated(p, o.gap));
  const placements = [];
  let count = 0;
  const group = candidateItems.map((p, i) => ({ ...p, _index: i }));
  while (count < maxCount) {
    const attempt = tryGroup(free, group, o, 'short');if (!attempt) break;
    placements.push(...attempt.placements.map((p, i) => ({ ...p, id: `suggestion-${count}-${i}`, groupId: `suggestion-product-${count}` })));
    free = attempt.free;count++;
  }
  return { count, placements, capped: count === maxCount && !!tryGroup(free, group, o, 'short') };
}
