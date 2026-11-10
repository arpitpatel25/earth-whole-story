// The air: a glow beyond the limb, and a procedural cloud deck that drifts with the ambient clock.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { state } from '../core/store.js';
import { deepLens, CLOUD_UNDER_LENS } from './lens.js';

const glowVertex = /* glsl */ `
varying vec3 vWorld;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// For each pixel of a shell around the planet, find how close the view ray passes to the surface
// and let brightness fall off with that height. Lit by the same sun as the ground.
const glowFragment = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform vec3 uCamPos, uSunDir, uAtmo;
uniform float uAtmoAmt;
void main(){
  vec3 rd = normalize(vWorld - uCamPos);
  float tca = dot(-uCamPos, rd);
  vec3 closest = uCamPos + rd * tca;
  float d = length(closest);
  if(d < 0.999) discard;
  float hgt = d - 1.0;
  float thin = exp(-hgt * 95.0);
  float wide = exp(-hgt * 16.0);
  float sun = smoothstep(-0.45, 0.6, dot(normalize(closest), uSunDir));
  vec3 col = uAtmo * (thin * 1.05 + wide * 0.16) * (0.12 + 0.88 * sun);
  gl_FragColor = vec4(col * uAtmoAmt, 1.0);
}
`;

const cloudVertex = /* glsl */ `
varying vec3 vPos;
void main(){
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const cloudFragment = /* glsl */ `
precision highp float;
varying vec3 vPos;
uniform float uClock, uAmount, uSnowball;
uniform vec3 uSunDir, uCamPos, uTint;
${NOISE}
void main(){
  vec3 n = normalize(vPos);
  float lat = n.y;
  // drift east, a little faster near the equator
  float a = uClock * 0.004 * (1.0 - 0.5 * lat * lat);
  mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec3 p = vec3(r * n.xz, n.y).xzy;
  // two scales of swirl give frontal bands and broken cumulus instead of soft blobs
  vec3 w1 = vec3(fbm3(p * 1.7 + 1.3), fbm3(p * 1.7 + 6.1), fbm3(p * 1.7 + 9.7)) - 0.5;
  vec3 q = p * 3.0 + w1 * 2.6;
  vec3 w2 = vec3(fbm3(q * 2.3 + 2.1), fbm3(q * 2.3 + 7.7), fbm3(q * 2.3 + 4.4)) - 0.5;
  float c = fbm(q * 1.6 + w2 * 0.9 + vec3(0.0, uClock * 0.0006, 0.0));
  float fine = fbm(q * 6.5 + w2 * 2.4);
  // more cloud along the equator and the mid-latitude storm tracks, less over the subtropics
  float belts = 0.10 * cos(lat * 9.4) + 0.07 * exp(-pow(lat * 6.0, 2.0)) - 0.10 * exp(-pow((abs(lat) - 0.40) * 6.5, 2.0));
  float d = c * 0.72 + fine * 0.28 + belts;
  float cover = smoothstep(0.53, 0.66, d);
  cover *= 0.55 + 0.45 * smoothstep(0.35, 0.65, fine);
  float sun = smoothstep(-0.2, 0.5, dot(n, uSunDir));
  vec3 v = normalize(uCamPos - vPos);
  float edge = smoothstep(0.0, 0.25, dot(n, v));
  // thicker cloud is brighter; thin cloud takes a little of the sky colour
  vec3 col = uTint * (0.14 + 0.86 * sun) * mix(0.80, 1.0, smoothstep(0.5, 0.75, d));
  gl_FragColor = vec4(col, clamp(cover, 0.0, 1.0) * uAmount * edge * (1.0 - 0.6 * uSnowball));
}
`;

export class Atmosphere {
  constructor(engine, earthUniforms) {
    this.engine = engine;
    const eu = earthUniforms;
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.16, 96, 48),
      new THREE.ShaderMaterial({
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        uniforms: { uCamPos: eu.uCamPos, uSunDir: eu.uSunDir, uAtmo: eu.uAtmo, uAtmoAmt: eu.uAtmoAmt },
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.glow.renderOrder = 30;
    this.glow.frustumCulled = false;
    engine.scene.add(this.glow);

    this.cloudUniforms = {
      uClock: { value: 0 },
      uAmount: { value: 0 },
      uSnowball: eu.uSnowball,
      uSunDir: eu.uSunDir,
      uCamPos: eu.uCamPos,
      uTint: { value: new THREE.Vector3(1, 1, 1) },
    };
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.006, 128, 64),
      new THREE.ShaderMaterial({
        vertexShader: cloudVertex,
        fragmentShader: cloudFragment,
        uniforms: this.cloudUniforms,
        defines: { FBM_OCTAVES: Math.max(3, engine.octaves - 1) },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.FrontSide,
      }),
    );
    this.clouds.renderOrder = 20;
    this.clouds.frustumCulled = false;
    engine.scene.add(this.clouds);
  }

  update(env, altKm, cloudScale) {
    this.glow.visible = env.earth > 0.001;
    // Clouds need water; they thin out as the user descends so they never hide the ground story.
    const byAlt = Math.min(1, Math.max(0, (altKm - 2500) / 9000));
    // a deep-time lens draws a map on the planet, so the clouds thin out over it
    const amount = env.earth * env.water * (0.26 + 0.2 * byAlt) * byAlt * cloudScale * (state.story ? 0.6 : 1) * CLOUD_UNDER_LENS[deepLens()];
    this.clouds.visible = amount > 0.004;
    this.cloudUniforms.uAmount.value = amount;
    this.cloudUniforms.uClock.value = this.engine.clock;
    // Hazy orange sky before oxygen, white afterwards.
    const t = env.o2;
    this.cloudUniforms.uTint.value.set(1.0, 0.86 + 0.14 * t, 0.72 + 0.28 * t);
  }
}
