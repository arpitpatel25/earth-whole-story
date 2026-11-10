// The base sphere: molten Earth, the first oceans, sketch continents before the plate model,
// the open ocean under the moving plates, and the real Earth with ice sheets and sea level.
// One shader blends between them by weights from epoch.js, so scrubbing never pops.
import * as THREE from 'three';
import { NOISE, SPHERE, LIGHT, PALEO_LAND, LENS } from './glsl.js';
import { deepLens, crisisAt } from './lens.js';
import { state } from '../core/store.js';

const vertexShader = /* glsl */ `
varying vec3 vPos;
varying vec3 vWorld;
void main(){
  vPos = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
varying vec3 vPos;
varying vec3 vWorld;
uniform float uClock;
uniform float uMolten, uCrust, uWater, uBombard;
uniform float uPreLand, uPreDrift, uPlates, uModern;
uniform float uO2;
uniform float uSea, uGlacial, uSahara, uLights;
uniform float uIceMix;
uniform sampler2D uDay, uElev, uNight, uIceA, uIceB;
uniform vec3 uIceAChan, uIceBChan;
uniform float uHasDay, uHasElev, uHasNight, uHasIce;
uniform float uTile;            // 1 when drawing a high-resolution tile patch
uniform sampler2D uTileTex;
uniform vec4 uTileRect;         // lon0, lat0, lonSpan, latSpan in uv units
uniform float uFade;
${NOISE}
${SPHERE}
${LIGHT}
${PALEO_LAND}
${LENS}

vec3 oceanColor(vec3 n, float depthHint){
  float d = fbm3(n * 3.1 + 2.0);
  vec3 early = mix(vec3(0.030,0.135,0.115), vec3(0.075,0.235,0.180), d);   // iron-rich, oxygen-poor seas
  vec3 late  = mix(vec3(0.012,0.060,0.150), vec3(0.030,0.125,0.270), d);
  vec3 c = mix(early, late, uO2);
  return mix(c, c * 1.9 + vec3(0.0,0.05,0.06), depthHint);
}

// A magma ocean: dark rafts of chilled rock drifting on glowing melt. As crust forms the glow
// retreats into a network of cracks.
vec4 lava(vec3 n){
  vec3 p = n * 2.3;
  vec3 warp = vec3(fbm3(p + uClock*0.006), fbm3(p + 5.2 - uClock*0.005), fbm3(p + 9.1));
  vec3 q = p + warp * 0.85;
  float cells = fbm(q * 1.9 + uClock * 0.004);
  float cr = ridged(q * 1.35);
  // share of the surface that is still open melt: most of it at first, only cracks later
  float melt = mix(0.62, 0.0, smoothstep(0.0, 0.85, uCrust));
  float open = smoothstep(0.5 - melt * 0.5, 0.56 - melt * 0.5, cells);
  float cracks = smoothstep(0.80 - 0.10 * (1.0 - uCrust), 0.97, cr) * (1.0 - 0.75 * smoothstep(0.75, 1.0, uCrust));
  float glow = clamp(max(open, cracks), 0.0, 1.0);
  float heat = clamp(cells * 1.25 + cr * 0.35 - 0.25, 0.0, 1.0);
  vec3 hot = mix(vec3(0.52,0.035,0.0), vec3(0.95,0.26,0.02), smoothstep(0.15, 0.55, heat));
  hot = mix(hot, vec3(1.0,0.62,0.14), smoothstep(0.55, 0.85, heat));
  hot = mix(hot, vec3(1.0,0.90,0.60), smoothstep(0.88, 1.0, heat) * 0.8);
  float grain = fbm3(n * 11.0);
  vec3 crust = mix(vec3(0.030,0.022,0.020), vec3(0.105,0.075,0.060), grain);
  crust += vec3(0.35,0.06,0.0) * smoothstep(0.35, 0.5, cells) * (1.0 - open) * 0.5 * (1.0 - uCrust); // heat bleeding through thin rafts
  return vec4(mix(crust, hot, glow), glow);                   // a = emissive share
}

// Impact flashes during the bombardment: deterministic in the ambient clock.
float impacts(vec3 n){
  float s = 0.0;
  for(int k=0;k<5;k++){
    float period = 3.7 + float(k) * 1.31;
    float t = uClock / period + float(k) * 0.37;
    float id = floor(t);
    float ph = fract(t);
    vec3 c = normalize(hash33(vec3(id, float(k)*7.0, 3.0)) * 2.0 - 1.0);
    float d = acos(clamp(dot(n, c), -1.0, 1.0));
    float flash = exp(-ph * 9.0) * exp(-d * d * 900.0) * 3.0;
    float ring = exp(-pow((d - ph * 0.22) * 55.0, 2.0)) * (1.0 - ph) * 0.9;
    s += flash + ring;
  }
  return s;
}

float decodeElev(vec3 t){
  float coarse = (t.r - 0.5) * 2.0;
  coarse = sign(coarse) * coarse * coarse * 9000.0;
  float fine = t.g * 255.0 - 160.0;
  return (t.g > 0.012 && t.g < 0.988) ? fine : coarse;
}

void main(){
  vec3 n = normalize(vPos);
  float sunlight = daylight(n);
  vec3 col;
  float emissive = 0.0;
  vec3 glowCol = vec3(0.0);
  float landMask = 0.0;   // for the deep-time lenses

  // ---------- sketch world: oceans and generated continents (before 1 Gya) ----------
  // Each part is skipped outright when its weight is zero. In recorded history (uModern = 1 with imagery loaded)
  // none of this procedural noise is evaluated, which is most of the cost of a full-screen frame.
  if(uModern < 0.999 || uHasDay < 0.5){
    float land = 0.0;
    float shelf = 0.0;
    vec3 landCol = vec3(0.0);
    if(uPreLand > 0.001){
      float h = fbm(n * 1.55 + vec3(uPreDrift*0.55, uPreDrift*0.21, -uPreDrift*0.37));
      h += 0.42 * (fbm3(n * 4.3 + 11.0 + uPreDrift * 0.3) - 0.5);
      float th = mix(0.70, 0.54, sqrt(clamp(uPreLand / 0.28, 0.0, 1.0)));
      land = smoothstep(th, th + 0.012, h);
      shelf = smoothstep(th - 0.07, th, h);
      landCol = paleoLand(n, n);
    }
    vec3 sea = oceanColor(n, shelf * 0.35);
    // polar sea ice in cool intervals of deep time
    float seaIce = seaIceAmount(n, fbm3(n * 14.0) - 0.5) * (1.0 - uModern);
    sea = mix(sea, vec3(0.80,0.87,0.92), seaIce * 0.9);
    col = mix(sea, landCol, land);
    landMask = land;
    if(uWater < 0.999){
      // early crust: basalt under a thin ocean
      float bn = fbm(n * 5.0 + 3.0);
      vec3 basalt = mix(vec3(0.085,0.070,0.066), vec3(0.230,0.190,0.170), bn);
      basalt *= 0.75 + 0.5 * fbm3(n * 23.0);
      // old impact scars and a few vents still glowing through the young crust
      float scars = smoothstep(0.62, 0.70, vnoise(n * 9.0 + 4.0)) * 0.35;
      basalt *= 1.0 - scars;
      float vents = smoothstep(0.86, 0.97, ridged(n * 3.1 + 7.0)) * (1.0 - uWater);
      basalt += vec3(0.85,0.22,0.03) * vents * 0.8;
      col = mix(basalt, col, uWater);
    }
  } else {
    col = vec3(0.0);
  }

  // ---------- molten world ----------
  if(uMolten > 0.001){
    vec4 lv = lava(n);
    col = mix(col, lv.rgb, uMolten);
    emissive = lv.a * uMolten;
    glowCol = lv.rgb;
  }
  if(uBombard > 0.001){
    float f = impacts(n) * uBombard;
    glowCol = mix(glowCol, vec3(1.0,0.85,0.6), clamp(f, 0.0, 1.0));
    col += vec3(1.0,0.8,0.5) * f;
    emissive = max(emissive, clamp(f, 0.0, 1.0));
  }

  // ---------- the real Earth: satellite image, sea level, ice ----------
  float nightAdd = 0.0;
  if(uModern > 0.001 && uHasDay > 0.5){
    vec3 day;
    if(uTile > 0.5){
      vec2 uv = sphereUV(n);
      day = texture2D(uTileTex, (uv - uTileRect.xy) / uTileRect.zw).rgb;
    } else {
      day = sampleEquirect(uDay, n).rgb;
    }
    vec3 m = day;
    float water = 0.0;
    if(uHasElev > 0.5){
      vec3 et = sampleEquirect(uElev, n).rgb;
      float e = decodeElev(et);
      float lat = n.y;
      float n1 = fbm3(n * 40.0);
      // sea level
      float under = 1.0 - smoothstep(uSea - 2.5, uSea + 2.5, e);        // 1 where below the sea of that time
      float wasSea = 1.0 - smoothstep(-2.5, 2.5, e);                    // 1 where sea today
      float exposed = (1.0 - under) * wasSea;                           // sea today, land then
      float flooded = under * (1.0 - wasSea);                           // land today, sea then
      vec3 lowTropic = mix(vec3(0.16,0.30,0.12), vec3(0.27,0.36,0.16), n1);
      vec3 lowCold = mix(vec3(0.40,0.40,0.28), vec3(0.52,0.49,0.36), n1);
      vec3 shelfLand = mix(lowTropic, lowCold, smoothstep(0.35, 0.75, abs(lat)));
      m = mix(m, shelfLand * (0.8 + 0.4 * et.b), exposed);
      m = mix(m, vec3(0.05,0.20,0.33), flooded);
      water = under;
      // cooler, drier glacial world: steppe and tundra spread, forests thin
      float isLand = 1.0 - under;
      float cool = uGlacial * smoothstep(0.42, 0.78, abs(lat)) * isLand;
      m = mix(m, mix(vec3(0.47,0.45,0.33), vec3(0.58,0.56,0.46), n1), cool * 0.55);
      float lum = dot(m, vec3(0.3,0.6,0.1));
      float forest = isLand * smoothstep(0.30, 0.12, lum) * (1.0 - smoothstep(0.3, 0.5, abs(lat)));
      m = mix(m, vec3(0.33,0.37,0.17), forest * uGlacial * 0.35);
      // Green Sahara: grassland and lakes where desert is today
      if(uSahara > 0.001){
        float lon = atan(-n.z, n.x);
        float latd = asin(clamp(n.y,-1.0,1.0)) * 57.2958;
        float lond = lon * 57.2958;
        float box = smoothstep(11.0, 16.0, latd) * (1.0 - smoothstep(29.0, 34.0, latd))
                  * smoothstep(-19.0, -14.0, lond) * (1.0 - smoothstep(52.0, 60.0, lond));
        float desert = smoothstep(0.42, 0.62, day.r) * smoothstep(0.02, 0.10, day.r - day.b);
        vec3 savanna = mix(vec3(0.30,0.40,0.16), vec3(0.47,0.50,0.24), fbm3(n * 30.0));
        m = mix(m, savanna, uSahara * box * desert * isLand * 0.88);
      }
      // land ice from reconstructions (signed-distance rasters, 0.5 at the margin)
      if(uHasIce > 0.5){
        float sd = mix(dot(sampleEquirect(uIceA, n).rgb, uIceAChan), dot(sampleEquirect(uIceB, n).rgb, uIceBChan), uIceMix);
        float ice = smoothstep(0.492, 0.512, sd + (n1 - 0.5) * 0.012);
        vec3 iceCol = mix(vec3(0.80,0.87,0.93), vec3(0.97,0.98,1.0), 0.35 + 0.65 * et.b);
        float interior = smoothstep(0.50, 0.62, sd);
        iceCol = mix(iceCol, vec3(0.96,0.975,0.99), interior * 0.7);
        m = mix(m, iceCol, ice);
        water *= 1.0 - ice;
      }
      // winter sea ice pushed toward the equator in glacial times
      float si = water * smoothstep(0.80 - 0.16 * uGlacial, 0.90 - 0.12 * uGlacial, abs(lat) + (n1 - 0.5) * 0.05);
      m = mix(m, vec3(0.83,0.89,0.93), si * 0.75 * step(0.02, uGlacial));
    }
    col = mix(col, m, uModern);
    landMask = mix(landMask, 1.0 - water, uModern);
    if(uHasNight > 0.5 && uLights > 0.001){
      vec3 nt = sampleEquirect(uNight, n).rgb;
      nightAdd = dot(nt, vec3(0.35,0.5,0.15));
      nightAdd = smoothstep(0.06, 0.9, nightAdd) * uLights * uModern;
    }
  }

  // ---------- deep-time lenses (not on a molten world: there is nothing yet to tell apart) ----------
  if(uLensAmt > 0.001) col = mix(applyLens(col, landMask, n.y, -1.0), col, uMolten);

  // ---------- light ----------
  float amb = 0.10;
  vec3 lit = col * (amb + (1.0 - amb) * sunlight);
  lit = mix(lit, glowCol * (0.75 + 0.5 * sunlight), clamp(emissive, 0.0, 1.0));
  lit += vec3(1.0, 0.78, 0.45) * nightAdd * (1.0 - sunlight) * 1.6;
  lit = applyLimb(lit, n, vWorld);
  gl_FragColor = vec4(lit, uFade);
}
`;

export function makeEarthUniforms() {
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  return {
    uClock: { value: 0 },
    uSunDir: { value: new THREE.Vector3(1, 0.3, 0.5).normalize() },
    uCamPos: { value: new THREE.Vector3(0, 0, 4) },
    uAtmo: { value: new THREE.Vector3(0.36, 0.6, 1) },
    uAtmoAmt: { value: 0.9 },
    uMolten: { value: 0 },
    uCrust: { value: 1 },
    uWater: { value: 1 },
    uBombard: { value: 0 },
    uPreLand: { value: 0 },
    uPreDrift: { value: 0 },
    uPlates: { value: 0 },
    uModern: { value: 1 },
    uO2: { value: 1 },
    uVeg: { value: 0 },
    uZonal: { value: blank },
    uZonalX: { value: 0 },
    uHasZonal: { value: 0 },
    uSnowball: { value: 0 },
    uRust: { value: 1 },
    uSea: { value: 0 },
    uGlacial: { value: 0 },
    uSahara: { value: 0 },
    uLights: { value: 1 },
    uIceMix: { value: 0 },
    uDay: { value: blank },
    uElev: { value: blank },
    uNight: { value: blank },
    uIceA: { value: blank },
    uIceB: { value: blank },
    uIceAChan: { value: new THREE.Vector3(1, 0, 0) },
    uIceBChan: { value: new THREE.Vector3(1, 0, 0) },
    uHasDay: { value: 0 },
    uHasElev: { value: 0 },
    uHasNight: { value: 0 },
    uHasIce: { value: 0 },
    uTile: { value: 0 },
    uTileTex: { value: blank },
    uTileRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uFade: { value: 1 },
    uLens: { value: 0 },
    uLensAmt: { value: 0 },
    uCrisis: { value: 0 },
  };
}

export function makeEarthMaterial(uniforms, octaves) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    defines: { FBM_OCTAVES: octaves },
    transparent: false,
  });
}

/** Copy the environment into the shared uniforms (used by the base sphere and by tile patches). */
export function applyEnvironment(u, env) {
  u.uMolten.value = env.molten;
  u.uCrust.value = env.crust;
  u.uWater.value = env.water;
  u.uBombard.value = env.bombard;
  u.uPreLand.value = env.preLand;
  u.uPreDrift.value = env.preDrift;
  u.uPlates.value = env.plates;
  u.uModern.value = env.modern;
  u.uO2.value = env.o2;
  u.uVeg.value = env.veg;
  u.uZonalX.value = env.zonalX;
  u.uSnowball.value = env.snowball;
  u.uRust.value = env.rust;
  u.uSea.value = env.sea;
  u.uGlacial.value = env.glacial;
  u.uSahara.value = env.sahara;
  u.uLights.value = env.lights;
  u.uIceMix.value = env.iceMix;
}

export class Earth {
  constructor(engine) {
    this.engine = engine;
    this.uniforms = makeEarthUniforms();
    const seg = engine.quality === 'low' ? 96 : 192;
    this.geometry = new THREE.SphereGeometry(1, seg, seg / 2);
    this.material = makeEarthMaterial(this.uniforms, engine.octaves);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 0;
    this.mesh.frustumCulled = false;
    engine.scene.add(this.mesh);
    this.requested = {};
    this.iceTextures = [];
  }

  /** Load a texture once; resolves when it is on the GPU-ready side. Tracked for capture readiness. */
  loadTexture(key, url, { onLoad } = {}) {
    if (this.requested[key]) return this.requested[key];
    const p = new Promise((resolve) => {
      new THREE.TextureLoader().load(
        url,
        (tex) => {
          // The renderer works in display space (see engine.js), so textures are used as stored.
          tex.colorSpace = THREE.NoColorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.anisotropy = this.engine.anisotropy;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.generateMipmaps = true;
          onLoad(tex);
          this.engine.invalidate();
          resolve(tex);
        },
        undefined,
        () => {
          this.engine.reportError(`texture failed: ${url}`);
          this.requested[key] = null;
          resolve(null);
        },
      );
    });
    this.requested[key] = p;
    return this.engine.track(p);
  }

  update(env) {
    const u = this.uniforms;
    const e = this.engine;
    applyEnvironment(u, env);
    const lens = deepLens();
    u.uLens.value = lens;
    u.uLensAmt.value = lens ? 1 : 0;
    u.uCrisis.value = lens === 4 ? crisisAt(env.ma) : 0;
    this.mesh.visible = env.earth > 0.001;
    if (!this.mesh.visible) return;
    if (env.ma > 2 && env.ma < 1100) {
      this.loadTexture('zonal', 'data/earth/zonal_temp.png', {
        onLoad: (t) => {
          t.generateMipmaps = false;
          t.minFilter = t.magFilter = THREE.LinearFilter;
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
          u.uZonal.value = t;
          u.uHasZonal.value = 1;
        },
      });
    }
    const size = e.quality === 'low' ? '2k' : '4k';
    if (env.modern > 0 || env.ma < 40) {
      this.loadTexture('day', `tex/earth_${size}.jpg`, {
        onLoad: (t) => {
          u.uDay.value = t;
          u.uHasDay.value = 1;
        },
      });
    }
    if (e.quality === 'high' && env.modern > 0.5 && state.altKm < 9000 && u.uHasDay.value > 0.5) {
      // sharper whole-globe image for the middle distances, before the tiles take over
      this.loadTexture('day8k', 'tex/earth_8k.jpg', { onLoad: (t) => (u.uDay.value = t) });
    }
    if (env.modern > 0 || env.ma < 70) {
      this.loadTexture('elev', `tex/elev_${size}.jpg`, {
        onLoad: (t) => {
          u.uElev.value = t;
          u.uHasElev.value = 1;
        },
      });
    }
    if (env.lights > 0 && env.modern > 0) {
      this.loadTexture('night', `tex/night_${size}.jpg`, {
        onLoad: (t) => {
          u.uNight.value = t;
          u.uHasNight.value = 1;
        },
      });
    }
    if (env.modern > 0 && e.iceIndex) {
      const a = this.iceSlice(env.iceA);
      const b = this.iceSlice(env.iceB);
      if (a && b) {
        u.uIceA.value = a.tex;
        u.uIceAChan.value.set(a.channel === 0 ? 1 : 0, a.channel === 1 ? 1 : 0, a.channel === 2 ? 1 : 0);
        u.uIceB.value = b.tex;
        u.uIceBChan.value.set(b.channel === 0 ? 1 : 0, b.channel === 1 ? 1 : 0, b.channel === 2 ? 1 : 0);
        u.uHasIce.value = 1;
      }
    }
  }

  /** Texture and channel for an ice slice. The first request loads every image so scrubbing never waits. */
  iceSlice(index) {
    const ice = this.engine.iceIndex;
    const slice = ice.slices[index];
    if (!slice) return null;
    if (!this.iceImages) {
      const suffix = this.engine.quality === 'low' ? '1k' : '2k';
      this.iceImages = ice.images.map((name, i) => {
        const rec = { tex: null };
        this.loadTexture(`ice${i}`, `data/earth/ice/${name}_${suffix}.png`, {
          onLoad: (t) => {
            t.generateMipmaps = false;
            t.minFilter = t.magFilter = THREE.LinearFilter;
            rec.tex = t;
          },
        });
        return rec;
      });
    }
    const img = this.iceImages[slice.image];
    return img && img.tex ? { tex: img.tex, channel: slice.channel } : null;
  }
}
