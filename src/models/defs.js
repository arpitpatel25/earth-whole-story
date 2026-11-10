// The 3D scenes, built in code. Each entry returns { root, view?, tick?, ground? }.
// Parts made with P('id', ...) are the labelled, selectable pieces; their ids must match content/models/models.txt
// (pipeline/14-models.mjs checks both directions). Dimensions come from the cited sources where they give one.
import { PAL } from './kit.js';

const TAU = Math.PI * 2;

export const DEFS = {
  'earth-interior': (k) => {
    const { P, G, sph, mat, mesh, THREE, put } = k;
    const R = { crust: 1, mantle: 0.975, outer: 3480 / 6371, inner: 1230 / 6371 };
    const cutMat = (c, o = {}) => mat(c, { r: 0.9, double: true, ...o });
    // a half-disc ring on each of the two cut faces
    const faces = (ri, ro, m) => {
      const a = mesh(new THREE.RingGeometry(ri, ro, 64, 1, Math.PI / 2, Math.PI), m);
      const b = a.clone();
      b.rotation.y = -Math.PI / 2;
      return G(a, b);
    };
    const shell = (r, m) => sph(r, m, 64, 40, 0, Math.PI * 1.5);
    const surface = shell(R.crust, mat('#3d6a8a', { r: 0.55 }));
    const root = G(
      P('crust', surface, faces(R.mantle, R.crust, cutMat('#8a7358'))),
      P('mantle', faces(R.outer, R.mantle, cutMat(PAL.lava, { e: '#5a1c08', ei: 0.5 }))),
      P('outer-core', shell(R.outer, mat(PAL.core, { r: 0.5, e: '#a14d00', ei: 0.55 })), faces(R.inner, R.outer, cutMat(PAL.core, { e: '#a14d00', ei: 0.6 }))),
      P('inner-core', sph(R.inner, mat(PAL.coreIn, { r: 0.4, e: '#ffcf5a', ei: 0.75 }), 40, 24)));
    put(root, 0, 1.02, 0);
    return { root: G(root), view: { az: -2.3, pol: 1.22, zoom: 0.92 }, ground: false };
  },

  'solar-system': (k) => {
    const { P, G, sph, mat, torus, put, lathe } = k;
    const planet = (name, r, orbit, color, speed, phase) => ({ name, orbit, speed, phase, o: sph(r, mat(color, { r: 0.75 }), 32, 20) });
    const bodies = [
      planet('mercury', 0.09, 0.95, '#9a8f85', 4.15, 0.4), planet('venus', 0.15, 1.35, '#d9b77a', 1.62, 2.1),
      planet('earth', 0.16, 1.8, '#3f74c9', 1.0, 4.0), planet('mars', 0.11, 2.25, '#b5533a', 0.53, 5.4),
      planet('jupiter', 0.42, 3.15, '#c9a47a', 0.084, 1.1), planet('saturn', 0.34, 4.2, '#d8c08a', 0.034, 3.0),
      planet('uranus', 0.23, 5.1, '#9fd6d8', 0.012, 5.0), planet('neptune', 0.22, 5.85, '#4b6fd6', 0.006, 0.2),
    ];
    const orbitMat = mat('#9fb0c4', { r: 1, a: 0.6 });
    const orbit = (b) => { const t = torus(b.orbit, 0.011, orbitMat, TAU, 128, 6); t.rotation.x = Math.PI / 2; t.castShadow = false; t.receiveShadow = false; return t; };
    const saturn = bodies[5];
    const ringMesh = k.ring(0.44, 0.7, mat('#cdbb8e', { r: 0.9, a: 0.8, double: true }));
    ringMesh.rotation.z = 0.35;
    saturn.o.add(ringMesh);
    const by = Object.fromEntries(bodies.map((b) => [b.name, b]));
    const members = (names) => names.flatMap((n) => [by[n].o, orbit(by[n])]);
    const sun = sph(0.6, mat('#ffcc55', { e: '#ffb020', ei: 1.4, r: 1 }), 48, 28);
    sun.castShadow = false;
    const root = G(P('sun', sun), P('rocky', members(['mercury', 'venus'])), P('habitable', members(['earth', 'mars'])), P('giants', members(['jupiter', 'saturn', 'uranus', 'neptune'])));
    put(root, 0, 0.6, 0);
    const tick = (t) => { for (const b of bodies) { const a = b.phase + t * 0.25 * b.speed; b.o.position.set(Math.cos(a) * b.orbit, 0, Math.sin(a) * b.orbit); } };
    tick(0);
    return { root: G(root), view: { az: 0.6, pol: 0.98, zoom: 0.72 }, tick, ground: false, sunlight: true, animated: true };
  },

  'lucy': (k) => {
    const { P, G, sph, mat, mesh, put, cyl, THREE } = k;
    const bone = mat(PAL.bone, { r: 0.62 });
    const ghost = mat('#8a99ab', { r: 1, a: 0.42, dw: true });
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const UP = V(0, 1, 0);
    // a long bone between two points: a shaft with swollen ends
    const long = (a, b, r, m) => {
      const L = a.distanceTo(b);
      const o = k.lathe([[0, 0], [r * 1.7, 0.02 * L], [r * 1.8, 0.06 * L], [r, 0.15 * L], [r * 0.85, 0.5 * L], [r, 0.85 * L], [r * 1.7, 0.94 * L], [r * 1.5, 0.985 * L], [0, L]], m, 14);
      o.position.copy(a);
      o.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
      return o;
    };
    const blob = (r, sx, sy, sz, m, x, y, z) => { const o = sph(r, m, 18, 12); o.scale.set(sx, sy, sz); return put(o, x, y, z); };
    // the height is about 1.1 m; the figure faces +z
    const hipY = 0.5, shY = 0.86;
    const rest = G();
    for (const s of [-1, 1]) {
      const hip = V(s * 0.085, hipY, 0), knee = V(s * 0.05, 0.27, 0.012), ankle = V(s * 0.052, 0.05, 0);
      rest.add(long(hip, knee, 0.014, ghost), long(knee, ankle, 0.012, ghost), blob(0.03, 0.8, 0.45, 2.3, ghost, s * 0.055, 0.02, 0.04));
      const sh = V(s * 0.145, shY, -0.01), el = V(s * 0.165, 0.63, -0.005), wr = V(s * 0.17, 0.43, 0.02);
      rest.add(long(sh, el, 0.011, ghost), long(el, wr, 0.009, ghost), blob(0.024, 0.7, 1.5, 0.5, ghost, s * 0.172, 0.39, 0.025));
      rest.add(k.rod([s * 0.02, shY + 0.012, 0.045], [s * 0.145, shY + 0.005, 0], 0.006, ghost)); // collar bone
    }
    // spine: vertebrae on a gentle curve
    const spine = G();
    for (let i = 0; i < 20; i++) {
      const t = i / 19;
      spine.add(put(cyl(0.012 + 0.006 * (1 - t), 0.013 + 0.006 * (1 - t), 0.014, bone, 12), 0, hipY + 0.05 + t * 0.4, -0.045 + Math.sin(t * Math.PI) * 0.012));
    }
    // ribs: each pair is one arc open at the back, wider lower down, sloping towards the front
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const R = 0.075 + t * 0.045;
      const gap = 0.5;
      const g = new THREE.TorusGeometry(R, 0.0042, 6, 40, TAU - gap);
      g.rotateX(Math.PI / 2);
      const rib = mesh(g, bone);
      rib.rotation.order = 'XYZ';
      rib.rotation.set(0.24, Math.PI / 2 - gap / 2, 0);
      rib.scale.z = 0.74;
      rib.position.set(0, shY - 0.03 - t * 0.19, 0.012 + t * 0.012);
      spine.add(rib);
    }
    // pelvis: two flaring blades and the sacrum between them
    const blade = (s) => { const b = sph(0.07, bone, 20, 14); b.scale.set(1, 0.82, 0.3); return put(b, s * 0.068, hipY + 0.035, -0.012, 0.2, s * -0.55, s * 0.28); };
    const sacrum = put(cyl(0.03, 0.012, 0.075, bone, 10), 0, hipY - 0.01, -0.045, 0.25, 0, 0);
    // skull: a small braincase, a projecting face and the jaw
    const skull = G(blob(0.058, 0.95, 0.86, 1.12, bone, 0, 1.035, -0.012), blob(0.038, 0.9, 0.9, 1.15, bone, 0, 0.998, 0.042));
    const jawG = new THREE.TorusGeometry(0.03, 0.008, 8, 24, Math.PI);
    jawG.rotateX(Math.PI / 2);
    skull.add(put(mesh(jawG, bone), 0, 0.962, 0.03, 0.2, 0, 0));
    const stand = G(put(cyl(0.16, 0.17, 0.02, mat('#2a3644', { r: 0.6 }), 40), 0, -0.02, 0));
    const root = G(stand, P('skull', skull), P('spine', spine), P('pelvis', blade(-1), blade(1), sacrum), P('missing', rest));
    return { root, view: { az: 0.5, pol: 1.38, zoom: 0.95 } };
  },

  'handaxe': (k) => {
    const { P, G, mat, mesh, THREE, put } = k;
    const src = new THREE.IcosahedronGeometry(1, 3).toNonIndexed();
    const pos = src.attributes.position;
    const v = new THREE.Vector3();
    const half = (y) => { const t = (y + 1) / 2; return 0.55 * Math.pow(Math.sin(Math.PI * Math.pow(1 - t, 0.62)), 0.75) + 0.02; }; // almond outline
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const y = v.y;
      const w = half(y);
      const ang = Math.atan2(v.z, v.x);
      const edge = Math.abs(Math.cos(ang));
      const thick = 0.2 * (0.35 + 0.65 * Math.sin(Math.PI * Math.pow((1 - y) / 2, 0.8)));
      let x = Math.cos(ang) * w;
      let z = Math.sin(ang) * thick * Math.pow(1 - edge * edge, 0.42);
      // flake scars: shallow, deterministic dents
      const n = Math.sin(v.x * 9.1 + v.y * 5.3) * Math.cos(v.z * 11.7 + v.y * 7.9);
      z *= 1 + 0.16 * n;
      x *= 1 + 0.035 * Math.sin(v.y * 23.0 + v.z * 3.0);
      pos.setXYZ(i, x, y * 0.92, z);
    }
    // split the one stone into its named regions, triangle by triangle
    const buckets = { tip: [], butt: [], edge: [], faces: [] };
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      const cy = (a.y + b.y + c.y) / 3, cx = (a.x + b.x + c.x) / 3;
      const w = half(cy / 0.92);
      const key = cy > 0.5 ? 'tip' : cy < -0.58 ? 'butt' : Math.abs(cx) > w * 0.72 ? 'edge' : 'faces';
      buckets[key].push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    const stone = (arr, color) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
      g.computeVertexNormals();
      return mesh(g, mat(color, { r: 0.62, flat: true }));
    };
    const axe = G(P('tip', stone(buckets.tip, '#665e52')), P('butt', stone(buckets.butt, '#5a5348')), P('edge', stone(buckets.edge, '#6d6558')), P('faces', stone(buckets.faces, PAL.flint)));
    put(axe, 0, 1.05, 0, 0.12, 0.5, 0.2);
    return { root: G(axe), view: { az: 0.35, pol: 1.3 }, ground: 0 };
  },

  'great-bath': (k) => {
    const { P, G, box, mat, put, ext, cyl } = k;
    const brick = mat(PAL.brick), brickD = mat(PAL.brickDark), tar = mat(PAL.bitumen, { r: 0.5 });
    const L = 12, W = 7, D = 2.4; // metres, from the source: long axis north-south (z)
    const ox = 12, oz = 15; // half-size of the surrounding platform
    const deck = ext([[-ox, -oz], [ox, -oz], [ox, oz], [-ox, oz]], D, brick, { holes: [[[-W / 2, -L / 2], [-W / 2, L / 2], [W / 2, L / 2], [W / 2, -L / 2]]] });
    deck.rotation.x = Math.PI / 2; deck.position.y = D / 2; // extrude runs along -y after the turn
    const floor = put(box(W, 0.12, L, tar), 0, -0.02, 0);
    const lining = G(floor,
      put(box(0.1, D, L, tar), -W / 2 + 0.05, 0, 0), put(box(0.1, D, L, tar), W / 2 - 0.05, 0, 0),
      put(box(W, D, 0.1, tar), 0, 0, -L / 2 + 0.05), put(box(W, D, 0.1, tar), 0, 0, L / 2 - 0.05));
    const water = put(box(W - 0.2, 0.04, L - 0.2, mat(PAL.water, { r: 0.15, a: 0.55 })), 0, 1.25, 0);
    water.castShadow = false;
    const stairs = G();
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) stairs.add(put(box(3.4, D - 0.17 - i * 0.17, 0.34, brickD), 0, 0, s * (L / 2 - 0.2 - i * 0.34)));
      stairs.add(put(box(W - 0.2, 1.0, 0.5, brickD), 0, 0, s * (L / 2 - 2.5)));
    }
    const colonnade = G();
    const pillar = (x, z) => put(box(0.7, 2.6, 0.7, brick), x, D, z);
    for (let i = 0; i < 8; i++) { const z = -L / 2 - 1 + i * ((L + 2) / 7); colonnade.add(pillar(W / 2 + 2.2, z)); }
    for (let i = 0; i < 5; i++) { const x = -W / 2 - 1 + i * ((W + 3.2) / 4); colonnade.add(pillar(x, -L / 2 - 2.2), pillar(x, L / 2 + 2.2)); }
    const rooms = G();
    for (let i = 0; i < 6; i++) rooms.add(put(box(4.2, 2.2, 0.35, brickD), W / 2 + 6.4, D, -L / 2 - 1 + i * ((L + 2) / 5)));
    rooms.add(put(box(0.35, 2.2, L + 2.35, brickD), W / 2 + 8.5, D, 0), put(box(0.35, 2.2, L + 2.35, brickD), W / 2 + 4.3, D, 0));
    const well = G(put(cyl(0.75, 0.75, 0.5, brick, 24), 0, 0, 0), put(cyl(0.5, 0.5, 0.52, mat(PAL.black), 24), 0, 0, 0));
    rooms.add(put(well, W / 2 + 6.4, D, -L / 2 + 0.4));
    const drain = G(put(box(0.5, 0.5, 0.3, mat(PAL.black)), -W / 2 + 0.4, 0.05, L / 2 - 0.12), put(box(1.0, 0.25, oz - L / 2, mat(PAL.black)), -W / 2 + 0.4, D - 0.2, (oz + L / 2) / 2));
    for (let i = 0; i < 5; i++) drain.add(put(box(1.5, 0.2, 0.5, brickD), -W / 2 + 0.4, D + 0.01, L / 2 + 1.6 + i * 1.5));
    const root = G(deck, P('tank', water), P('lining', lining), P('stairs', stairs), P('colonnade', colonnade), P('well', rooms), P('drain', drain), put(k.person(1.7), -W / 2 - 1.6, D, 2));
    return { root, view: { az: -0.7, pol: 0.92 } };
  },

  'harappan-street': (k) => {
    const { P, G, box, mat, put, cyl } = k;
    const brick = mat(PAL.brick), brickD = mat(PAL.brickDark), mud = mat('#b89a72'), roof = mat('#c5aa80');
    const ground = put(box(34, 0.3, 26, mat('#a88c66')), 0, -0.3, 0);
    const houses = G();
    const house = (x, z, w, d, h) => G(put(box(w, h, d, brick), x, 0, z), put(box(w + 0.3, 0.25, d + 0.3, roof), x, h, z), put(box(1.1, 2.0, 0.2, mat(PAL.woodDark)), x - w / 4, 0, z + (z < 0 ? d / 2 : -d / 2)));
    houses.add(house(-10, -8.5, 9, 7, 3.6), house(1.5, -8.5, 11, 7, 6.4), house(11.5, -8.5, 6, 7, 3.4), house(-10.5, 8.5, 8, 7, 6.2));
    // the open courtyard house: walls only, so the washing place can be seen
    const wall = (x, z, w, d) => put(box(w, 3.0, d, brick), x, 0, z);
    houses.add(wall(4, 5.15, 15, 0.5), wall(4, 11.85, 15, 0.5), wall(-3.25, 8.5, 0.5, 7.2), wall(11.25, 8.5, 0.5, 7.2), wall(1.5, 9.6, 0.4, 4.2));
    const well = G(cyl(0.95, 0.95, 0.8, brickD, 28), put(cyl(0.62, 0.62, 0.82, mat(PAL.black), 28), 0, 0, 0), put(cyl(1.5, 1.5, 0.08, brickD, 28), 0, 0, 0));
    const platform = G(put(box(2.6, 0.3, 2.2, brickD), 8.6, 0, 9.9), put(box(2.2, 0.06, 1.8, mat('#6b4a36', { r: 0.4 })), 8.6, 0.3, 9.9), put(box(0.9, 0.55, 0.9, brickD), 10.3, 0, 6.4), put(box(0.4, 0.57, 0.4, mat(PAL.black)), 10.3, 0, 6.4));
    const drain = G(put(box(34, 0.12, 0.9, brickD), 0, -0.02, 3.6));
    for (let i = 0; i < 22; i++) if (i !== 9 && i !== 10) drain.add(put(box(1.4, 0.14, 1.1, mud), -16.2 + i * 1.5, 0.08, 3.6));
    drain.add(put(box(2.7, 0.2, 0.7, mat(PAL.black)), -2.0, -0.06, 3.6), k.rod([10.3, 0.2, 6.0], [10.3, 0.12, 3.9], 0.14, mat('#9a6a48')));
    const jar = put(k.lathe([[0, 0], [0.16, 0.02], [0.24, 0.2], [0.2, 0.4], [0.1, 0.48], [0.12, 0.54]], mat('#b0603c'), 20), 9.4, 0.3, 9.2);
    const root = G(ground, P('houses', houses), P('well', put(well, 4.6, 0, 8.4)), P('bath', platform, jar), P('drain', drain), put(k.person(1.6), -5.5, 0, 1.2));
    return { root, view: { az: 0.5, pol: 0.86 } };
  },

  'stonehenge': (k) => {
    const { P, G, box, mat, put, around, torus, cyl } = k;
    const sarsen = mat(PAL.sarsen, { r: 0.95 }), blue = mat('#6f7f8a', { r: 0.95 });
    const stone = (w, h, d, m, i) => { const s = box(w * (0.9 + k.rnd(i) * 0.2), h * (0.95 + k.rnd(i + 7) * 0.1), d * (0.85 + k.rnd(i + 13) * 0.3), m); s.rotation.y = (k.rnd(i + 3) - 0.5) * 0.12; return s; };
    const circle = G(around(30, 15.2, (i) => stone(2.1, 4.0, 1.1, sarsen, i)));
    circle.add(around(30, 15.2, (i) => put(box(3.2, 0.75, 1.0, sarsen), 0, 4.05, 0, 0, 0, 0), Math.PI / 30));
    const blues = around(40, 11.6, (i) => stone(0.8, 1.9, 0.6, blue, i + 100));
    const tri = G();
    const arc = [-2.05, -1.05, 0, 1.05, 2.05];
    arc.forEach((a, i) => {
      const h = 6.0 + (2 - Math.abs(i - 2)) * 0.65;
      const t = G(put(stone(2.4, h, 1.2, sarsen, i + 200), -1.75, 0, 0), put(stone(2.4, h, 1.2, sarsen, i + 210), 1.75, 0, 0), put(box(5.6, 1.0, 1.3, sarsen), 0, h + 0.02, 0));
      tri.add(put(t, Math.sin(a) * 7.3, 0, -Math.cos(a) * 7.3 + 1.0, 0, -a, 0));
    });
    const ditch = G(put(k.ring(47, 51.5, mat('#4d5a38', { r: 1 })), 0, 0.02, 0), put(torus(45.2, 1.1, mat('#74845a', { r: 1 }), TAU, 96, 8), 0, 0, 0, Math.PI / 2, 0, 0));
    ditch.children[1].scale.set(1, 1, 0.55);
    const turf = put(cyl(58, 58, 0.5, mat(PAL.grass, { r: 1 }), 72), 0, -0.5, 0);
    const root = G(turf, P('sarsens', circle), P('bluestones', blues), P('trilithons', tri), P('ditch', ditch), put(k.person(1.7), 4, 0, 19));
    return { root, view: { az: 0.5, pol: 1.16, zoom: 0.5 } };
  },

  'great-pyramid': (k) => {
    const { P, G, box, mat, put, mesh, THREE } = k;
    const B = 230.3 / 2, H = 146.6, N = 42; // half-base and original height in metres; N courses stand for some 210
    const core = G();
    const lime = mat(PAL.limestone, { r: 0.95 }), limeD = mat('#c9bd9f', { r: 0.95 });
    for (let i = 0; i < N; i++) {
      const y0 = (i / N) * 138.5, s = B * (1 - (i + 0.5) / N * (138.5 / H)) ;
      core.add(put(box(s * 2, 138.5 / N + 0.05, s, i % 2 ? lime : limeD), 0, y0, s / 2));
    }
    // smooth casing on the back and west faces, as the whole pyramid once was
    const tri = (pts, m) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.flat()), 3)); g.computeVertexNormals(); return mesh(g, m); };
    const white = mat('#f5f1e6', { r: 0.45, double: true });
    const e = 2.2;
    const casing = G(tri([[-B - e, 0, B + e], [B + e, 0, B + e], [0, H, 0]], white), tri([[-B - e, 0, 0], [-B - e, 0, B + e], [0, H, 0]], white));
    const rock = put(box(B * 2 + 60, 46, B + 30, mat('#b79d74', { r: 1 })), 0, -46, (B + 30) / 2);
    const cham = (w, h, x, y, color) => put(box(w, h, 6, mat(color, { r: 0.6, e: '#201510', ei: 0.4 })), x, y, 1.5);
    const passage = (a, b) => k.rod([a[0], a[1], 0.2], [b[0], b[1], 0.2], 1.3, mat('#2a2622'));
    const kings = P('kings', cham(15, 9, 6, 43, PAL.granite));
    const queens = P('queens', cham(9, 8, 0, 21, '#d6c9a6'));
    const lower = P('lower', cham(16, 7, 0, -30, '#5b4c3a'));
    const ways = G(passage([-B * 0.42, 17, 0], [-18, -27, 0]), passage([-B * 0.26, 3, 0], [-6, 22, 0]), passage([-6, 22, 0], [1, 43, 0]));
    const root = G(P('core', core), P('casing', casing), rock, kings, queens, lower, ways);
    return { root, view: { az: Math.PI, pol: 1.32 }, ground: false };
  },
};

Object.assign(DEFS, {
  'sanchi-stupa': (k) => {
    const { P, G, box, mat, put, around, torus, cyl, lathe } = k;
    const stone = mat('#c9b48e', { r: 0.9 }), stoneD = mat('#b09a74', { r: 0.9 });
    const R = 18.3; // the dome is some 36 m across; proportions are approximate
    const terrace = G(cyl(R + 3.2, R + 3.4, 4.2, stoneD, 72), put(torus(R + 3.0, 0.22, stone, TAU, 96, 8), 0, 5.3, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 64; i++) { const a = (i / 64) * TAU; terrace.add(put(box(0.3, 1.2, 0.3, stone), Math.sin(a) * (R + 3.0), 4.2, Math.cos(a) * (R + 3.0))); }
    const profile = [];
    for (let i = 0; i <= 24; i++) { const t = (i / 24) * (Math.PI / 2); profile.push([Math.cos(t) * R, 4.2 + Math.sin(t) * R * 0.78]); }
    const dome = lathe(profile, mat('#d8c6a2', { r: 0.95 }), 72);
    const top = 4.2 + R * 0.78;
    const harmika = G();
    for (let i = 0; i < 16; i++) { const s = Math.floor(i / 4), u = (i % 4) / 4 - 0.375; const x = [u * 5.2, 2.6, -u * 5.2, -2.6][s], z = [2.6, -u * 5.2, -2.6, u * 5.2][s]; harmika.add(put(box(0.32, 1.6, 0.32, stone), x, top - 0.2, z)); }
    for (const y of [0.5, 1.1]) harmika.add(put(box(5.5, 0.2, 0.2, stone), 0, top + y - 0.2, 2.6), put(box(5.5, 0.2, 0.2, stone), 0, top + y - 0.2, -2.6), put(box(0.2, 0.2, 5.5, stone), 2.6, top + y - 0.2, 0), put(box(0.2, 0.2, 5.5, stone), -2.6, top + y - 0.2, 0));
    const chatra = G(put(cyl(0.22, 0.26, 5.2, stone, 16), 0, top - 0.3, 0));
    [[2.3, 2.2], [1.7, 3.4], [1.15, 4.5]].forEach(([r, y]) => chatra.add(put(lathe([[0, 0.18], [r * 0.5, 0.16], [r, 0], [r, -0.08], [0.2, -0.02]], stone, 40), 0, top + y, 0)));
    // the ground balustrade: posts, three rails and a coping
    const RR = R + 6.4;
    const rail = G();
    for (let i = 0; i < 96; i++) { const a = (i / 96) * TAU; if (Math.abs(((a + Math.PI / 4) % (Math.PI / 2)) - Math.PI / 4) < 0.085) continue; rail.add(put(box(0.5, 3.0, 0.42, stone), Math.sin(a) * RR, 0, Math.cos(a) * RR, 0, a, 0)); }
    for (const y of [0.9, 1.6, 2.3, 3.05]) for (let q = 0; q < 4; q++) rail.add(put(torus(RR, y > 3 ? 0.24 : 0.15, stoneD, Math.PI / 2 - 0.19, 40, 8), 0, y, 0, Math.PI / 2, 0, q * Math.PI / 2 + 0.095));
    const torana = () => {
      const g = G(put(box(0.75, 8.6, 0.75, stone), -1.9, 0, 0), put(box(0.75, 8.6, 0.75, stone), 1.9, 0, 0));
      [5.6, 7.3, 9.0].forEach((y, i) => {
        const beam = k.ext([[-3.6, 0], [-3.9, 0.35], [-3.6, 0.7], [3.6, 0.7], [3.9, 0.35], [3.6, 0]].map(([x, yy]) => [x, yy + Math.pow(Math.abs(x) / 3.9, 2) * -0.35]), 0.6, stoneD);
        g.add(put(beam, 0, y, 0));
        for (const s of [-1, 1]) g.add(put(cyl(0.42, 0.42, 0.62, stone, 20), s * 3.75, y + 0.02, 0, Math.PI / 2, 0, 0));
        if (i < 2) for (const x of [-1.1, 0, 1.1]) g.add(put(box(0.3, 1.0, 0.3, stone), x, y + 0.7, 0));
      });
      g.add(put(box(0.4, 1.3, 0.3, stone), 0, 9.7, 0), put(cyl(0.55, 0.55, 0.16, stone, 20), 0, 11.0, 0, Math.PI / 2, 0, 0));
      return g;
    };
    const gates = around(4, RR + 0.2, () => torana());
    const plinth = put(cyl(RR + 9, RR + 9, 0.6, mat('#9a8f72', { r: 1 }), 72), 0, -0.6, 0);
    const root = G(plinth, P('terrace', terrace), P('dome', dome), P('chatra', harmika, chatra), P('railing', rail), P('toranas', gates), put(k.person(1.7), 6, 0, RR + 4));
    return { root, view: { az: 0.45, pol: 1.2 } };
  },

  'iron-pillar': (k) => {
    const { P, G, mat, put, lathe, cyl, box } = k;
    const iron = mat('#5b5753', { r: 0.5, m: 0.7 });
    const above = 7.21 - 1.12; // metres above ground, from the source
    const shaft = lathe([[0.205, 0], [0.2, 1.5], [0.175, above - 1.05], [0.165, above - 1.0]], iron, 40);
    // the capital: a reeded bell, discs and a square top
    const bell = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; bell.push([0.17 + Math.sin(t * Math.PI) * 0.1 + t * 0.03, t * 0.306]); }
    const cap = G(put(lathe(bell, iron, 24), 0, above - 1.0, 0));
    [[0.21, 0.07], [0.24, 0.06], [0.2, 0.07], [0.23, 0.06]].forEach(([r, h], i) => cap.add(put(cyl(r, r, h, iron, 32), 0, above - 0.69 + i * 0.085, 0)));
    cap.add(put(box(0.3, 0.3, 0.3, iron), 0, above - 0.34, 0));
    const base = lathe([[0.3, -1.12], [0.34, -0.9], [0.26, -0.3], [0.205, 0]], mat('#57504a', { r: 0.8, m: 0.5 }), 40);
    // the ground, cut away so that the buried part can be seen
    const soil = cyl(2.6, 2.6, 1.4, mat(PAL.earth, { r: 1 }), 64);
    soil.geometry = new k.THREE.CylinderGeometry(2.6, 2.6, 1.4, 64, 1, false, 0.9, Math.PI * 1.5);
    const paving = new k.THREE.CylinderGeometry(2.6, 2.6, 0.08, 64, 1, false, 0.9, Math.PI * 1.5);
    const ground = G(put(soil, 0, -0.7, 0), put(k.mesh(paving, mat(PAL.stone, { r: 1 })), 0, 0.04, 0), put(cyl(0.9, 1.0, 0.25, mat(PAL.stone), 40), 0, 0, 0));
    ground.children[2].geometry = new k.THREE.CylinderGeometry(0.9, 1.0, 0.25, 40, 1, false, 0.9, Math.PI * 1.5); ground.children[2].position.y = 0.125;
    const root = G(ground, P('shaft', shaft), P('capital', cap), P('base', base), put(k.person(1.7), 1.25, 0.08, -0.3));
    return { root, view: { az: -0.25, pol: 1.38 }, ground: -1.4 };
  },

  'brihadisvara': (k) => {
    const { P, G, box, mat, put, cyl, lathe, sph } = k;
    const gr = mat('#b99a78', { r: 0.92 }), grD = mat('#9f8262', { r: 0.92 }), grL = mat('#cdb18c', { r: 0.92 });
    const base = G(put(box(34, 2.4, 34, grD), 0, 0, 0), put(box(31, 0.6, 31, grL), 0, 2.4, 0));
    const sanctum = G(put(box(27, 14, 27, gr), 0, 3, 0), put(box(28, 0.8, 28, grL), 0, 10, 0), put(box(28.4, 0.9, 28.4, grL), 0, 17, 0));
    for (let s = 0; s < 4; s++) for (let i = 0; i < 6; i++) { const u = -11 + i * 4.4; const p = box(1.3, 14, 0.5, grL); sanctum.add(put(p, s % 2 ? (s === 1 ? 13.6 : -13.6) : u, 3, s % 2 ? u : (s === 0 ? 13.6 : -13.6), 0, s % 2 ? Math.PI / 2 : 0, 0)); }
    const tower = G();
    const tiers = 13, y0 = 17.9, y1 = 54.5;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers, w = 26 - t * 15.5, h = (y1 - y0) / tiers;
      tower.add(put(box(w, h * 0.78, w, i % 2 ? gr : grD), 0, y0 + i * h, 0), put(box(w + 0.9, h * 0.24, w + 0.9, grL), 0, y0 + i * h + h * 0.78, 0));
    }
    const crown = G(put(cyl(4.6, 4.9, 2.6, gr, 8), 0, y1, 0),
      put(lathe([[0, 5.6], [1.2, 5.5], [3.6, 4.4], [5.2, 2.6], [5.6, 1.2], [5.0, 0]], grL, 8), 0, y1 + 2.6, 0),
      put(lathe([[0, 3.2], [0.12, 3.0], [0.5, 2.2], [0.25, 1.6], [0.75, 0.9], [0.4, 0.3], [0.6, 0]], mat(PAL.gold, { r: 0.35, m: 0.8 }), 20), 0, y1 + 8.2, 0)); // 63.4 m in all
    const hall = G(put(box(20, 2.4, 44, grD), 0, 0, 38), put(box(17, 9, 40, gr), 0, 2.4, 38), put(box(18, 0.8, 41, grL), 0, 11.4, 38));
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) hall.add(put(box(0.5, 9, 1.2, grL), s * 8.6, 2.4, 20.5 + i * 4.4));
    // the Nandi pavilion and, inside it, the bull, facing the shrine
    const pav = G(put(box(11, 1.6, 13, grD), 0, 0, 72), put(box(11.6, 0.8, 13.6, grL), 0, 8.2, 72));
    for (const x of [-4.6, -1.5, 1.5, 4.6]) for (const z of [-5.4, 0, 5.4]) if (Math.abs(x) > 4 || Math.abs(z) > 5) pav.add(put(box(0.7, 6.6, 0.7, grL), x, 1.6, 72 + z));
    const dark = mat('#3a3531', { r: 0.6 });
    const bull = G(put(sph(1.9, dark, 20, 14), 0, 3.4, 72.4), put(sph(1.0, dark, 16, 12), 0, 4.9, 70.0), put(sph(0.8, dark, 12, 10), 0, 5.1, 71.6));
    bull.children[0].scale.set(1, 0.85, 1.7);
    const court = put(box(64, 0.5, 124, mat('#b3a184', { r: 1 })), 0, -0.5, 30);
    const root = G(court, base, P('sanctum', sanctum), P('vimana', tower), P('crown', crown), P('hall', hall, pav, bull));
    return { root, view: { az: 2.2, pol: 1.22 } };
  },

  'qutb-minar': (k) => {
    const { P, G, mat, put, mesh, THREE, cyl, box } = k;
    const H = 72.5, R0 = 7.15, R1 = 1.35; // height and diameters (14.3 m to 2.7 m) from the source
    const stage = [0, 0.4, 0.61, 0.76, 0.88, 1].map((t) => t * H);
    const rAt = (y) => R0 + (R1 - R0) * (y / H);
    const red = mat(PAL.red, { r: 0.85 }), redL = mat('#b9583a', { r: 0.85 }), buff = mat('#d9c7a8', { r: 0.8 });
    // a fluted drum: the radius is modulated around the circumference
    const fluted = (y0, y1, m, flutes, sharp) => {
      const g = new THREE.CylinderGeometry(rAt(y1), rAt(y0), y1 - y0, flutes * 8, 1, true);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        const a = Math.atan2(z, x);
        const w = sharp ? Math.abs(((a * flutes) / Math.PI) % 2 - 1) : 0.5 + 0.5 * Math.cos(a * flutes);
        const s = 1 + 0.085 * w;
        p.setX(i, x * s); p.setZ(i, z * s);
      }
      g.computeVertexNormals();
      g.translate(0, (y0 + y1) / 2, 0);
      return mesh(g, m);
    };
    const first = fluted(stage[0], stage[1] - 1.2, red, 24, false);
    const shaft = G(fluted(stage[1] + 0.6, stage[2] - 1.0, redL, 24, false), fluted(stage[2] + 0.6, stage[3] - 0.9, red, 24, true), fluted(stage[3] + 0.5, stage[4] - 0.8, buff, 1, false), fluted(stage[4] + 0.5, stage[5] - 0.6, buff, 1, false));
    for (let i = 3; i < 5; i++) for (const f of [0.3, 0.7]) { const y = stage[i] + (stage[i + 1] - stage[i]) * f; shaft.add(put(cyl(rAt(y) + 0.06, rAt(y) + 0.06, 0.5, red, 40), 0, y, 0)); }
    const firstBands = G();
    for (let i = 0; i < 3; i++) for (const f of [0.25, 0.5, 0.75]) { const y = stage[i] + (stage[i + 1] - stage[i]) * f; (i === 0 ? firstBands : shaft).add(put(cyl(rAt(y) * 1.09, rAt(y) * 1.09, 0.7, buff, 48), 0, y, 0)); }
    const balconies = G();
    for (let i = 1; i <= 5; i++) {
      const y = stage[i], r = rAt(y);
      if (i < 5) balconies.add(put(cyl(r * 1.42, r * 1.02, 1.3, redL, 48), 0, y - 1.3, 0), put(cyl(r * 1.45, r * 1.45, 0.25, buff, 48), 0, y, 0), put(cyl(r * 1.45, r * 1.45, 0.9, red, 48, true), 0, y + 0.25, 0));
      else balconies.add(put(cyl(r * 1.25, r * 1.0, 0.6, buff, 32), 0, y - 0.6, 0), put(cyl(0.5, r * 1.1, 1.6, buff, 24), 0, y, 0));
    }
    const door = put(k.ext([[-0.9, 0], [-0.9, 2.1], [-0.6, 2.9], [0, 3.4], [0.6, 2.9], [0.9, 2.1], [0.9, 0]], 0.8, mat(PAL.black)), 0, 0.2, R0 * 1.07);
    const slits = G(door);
    for (let i = 0; i < 9; i++) { const y = 6 + i * 6.6; const r = rAt(y) * 1.07; const a = i * 1.9; slits.add(put(box(0.35, 1.5, 0.3, mat(PAL.black)), Math.sin(a) * r, y, Math.cos(a) * r, 0, a, 0)); }
    const plinth = put(cyl(11, 11.4, 0.8, mat(PAL.stone, { r: 1 }), 64), 0, -0.8, 0);
    const root = G(plinth, P('first', first, firstBands), P('shaft', shaft), P('balconies', balconies), P('stairs', slits), put(k.person(1.7), 9.6, 0, 3));
    return { root, view: { az: 0.3, pol: 1.4 } };
  },

  'samrat-yantra': (k) => {
    const { P, G, box, mat, put, ext, mesh, THREE, cyl } = k;
    const plaster = mat('#e6d3a8', { r: 0.9 }), plasterD = mat('#c9b283', { r: 0.9 }), marble = mat(PAL.marble, { r: 0.5 });
    const LAT = (27 * Math.PI) / 180; // the gnomon's edge points at the celestial pole: its slope is the latitude
    const Hh = 27, base = Hh / Math.tan(LAT);
    const wall = ext([[0, 0], [base, 0], [base, Hh], ], 3.2, plaster);
    wall.rotation.y = Math.PI / 2; // run north-south along z
    const steps = G();
    for (let i = 0; i < 40; i++) { const t = (i + 0.5) / 40; steps.add(put(box(1.5, 0.35, base / 40 + 0.05, plasterD), 0, t * Hh - 0.15, -t * base)); }
    const kiosk = G(put(box(2.6, 0.3, 2.6, plasterD), 0, Hh, -base + 1.2));
    for (const x of [-1, 1]) for (const z of [-1, 1]) kiosk.add(put(cyl(0.12, 0.12, 2.2, plasterD, 10), x, Hh + 0.3, -base + 1.2 + z));
    kiosk.add(put(k.lathe([[0, 1.3], [0.8, 1.0], [1.5, 0.3], [1.7, 0], [1.9, 0]], plasterD, 24), 0, Hh + 2.5, -base + 1.2));
    // the two quadrants: quarter circles in the plane of the equator (at right angles to the gnomon's edge),
    // one on each side, carried on masonry that fills in beneath them
    const quad = (side) => {
      const Rq = 14.5, w = 2.8, thick = 0.7, n = 28;
      const e = new THREE.Vector3(0, Math.sin(LAT), -Math.cos(LAT)); // along the gnomon's edge
      const d0 = new THREE.Vector3(0, -Math.cos(LAT), -Math.sin(LAT)); // downwards, within the equatorial plane
      const x = new THREE.Vector3(side, 0, 0);
      const mid = 0.6;
      const C = new THREE.Vector3(side * 1.6, mid * Hh, -mid * base);
      const at = (th, r, off) => C.clone().addScaledVector(d0, Math.cos(th) * r).addScaledVector(x, Math.sin(th) * r).addScaledVector(e, off);
      const band = [], fillA = [], fillB = [];
      const quadTo = (arr, a, b, c, d) => arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      const drop = (p) => new THREE.Vector3(p.x, 0, p.z);
      for (let i = 0; i < n; i++) {
        const t0 = (i / n) * (Math.PI / 2), t1 = ((i + 1) / n) * (Math.PI / 2);
        const o0a = at(t0, Rq, -w / 2), o0b = at(t0, Rq, w / 2), o1a = at(t1, Rq, -w / 2), o1b = at(t1, Rq, w / 2);
        const i0a = at(t0, Rq - thick, -w / 2), i0b = at(t0, Rq - thick, w / 2), i1a = at(t1, Rq - thick, -w / 2), i1b = at(t1, Rq - thick, w / 2);
        quadTo(band, i0a, i0b, i1b, i1a); quadTo(band, o0b, o0a, o1a, o1b); quadTo(band, i0a, i1a, o1a, o0a); quadTo(band, i0b, o0b, o1b, i1b);
        quadTo(fillA, o0a, drop(o0a), drop(o1a), o1a); quadTo(fillA, o0b, o1b, drop(o1b), drop(o0b)); quadTo(fillA, o0a, o1a, o1b, o0b);
      }
      const end = at(Math.PI / 2, Rq, 0);
      const geo = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3)); g.computeVertexNormals(); return g; };
      const wing = mesh(geo(fillA), mat('#d7c193', { r: 0.9, double: true }));
      const scale = mesh(geo(band), mat(PAL.marble, { r: 0.45, double: true }));
      const endWall = put(box(w * 0.9, end.y, 0.6, plasterD), end.x, 0, end.z);
      return G(wing, scale, endWall);
    };
    const platform = put(box(46, 1.2, base + 16, mat('#bfa57a', { r: 1 })), 0, -1.2, -base / 2);
    const root = G(P('maker', platform), P('gnomon', wall, steps, kiosk), P('quadrants', quad(-1), quad(1)), put(k.person(1.7), 6, 0, 3));
    return { root, view: { az: 0.42, pol: 1.08 } };
  },

  'taj-mahal': (k) => {
    const { P, G, box, mat, put, ext, lathe, cyl, around } = k;
    const marble = mat('#f1ede2', { r: 0.5 }), shade = mat('#d9d3c4', { r: 0.6 }), dark = mat('#8f8a80', { r: 0.8 });
    const plinth = G(put(box(95.5, 6, 95.5, marble), 0, 0, 0), put(box(96.5, 0.5, 96.5, shade), 0, 6, 0)); // 95.5 m square, 6 m high: from the source
    const S = 28, C = 10; // half-width of the tomb block and its chamfer
    const block = ext([[-S + C, -S], [S - C, -S], [S, -S + C], [S, S - C], [S - C, S], [-S + C, S], [-S, S - C], [-S, -S + C]], 23, marble);
    block.rotation.x = -Math.PI / 2; block.position.y = 6.5 + 11.5;
    const arch = (w, h, depth, m) => ext([[-w / 2, 0], [-w / 2, h * 0.62], [-w * 0.3, h * 0.86], [0, h], [w * 0.3, h * 0.86], [w / 2, h * 0.62], [w / 2, 0]], depth, m);
    const tomb = G(block, put(box(S * 2 + 0.6, 0.9, S * 2 + 0.6, shade), 0, 29.5, 0));
    tomb.add(around(4, S, () => G(put(box(21, 28.5, 1.4, marble), 0, 0, 0.2), put(arch(13, 21, 1.8, dark), 0, 1.2, 0.5), put(arch(5.2, 7.2, 1.0, dark), -14.2, 1.6, 0.05), put(arch(5.2, 7.2, 1.0, dark), 14.2, 1.6, 0.05), put(arch(5.2, 7.2, 1.0, dark), -14.2, 12.6, 0.05), put(arch(5.2, 7.2, 1.0, dark), 14.2, 12.6, 0.05))));
    tomb.add(around(4, Math.hypot(S - C / 2, S - C / 2) - 0.25, () => G(put(arch(5.2, 7.2, 1.0, dark), 0, 1.6, 0), put(arch(5.2, 7.2, 1.0, dark), 0, 12.6, 0)), Math.PI / 4));
    tomb.position.y = 6.5;
    const chhatri = () => G(around(8, 3.1, () => cyl(0.3, 0.3, 4.6, marble, 10)), put(cyl(4.0, 4.0, 0.5, shade, 8), 0, 4.6, 0), put(lathe([[0, 3.7], [0.4, 3.5], [2.2, 2.6], [3.4, 1.3], [3.5, 0.5], [3.1, 0]], marble, 28), 0, 5.1, 0), put(cyl(0.05, 0.14, 1.6, mat(PAL.gold, { m: 0.8, r: 0.35 }), 8), 0, 8.7, 0));
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) tomb.add(put(chhatri(), x * 14.5, 23.5, z * 14.5));
    const top = 6.5 + 23.5;
    const dome = G(put(cyl(11.2, 11.2, 7.5, marble, 56), 0, top, 0), put(cyl(11.7, 11.7, 0.6, shade, 56), 0, top + 7.5, 0),
      put(lathe([[11.2, 0], [12.9, 3.2], [13.6, 7.5], [13.0, 12], [11.0, 16.5], [7.6, 20.5], [3.6, 23.6], [1.2, 25.2], [0, 26.2]], marble, 64), 0, top + 8.1, 0),
      put(lathe([[1.6, 0], [2.3, 0.5], [0.9, 1.2], [0.35, 2.0], [0.9, 3.0], [0.3, 3.9], [0.6, 4.7], [0.12, 5.6], [0.1, 8.6], [0, 9.0]], mat(PAL.gold, { m: 0.85, r: 0.3 }), 20), 0, top + 34.0, 0));
    const minaret = () => {
      const g = G(lathe([[2.9, 0], [2.6, 36]], marble, 32));
      for (const y of [12, 24, 36]) g.add(put(cyl(3.5, 2.7, 0.8, shade, 32), 0, y - 0.8, 0), put(cyl(3.5, 3.5, 0.9, marble, 32, true), 0, y, 0));
      g.add(around(8, 1.9, () => cyl(0.22, 0.22, 3.0, marble, 8)).translateY(36), put(lathe([[0, 2.6], [0.3, 2.45], [1.5, 1.8], [2.3, 0.8], [2.35, 0.2], [2.1, 0]], marble, 24), 0, 39.0, 0), put(cyl(0.04, 0.1, 1.2, mat(PAL.gold, { m: 0.8, r: 0.35 }), 8), 0, 41.5, 0));
      return g;
    };
    const mins = G();
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) mins.add(put(minaret(), x * 43.5, 6.5, z * 43.5));
    const terrace = put(box(150, 1, 150, mat('#b0694a', { r: 0.95 })), 0, -1, 0);
    const root = G(terrace, P('plinth', plinth), P('tomb', tomb), P('dome', dome), P('minarets', mins));
    return { root, view: { az: 0.52, pol: 1.3 } };
  },

  'printing-press': (k) => {
    const { P, G, box, mat, put, cyl, lathe, torus } = k;
    const wood = mat(PAL.wood, { r: 0.75 }), woodD = mat(PAL.woodDark, { r: 0.8 }), iron = mat(PAL.iron, { m: 0.7, r: 0.5 });
    const frame = G(put(box(0.16, 1.95, 0.22, wood), -0.48, 0.08, 0), put(box(0.16, 1.95, 0.22, wood), 0.48, 0.08, 0), put(box(1.3, 0.2, 0.26, woodD), 0, 1.93, 0), put(box(0.96, 0.16, 0.24, woodD), 0, 1.4, 0),
      put(box(0.96, 0.14, 0.24, woodD), 0, 0.66, 0), put(box(1.3, 0.08, 0.9, woodD), 0, 0, 0), put(box(0.12, 0.74, 0.1, wood), -0.4, 0.08, 0.9), put(box(0.12, 0.74, 0.1, wood), 0.4, 0.08, 0.9),
      put(box(0.2, 0.06, 1.75, wood), -0.26, 0.76, 0.42), put(box(0.2, 0.06, 1.75, wood), 0.26, 0.76, 0.42), k.rod([-0.48, 2.03, 0], [-0.9, 2.5, -0.35], 0.045, wood), k.rod([0.48, 2.03, 0], [0.9, 2.5, -0.35], 0.045, wood));
    // the screw, with its thread, the bar that turns it and the platen it drives down
    const thread = [];
    for (let i = 0; i <= 60; i++) { const a = (i / 60) * TAU * 5; thread.push([Math.cos(a) * 0.075, 1.5 + (i / 60) * 0.42, Math.sin(a) * 0.075]); }
    const screw = G(put(cyl(0.062, 0.062, 0.62, woodD, 20), 0, 1.36, 0), k.tube(thread, 0.016, wood, { seg: 200, radial: 6 }), put(box(0.2, 0.16, 0.2, iron), 0, 1.22, 0), k.rod([0.02, 1.3, 0], [0.82, 1.24, 0.38], 0.022, iron), put(k.sph(0.045, woodD, 12, 10), 0.82, 1.24, 0.38),
      put(box(0.12, 0.3, 0.12, wood), 0, 0.98, 0), put(box(0.5, 0.07, 0.36, woodD), 0, 0.93, 0));
    // the bed with the forme of type, and a few loose sorts
    const type = G(put(box(0.62, 0.05, 0.46, woodD), 0, 0.79, 0), put(box(0.56, 0.03, 0.4, iron), 0, 0.84, 0));
    for (let r = 0; r < 14; r++) for (let c = 0; c < 20; c++) if (k.rnd(r * 31 + c) > 0.14) type.add(put(box(0.022, 0.014, 0.02, mat('#8d9299', { m: 0.8, r: 0.4 })), -0.25 + c * 0.0265, 0.87, -0.17 + r * 0.026));
    for (let i = 0; i < 5; i++) type.add(put(box(0.03, 0.09, 0.03, mat('#8d9299', { m: 0.8, r: 0.4 })), -0.62 + i * 0.07, 0.08, 0.62 + k.rnd(i) * 0.1, 0, k.rnd(i + 5), 0));
    // ink balls and a printed sheet on the open tympan
    const ball = () => G(lathe([[0, 0], [0.085, 0.02], [0.11, 0.07], [0.07, 0.12], [0.03, 0.15]], mat(PAL.black, { r: 0.4 }), 20), put(cyl(0.022, 0.03, 0.16, wood, 10), 0, 0.14, 0));
    const sheet = G(put(box(0.5, 0.012, 0.38, mat('#e9e1c9', { r: 0.9 })), 0, 0, 0));
    for (let r = 0; r < 11; r++) sheet.add(put(box(0.4 - (r === 10 ? 0.18 : 0), 0.004, 0.012, mat('#2b2620')), r === 10 ? -0.09 : 0, 0.012, -0.14 + r * 0.028));
    const ink = G(put(ball(), 0.72, 0.08, 0.5, 0, 0, 0.25), put(ball(), 0.6, 0.08, 0.72, 0.3, 0, -0.2), put(sheet, 0, 1.02, 1.12, -1.0, 0, 0), put(box(0.56, 0.03, 0.44, wood), 0, 1.0, 1.15, -1.0, 0, 0));
    const floor = put(box(2.6, 0.06, 2.6, mat('#6b5a45', { r: 1 })), 0, -0.06, 0.3);
    const root = G(floor, frame, P('screw', screw), P('type', type), P('ink', ink), put(k.person(1.7), -1.05, 0, 0.9));
    return { root, view: { az: 0.75, pol: 1.25 } };
  },

  'steam-engine': (k) => {
    const { P, G, box, mat, put, cyl, torus, THREE } = k;
    const iron = mat('#3b4046', { r: 0.5, m: 0.7 }), steel = mat(PAL.steel, { r: 0.35, m: 0.85 }), brass = mat(PAL.brass, { r: 0.35, m: 0.8 }), wood = mat(PAL.wood), stone = mat('#8f8a80', { r: 1 }), green = mat('#2f4a3a', { r: 0.6, m: 0.3 });
    const bed = G(put(box(8.6, 0.5, 2.6, stone), 0.4, -0.5, 0), put(box(1.5, 1.0, 1.5, stone), -2.6, 0, 0));
    const PIV = new THREE.Vector3(0, 5.0, 0), ARM = 2.6, CRANK = 0.62, AXLE = new THREE.Vector3(2.6, 1.5, 0);
    // fixed parts
    const column = G(put(cyl(0.16, 0.26, 4.9, green, 20), 0, 0, 0), put(box(0.9, 0.2, 0.9, green), 0, 0, 0), put(box(0.5, 0.24, 0.6, brass), 0, 4.86, 0));
    const cylinder = G(put(cyl(0.62, 0.62, 2.3, green, 40), -2.6, 1.0, 0), put(cyl(0.7, 0.7, 0.14, iron, 40), -2.6, 1.0, 0), put(cyl(0.7, 0.7, 0.14, iron, 40), -2.6, 3.3, 0), put(cyl(0.12, 0.12, 0.2, brass, 16), -2.6, 3.44, 0));
    const condenser = G(put(box(1.3, 1.1, 1.3, mat('#4b6a78', { r: 0.4, a: 0.55 })), -1.05, 0, 0), put(cyl(0.3, 0.3, 0.95, iron, 24), -1.05, 0.06, 0), k.tube([[-2.0, 1.15, 0], [-1.6, 1.15, 0], [-1.25, 1.1, 0], [-1.1, 0.95, 0]], 0.09, iron, { seg: 20 }), put(cyl(0.2, 0.2, 0.9, iron, 20), -0.72, 0.06, 0.32));
    const flyAxleStand = G(put(box(0.5, 1.5, 0.3, green), 2.6, 0, 0.75), put(box(0.5, 1.5, 0.3, green), 2.6, 0, -0.75));
    // moving parts
    const beam = G(put(box(ARM * 2 + 0.5, 0.42, 0.22, wood), 0, -0.21, 0), put(box(ARM * 2 + 0.5, 0.06, 0.26, iron), 0, 0.21, 0), put(cyl(0.1, 0.1, 0.5, steel, 16), 0, 0, -0.25, Math.PI / 2, 0, 0));
    for (const x of [-ARM, ARM]) beam.add(put(cyl(0.07, 0.07, 0.4, steel, 12), x, 0, -0.2, Math.PI / 2, 0, 0));
    const beamHolder = G(beam); beamHolder.position.copy(PIV);
    const mkRod = (r, m) => k.rod([0, 0, 0], [0, 1, 0], r, m);
    const pistonRod = mkRod(0.05, steel), pumpRod = mkRod(0.035, steel), conRod = mkRod(0.07, iron), link1 = mkRod(0.03, steel), link2 = mkRod(0.03, steel), link3 = mkRod(0.03, steel);
    const flywheel = G(put(torus(1.9, 0.14, iron, TAU, 72, 10), 0, 0, 0), put(cyl(0.2, 0.2, 0.5, steel, 20), 0, 0, -0.25, Math.PI / 2, 0, 0));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; flywheel.add(k.rod([0, 0, 0], [Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0], 0.06, iron)); }
    flywheel.position.copy(AXLE).setZ(0.45);
    const gearTeeth = (r, n, m) => { const g = G(put(cyl(r, r, 0.16, m, 40), 0, 0, -0.08, Math.PI / 2, 0, 0)); for (let i = 0; i < n; i++) { const a = (i / n) * TAU; g.add(put(box(0.08, 0.1, 0.16, m), Math.cos(a) * (r + 0.03), Math.sin(a) * (r + 0.03) - 0.05, 0, 0, 0, a + Math.PI / 2)); } return g; };
    const sun = gearTeeth(CRANK / 2 - 0.03, 16, brass), planet = gearTeeth(CRANK / 2 - 0.03, 16, brass);
    sun.position.copy(AXLE);
    const scratch = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const tick = (t) => {
      const th = t * 1.1; // one engine cycle
      const pc = scratch[0].set(AXLE.x + Math.cos(th) * CRANK, AXLE.y + Math.sin(th) * CRANK, 0); // centre of the planet gear
      // the beam angle that puts its right-hand end the connecting rod's length above the planet gear
      const Lc = Math.hypot(ARM - AXLE.x, PIV.y - AXLE.y);
      let phi = 0;
      for (let i = 0; i < 6; i++) { const ex = Math.cos(phi) * ARM, ey = PIV.y + Math.sin(phi) * ARM; const d = Math.hypot(ex - pc.x, ey - pc.y); phi += (Lc - d) * 0.35 * Math.sign(1); }
      beamHolder.rotation.z = phi;
      const right = scratch[1].set(Math.cos(phi) * ARM, PIV.y + Math.sin(phi) * ARM, 0);
      const left = scratch[2].set(-Math.cos(phi) * ARM, PIV.y - Math.sin(phi) * ARM, 0);
      k.aim(conRod, right, pc); conRod.scale.y = right.distanceTo(pc);
      planet.position.copy(pc); planet.rotation.z = 0; // the planet gear is fixed to the rod and does not spin
      sun.rotation.z = th * 2; flywheel.rotation.z = th * 2; // equal gears: the wheel turns twice for each cycle
      const top = new THREE.Vector3(-2.6, left.y - 0.75, 0), bot = new THREE.Vector3(-2.6, left.y - 2.75, 0);
      k.aim(pistonRod, top, bot); pistonRod.scale.y = 2.0;
      k.aim(link1, left, top); link1.scale.y = left.distanceTo(top);
      const mid = new THREE.Vector3(-Math.cos(phi) * ARM * 0.5, PIV.y - Math.sin(phi) * ARM * 0.5, 0);
      const midLow = new THREE.Vector3(mid.x - 0.05, mid.y - 0.78, 0);
      k.aim(link2, mid, midLow); link2.scale.y = mid.distanceTo(midLow);
      k.aim(link3, midLow, top); link3.scale.y = midLow.distanceTo(top);
      const pTop = new THREE.Vector3(-0.72, PIV.y - Math.sin(phi) * 0.72 - 0.2, 0.32), pBot = new THREE.Vector3(-0.72, 0.9, 0.32);
      k.aim(pumpRod, pTop, pBot); pumpRod.scale.y = pTop.distanceTo(pBot);
    };
    tick(0.6);
    const root = G(bed, flyAxleStand, P('cylinder', cylinder, pistonRod), P('condenser', condenser, pumpRod), P('gear', sun, planet, flywheel, conRod), P('beam', column, beamHolder, link1, link2, link3), put(k.person(1.7), -0.6, 0, 1.9));
    return { root, view: { az: 0.25, pol: 1.3 }, tick, animated: true };
  },
});

Object.assign(DEFS, {
  'spinning-jenny': (k) => {
    const { P, G, box, mat, put, cyl, torus, lathe } = k;
    const wood = mat(PAL.wood, { r: 0.75 }), woodD = mat(PAL.woodDark, { r: 0.8 }), thread = mat('#efe9d8', { r: 1 }), iron = mat(PAL.iron, { m: 0.6, r: 0.5 });
    const L = 1.9, W = 1.1, Hh = 0.8;
    const frame = G();
    for (const x of [-W / 2, W / 2]) for (const z of [-L / 2, L / 2]) frame.add(put(box(0.08, Hh + (z < 0 ? 0.25 : 0), 0.08, wood), x, 0, z));
    for (const x of [-W / 2, W / 2]) frame.add(put(box(0.07, 0.08, L, wood), x, Hh - 0.08, 0), put(box(0.06, 0.06, L, wood), x, 0.2, 0));
    for (const z of [-L / 2, L / 2]) frame.add(put(box(W, 0.07, 0.07, wood), 0, Hh - 0.08, z), put(box(W, 0.06, 0.06, wood), 0, 0.2, z));
    // eight spindles at the far end, each with its cop of spun yarn
    const spindles = G(put(box(W, 0.05, 0.1, woodD), 0, 0.42, -L / 2 + 0.12));
    const xs = Array.from({ length: 8 }, (_, i) => -0.42 + i * 0.12);
    for (const x of xs) spindles.add(put(cyl(0.008, 0.008, 0.62, iron, 8), x, 0.4, -L / 2 + 0.12, -0.28, 0, 0), put(lathe([[0.004, 0], [0.04, 0.03], [0.028, 0.2], [0.006, 0.28]], thread, 16), x, 0.64, -L / 2 + 0.05, -0.28, 0, 0));
    const drum = put(cyl(0.07, 0.07, W - 0.1, woodD, 20), 0, 0.3, -L / 2 + 0.42, 0, 0, Math.PI / 2); drum.position.x = (W - 0.1) / 2 - (W - 0.1) / 2; drum.position.set(-(W - 0.1) / 2 * 0 , 0.3, -L / 2 + 0.42); drum.rotation.set(0, 0, Math.PI / 2); drum.position.x = (W - 0.1) / 2;
    spindles.add(drum);
    // the clasp: two bars that grip the rovings and are drawn back along the frame
    const cz = 0.25;
    const clasp = G(put(box(W + 0.1, 0.035, 0.07, woodD), 0, Hh + 0.0, cz), put(box(W + 0.1, 0.035, 0.07, wood), 0, Hh + 0.045, cz), put(box(0.05, 0.12, 0.2, woodD), -W / 2 - 0.02, Hh - 0.04, cz), put(box(0.05, 0.12, 0.2, woodD), W / 2 + 0.02, Hh - 0.04, cz));
    // rovings on the lower creel, and the threads they become
    const creel = G(put(box(W, 0.04, 0.3, woodD), 0, 0.26, 0.55));
    for (const x of xs) {
      creel.add(put(lathe([[0.012, 0], [0.055, 0.02], [0.05, 0.16], [0.012, 0.19]], thread, 14), x, 0.3, 0.55));
      creel.add(k.rod([x, 0.47, 0.55], [x, Hh + 0.03, cz], 0.006, thread, 6), k.rod([x, Hh + 0.03, cz], [x + 0.0, 0.93, -L / 2 + 0.02], 0.003, thread, 6));
    }
    // the hand wheel and its drive band
    const wheel = G(put(torus(0.46, 0.03, wood, TAU, 48, 10), 0, 0, 0), put(cyl(0.06, 0.06, 0.2, woodD, 16), 0, 0, -0.1, Math.PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; wheel.add(k.rod([0, 0, 0], [Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0], 0.014, wood, 8)); }
    wheel.add(k.rod([0.2, 0.0, 0], [0.2, 0.0, 0.2], 0.016, iron, 8), put(cyl(0.022, 0.022, 0.12, woodD, 10), 0.2, 0, 0.2, Math.PI / 2, 0, 0));
    const wheelG = G(put(wheel, W / 2 + 0.12, 0.62, 0.35, 0, Math.PI / 2, 0), put(box(0.06, 0.62, 0.06, wood), W / 2 + 0.2, 0, 0.35), k.rod([W / 2 + 0.12, 1.07, 0.3], [W / 2 - 0.05, 0.37, -L / 2 + 0.42], 0.006, thread, 6), k.rod([W / 2 + 0.12, 0.17, 0.3], [W / 2 - 0.05, 0.23, -L / 2 + 0.42], 0.006, thread, 6));
    const floor = put(box(3.0, 0.05, 3.2, mat('#6b5a45', { r: 1 })), 0.2, -0.05, 0);
    const root = G(floor, frame, creel, P('spindles', spindles), P('clasp', clasp), P('wheel', wheelG), put(k.person(1.6), -1.0, 0, 0.9));
    return { root, view: { az: 0.95, pol: 1.15 } };
  },

  'enigma': (k) => {
    const { P, G, box, mat, put, cyl } = k;
    const wood = mat('#5a3d22', { r: 0.6 }), plate = mat('#191b1e', { r: 0.45, m: 0.4 }), key = mat('#0f1012', { r: 0.4 }), ringM = mat('#c7ccd2', { r: 0.3, m: 0.9 }), glass = mat('#e8dba8', { r: 0.3, e: '#b99a3a', ei: 0.25 });
    const W = 0.28, D = 0.34;
    const casing = G(put(box(W + 0.03, 0.11, D + 0.03, wood), 0, 0, 0), put(box(W, 0.012, D, plate), 0, 0.11, 0));
    const rows = [[9, 0.0], [8, 0.014], [9, 0.0]];
    const layout = (z0, dz, fn) => rows.forEach(([n, off], r) => { for (let i = 0; i < n; i++) fn(-0.108 + off + i * 0.027 + (n === 8 ? 0 : 0), z0 + r * dz, r * 9 + i); });
    const keyboard = G();
    layout(0.03, 0.036, (x, z) => keyboard.add(put(cyl(0.004, 0.004, 0.022, ringM, 8), x, 0.122, z), put(cyl(0.0105, 0.0105, 0.006, ringM, 20), x, 0.144, z), put(cyl(0.009, 0.009, 0.007, key, 20), x, 0.146, z)));
    const lamps = G(put(box(W - 0.03, 0.004, 0.1, mat('#101214', { r: 0.6 })), 0, 0.122, -0.045));
    layout(-0.078, 0.033, (x, z, i) => lamps.add(put(cyl(0.0098, 0.0098, 0.003, i === 12 ? mat('#fff0a8', { e: '#ffd23f', ei: 1.2 }) : glass, 20), x, 0.126, z)));
    // three rotors showing through their slots, with the letter windows beside them
    const rotors = G(put(box(0.17, 0.006, 0.07, mat('#2a2d31', { r: 0.4, m: 0.6 })), 0.01, 0.122, -0.132));
    for (let i = 0; i < 3; i++) {
      const x = -0.03 + i * 0.045;
      const wheel = put(cyl(0.034, 0.034, 0.011, mat('#8a8f96', { r: 0.35, m: 0.85 }), 40), x + 0.012, 0.106, -0.132, 0, 0, Math.PI / 2);
      rotors.add(wheel, put(box(0.012, 0.004, 0.014, mat('#f2ead0', { r: 0.4 })), x - 0.006, 0.127, -0.132));
      for (let t = 0; t < 26; t++) { const a = (t / 26) * TAU; if (Math.sin(a) > 0.3) rotors.add(put(box(0.011, 0.003, 0.004, plate), x + 0.012, 0.106 + Math.sin(a) * 0.0345, -0.132 + Math.cos(a) * 0.0345, -a, 0, 0)); }
    }
    // the plugboard on the front: sockets and a few leads
    const plug = G(put(box(W - 0.02, 0.085, 0.006, plate), 0, 0.012, D / 2 + 0.017));
    layout(0, 0, () => {});
    rows.forEach(([n, off], r) => { for (let i = 0; i < n; i++) for (const dy of [0, 0.012]) plug.add(put(cyl(0.0035, 0.0035, 0.004, ringM, 10), -0.108 + off + i * 0.027, 0.075 - r * 0.027 - dy, D / 2 + 0.021, Math.PI / 2, 0, 0)); });
    const lead = (i0, r0, i1, r1) => { const p = (i, r) => [-0.108 + rows[r][1] + i * 0.027, 0.069 - r * 0.027, D / 2 + 0.022]; const a = p(i0, r0), b = p(i1, r1); return k.tube([a, [a[0], a[1] - 0.012, a[2] + 0.03], [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 0.045, a[2] + 0.045], [b[0], b[1] - 0.012, b[2] + 0.03], b], 0.0028, mat('#22262b', { r: 0.6 }), { seg: 24, radial: 6 }); };
    plug.add(lead(0, 0, 4, 1), lead(2, 0, 7, 2), lead(5, 0, 6, 1), lead(1, 2, 3, 1), lead(8, 0, 5, 2));
    const table = put(box(0.9, 0.02, 0.8, mat('#3b3027', { r: 0.9 })), 0, -0.02, 0);
    const root = G(table, casing, P('keyboard', keyboard), P('lampboard', lamps), P('rotors', rotors), P('settings', plug));
    return { root, view: { az: 0.5, pol: 0.95, zoom: 0.72 } };
  },

  'saturn-v': (k) => {
    const { P, G, mat, put, lathe, cyl, box, around } = k;
    const white = mat('#eceae4', { r: 0.55 }), black = mat('#1b1d20', { r: 0.6 }), steel = mat('#9aa1a9', { r: 0.35, m: 0.8 });
    const R = 5.03, y1 = 42.1, y2 = y1 + 24.9, y3 = y2 + 17.8 + 5.8, top = 110.6; // stage lengths are approximate
    const bell = (r, h) => lathe([[r * 0.32, h], [r * 0.5, h * 0.72], [r * 0.82, h * 0.3], [r, 0]], steel, 24);
    const engines = G(put(bell(1.85, 5.6), 0, -5.2, 0), around(4, 3.35, () => put(bell(1.85, 5.6), 0, -5.2, 0), Math.PI / 4));
    const fins = around(4, R + 0.2, () => G(put(lathe([[2.2, 0], [1.9, 5.2], [0.6, 7.6], [0, 7.9]], white, 16, ), 0, -0.6, -1.2), put(k.ext([[0, 0], [3.6, 0], [1.0, 5.6], [0, 5.6]], 0.3, black), 0, -0.4, 0.3, 0, -Math.PI / 2, 0)), Math.PI / 4);
    const band = (y, h, m = black) => put(cyl(R + 0.03, R + 0.03, h, m, 64, true), 0, y, 0);
    const first = G(put(cyl(R, R, y1, white, 64), 0, 0, 0), band(0.2, 3.2), band(18.5, 6.5), band(y1 - 1.6, 1.6), engines, fins);
    const second = G(put(cyl(R, R, y2 - y1, white, 64), 0, y1, 0), band(y1 + 0.1, 5.2, mat('#d7d5cf', { r: 0.6 })), band(y2 - 1.4, 1.4));
    const third = G(put(lathe([[R, 0], [3.3, 5.8]], white, 64), 0, y2, 0), put(cyl(3.3, 3.3, 17.8, white, 56), 0, y2 + 5.8, 0), put(cyl(3.33, 3.33, 0.9, black, 56, true), 0, y3 - 0.9, 0));
    const apollo = G(put(lathe([[3.3, 0], [1.95, 8.5]], white, 56), 0, y3, 0), put(cyl(1.95, 1.95, 7.5, steel, 48), 0, y3 + 8.5, 0), put(lathe([[1.95, 0], [0.5, 3.4], [0.25, 3.6]], mat('#c9ccd1', { r: 0.3, m: 0.7 }), 40), 0, y3 + 16, 0),
      put(cyl(0.33, 0.33, top - (y3 + 22.2), white, 16), 0, y3 + 22.2, 0), put(lathe([[0.33, 0], [0.33, 1.2], [0, 2.0]], white, 16), 0, top - 2.0, 0));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; apollo.add(k.rod([Math.cos(a) * 0.5, y3 + 19.4, Math.sin(a) * 0.5], [Math.cos(a) * 0.3, y3 + 22.3, Math.sin(a) * 0.3], 0.05, steel, 6)); }
    const pad = put(cyl(16, 17, 1.2, mat('#6f7479', { r: 1 }), 48), 0, -7.6, 0);
    const root = G(pad, P('first', first), P('second', second), P('third', third), P('apollo', apollo), put(k.person(1.8), 9, -6.4, 4));
    return { root, view: { az: 0.5, pol: 1.42 }, ground: -7.6 };
  },

  'sputnik': (k) => {
    const { P, G, mat, put, sph, torus, cyl } = k;
    const metal = (c) => mat(c, { r: 0.18, m: 1.0 });
    const R = 0.29; // 58 cm across, from the source
    const front = sph(R, metal('#d9dde2'), 48, 24, 0, TAU, 0, Math.PI / 2);
    const rear = sph(R, metal('#c5cad0'), 48, 24, 0, TAU, Math.PI / 2, Math.PI / 2);
    const seam = put(torus(R + 0.002, 0.006, metal('#aeb4bb'), TAU, 64, 8), 0, 0, 0, Math.PI / 2, 0, 0);
    const ant = G();
    [2.4, 2.9, 2.4, 2.9].forEach((len, i) => {
      const a = (i / 4) * TAU + Math.PI / 4;
      const from = [Math.cos(a) * R * 0.72, R * 0.62, Math.sin(a) * R * 0.72];
      const to = [Math.cos(a) * (R * 0.72 + len * 0.57), R * 0.62 - len * 0.82, Math.sin(a) * (R * 0.72 + len * 0.57)];
      ant.add(k.rod(from, to, 0.006, metal('#cfd4da'), 8), put(cyl(0.02, 0.014, 0.05, metal('#9aa1a9'), 12), from[0], from[1] - 0.01, from[2]));
    });
    const craft = G(P('sphere', front, seam), P('power', rear), P('antennas', ant));
    put(craft, 0, 2.6, 0, 0.5, 0.3, 0.9);
    return { root: G(craft), view: { az: 0.8, pol: 1.25, zoom: 0.5 }, ground: false, space: true };
  },

  'aryabhata': (k) => {
    const { P, G, mat, put, mesh, THREE, cyl } = k;
    // a rhombicuboctahedron has exactly 26 faces: 18 squares and 8 triangles
    const s = 1 + Math.SQRT2, V = [];
    for (const p of [[1, 1, s], [1, s, 1], [s, 1, 1]]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) V.push(new THREE.Vector3(p[0] * sx, p[1] * sy, p[2] * sz));
    // find the faces: for each axis direction that is a face normal, take the vertices on that plane
    const dirs = [];
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c of [-1, 0, 1]) if (a || b || c) dirs.push(new THREE.Vector3(a, b, c).normalize());
    const scale = 0.7 / s; // 1.4 m across
    const body = G(), cells = G();
    const frameM = mat('#c9ccd1', { r: 0.35, m: 0.85 }), cellM = mat('#17357a', { r: 0.25, m: 0.5 }), capM = mat('#d9ae45', { r: 0.4, m: 0.7 });
    for (const d of dirs) {
      let max = -Infinity;
      for (const v of V) max = Math.max(max, v.dot(d));
      const on = V.filter((v) => Math.abs(v.dot(d) - max) < 1e-6);
      if (on.length < 3) continue;
      const centre = on.reduce((acc, v) => acc.add(v), new THREE.Vector3()).multiplyScalar(1 / on.length);
      const u = on[0].clone().sub(centre).normalize(), w = d.clone().cross(u);
      on.sort((p, q) => Math.atan2(p.clone().sub(centre).dot(w), p.clone().sub(centre).dot(u)) - Math.atan2(q.clone().sub(centre).dot(w), q.clone().sub(centre).dot(u)));
      const poly = (shrink, lift, m) => {
        const pts = on.map((v) => centre.clone().add(v.clone().sub(centre).multiplyScalar(shrink)).add(d.clone().multiplyScalar(lift)).multiplyScalar(scale));
        const arr = [];
        for (let i = 1; i < pts.length - 1; i++) arr.push(pts[0].x, pts[0].y, pts[0].z, pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
        g.computeVertexNormals();
        return mesh(g, m);
      };
      const capFace = Math.abs(d.y) > 0.99;
      body.add(poly(1, 0, capFace ? capM : frameM));
      if (!capFace) cells.add(poly(0.86, 0.012, cellM)); // every face but the top and bottom carries solar cells
    }
    const top = 0.7;
    const gear = G(put(cyl(0.07, 0.09, 0.12, frameM, 16), 0.12, top, 0.05), put(cyl(0.04, 0.04, 0.2, frameM, 12), -0.14, top, -0.08), put(cyl(0.11, 0.11, 0.05, mat('#22262b'), 20), -0.02, top, 0.16));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.6; gear.add(k.rod([Math.cos(a) * 0.2, top, Math.sin(a) * 0.2], [Math.cos(a) * 0.62, top + 0.62, Math.sin(a) * 0.62], 0.008, frameM, 6)); }
    const craft = G(P('body', body), P('cells', cells), P('mission', gear));
    put(craft, 0, 2.2, 0, 0.25, 0.4, 0.12);
    return { root: G(craft), view: { az: 0.6, pol: 1.2 }, ground: false, space: true };
  },

  'chandrayaan-3': (k) => {
    const { P, G, box, mat, put, cyl, sph, lathe, torus } = k;
    const foil = mat(PAL.foil, { r: 0.42, m: 0.75 }), panel = mat('#1b3a78', { r: 0.25, m: 0.5 }), dark = mat('#2a2d31', { r: 0.5, m: 0.5 }), steel = mat(PAL.steel, { r: 0.35, m: 0.8 });
    const body = G(put(box(2.0, 1.15, 2.0, foil), 0, 0.85, 0), put(box(2.06, 0.06, 2.06, dark), 0, 2.0, 0));
    for (const [x, z, ry] of [[0, -1.02, 0], [1.02, 0, Math.PI / 2], [-1.02, 0, Math.PI / 2]]) body.add(put(box(1.7, 0.95, 0.04, panel), x, 0.95, z, 0, ry, 0));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const hipT = [sx * 0.95, 1.5, sz * 0.95], hipB = [sx * 0.95, 0.95, sz * 0.95], foot = [sx * 1.75, 0.08, sz * 1.75];
      body.add(k.rod(hipT, foot, 0.035, steel, 8), k.rod(hipB, foot, 0.028, steel, 8), put(cyl(0.2, 0.24, 0.07, foil, 20), foot[0], 0, foot[2]));
      body.add(put(lathe([[0.07, 0.22], [0.1, 0.1], [0.15, 0]], dark, 16), sx * 0.5, 0.62, sz * 0.5));
    }
    body.add(put(cyl(0.06, 0.06, 0.5, steel, 10), 0.6, 2.06, 0.6), put(lathe([[0, 0.02], [0.2, 0.06], [0.32, 0.16]], steel, 24), 0.6, 2.5, 0.6, 0.5, 0, 0), put(box(0.3, 0.25, 0.3, dark), -0.5, 2.06, -0.4));
    const ramp = G(put(box(0.85, 0.03, 1.9, steel), 0, 0, 0)); ramp.children[0].geometry.translate(0, 0, 0.95);
    body.add(put(ramp, 0, 0.86, 1.02, 0.44, 0, 0));
    // the rover: six wheels on rockers, a box body and one upright solar panel
    const rover = G(put(box(0.75, 0.3, 0.9, foil), 0, 0.32, 0), put(box(0.04, 0.62, 0.86, panel), -0.4, 0.5, 0, 0, 0, 0.12), put(cyl(0.012, 0.012, 0.5, steel, 8), 0.3, 0.62, 0.38), put(box(0.12, 0.08, 0.08, dark), 0.3, 1.12, 0.38));
    for (const sx of [-1, 1]) { rover.add(k.rod([sx * 0.45, 0.3, -0.42], [sx * 0.45, 0.3, 0.42], 0.02, steel, 8)); for (const z of [-0.42, 0, 0.42]) rover.add(put(cyl(0.14, 0.14, 0.1, dark, 24), sx * 0.5, 0.14, z, 0, 0, Math.PI / 2).translateY(0)); }
    put(rover, 0.2, 0, 4.2, 0, 0.35, 0);
    // the ground: regolith with a few shallow craters and the rover's tracks
    const reg = mat(PAL.moon, { r: 1 });
    const site = G(put(cyl(6.4, 6.7, 0.4, reg, 72), 0, -0.4, 0));
    for (let i = 0; i < 9; i++) { const a = k.rnd(i) * TAU, r = 3.0 + k.rnd(i + 9) * 2.6, s = 0.3 + k.rnd(i + 18) * 0.5; site.add(put(torus(s, s * 0.16, reg, TAU, 28, 6), Math.cos(a) * r, 0, Math.sin(a) * r, Math.PI / 2, 0, 0), put(k.ring(0, s * 0.92, mat('#75777b', { r: 1 }), 24), Math.cos(a) * r, 0.012, Math.sin(a) * r)); }
    for (const sx of [-0.3, 0.7]) site.add(put(box(0.1, 0.012, 1.7, mat('#7b7d81', { r: 1 })), sx + 0.05, 0.004, 3.05, 0, 0.2, 0));
    const root = G(P('site', site), P('lander', body), P('rover', rover), put(k.person(1.7), -3.2, 0, 1.5));
    return { root, view: { az: 0.75, pol: 1.2, zoom: 0.8 }, space: true };
  },

  'mysorean-rocket': (k) => {
    const { P, G, mat, put, cyl, torus, box, lathe } = k;
    const iron = mat('#3f4347', { r: 0.6, m: 0.7 }), bamboo = mat(PAL.bamboo, { r: 0.7 }), hide = mat('#6b4a2c', { r: 0.9 }), wood = mat(PAL.woodDark);
    // an iron tube 20 cm long and about 5 cm across, lashed to a bamboo shaft about a metre long: from the source
    const tube = G(put(cyl(0.027, 0.027, 0.2, iron, 24), 0, 0, 0), put(lathe([[0, 0.03], [0.014, 0.024], [0.027, 0]], iron, 24), 0, 0.2, 0), put(cyl(0.029, 0.029, 0.012, mat('#2b2e31', { m: 0.7, r: 0.5 }), 24), 0, 0.03, 0), put(cyl(0.029, 0.029, 0.012, mat('#2b2e31', { m: 0.7, r: 0.5 }), 24), 0, 0.15, 0));
    const shaft = G(put(cyl(0.011, 0.013, 1.0, bamboo, 12), 0, 0, 0));
    for (let i = 1; i < 6; i++) shaft.add(put(torus(0.0125, 0.0022, mat('#9a7d3a'), TAU, 16, 6), 0, i * 0.17, 0, Math.PI / 2, 0, 0));
    const lash = G();
    for (const y of [0.06, 0.1, 0.17]) lash.add(put(torus(0.033, 0.004, hide, TAU, 24, 6), 0.013, y, 0, Math.PI / 2, 0, 0));
    const rocket = G(P('case', put(tube, 0.04, 0.78, 0), put(lash, 0.027, 0.78, 0)), P('shaft', shaft));
    const rest = G(put(box(0.05, 0.62, 0.05, wood), 0, 0, 0), put(box(0.3, 0.03, 0.3, wood), 0, 0, 0), put(box(0.12, 0.03, 0.05, wood), 0, 0.62, 0));
    const root = G(put(box(2.4, 0.03, 1.6, mat('#7b6a50', { r: 1 })), 0.4, -0.03, 0), put(rest, 0.02, 0, 0), put(rocket, -0.42, 0.06, 0, 0, 0, -0.75), put(k.person(1.7), 1.15, 0, -0.3));
    return { root, view: { az: 0.35, pol: 1.3 } };
  },
});
