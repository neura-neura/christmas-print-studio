import test from 'node:test';
import assert from 'node:assert/strict';
import { packItems, validateLayout, capacityFor } from '../src/packing.js';

const items = (count, width, height) => Array.from({ length: count }, (_, i) => ({ id: `part-${i}`, width, height }));
test('uses borders and clearance, packs all physical pieces exactly once', () => {
  const input = [...items(4, 83.3, 100.4), { id: 'photo-front', width: 84, height: 101.5 }, { id: 'photo-back', width: 80, height: 80 }, { id: 'name', width: 151.7, height: 63.36 }];
  const result = packItems(input);
  assert.equal(result.rejected.length, 0);assert.equal(result.placed, input.length);
  assert.equal(new Set(result.plates.flatMap((p) => p.placements.map((r) => r.id))).size, input.length);
  assert.deepEqual(validateLayout(result.plates, result.options), []);
  assert.ok(result.plates.length >= 2); // These conservative rectangular footprints cannot all fit one A1 plate.
});
test('exact fits and clearances are handled without losing a row', () => {
  const result = packItems(items(4, 120.5, 120.5));
  assert.equal(result.plates.length, 1);assert.equal(result.placed, 4);
  assert.equal(capacityFor(result.plates[0], { width: 120.5, height: 120.5 }).count, 0);
});
test('rotation fits a narrow piece without distorting it', () => {
  const result = packItems([{ id: 'rotate', width: 90, height: 180 }], { width: 200, height: 110, margin: 5 });
  assert.equal(result.placed, 1);assert.equal(result.plates[0].placements[0].rotation, 90);
  assert.equal(result.plates[0].placements[0].width, 180);
  const locked = packItems([{ id: 'fixed', width: 90, height: 180, allowRotation: false }], { width: 200, height: 110, margin: 5 });
  assert.equal(locked.rejected.length, 1);assert.equal(locked.plates.length, 0);
});
test('reserved calibration zones stay empty, including clearance', () => {
  const options = { reserved: [{ x: 6, y: 6, width: 130, height: 12 }, { x: 124, y: 6, width: 20, height: 12 }] };
  const result = packItems(items(12, 52, 55), options);
  assert.equal(result.placed, 12);assert.deepEqual(validateLayout(result.plates, options), []);
  assert.ok(result.plates.every((p) => p.availableArea < 244 * 244));
});
test('rejects oversize and malformed parts explicitly, does not silently scale them', () => {
  const result = packItems([{ id: 'oversize', width: 245, height: 245 }, { id: 'bad', width: NaN, height: 30 }, { id: 'good', width: 200, height: 100 }]);
  assert.equal(result.rejected.length, 2);assert.equal(result.placed, 1);
  assert.equal(result.plates[0].placements[0].width * result.plates[0].placements[0].height, 20000);
  assert.throws(() => packItems([{ id: 'x', width: 1, height: 1 }, { id: 'x', width: 1, height: 1 }]));
});
test('remaining-space suggestions describe actual additional placements', () => {
  const options = { width: 200, height: 160, margin: 5, gap: 3 };
  const result = packItems([{ id: 'first', width: 95, height: 95 }], options);
  const capacity = capacityFor(result.plates[0], { width: 40, height: 40 }, options);
  assert.ok(capacity.count > 0);
  const augmented = { placements: [...result.plates[0].placements, ...capacity.placements.map((p, i) => ({ ...p, id: `extra-${i}` }))] };
  assert.deepEqual(validateLayout([augmented], options), []);
});
test('deterministic multi-plate packing has no overlaps across varied production batches', () => {
  let state = 143;
  const random = () => { state = (1664525 * state + 1013904223) >>> 0;return state / 2 ** 32; };
  for (let iteration = 0; iteration < 15; iteration++) {
    const batch = Array.from({ length: 40 }, (_, i) => ({ id: `item-${i}`, width: 8 + random() * 190, height: 8 + random() * 95 }));
    const options = { reserved: [{ x: 10, y: 6, width: 120, height: 8 }] };
    const result = packItems(batch, options);
    assert.equal(result.placed, batch.length);assert.deepEqual(validateLayout(result.plates, options), []);
    assert.deepEqual(packItems(batch, options), result);
  }
});
test('empty queue and an entirely reserved plate terminate safely', () => {
  assert.equal(packItems([]).plates.length, 0);
  const result = packItems(items(2, 20, 20), { reserved: [{ x: 0, y: 0, width: 256, height: 256 }] });
  assert.equal(result.plates.length, 0);assert.equal(result.rejected.length, 2);
});
test('photo front and back stay on the same plate even when separate fragments would fit earlier', () => {
  const batch = [{ id: 'large', width: 240, height: 140 }, { id: 'front', groupId: 'photo', width: 100, height: 100 }, { id: 'back', groupId: 'photo', width: 100, height: 100 }];
  const r = packItems(batch);
  assert.equal(r.placed, 3);
  const indexes = r.plates.flatMap((p, i) => p.placements.filter((a) => a.groupId === 'photo').map(() => i));
  assert.equal(new Set(indexes).size, 1);
  assert.deepEqual(validateLayout(r.plates), []);
});
test('rejects an entire product when its pieces cannot fit together, without orphaning pieces', () => {
  const batch = [{ id: 'front', groupId: 'photo', width: 180, height: 180 }, { id: 'back', groupId: 'photo', width: 180, height: 180 }, { id: 'small', width: 20, height: 20 }];
  const r = packItems(batch);
  assert.equal(r.placed, 1);assert.equal(r.rejected.length, 2);
  assert.ok(r.rejected.every((i) => i.groupId === 'photo'));
  assert.ok(validateLayout([{ placements: [{ id: 'x', groupId: 'g', x: 6, y: 6, width: 10, height: 10 }] }, { placements: [{ id: 'y', groupId: 'g', x: 6, y: 6, width: 10, height: 10 }] }]).some((e) => e.includes('split')));
});
test('invalid group members and batch/plate limits produce explicit outcomes', () => {
  const r = packItems([{ id: 'bad', groupId: 'p', width: 0, height: 20 }, { id: 'good', groupId: 'p', width: 20, height: 20 }]);
  assert.equal(r.placed, 0);assert.equal(r.rejected.length, 2);
  assert.throws(() => packItems(items(3, 10, 10), { maxItems: 2 }));
  const capped = packItems(items(3, 200, 200), { maxPlates: 2 });
  assert.equal(capped.plates.length, 2);assert.equal(capped.rejected[0].reason, 'plate_limit');
});
test('photo capacity counts complete products rather than isolated front pieces', async () => {
  const { capacityForGroup } = await import('../src/packing.js');
  const r = packItems([{ id: 'existing', width: 100, height: 100 }]);
  const result = capacityForGroup(r.plates[0], [{ width: 70, height: 80 }, { width: 65, height: 65 }]);
  assert.ok(result.count > 0);assert.equal(result.placements.length, result.count * 2);
  assert.deepEqual(validateLayout([{ placements: [...r.plates[0].placements, ...result.placements] }]), []);
});
