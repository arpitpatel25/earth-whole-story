// Moving continents, 1 billion years ago to today.
// Polygons from Merdith et al. 2021 are meshed at present-day coordinates. Each vertex knows its
// plate; the vertex shader looks up that plate's finite rotation for the current time and turns the
// vertex to where it was. At 0 Ma every rotation is the identity, so the motion ends in today's map.
import * as THREE from 'three';
import { NOISE, SPHERE, QUAT, LIGHT, PALEO_LAND, LENS } from './glsl.js';
import { deepLens } from './lens.js';

const vertexShader = /* glsl */ `
precision highp float;
precision highp sampler2D;
attribute float aPlate;
attribute float aBegin;
attribute float aEnd;
uniform sampler2D uRot;      // [plate, time step] -> quaternion
uniform float uStepF;        // fractional time step index
uniform float uMa;
varying vec3 vNow;
varying vec3 vThen;
varying float vAlive;
varying float vPlate;
${QUAT}
void main(){
  int s0 = int(floor(uStepF));
  float f = uStepF - float(s0);
  int p = int(aPlate + 0.5);
  vec4 q0 = texelFetch(uRot, ivec2(p, s0), 0);
  vec4 q1 = texelFetch(uRot, ivec2(p, s0 + 1), 0);
  vec4 q = normalize(mix(q0, q1, f));
  vec3 pos = quatRotate(q, position);
  vNow = position;
  vThen = pos;
  vPlate = aPlate;
  float born = 1.0 - smoothstep(aBegin - 0.6, aBegin + 0.2, uMa);
  float gone = aEnd < 0.5 ? 1.0 : smoothstep(aEnd - 0.2, aEnd + 0.6, uMa);
  vAlive = born * gone;
  gl_Position = vAlive < 0.004 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
varying vec3 vNow;
varying vec3 vThen;
varying float vAlive;
varying float vPlate;
uniform float uLayer;        // 0 continental crust, 1 coastline
uniform float uLandness;     // continents count as dry land before coastlines are known
uniform float uAlpha;
uniform float uMa;
uniform float uO2;
uniform sampler2D uDay, uElev;
uniform float uHasDay, uHasElev;
${NOISE}
${SPHERE}
${LIGHT}
${PALEO_LAND}
${LENS}
void main(){
  vec3 nNow = normalize(vNow);
  vec3 nThen = normalize(vThen);
  vec3 land = paleoLand(nNow, nThen);
  // Relief and, close to the present, the real surface, carried along with the plate.
  if(uHasElev > 0.5 && uMa < 66.0){
    float hill = sampleEquirect(uElev, nNow).b;
    land *= mix(1.0, 0.72 + 0.56 * hill, 1.0 - smoothstep(8.0, 66.0, uMa));
  }
  if(uHasDay > 0.5 && uMa < 22.0){
    vec3 day = sampleEquirect(uDay, nNow).rgb;
    land = mix(land, day, (1.0 - smoothstep(2.6, 22.0, uMa)) * 0.85);
  }
  vec3 col = land;
  float alpha = vAlive * uAlpha;
  if(uLayer < 0.5){
    // Flooded continental crust reads as a pale shelf sea once coastlines are available.
    float d = fbm3(nNow * 9.0);
    vec3 shelfEarly = mix(vec3(0.07,0.22,0.19), vec3(0.11,0.30,0.25), d);
    vec3 shelfLate = mix(vec3(0.05,0.19,0.33), vec3(0.09,0.29,0.43), d);
    vec3 shelf = mix(shelfEarly, shelfLate, uO2);
    shelf = mix(shelf, vec3(0.80,0.87,0.92), seaIceAmount(nThen, d - 0.5) * 0.9);
    col = mix(shelf, land, uLandness);
    alpha *= mix(0.82, 1.0, uLandness);
  }
  if(uLensAmt > 0.001){
    float landness = uLayer < 0.5 ? uLandness : 1.0;
    // under the geology lens flooded continental crust still belongs to its plate
    col = applyLens(col, uLens < 1.5 ? mix(0.6, 1.0, landness) : landness, nThen.y, floor(vPlate + 0.5));
  }
  float sunlight = daylight(nThen);
  vec3 lit = col * (0.10 + 0.90 * sunlight);
  lit = applyLimb(lit, nThen, nThen);
  gl_FragColor = vec4(lit, alpha);
}
`;

export class Plates {
  constructor(engine, earth) {
    this.engine = engine;
    this.earth = earth;
    this.group = new THREE.Group();
    this.group.visible = false;
    engine.scene.add(this.group);
    this.ready = false;
    this.loading = null;
    this.meta = null;
    this.quats = null; // Int16Array [step][plate][4]
    this.grid = null;
    this.materials = [];
  }

  load() {
    if (this.loading) return this.loading;
    const get = (url, type) =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return type === 'json' ? r.json() : r.arrayBuffer();
      });
    this.loading = this.engine.track(
      Promise.all([get('data/plates/meta.json', 'json'), get('data/plates/rotations.bin'), get('data/plates/mesh.bin'), get('data/plates/plategrid.bin')])
        .then(([meta, rot, mesh, grid]) => this.build(meta, rot, mesh, grid))
        .catch((e) => {
          this.engine.reportError(`plates failed to load: ${e.message}`);
          this.loading = null;
        }),
    );
    return this.loading;
  }

  build(meta, rotBuf, meshBuf, gridBuf) {
    this.meta = meta;
    const nPlates = meta.plateIds.length;
    const q16 = new Int16Array(rotBuf);
    this.quats = q16;
    this.nPlates = nPlates;
    const f32 = new Float32Array(q16.length);
    for (let i = 0; i < q16.length; i++) f32[i] = q16[i] / 32767;
    const tex = new THREE.DataTexture(f32, nPlates, meta.steps, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.rotTex = tex;

    const cells = meta.grid.nx * meta.grid.ny;
    this.grid = new Uint16Array(gridBuf, 0, cells);
    this.gridAge = new Uint16Array(gridBuf, cells * 2, cells);

    const headLen = new DataView(meshBuf).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(meshBuf, 4, headLen)));
    const base = 4 + headLen;
    const eu = this.earth.uniforms;
    for (const [name, L] of Object.entries(header.layers)) {
      const geo = new THREE.BufferGeometry();
      const pos = new Int16Array(meshBuf, base + L.position, L.vertices * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3, true));
      geo.setAttribute('aPlate', new THREE.BufferAttribute(new Uint16Array(meshBuf, base + L.plate, L.vertices), 1));
      geo.setAttribute('aBegin', new THREE.BufferAttribute(new Uint16Array(meshBuf, base + L.begin, L.vertices), 1));
      geo.setAttribute('aEnd', new THREE.BufferAttribute(new Uint16Array(meshBuf, base + L.end, L.vertices), 1));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(meshBuf, base + L.index, L.triangles * 3), 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01);
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        defines: { FBM_OCTAVES: this.engine.octaves },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.FrontSide,
        uniforms: {
          uRot: { value: tex },
          uStepF: { value: 0 },
          uMa: { value: 0 },
          uLayer: { value: name === 'coast' ? 1 : 0 },
          uLandness: { value: 1 },
          uAlpha: { value: 1 },
          // shared with the base sphere so light, air and climate always agree
          uSunDir: eu.uSunDir,
          uCamPos: eu.uCamPos,
          uAtmo: eu.uAtmo,
          uAtmoAmt: eu.uAtmoAmt,
          uVeg: eu.uVeg,
          uZonal: eu.uZonal,
          uZonalX: eu.uZonalX,
          uHasZonal: eu.uHasZonal,
          uSnowball: eu.uSnowball,
          uRust: eu.uRust,
          uO2: eu.uO2,
          uDay: eu.uDay,
          uElev: eu.uElev,
          uHasDay: eu.uHasDay,
          uHasElev: eu.uHasElev,
          uLens: eu.uLens,
          uLensAmt: eu.uLensAmt,
          uCrisis: eu.uCrisis,
        },
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = name === 'coast' ? 2 : 1;
      this.group.add(mesh);
      this.materials.push(material);
    }
    this.ready = true;
    this.engine.invalidate();
  }

  update(env) {
    const show = env.plates > 0.001 && env.modern < 0.999;
    if (show || (env.ma < 1400 && env.ma > 0.5)) this.load();
    this.group.visible = show && this.ready;
    if (!this.group.visible) return;
    const ma = Math.min(this.meta.maxMa, Math.max(0, env.ma));
    const stepF = Math.min(this.meta.steps - 1.0001, ma / this.meta.stepMyr);
    // Coastlines exist in the model back to about 400 Ma; before that the continental crust is the land.
    const coastAlpha = 1 - smoothStep(380, 410, ma);
    for (const m of this.materials) {
      m.uniforms.uStepF.value = stepF;
      m.uniforms.uMa.value = ma;
      const alpha = env.plates * (1 - env.modern);
      if (m.uniforms.uLayer.value > 0.5) m.uniforms.uAlpha.value = alpha * coastAlpha;
      else {
        m.uniforms.uAlpha.value = alpha;
        m.uniforms.uLandness.value = 1 - coastAlpha;
      }
    }
  }

  /** Finite rotation of a plate (by index) at `ma`, as [x, y, z, w]. */
  quatAt(plate, ma, out = [0, 0, 0, 1]) {
    const { stepMyr, steps } = this.meta;
    const sf = Math.min(steps - 1.0001, Math.max(0, ma / stepMyr));
    const s0 = Math.floor(sf);
    const f = sf - s0;
    const a = (s0 * this.nPlates + plate) * 4;
    const b = ((s0 + 1) * this.nPlates + plate) * 4;
    const q = this.quats;
    let x = q[a] + (q[b] - q[a]) * f;
    let y = q[a + 1] + (q[b + 1] - q[a + 1]) * f;
    let z = q[a + 2] + (q[b + 2] - q[a + 2]) * f;
    let w = q[a + 3] + (q[b + 3] - q[a + 3]) * f;
    const l = Math.hypot(x, y, z, w) || 1;
    out[0] = x / l;
    out[1] = y / l;
    out[2] = z / l;
    out[3] = w / l;
    return out;
  }

  /** Plate index under a present-day lon/lat, or -1. */
  plateAtPresent(lon, lat) {
    if (!this.ready) return -1;
    const { deg, nx, ny } = this.meta.grid;
    const i = Math.min(nx - 1, Math.max(0, Math.floor((lon + 180) / deg)));
    const j = Math.min(ny - 1, Math.max(0, Math.floor((90 - lat) / deg)));
    const v = this.grid[j * nx + i];
    return v === 0xffff ? -1 : v;
  }

  /** Where a present-day point was at `ma`: returns { lon, lat, plate } or null if it did not exist yet. */
  reconstruct(lon, lat, ma) {
    const plate = this.plateAtPresent(lon, lat);
    if (plate < 0) return null;
    const { deg, nx } = this.meta.grid;
    const i = Math.floor((lon + 180) / deg);
    const j = Math.floor((90 - lat) / deg);
    if (this.gridAge[j * nx + i] < ma) return null;
    const q = this.quatAt(plate, ma);
    const v = rotate(q, toVec(lon, lat));
    return { ...toLonLat(v), plate };
  }

  /**
   * Like reconstruct, but when the exact spot is younger than `ma` (an accreted terrane, a young margin) it uses
   * the nearest crust within about `reach` degrees that did exist, so a fossil site on a continent's edge still
   * lands on that continent. Returns { lon, lat, plate, approx } or null.
   */
  reconstructNear(lon, lat, ma, reach = 8) {
    const direct = this.reconstruct(lon, lat, ma);
    if (direct || !this.ready) return direct;
    const { deg } = this.meta.grid;
    for (let r = deg; r <= reach; r += deg) {
      let best = null;
      for (let a = 0; a < 360; a += 30) {
        const la = lat + r * Math.sin((a * Math.PI) / 180);
        const lo = lon + (r * Math.cos((a * Math.PI) / 180)) / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
        if (Math.abs(la) > 89) continue;
        const got = this.reconstruct(((lo + 540) % 360) - 180, la, ma);
        if (got) {
          best = got;
          break;
        }
      }
      if (best) return { ...best, approx: true };
    }
    return null;
  }

  /**
   * The inverse question: which present-day place sat at (lon, lat) at `ma`?
   * Tries every plate: un-rotate the point and check that the plate grid agrees.
   */
  presentPlaceOf(lon, lat, ma) {
    if (!this.ready) return null;
    const v = toVec(lon, lat);
    const { deg, nx, ny } = this.meta.grid;
    const q = [0, 0, 0, 1];
    for (let p = 0; p < this.nPlates; p++) {
      this.quatAt(p, ma, q);
      const u = rotate([-q[0], -q[1], -q[2], q[3]], v);
      const ll = toLonLat(u);
      const i = Math.min(nx - 1, Math.max(0, Math.floor((ll.lon + 180) / deg)));
      const j = Math.min(ny - 1, Math.max(0, Math.floor((90 - ll.lat) / deg)));
      const k = j * nx + i;
      if (this.grid[k] === p && this.gridAge[k] >= ma) return { lon: ll.lon, lat: ll.lat, plate: p, plateId: this.meta.plateIds[p] };
    }
    return null;
  }
}

function smoothStep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const D2R = Math.PI / 180;
export function toVec(lon, lat) {
  const cl = Math.cos(lat * D2R);
  return [cl * Math.cos(lon * D2R), Math.sin(lat * D2R), -cl * Math.sin(lon * D2R)];
}
export function toLonLat(v) {
  return { lon: Math.atan2(-v[2], v[0]) / D2R, lat: Math.asin(Math.max(-1, Math.min(1, v[1]))) / D2R };
}
export function rotate(q, v) {
  const [x, y, z, w] = q;
  const cx = y * v[2] - z * v[1] + w * v[0];
  const cy = z * v[0] - x * v[2] + w * v[1];
  const cz = x * v[1] - y * v[0] + w * v[2];
  return [v[0] + 2 * (y * cz - z * cy), v[1] + 2 * (z * cx - x * cz), v[2] + 2 * (x * cy - y * cx)];
}
