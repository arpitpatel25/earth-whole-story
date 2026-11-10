// A small kit for building the 3D scenes in code: shared materials, primitives that sit on the ground plane,
// and the part() wrapper that makes a group selectable. Units are metres; +Y is up.
import * as THREE from 'three';

export const PAL = {
  stone: '#bcae93', sarsen: '#a9a79f', sandstone: '#b9673f', red: '#a4472d', marble: '#efebe0', brick: '#a8603f', brickDark: '#84482f',
  iron: '#4d5259', steel: '#b4bcc6', dark: '#20252c', bronze: '#a06a34', brass: '#c9a24a', gold: '#e3b83a', wood: '#8a6238', woodDark: '#54391f',
  bone: '#e8dfc8', ghost: '#7d8b9c', water: '#3d87a6', grass: '#69794a', earth: '#8a6c4c', chalk: '#f4f1e8', black: '#14171b', flint: '#5e574c',
  copper: '#b87333', blue: '#3f74c9', panel: '#1f3f7a', foil: '#d9ae45', moon: '#8d8f93', bamboo: '#b99a4e', granite: '#b9897a', bitumen: '#1d1c1b',
  limestone: '#d9cfb4', white: '#e9e7e1', lava: '#c2562f', core: '#f0a23a', coreIn: '#ffe08a',
};

export function makeKit() {
  const cache = new Map();
  /** A cached standard material. o: { r roughness, m metalness, a opacity, flat, double, e emissive, ei } */
  const mat = (color, o = {}) => {
    const key = `${color}|${o.r ?? 0.82}|${o.m ?? 0}|${o.a ?? 1}|${o.flat ? 1 : 0}|${o.double ? 1 : 0}|${o.e || ''}|${o.ei ?? 1}|${o.dw ?? ''}`;
    if (!cache.has(key)) {
      cache.set(key, new THREE.MeshStandardMaterial({
        color, roughness: o.r ?? 0.82, metalness: o.m ?? 0, transparent: o.a != null && o.a < 1, opacity: o.a ?? 1, depthWrite: o.dw ?? !(o.a != null && o.a < 0.6),
        flatShading: !!o.flat, side: o.double ? THREE.DoubleSide : THREE.FrontSide, emissive: o.e || '#000000', emissiveIntensity: o.ei ?? 1,
      }));
    }
    return cache.get(key);
  };
  const mesh = (geo, m) => {
    const o = new THREE.Mesh(geo, typeof m === 'string' ? mat(m) : m);
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  };
  const k = {
    THREE, PAL, mat, mesh,
    /** Box resting on y = 0, centred in x and z. */
    box(w, h, d, m) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return mesh(g, m); },
    /** Cylinder (or cone frustum) resting on y = 0. rt top radius, rb bottom radius. */
    cyl(rt, rb, h, m, seg = 32, open = false) { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); g.translate(0, h / 2, 0); return mesh(g, m); },
    sph(r, m, ws = 40, hs = 24, phiStart = 0, phiLength = Math.PI * 2, thetaStart = 0, thetaLength = Math.PI) { return mesh(new THREE.SphereGeometry(r, ws, hs, phiStart, phiLength, thetaStart, thetaLength), m); },
    /** Surface of revolution from [radius, y] pairs. */
    lathe(pts, m, seg = 48) { return mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), m); },
    /** Extrude a closed outline given as [x, y] pairs along z (centred), optionally with holes. */
    ext(pts, depth, m, { bevel = 0, holes = [] } = {}) {
      const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 24 });
      g.translate(0, 0, -depth / 2);
      return mesh(g, m);
    },
    tube(pts, r, m, { closed = false, seg = 64, radial = 10 } = {}) {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, 'catmullrom', 0.5);
      return mesh(new THREE.TubeGeometry(curve, seg, r, radial, closed), m);
    },
    /** A straight rod between two points. */
    rod(a, b, r, m, seg = 12) {
      const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
      const len = va.distanceTo(vb);
      const o = mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
      k.aim(o, va, vb);
      return o;
    },
    /** Re-pose a rod made with rod() between two new points (for animation). */
    aim(o, va, vb) {
      o.position.copy(va).add(vb).multiplyScalar(0.5);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
      return o;
    },
    torus(R, r, m, arc = Math.PI * 2, seg = 64, radial = 12) { return mesh(new THREE.TorusGeometry(R, r, radial, seg, arc), m); },
    /** A flat ring in the ground plane (y up). */
    ring(ri, ro, m, seg = 64, start = 0, len = Math.PI * 2) { const g = new THREE.RingGeometry(ri, ro, seg, 1, start, len); g.rotateX(-Math.PI / 2); return mesh(g, m); },
    put(o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; },
    G(...os) { const g = new THREE.Group(); for (const o of os.flat()) if (o) g.add(o); return g; },
    /** A selectable, labelled part. */
    P(id, ...os) { const g = k.G(...os); g.userData.part = id; g.name = id; return g; },
    /** n copies around the y axis at radius r; fn(i, angle) returns an object built facing +z, which is turned outward. */
    around(n, r, fn, start = 0) {
      const g = new THREE.Group();
      for (let i = 0; i < n; i++) {
        const a = start + (i / n) * Math.PI * 2;
        const o = fn(i, a);
        if (!o) continue;
        const holder = new THREE.Group();
        holder.add(o);
        holder.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
        holder.rotation.y = a;
        g.add(holder);
      }
      return g;
    },
    /** A person for scale: not a part, cannot be selected. */
    person(h = 1.7) {
      const m = mat(PAL.ghost, { r: 1, a: 0.82 });
      const s = h / 1.7;
      const g = k.G(
        k.put(k.cyl(0.13 * s, 0.17 * s, 0.82 * s, m, 16), 0, 0, 0),
        k.put(k.cyl(0.2 * s, 0.15 * s, 0.6 * s, m, 16), 0, 0.82 * s, 0),
        k.put(k.sph(0.115 * s, m, 16, 12), 0, 1.57 * s, 0));
      g.userData.scale = true;
      return g;
    },
    /** Deterministic noise in [0, 1) from an integer. */
    rnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); },
  };
  return k;
}
