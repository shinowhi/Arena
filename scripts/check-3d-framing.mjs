// Headless framing check for Problem3D models: builds every rig, poses it at
// two animation extremes, and verifies all bounding-box corners land inside
// the camera frustum (NDC within [-1.05, 1.05]). Run: npx tsx scripts/check-3d-framing.mjs
import * as THREE from "three";
import { MODEL_FOR_SKILL, buildSlices, def } from "../components/Problem3D.js";

const W = 600;
const H = 220;
const MARGIN = 1.05;

function checkOne(name, modelDef) {
  const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
  camera.position.set(...modelDef.cam);
  camera.lookAt(...modelDef.look);
  camera.updateMatrixWorld();
  let worstX = 0;
  let worstY = 0;
  const v = new THREE.Vector3();
  for (const t of [0.4, 1.6]) {
    for (const ry of [-0.52, -0.08]) {
      const rig = modelDef.build();
      rig.group.rotation.y = ry;
      rig.update(t);
      rig.group.updateMatrixWorld(true);
      rig.group.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 1) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(camera);
          if (Math.abs(v.x) > worstX) worstX = Math.abs(v.x);
          if (Math.abs(v.y) > worstY) worstY = Math.abs(v.y);
        }
      });
    }
  }
  const worst = Math.max(worstX, worstY);
  const pass = worst <= MARGIN;
  console.log(`${pass ? "PASS" : "FAIL"} ${name} x=${worstX.toFixed(2)} y=${worstY.toFixed(2)}`);
  return pass;
}

const seen = new Set();
let allPass = true;
// One check per distinct builder (skills share rigs).
const builders = new Map();
for (const [skill, d] of Object.entries(MODEL_FOR_SKILL)) {
  const key = d.build.name;
  if (!builders.has(key)) builders.set(key, { def: d, skills: [] });
  builders.get(key).skills.push(skill);
}
for (const [key, { def: d, skills }] of builders) {
  if (!checkOne(`${key} [${skills.length} skills]`, d)) allPass = false;
  seen.add(key);
}
// Calculus fallback (default branch).
if (!checkOne("buildSlices [fallback]", def(buildSlices))) allPass = false;

console.log(allPass ? "FRAMING OK" : "FRAMING FAILURES");
process.exit(allPass ? 0 : 1);
