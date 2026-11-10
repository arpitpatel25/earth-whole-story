// Everything before Earth: the Big Bang, the glowing fog, the dark ages, first stars, galaxies,
// the Milky Way and the solar nebula. One full-screen shader, staged by the age of the universe.
// These are illustrations of each epoch, not observations; the interface labels them so.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { deepLens } from './lens.js';

const vertexShader = /* glsl */ `
varying vec2 vNdc;
void main(){
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vNdc;
uniform float uLogAge;     // log10 of the universe's age in years
uniform float uClock;
uniform float uAspect, uTanHalf;
uniform vec3 uRight, uUp, uFwd, uEye;
uniform float uBang, uFog, uWeb, uStars, uGalaxies, uMilky, uNebula, uSunLit, uPlanets, uOpacity, uBackdrop;
${NOISE}

mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// A layer of point stars living in cells on the direction sphere.
vec3 starLayer(vec3 rd, float scale, float density, float seed, float ignite){
  vec3 p = rd * scale;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  vec3 h = hash33(id + seed);
  if(h.x > density) return vec3(0.0);
  vec3 off = (hash33(id + seed + 17.0) - 0.5) * 0.7;
  float d = length(f - off);
  float born = smoothstep(h.y * 0.9, h.y * 0.9 + 0.08, ignite);
  float flare = 1.0 + 3.0 * exp(-max(0.0, ignite - h.y * 0.9) * 22.0);
  float tw = 0.82 + 0.18 * sin(uClock * (0.6 + h.z * 1.7) + h.x * 40.0);
  float core = exp(-d * d * 900.0) + 0.16 * exp(-d * d * 60.0);
  vec3 tint = mix(vec3(0.62,0.74,1.0), vec3(1.0,0.86,0.70), smoothstep(0.35, 1.0, h.z));
  return tint * core * born * flare * tw * (0.5 + 1.6 * h.z * h.z);
}

// Small fuzzy galaxies scattered across the sky.
vec3 galaxyLayer(vec3 rd, float scale, float seed, float grown){
  vec3 p = rd * scale;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  vec3 h = hash33(id + seed);
  if(h.x > 0.42) return vec3(0.0);
  vec3 off = (hash33(id + seed + 5.0) - 0.5) * 0.5;
  vec3 q = f - off;
  // flatten along a random axis so each one reads as a tilted disc
  vec3 ax = normalize(hash33(id + seed + 9.0) - 0.5);
  float along = dot(q, ax);
  vec3 inPlane = q - ax * along;
  float r = length(inPlane) * (2.4 + 3.0 * h.y);
  float z = abs(along) * (9.0 + 12.0 * h.z);
  float born = smoothstep(h.z * 0.8, h.z * 0.8 + 0.25, grown);
  float ang = atan(inPlane.y, inPlane.x + 1e-5);
  float arms = 0.65 + 0.35 * sin(ang * 2.0 + r * 16.0 + h.x * 30.0);
  float disc = exp(-r * r * 26.0) * exp(-z * z * 3.0) * arms;
  float bulge = exp(-(r * r + z * z * 0.2) * 190.0);
  vec3 tint = mix(vec3(0.55,0.68,1.0), vec3(1.0,0.82,0.62), h.y);
  return (tint * disc * 0.8 + vec3(1.0,0.92,0.8) * bulge * 1.2) * born;
}

void main(){
  vec2 sp = vec2(vNdc.x * uAspect, vNdc.y);          // screen space, centred, height = 2
  vec3 rd = normalize(uFwd + uRight * (sp.x * uTanHalf) + uUp * (sp.y * uTanHalf));
  float la = uLogAge;
  vec3 col = vec3(0.0);

  // ---------------- the first light ----------------
  if(uBang > 0.001){
    float r = length(sp);
    float grow = smoothstep(-9.0, -1.5, la);
    float R = 0.012 + 3.4 * grow * grow;                       // radius of the expanding fireball
    float inside = 1.0 - smoothstep(R * 0.72, R * 1.02, r);
    vec3 p = rd * (2.0 + 3.0 * grow) + vec3(0.0, 0.0, uClock * 0.02);
    float turb = fbm(p * 2.2 + fbm3(p * 1.3 + uClock * 0.015) * 1.6);
    float cool = smoothstep(-2.0, 5.6, la);                    // white-hot -> orange -> deep red
    vec3 hot = mix(vec3(1.0,0.98,0.95), vec3(1.0,0.80,0.42), smoothstep(0.0, 0.45, cool));
    hot = mix(hot, vec3(1.0,0.42,0.13), smoothstep(0.45, 0.85, cool));
    hot = mix(hot, vec3(0.62,0.12,0.04), smoothstep(0.85, 1.0, cool));
    float body = inside * (0.62 + 0.75 * turb) * mix(1.25, 0.75, cool);
    // the seed: a single point with a soft halo and fine rays, before the expansion
    float seed = (1.0 - grow) * (exp(-r * r * 9000.0) * 2.4 + exp(-r * r * 260.0) * 0.55 + 0.012 / (r + 0.012));
    float ang = atan(sp.y, sp.x);
    float rays = (1.0 - grow) * pow(abs(sin(ang * 6.0 + 0.4)), 40.0) * exp(-r * 5.0) * 0.5;
    float pulse = 0.94 + 0.06 * sin(uClock * 1.7);
    float shell = exp(-pow((r - R) / (0.05 + R * 0.10), 2.0)) * (1.0 - smoothstep(0.75, 1.0, grow)) * step(0.02, grow);
    col += (hot * body + vec3(1.0,0.97,0.92) * (seed * pulse + rays) + vec3(0.85,0.90,1.0) * shell * 0.9) * uBang;
  }

  // ---------------- the fog clears: afterglow of the first atoms ----------------
  if(uFog > 0.001){
    float m = fbm(rd * 5.0 + 3.0);
    float fine = fbm3(rd * 19.0 + 11.0);
    float t = m * 0.65 + fine * 0.35;
    vec3 glow = mix(vec3(0.42,0.07,0.02), vec3(0.95,0.36,0.10), smoothstep(0.30, 0.72, t));
    col += glow * uFog * (0.55 + 0.6 * t);
  }

  // ---------------- dark ages and the cosmic web ----------------
  if(uWeb > 0.001){
    vec3 p = rd * 3.2;
    vec3 warp = vec3(fbm3(p + 1.7), fbm3(p + 8.3), fbm3(p + 4.1)) - 0.5;
    float fil = ridged(p * 1.15 + warp * 1.5);
    fil = smoothstep(0.52, 0.95, fil);
    float knots = smoothstep(0.62, 0.9, fbm(p * 2.1 + warp));
    vec3 gas = mix(vec3(0.035,0.045,0.11), vec3(0.16,0.13,0.32), knots);
    col += gas * fil * uWeb * 1.25 + vec3(0.30,0.24,0.55) * fil * knots * uWeb * 0.35;
  }

  // ---------------- first stars ----------------
  if(uStars > 0.001){
    vec3 s = starLayer(rd, 26.0, 0.30, 1.0, uStars)
           + starLayer(rd, 52.0, 0.34, 7.0, uStars * 0.92)
           + starLayer(rd, 96.0, 0.30, 13.0, uStars * 0.84) * 0.7;
    col += s * 1.5;
  }

  // ---------------- galaxies ----------------
  if(uGalaxies > 0.001){
    col += galaxyLayer(rd, 4.6, 3.0, uGalaxies) * 1.25 + galaxyLayer(rd, 9.0, 21.0, uGalaxies * 0.9) * 0.6;
  }

  // ---------------- inside the Milky Way ----------------
  if(uMilky > 0.001){
    vec3 gn = normalize(vec3(0.32, 0.86, 0.40));                // galactic pole (illustrative orientation)
    vec3 gc = normalize(cross(gn, vec3(0.0, 0.0, 1.0)));         // towards the galactic centre
    float b = dot(rd, gn);
    float l = dot(rd, gc);
    float dust = fbm(rd * 7.0 + 2.0);
    float lanes = smoothstep(0.42, 0.66, fbm(rd * vec3(11.0, 26.0, 11.0) + 6.0));
    float band = exp(-b * b * (30.0 + 20.0 * dust)) * (0.5 + 0.75 * dust);
    float bulge = exp(-(b * b * 22.0 + (1.0 - l) * (1.0 - l) * 3.2));
    vec3 mw = mix(vec3(0.42,0.48,0.72), vec3(1.0,0.86,0.66), bulge) * (band * 0.85 + bulge * 0.85);
    mw *= 1.0 - 0.72 * lanes * exp(-b * b * 120.0);
    // supernovae seeding heavy elements: brief flashes along the band
    float sn = 0.0;
    for(int k=0;k<3;k++){
      float t = uClock / (5.3 + float(k) * 2.9) + float(k) * 0.41;
      float id = floor(t), ph = fract(t);
      vec3 c = normalize(hash33(vec3(id, float(k), 5.0)) * 2.0 - 1.0);
      c = normalize(c - gn * dot(c, gn) * 0.93);
      float d = acos(clamp(dot(rd, c), -1.0, 1.0));
      sn += exp(-d * d * 5200.0) * exp(-ph * 5.0) * 5.0 + exp(-pow((d - ph * 0.045) * 240.0, 2.0)) * (1.0 - ph) * 0.4;
    }
    col += (mw + vec3(0.85,0.92,1.0) * sn) * uMilky;
  }

  // ---------------- the solar nebula ----------------
  if(uNebula > 0.001){
    // Disc in the plane y = 0 around the origin; uEye orbits it with the user's camera.
    vec3 ro = uEye;
    vec3 acc = vec3(0.0);
    float tPlane = -ro.y / (rd.y + sign(rd.y) * 1e-5);
    if(tPlane > 0.0){
      vec3 hit = ro + rd * tPlane;
      float r = length(hit.xz);
      float ang = atan(hit.z, hit.x);
      float spin = uClock * 0.05 / (0.25 + r * r * 0.7);            // inner disc turns faster
      float sw = fbm(vec3(cos(ang + spin) * r * 2.4, sin(ang + spin) * r * 2.4, r * 1.4) * 2.0);
      float arms = 0.5 + 0.5 * sin(ang * 2.0 + spin * 2.0 - log(r + 0.05) * 5.0);
      // gaps open where planets sweep their orbits
      float gaps = 1.0;
      float rings[6]; rings[0]=0.42; rings[1]=0.62; rings[2]=0.86; rings[3]=1.22; rings[4]=1.78; rings[5]=2.35;
      for(int i=0;i<6;i++){ gaps *= 1.0 - uPlanets * 0.88 * exp(-pow((r - rings[i]) / (0.035 + 0.02 * float(i)), 2.0)); }
      float dens = exp(-r * 0.95) * smoothstep(0.10, 0.22, r) * (1.0 - smoothstep(2.6, 3.4, r));
      dens *= (0.45 + 0.75 * sw) * mix(0.65 + 0.5 * arms, 1.0, uPlanets) * gaps;
      vec3 dustCol = mix(vec3(1.0,0.78,0.42), vec3(0.55,0.25,0.12), smoothstep(0.15, 1.6, r));
      dustCol = mix(dustCol, vec3(0.22,0.14,0.16), smoothstep(1.4, 3.0, r));
      acc += dustCol * dens * (1.15 + 1.4 * uSunLit);
      // young planets riding in their gaps
      for(int i=0;i<6;i++){
        float pa = uClock * 0.11 / pow(rings[i], 1.5) + float(i) * 1.9;
        vec2 pp = vec2(cos(pa), sin(pa)) * rings[i];
        float d = length(hit.xz - pp);
        acc += vec3(1.0,0.85,0.66) * exp(-d * d * 2600.0) * uPlanets * 2.2;
      }
    }
    // the protostar, then the Sun
    float cd = length(cross(rd, ro));                                  // closest approach of the ray to the centre
    float toward = step(0.0, -dot(rd, normalize(ro)));
    float sunCore = exp(-cd * cd * mix(420.0, 180.0, uSunLit)) * toward;
    float halo = (0.012 + 0.03 * uSunLit) / (cd * cd + 0.012) * toward;
    vec3 sunCol = mix(vec3(1.0,0.45,0.16), vec3(1.0,0.93,0.78), uSunLit);
    acc += sunCol * (sunCore * (1.2 + 2.6 * uSunLit) + halo * (0.35 + 0.65 * uSunLit));
    // surrounding gas cloud
    float cloud = fbm(rd * 2.4 + 4.0) * fbm3(rd * 6.0 + 1.0);
    acc += vec3(0.20,0.10,0.14) * cloud * (1.0 - uSunLit * 0.6) * 0.9;
    col += acc * uNebula;
  }

  // ---------------- a quiet backdrop of stars for every later scene ----------------
  if(uBackdrop > 0.001){
    vec3 s = starLayer(rd, 48.0, 0.22, 31.0, 2.0) + starLayer(rd, 110.0, 0.20, 37.0, 2.0) * 0.6;
    vec3 gn = normalize(vec3(0.32, 0.86, 0.40));
    float b = dot(rd, gn);
    float band = exp(-b * b * 34.0) * (0.35 + 0.65 * fbm3(rd * 6.0 + 2.0));
    col += (s * 0.9 + vec3(0.34,0.38,0.55) * band * 0.16) * uBackdrop;
  }

  // gentle filmic shoulder so the hot scenes do not clip harshly
  col = 1.0 - exp(-col * 1.15);
  gl_FragColor = vec4(col * uOpacity, 1.0);
}
`;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Cosmos {
  constructor(engine) {
    this.engine = engine;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.uniforms = {
      uLogAge: { value: -9 },
      uClock: { value: 0 },
      uAspect: { value: 1 },
      uTanHalf: { value: 0.3 },
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uFwd: { value: new THREE.Vector3(0, 0, -1) },
      uEye: { value: new THREE.Vector3(0, 1, 3) },
      uBang: { value: 0 },
      uFog: { value: 0 },
      uWeb: { value: 0 },
      uStars: { value: 0 },
      uGalaxies: { value: 0 },
      uMilky: { value: 0 },
      uNebula: { value: 0 },
      uSunLit: { value: 0 },
      uPlanets: { value: 0 },
      uOpacity: { value: 1 },
      uBackdrop: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      defines: { FBM_OCTAVES: engine.octaves },
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    engine.scene.add(this.mesh);
  }

  update(env, camera) {
    const u = this.uniforms;
    const la = Math.log10(Math.max(1e-9, env.age));
    u.uLogAge.value = la;
    u.uClock.value = this.engine.clock;
    u.uAspect.value = camera.aspect;
    u.uTanHalf.value = Math.tan((camera.fov * Math.PI) / 360);
    camera.matrixWorld.extractBasis(u.uRight.value, u.uUp.value, u.uFwd.value);
    u.uFwd.value.negate();
    // The nebula camera keeps the user's viewing direction but sits at a fixed, comfortable distance.
    u.uEye.value.copy(camera.position).normalize().multiplyScalar(3.4);
    if (Math.abs(u.uEye.value.y) < 0.75) u.uEye.value.y = u.uEye.value.y < 0 ? -0.75 : 0.75;

    const neb = smooth(9.957, 9.9625, la); // about 4.75 to 4.62 billion years ago
    u.uBang.value = 1 - smooth(5.45, 5.75, la);
    u.uFog.value = smooth(5.45, 5.7, la) * (1 - smooth(5.9, 6.9, la));
    u.uWeb.value = smooth(6.2, 7.6, la) * (1 - smooth(9.3, 9.8, la)) * (1 - neb);
    u.uStars.value = la < 7.9 ? 0 : smooth(7.95, 9.0, la) * 1.2;
    u.uGalaxies.value = la < 8.3 ? 0 : smooth(8.35, 9.2, la) * 1.2 * (1 - smooth(9.5, 9.9, la) * 0.75);
    u.uMilky.value = smooth(9.15, 9.6, la) * (1 - neb * 0.8);
    u.uNebula.value = neb * env.cosmos;
    u.uSunLit.value = smooth(-4.63e9, -4.59e9, env.age - 13.8e9);
    u.uPlanets.value = smooth(-4.6e9, -4.55e9, env.age - 13.8e9);
    // Fade stars while the nebula owns the view, and let a calm backdrop take over once Earth exists.
    if (neb > 0) u.uStars.value *= 1 - neb * 0.55;
    u.uBackdrop.value = env.earth * (deepLens() === 6 ? 3.4 : 1); // the cosmos lens turns the sky up
    const dim = env.cosmos;
    u.uBang.value *= dim;
    u.uFog.value *= dim;
    u.uWeb.value *= dim;
    u.uStars.value *= dim;
    u.uGalaxies.value *= dim;
    u.uMilky.value *= dim;
  }
}
