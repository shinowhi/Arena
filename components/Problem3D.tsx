"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// 3D illustration for real-life problems. Parametric mechanics models built
// from primitives (zero model files): bending beam with live pin/roller
// joints, twisting shaft, buckling column, pressure tank, rotating stress
// element, plus a calculus fallback. One static frame when reduced-motion
// is on; full cleanup on unmount.

type Rig = {
  group: THREE.Group;
  update: (t: number) => void;
  disposables: Array<{ dispose: () => void }>;
};

const RED = 0xef4444;
const AMBER = 0xf59e0b;
const STEEL = 0x9aa3b2;
const DARK = 0x52525b;

function mat(color: number, extra?: { roughness?: number; metalness?: number; transparent?: boolean; opacity?: number }) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extra?.roughness ?? 0.5,
    metalness: extra?.metalness ?? 0.35,
    transparent: extra?.transparent ?? false,
    opacity: extra?.opacity ?? 1,
  });
}

function track(disposables: Array<{ dispose: () => void }>, ...items: Array<{ dispose: () => void }>) {
  disposables.push(...items);
}

function arrow(disposables: Rig["disposables"], color: number, len: number): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color);
  const sg = new THREE.CylinderGeometry(0.045, 0.045, len, 10);
  const shaft = new THREE.Mesh(sg, m);
  const hg = new THREE.ConeGeometry(0.11, 0.24, 10);
  const head = new THREE.Mesh(hg, m);
  head.rotation.x = Math.PI;
  head.position.y = -len / 2 - 0.1;
  g.add(shaft, head);
  track(disposables, sg, hg, m);
  return g;
}

// Simply supported beam: load arrow presses, beam flexes, pin joint wobbles.
function buildBeam(): Rig {
  const disposables: Rig["disposables"] = [];
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(4.4, 0.32, 0.32, 28, 1, 1);
  const base = Float32Array.from(geo.attributes.position.array);
  const beamMat = mat(STEEL);
  const beam = new THREE.Mesh(geo, beamMat);
  beam.position.y = 0.7;
  group.add(beam);
  track(disposables, geo, beamMat);
  const pinMat = mat(DARK);
  const pin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.42, 4), pinMat);
  pin.rotation.y = Math.PI / 4;
  pin.position.set(-1.9, 0.32, 0);
  group.add(pin);
  track(disposables, pin.geometry, pinMat);
  const rollMat = mat(DARK);
  const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.36, 20), rollMat);
  roller.rotation.x = Math.PI / 2;
  roller.position.set(1.9, 0.28, 0);
  group.add(roller);
  track(disposables, roller.geometry, rollMat);
  const groundMat = mat(0x27272a, { roughness: 0.9, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.08, 0.9), groundMat);
  ground.position.y = 0.02;
  group.add(ground);
  track(disposables, ground.geometry, groundMat);
  const load = arrow(disposables, RED, 0.7);
  load.position.set(0, 1.9, 0);
  group.add(load);
  const update = (t: number) => {
    const phase = (Math.sin(t * 1.6) + 1) / 2;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const s = Math.sin((Math.PI * (x + 2.2)) / 4.4);
      pos.setY(i, base[i * 3 + 1] - 0.34 * phase * s * s);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    load.position.y = 1.9 - 0.34 * phase;
    pin.rotation.z = 0.07 * Math.sin(t * 1.6);
  };
  return { group, update, disposables };
}

// Shaft in torsion: stations twist progressively, free end oscillates.
function buildShaft(): Rig {
  const disposables: Rig["disposables"] = [];
  const group = new THREE.Group();
  const steel = mat(STEEL);
  const shaftGeo = new THREE.CylinderGeometry(0.3, 0.3, 4.4, 24);
  const shaft = new THREE.Mesh(shaftGeo, steel);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.y = 0.7;
  group.add(shaft);
  track(disposables, shaftGeo, steel);
  const rings: THREE.Mesh[] = [];
  const ringMat = mat(RED);
  const dotMat = mat(AMBER);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.TorusGeometry(0.32, 0.045, 10, 28);
    const r = new THREE.Mesh(g, ringMat);
    r.position.set(-1.76 + i * 0.88, 0.7, 0);
    r.rotation.y = Math.PI / 2;
    // Marker dot: a smooth torus spins invisibly, the dot makes twist visible.
    const dg = new THREE.SphereGeometry(0.07, 12, 8);
    const dot = new THREE.Mesh(dg, dotMat);
    dot.position.set(0.32, 0, 0);
    r.add(dot);
    group.add(r);
    rings.push(r);
    track(disposables, g, dg);
  }
  track(disposables, ringMat, dotMat);
  const blockMat = mat(DARK);
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 1.1), blockMat);
  block.position.set(-2.4, 0.55, 0);
  group.add(block);
  track(disposables, block.geometry, blockMat);
  const knobMat = mat(AMBER);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 6), knobMat);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(2.35, 0.7, 0);
  group.add(knob);
  track(disposables, knob.geometry, knobMat);
  const update = (t: number) => {
    const twist = 0.9 * Math.sin(t * 1.4);
    rings.forEach((r, i) => {
      r.rotation.x = twist * (i / 4);
    });
    knob.rotation.x = twist;
  };
  return { group, update, disposables };
}

// Column under axial load: bows sideways, pinned ends rotate (live joints).
function buildColumn(): Rig {
  const disposables: Rig["disposables"] = [];
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.5, 3.4, 0.5, 1, 24, 1);
  const base = Float32Array.from(geo.attributes.position.array);
  const colMat = mat(STEEL);
  const col = new THREE.Mesh(geo, colMat);
  col.position.y = 1.95;
  group.add(col);
  track(disposables, geo, colMat);
  const pinMat = mat(DARK);
  const mkPin = (y: number) => {
    // Faceted (not smooth): joint rotation must be visible.
    const p = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), pinMat);
    p.position.y = y;
    group.add(p);
    track(disposables, p.geometry);
    return p;
  };
  const topPin = mkPin(3.75);
  const botPin = mkPin(0.15);
  track(disposables, pinMat);
  const capMat = mat(AMBER);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 1.1), capMat);
  cap.position.y = 4.0;
  group.add(cap);
  track(disposables, cap.geometry, capMat);
  const baseMat = mat(0x27272a, { roughness: 0.9, metalness: 0 });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 1.3), baseMat);
  plinth.position.y = -0.02;
  group.add(plinth);
  track(disposables, plinth.geometry, baseMat);
  const update = (t: number) => {
    const phase = (Math.sin(t * 1.2) + 1) / 2;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = base[i * 3 + 1];
      const s = Math.sin((Math.PI * (y + 1.7)) / 3.4);
      pos.setX(i, base[i * 3] + 0.4 * phase * s);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    cap.position.y = 4.0 - 0.22 * phase;
    topPin.rotation.z = 0.12 * phase;
    botPin.rotation.z = -0.12 * phase;
  };
  return { group, update, disposables };
}

// Thin pressure tank: hoop rings breathe.
function buildTank(): Rig {
  const disposables: Rig["disposables"] = [];
  const group = new THREE.Group();
  const tankMat = mat(STEEL, { transparent: true, opacity: 0.85 });
  const tankGeo = new THREE.CylinderGeometry(0.9, 0.9, 2.6, 28, 1, true);
  const tank = new THREE.Mesh(tankGeo, tankMat);
  tank.position.y = 1.7;
  group.add(tank);
  track(disposables, tankGeo, tankMat);
  const capMat = mat(DARK);
  for (const y of [0.4, 3.0]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.9, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    if (y < 1.7) cap.rotation.x = Math.PI;
    cap.position.y = y;
    group.add(cap);
    track(disposables, cap.geometry);
  }
  track(disposables, capMat);
  const hoops: THREE.Mesh[] = [];
  const hoopMat = mat(RED);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.TorusGeometry(0.93, 0.05, 10, 40);
    const h = new THREE.Mesh(g, hoopMat);
    h.rotation.x = Math.PI / 2;
    h.position.y = 0.9 + i * 0.53;
    group.add(h);
    hoops.push(h);
    track(disposables, g);
  }
  track(disposables, hoopMat);
  const update = (t: number) => {
    hoops.forEach((h, i) => {
      const s = 1 + 0.035 * Math.sin(t * 2.2 - i * 0.7);
      h.scale.set(s, s, 1);
    });
  };
  return { group, update, disposables };
}

// Stress element: cube rocks to inclined planes, arrows ride along.
function buildElement(): Rig {
  const disposables: Rig["disposables"] = [];
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = 1.4;
  group.add(pivot);
  const cubeMat = mat(STEEL);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), cubeMat);
  pivot.add(cube);
  track(disposables, cube.geometry, cubeMat);
  const mkArrow = (x: number, y: number, rotZ: number) => {
    const a = arrow(disposables, RED, 0.5);
    a.position.set(x, y, 0);
    a.rotation.z = rotZ;
    pivot.add(a);
  };
  mkArrow(0, 1.25, Math.PI);
  mkArrow(0, -1.25, 0);
  mkArrow(1.25, 0, -Math.PI / 2);
  mkArrow(-1.25, 0, Math.PI / 2);
  const update = (t: number) => {
    pivot.rotation.z = 0.5 * Math.sin(t * 0.9);
  };
  return { group, update, disposables };
}

// Calculus fallback: Riemann slices stacking under a curve.
export function buildSlices(): Rig {
  const disposables: Rig["disposables"] = [];
  const group = new THREE.Group();
  const bars: THREE.Mesh[] = [];
  const barMat = mat(AMBER);
  for (let i = 0; i < 8; i++) {
    const h = 0.5 + 1.8 * Math.sin((Math.PI * (i + 0.5)) / 8);
    const g = new THREE.BoxGeometry(0.42, 1, 0.42);
    const b = new THREE.Mesh(g, barMat);
    b.position.set(-1.75 + i * 0.5, h / 2 + 0.1, 0);
    b.scale.y = h;
    group.add(b);
    bars.push(b);
    track(disposables, g);
  }
  track(disposables, barMat);
  const baseMat = mat(0x27272a, { roughness: 0.9, metalness: 0 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 0.9), baseMat);
  base.position.y = 0.02;
  group.add(base);
  track(disposables, base.geometry, baseMat);
  const update = (t: number) => {
    bars.forEach((b, i) => {
      const p = (t * 0.8 + i * 0.35) % 2;
      const k = p < 1 ? p : 2 - p;
      b.position.y = 0.1 + (b.scale.y * k) / 2 + (1 - k) * 0.0;
      b.scale.y = Math.max(0.02, (0.5 + 1.8 * Math.sin((Math.PI * (i + 0.5)) / 8)) * (0.35 + 0.65 * k));
    });
  };
  return { group, update, disposables };
}

type ModelDef = { build: () => Rig; cam: [number, number, number]; look: [number, number, number] };

// Per-model framing: the column is ~4 units tall and needs a higher target,
// everything else fits the default close-up.
const DEFAULT_CAM: [number, number, number] = [3.6, 2.6, 4.8];
const DEFAULT_LOOK: [number, number, number] = [0, 1.0, 0];
const TALL_CAM: [number, number, number] = [4.0, 2.8, 5.4];
const TALL_LOOK: [number, number, number] = [0, 1.7, 0];

export function def(build: () => Rig, tall = false): ModelDef {
  return tall
    ? { build, cam: TALL_CAM, look: TALL_LOOK }
    : { build, cam: DEFAULT_CAM, look: DEFAULT_LOOK };
}

// Exported for the headless framing check (scripts/check-3d-framing.mjs).
export const MODEL_FOR_SKILL: Record<string, ModelDef> = {
  bending_stress: def(buildBeam),
  shear_moment_diagrams: def(buildBeam),
  beam_deflection: def(buildBeam),
  transverse_shear_stress: def(buildBeam),
  torsion_stress: def(buildShaft),
  torsion_twist: def(buildShaft),
  buckling_columns: def(buildColumn, true),
  axial_loading: def(buildColumn, true),
  indeterminate_axial: def(buildColumn, true),
  thermal_stress: def(buildColumn, true),
  stress_strain_concepts: def(buildColumn, true),
  pressure_vessels: def(buildTank, true),
  stress_transformation: def(buildElement),
  principal_stress_mohr: def(buildElement),
};

export default function Problem3D({ skill }: { skill: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer | null = null;
    let raf = 0;
    let rig: Rig | null = null;
    let onResize = () => {};
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce = true;
    }
    try {
      const H = 220;
      const W = host.clientWidth || 320;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      host.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
      const model = MODEL_FOR_SKILL[skill] ?? def(buildSlices);
      camera.position.set(...model.cam);
      camera.lookAt(...model.look);
      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const dir = new THREE.DirectionalLight(0xffffff, 1.6);
      dir.position.set(4, 6, 4);
      scene.add(dir);
      const glow = new THREE.PointLight(0xef4444, 12, 24);
      glow.position.set(-4, 2, 3);
      scene.add(glow);
      rig = model.build();
      scene.add(rig.group);
      const clock = new THREE.Clock();
      const render = () => {
        if (!renderer || !rig) return;
        const t = clock.getElapsedTime();
        rig.group.rotation.y = reduce ? -0.3 : -0.3 + 0.22 * Math.sin(t * 0.35);
        rig.update(reduce ? 1.1 : t);
        renderer.render(scene, camera);
      };
      if (reduce) {
        render();
      } else {
        const loop = () => {
          render();
          raf = requestAnimationFrame(loop);
        };
        loop();
      }
      onResize = () => {
        if (!renderer) return;
        const nw = host.clientWidth || W;
        camera.aspect = nw / H;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, H);
      };
      window.addEventListener("resize", onResize);
    } catch {
      // WebGL unavailable: the frame stays empty, problem text still shows.
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      if (rig) {
        for (const d of rig.disposables) {
          try {
            d.dispose();
          } catch {
            // ignore teardown errors
          }
        }
      }
      renderer?.dispose();
      if (renderer?.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [skill]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={`3D illustration for ${skill}`}
      className="h-[220px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60"
    />
  );
}
