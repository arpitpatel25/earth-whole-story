// Shared GLSL. Site axis convention: x = cos(lat)cos(lon), y = sin(lat), z = -cos(lat)sin(lon).

export const NOISE = /* glsl */ `
vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Value noise with quintic interpolation: cheap, stable across GPUs.
float vnoise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  float a = hash13(i), b = hash13(i+vec3(1,0,0)), c = hash13(i+vec3(0,1,0)), d = hash13(i+vec3(1,1,0));
  float e = hash13(i+vec3(0,0,1)), f1 = hash13(i+vec3(1,0,1)), g = hash13(i+vec3(0,1,1)), h = hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,f1,u.x), mix(g,h,u.x), u.y), u.z);
}
float fbm(vec3 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<FBM_OCTAVES;i++){ s += a * vnoise(p); p = p * 2.03 + vec3(17.1, 3.7, 9.2); a *= 0.5; }
  return s;
}
float fbm3(vec3 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<3;i++){ s += a * vnoise(p); p = p * 2.07 + vec3(5.3, 11.7, 2.9); a *= 0.5; }
  return s;
}
// Ridged noise for cracks and filaments.
float ridged(vec3 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ float n = 1.0 - abs(vnoise(p)*2.0-1.0); s += a*n*n; p = p*2.11 + vec3(3.1, 7.3, 1.9); a *= 0.5; }
  return s;
}
`;

export const SPHERE = /* glsl */ `
const float PI = 3.141592653589793;
// Equirectangular uv from a unit vector, with the antimeridian seam kept out of the mip selection.
vec2 sphereUV(vec3 n){
  float lon = atan(-n.z, n.x);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  return vec2(lon / (2.0*PI) + 0.5, lat / PI + 0.5);
}
vec4 sampleEquirect(sampler2D tex, vec3 n){
  float lon = atan(-n.z, n.x);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float u1 = lon / (2.0*PI) + 0.5;
  float u2 = fract(u1 + 0.5) - 0.5;
  float v = lat / PI + 0.5;
  vec2 dx = vec2(abs(dFdx(u1)) < abs(dFdx(u2)) ? dFdx(u1) : dFdx(u2), dFdx(v));
  vec2 dy = vec2(abs(dFdy(u1)) < abs(dFdy(u2)) ? dFdy(u1) : dFdy(u2), dFdy(v));
  return textureGrad(tex, vec2(u1, v), dx, dy);
}
`;

export const QUAT = /* glsl */ `
vec3 quatRotate(vec4 q, vec3 v){
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
`;

// Lighting shared by the base sphere and the plate meshes so they never disagree.
export const LIGHT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform vec3 uAtmo;       // atmosphere colour for the limb
uniform float uAtmoAmt;   // 0 with no atmosphere
float daylight(vec3 n){
  return smoothstep(-0.22, 0.5, dot(n, uSunDir));
}
vec3 applyLimb(vec3 col, vec3 n, vec3 worldPos){
  vec3 v = normalize(uCamPos - worldPos);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.2);
  float lit = 0.25 + 0.75 * daylight(n);
  return mix(col, uAtmo * lit, clamp(rim * uAtmoAmt, 0.0, 0.85));
}
`;

// Deep-time land and sea-ice colouring. Temperature by latitude comes from a retrieved dataset
// (Scotese 2022, 100 Phanerozoic intervals); rainfall belts are a simple latitude sketch. The result
// is an illustration of climate, labelled as such in the interface, not a map of real biomes.
export const PALEO_LAND = /* glsl */ `
uniform sampler2D uZonal;  // x: time 0..540 Ma, y: latitude south..north, value: (T + 60) / 100
uniform float uZonalX;     // column for the current time
uniform float uHasZonal;
uniform float uVeg;        // 0 before land plants, 1 once forests are established
uniform float uSnowball;   // 0..1 global white-out
uniform float uRust;       // 0 before oxygen (grey-black rock), 1 after (oxidised red beds)
float zonalTemp(float sinLat){
  if(uHasZonal < 0.5) return 22.0 - 38.0 * sinLat * sinLat;
  float v = asin(clamp(sinLat, -1.0, 1.0)) / 3.14159265 + 0.5;
  return texture2D(uZonal, vec2(uZonalX, v)).r * 100.0 - 60.0;
}
float seaIceAmount(vec3 nThen, float jitter){
  float t = zonalTemp(nThen.y) + jitter * 5.0;
  return max(smoothstep(-6.0, -13.0, t), uSnowball);
}
vec3 paleoLand(vec3 nNow, vec3 nThen){
  float sLat = nThen.y;
  float aLat = abs(sLat);
  float n1 = fbm(nNow * 6.0);
  float n2 = fbm3(nNow * 21.0 + 7.0);
  float n3 = vnoise(nNow * 64.0);
  float T = zonalTemp(sLat) + (n1 - 0.5) * 7.0;
  // bare rock: dark before oxygen, rusted afterwards
  vec3 rockOld = mix(vec3(0.16,0.15,0.15), vec3(0.30,0.28,0.26), n1);
  vec3 rockRed = mix(vec3(0.43,0.25,0.16), vec3(0.62,0.47,0.33), n1);
  vec3 rock = mix(rockOld, rockRed, uRust) * (0.82 + 0.36 * n2);
  // plants: wet tropics and temperate belts green, subtropical highs dry, extreme heat bleaches
  float dry = smoothstep(0.22, 0.38, aLat) * (1.0 - smoothstep(0.50, 0.66, aLat));
  dry = clamp(dry * (0.75 + 0.6 * (n1 - 0.5)) + smoothstep(30.0, 38.0, T) * 0.7, 0.0, 1.0);
  vec3 lush = mix(vec3(0.09,0.26,0.10), vec3(0.20,0.36,0.13), n2);
  vec3 temperate = mix(vec3(0.17,0.30,0.12), vec3(0.34,0.38,0.17), n2);
  vec3 green = mix(temperate, lush, smoothstep(12.0, 24.0, T));
  vec3 desert = mix(vec3(0.66,0.52,0.34), vec3(0.78,0.66,0.47), n2);
  vec3 veg = mix(green, desert, dry);
  vec3 tundra = mix(vec3(0.40,0.39,0.30), vec3(0.50,0.47,0.38), n2);
  veg = mix(veg, tundra, smoothstep(4.0, -6.0, T));
  vec3 col = mix(rock, veg, uVeg * (0.78 + 0.22 * n3));
  // land ice where the year-round mean is far below freezing
  float ice = max(smoothstep(-9.0, -15.0, T), uSnowball);
  vec3 iceCol = mix(vec3(0.86,0.91,0.95), vec3(0.97,0.98,1.0), n2);
  return mix(col, iceCol, ice);
}
`;

// What a deep-time lens does to a surface colour. Needs zonalTemp() from PALEO_LAND.
export const LENS = /* glsl */ `
uniform float uLens;      // 0 none, 1 geology, 2 climate, 3 life, 4 extinctions, 5 oceans, 6 cosmos
uniform float uLensAmt;   // 0..1
uniform float uCrisis;    // 0..1 closeness to a mass extinction
vec3 tempRamp(float T){
  vec3 c = mix(vec3(0.30,0.45,0.95), vec3(0.74,0.89,0.98), smoothstep(-25.0, -2.0, T));
  c = mix(c, vec3(0.45,0.78,0.50), smoothstep(-2.0, 12.0, T));
  c = mix(c, vec3(0.98,0.84,0.32), smoothstep(12.0, 24.0, T));
  c = mix(c, vec3(0.93,0.36,0.20), smoothstep(24.0, 36.0, T));
  return c;
}
vec3 plateTint(float plate){
  float h = fract(sin(plate * 12.9898 + 4.1) * 43758.5453);
  float v = fract(sin(plate * 78.233 + 1.7) * 12543.123);
  // muted mineral colours: enough difference to tell neighbours apart, none of them loud
  vec3 c = 0.52 + 0.21 * cos(6.2831853 * (h + vec3(0.02, 0.36, 0.69)));
  return mix(c, vec3(0.60, 0.50, 0.41), 0.42) * (0.82 + 0.30 * v);
}
// land: 1 on land, 0 on water. sinLat: sine of the latitude at the time shown. plate: index, or -1 if unknown.
vec3 applyLens(vec3 col, float land, float sinLat, float plate){
  if(uLensAmt < 0.001) return col;
  float lum = dot(col, vec3(0.3, 0.6, 0.1));
  vec3 o = col;
  if(uLens < 1.5){
    // geology: every plate in its own colour, the sea drained of colour
    vec3 pc = plate < -0.5 ? vec3(0.60, 0.50, 0.42) : plateTint(plate);
    vec3 sea = vec3(0.055, 0.075, 0.105) + vec3(lum) * vec3(0.30, 0.36, 0.46);
    o = mix(sea, pc * (0.66 + 0.80 * lum), land);
  } else if(uLens < 2.5){
    // climate: mean temperature by latitude, on land and sea alike
    vec3 t = tempRamp(zonalTemp(sinLat));
    // the same scale on land and sea; the land a step brighter so that the continents still read
    o = t * mix(0.50, 0.90, land) * (0.84 + 0.5 * lum);
    o = mix(o, col, 0.14);
  } else if(uLens < 3.5){
    // life: the living colours kept and leaned towards green, a little darker so that the fossil finds stand out
    o = mix(col, col * vec3(0.72, 1.12, 0.76) + vec3(0.0, 0.02, 0.0), 0.85) * mix(0.62, 0.86, land);
  } else if(uLens < 4.5){
    // extinctions: the colour drained out, bone on land and lead at sea, and a red cast when a mass extinction is near
    o = mix(vec3(lum) * vec3(0.46, 0.45, 0.50) * 0.75 + 0.012, vec3(0.20) + vec3(lum) * vec3(1.02, 0.92, 0.84) * 0.9, land);
    o += vec3(0.24, 0.03, 0.012) * uCrisis * (0.6 + lum);
  } else if(uLens < 5.5){
    // oceans: land in silhouette, the sea brought forward
    o = mix(col * 1.55 + vec3(0.0, 0.035, 0.09), vec3(0.055, 0.058, 0.062) + col * 0.12, land);
  } else {
    // cosmos: the planet dims and the sky comes forward
    o = col * 0.38;
  }
  return mix(col, o, uLensAmt);
}
`;
