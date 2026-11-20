// node _tools/wall_batch_test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../vendor/three.min.js');

const world = new THREE.Group();
const material = new THREE.MeshLambertMaterial();
function wall(x) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.5), material);
  mesh.position.x = x;
  world.add(mesh);
  return mesh;
}

const a = wall(4), b = wall(6), childWall = wall(8);
const sign = new THREE.Group();
childWall.add(sign);
const context = vm.createContext({ THREE, world, MAP_SIZE: 88, DESTRUCTIBLES: [{meshes: [a, b, childWall]}] });
const source = fs.readFileSync(path.join(__dirname, '../js/07b_batch.js'), 'utf8');
vm.runInContext(source, context);
context.mergeStaticWorld();
assert.equal(a.parent, null);
assert.equal(b.parent, null);
assert.equal(childWall.parent, world);
assert.equal(sign.parent, childWall);

const positions = world.children.find(m => m.userData.mergedChunk).geometry.attributes.position;
const before = positions.array.slice();
context.removeStructureMesh(a);
const half = before.length / 2;
assert(positions.array.subarray(0, half).every(x => x === 0));
assert.deepEqual(positions.array.subarray(half), before.subarray(half));
assert.deepEqual(positions.updateRange, {offset: 0, count: half});
context.removeStructureMesh(b);
assert(positions.array.every(x => x === 0));
assert.equal(positions.updateRange.count, positions.array.length);
context.removeStructureMesh(childWall);
assert.equal(childWall.parent, null);
assert.equal(sign.parent, childWall);
console.log('Wall batching preserves neighbouring geometry and attached props');
