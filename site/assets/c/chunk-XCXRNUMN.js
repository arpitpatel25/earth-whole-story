import{A as O,C as D,F as Y,K as pt,d as ht,r as xt,t as P,v as B,w as Z,y as T,z as V}from"./chunk-WVF6CUXD.js";var _=new Set,et=!1;function at(t,e,n=2){let o=e&&e.length,i=o?e[0]*n:t.length;_.size&&_.clear();let r=yt(t,0,i,n,!0),l=[];if(!r||r.next===r.prev)return l;let s=0,a=0,c=0;if(o&&(r=Pt(t,e,r,n)),t.length>80*n){s=t[0],a=t[1];let p=s,m=a;for(let g=n;g<i;g+=n){let v=t[g],x=t[g+1];v<s&&(s=v),x<a&&(a=x),v>p&&(p=v),x>m&&(m=x)}c=Math.max(p-s,m-a),c=c!==0?32767/c:0}return nt(r,l,s,a,c),l}function yt(t,e,n,o,i){let r=null;if(i===Gt(t,e,n,o)>0)for(let l=e;l<n;l+=o)r=gt(l/o|0,t[l],t[l+1],r);else for(let l=n-o;l>=e;l-=o)r=gt(l/o|0,t[l],t[l+1],r);return r&&I(r,r.next)&&(W(r),r=r.next),r}function F(t,e=t){let n=e===t,o=t,i;do i=!1,o!==o.next&&(_.size===0||!_.has(o))&&(I(o,o.next)||E(o.prev,o,o.next)===0)?((n||o===e)&&(e=o.prev),et=!0,W(o),o=o.prev,i=!0):(n||o!==e)&&(o=o.next,i=!n);while(i||o!==e);return e}function nt(t,e,n,o,i){i&&jt(t,n,o,i);let r=t,l=!1;for(;t.prev!==t.next;){let s=t.prev,a=t.next;if(E(s,t,a)<0&&(i?Ct(t,n,o,i):Ht(t))){e.push(s.i,t.i,a.i),W(t),t=a,r=a;continue}if(t=a,t===r){if(et=!1,t=F(t),et){r=t;continue}if(!l){t=St(t,e),r=t,l=!0;continue}Ft(t,e,n,o,i);break}}}function Ht(t){let e=t.prev,n=t,o=t.next,i=e.x,r=n.x,l=o.x,s=e.y,a=n.y,c=o.y,p=Math.min(i,r,l),m=Math.min(s,a,c),g=Math.max(i,r,l),v=Math.max(s,a,c),x=o.next;for(;x!==e;){if(x.x>=p&&x.x<=g&&x.y>=m&&x.y<=v&&!(i===x.x&&s===x.y)&&Q(i,s,r,a,l,c,x.x,x.y)&&E(x.prev,x,x.next)>=0)return!1;x=x.next}return!0}function Ct(t,e,n,o){let i=t.prev,r=t,l=t.next,s=i.x,a=r.x,c=l.x,p=i.y,m=r.y,g=l.y,v=Math.min(s,a,c),x=Math.min(p,m,g),d=Math.max(s,a,c),y=Math.max(p,m,g),A=lt(v,x,e,n,o),u=lt(d,y,e,n,o),f=t.prevZ;for(;f&&f.z>=A;){if(f.x>=v&&f.x<=d&&f.y>=x&&f.y<=y&&f!==l&&!(s===f.x&&p===f.y)&&Q(s,p,a,m,c,g,f.x,f.y)&&E(f.prev,f,f.next)>=0)return!1;f=f.prevZ}let h=t.nextZ;for(;h&&h.z<=u;){if(h.x>=v&&h.x<=d&&h.y>=x&&h.y<=y&&h!==l&&!(s===h.x&&p===h.y)&&Q(s,p,a,m,c,g,h.x,h.y)&&E(h.prev,h,h.next)>=0)return!1;h=h.nextZ}return!0}function St(t,e){let n=t,o=!1;do{let i=n.prev,r=n.next.next;Mt(i,n,n.next,r,!1)&&U(i,r)&&U(r,i)&&(e.push(i.i,n.i,r.i),W(n),W(n.next),n=t=r,o=!0),n=n.next}while(n!==t);return o?F(n):n}function Ft(t,e,n,o,i){let r=t;do{let l=r.next.next;for(;l!==r.prev;){if(r.i!==l.i&&It(r,l)){let s=Et(r,l);r=F(r,r.next),s=F(s,s.next),nt(r,e,n,o,i),nt(s,e,n,o,i);return}l=l.next}r=r.next}while(r!==t)}var ot=!1;function Pt(t,e,n,o){let i=[];for(let r=0,l=e.length;r<l;r++){let s=e[r]*o,a=r<l-1?e[r+1]*o:t.length,c=yt(t,s,a,o,!1);c===c.next&&_.add(c),i.push(_t(c))}i.sort(kt),Bt(t.length/o,e.length),wt(n,n),ot=!0;for(let r=0;r<i.length;r++)n=zt(i[r],n);return ot=!1,F(n)}function kt(t,e){return t.x-e.x||t.y-e.y||(t.next.y-t.y)/(t.next.x-t.x)-(e.next.y-e.y)/(e.next.x-e.x)}function zt(t,e){let n=Vt(t,e);if(!n)return e;let o=Et(n,t),i=o.next;return wt(n,i.next),F(o,o.next),F(n,n.next)}var dt=16,M=new Float64Array(0),J=0,it=[],rt=[];function Bt(t,e){let n=Math.ceil((t+2*e)/dt)+e+2;M.length<n*4&&(M=new Float64Array(n*4)),J=0}function wt(t,e){let n=t;do{let o=J++;it[o]=n;let i=n.x,r=n.y,l=n.x,s=n.y,a=0;do{let p=n.next;n.z=o,p.x<i&&(i=p.x),p.x>l&&(l=p.x),p.y<r&&(r=p.y),p.y>s&&(s=p.y),n=p}while(++a<dt&&n!==e);rt[o]=n;let c=o*4;M[c]=i,M[c+1]=r,M[c+2]=l,M[c+3]=s}while(n!==e)}function Zt(t,e){let n=t.z*4;e.x<M[n]&&(M[n]=e.x),e.y<M[n+1]&&(M[n+1]=e.y),e.x>M[n+2]&&(M[n+2]=e.x),e.y>M[n+3]&&(M[n+3]=e.y)}function vt(t){let e=rt[t];for(;e.prev.next!==e;)e=e.next;return rt[t]=e,e}function mt(t){let e=it[t];for(;e.prev.next!==e;)e=e.next;return it[t]=e,e}function Vt(t,e){let n=e,o=t.x,i=t.y,r=-1/0,l;if(I(t,n))return n;for(let g=0,v=0;g<J;g++,v+=4){if(i<M[v+1]||i>M[v+3]||M[v]>o||M[v+2]<=r)continue;let x=vt(g);n=mt(g);do{if(n.prev.next===n){if(I(t,n.next))return n.next;if(i<=n.y&&i>=n.next.y&&n.next.y!==n.y){let d=n.x+(i-n.y)*(n.next.x-n.x)/(n.next.y-n.y);if(d<=o&&d>r&&(r=d,l=n.x<n.next.x?n:n.next,d===o))return l}}n=n.next}while(n!==x)}if(!l)return null;let s=l.x,a=l.y,c=Math.min(i,a),p=Math.max(i,a),m=1/0;for(let g=0,v=0;g<J;g++,v+=4){if(M[v+2]<s||M[v]>o||M[v+3]<c||M[v+1]>p)continue;let x=vt(g);n=mt(g);do{if(n.prev.next===n&&o>=n.x&&n.x>=s&&o!==n.x&&Q(i<a?o:r,i,s,a,i<a?r:o,i,n.x,n.y)){let d=Math.abs(i-n.y)/(o-n.x);(U(n,t)||n.y===i&&n.next.y===i&&n.next.x>o)&&(d<m||d===m&&(n.x>l.x||n.x===l.x&&Dt(l,n)))&&(l=n,m=d)}n=n.next}while(n!==x)}return l}function Dt(t,e){return E(t.prev,t,e.prev)<0&&E(e.next,t,t.next)<0}var R=[],k=[],S=new Uint32Array(0),j=new Uint32Array(0),L=new Uint32Array(256);function jt(t,e,n,o){let i=t,r=0;do i.z=lt(i.x,i.y,e,n,o),R[r++]=i,i=i.next;while(i!==t);Lt(r);let l=null;for(let s=0;s<r;s++){let a=R[s];a.prevZ=l,l&&(l.nextZ=a),l=a}l.nextZ=null,R.fill(null,0,r),k.fill(null,0,r)}function Lt(t){if(t<=32){for(let e=1;e<t;e++){let n=R[e],o=n.z,i=e-1;for(;i>=0&&R[i].z>o;)R[i+1]=R[i],i--;R[i+1]=n}return}S.length<t&&(S=new Uint32Array(t),j=new Uint32Array(t),k=new Array(t));for(let e=0;e<t;e++)S[e]=R[e].z;X(t,R,S,k,j,0),X(t,k,j,R,S,8),X(t,R,S,k,j,16),X(t,k,j,R,S,24)}function X(t,e,n,o,i,r){L.fill(0);for(let s=0;s<t;s++)L[n[s]>>>r&255]++;let l=0;for(let s=0;s<256;s++){let a=L[s];L[s]=l,l+=a}for(let s=0;s<t;s++){let a=n[s],c=L[a>>>r&255]++;o[c]=e[s],i[c]=a}}function lt(t,e,n,o,i){return t=(t-n)*i|0,e=(e-o)*i|0,t=(t|t<<8)&16711935,t=(t|t<<4)&252645135,t=(t|t<<2)&858993459,t=(t|t<<1)&1431655765,e=(e|e<<8)&16711935,e=(e|e<<4)&252645135,e=(e|e<<2)&858993459,e=(e|e<<1)&1431655765,t|e<<1}function _t(t){let e=t,n=t;do(e.x<n.x||e.x===n.x&&e.y<n.y)&&(n=e),e=e.next;while(e!==t);return n}function Q(t,e,n,o,i,r,l,s){return(i-l)*(e-s)>=(t-l)*(r-s)&&(t-l)*(o-s)>=(n-l)*(e-s)&&(n-l)*(r-s)>=(i-l)*(o-s)}function It(t,e){let n=I(t,e)&&E(t.prev,t,t.next)>0&&E(e.prev,e,e.next)>0;return t.next.i!==e.i&&(n||U(t,e)&&U(e,t)&&(E(t.prev,t,e.prev)!==0||E(t,e.prev,e)!==0))&&!Ut(t,e)&&(n||Wt(t,e))}function E(t,e,n){return(e.y-t.y)*(n.x-e.x)-(e.x-t.x)*(n.y-e.y)}function I(t,e){return t.x===e.x&&t.y===e.y}function Mt(t,e,n,o,i=!0){let r=E(t,e,n),l=E(t,e,o),s=E(n,o,t),a=E(n,o,e);return(r>0&&l<0||r<0&&l>0)&&(s>0&&a<0||s<0&&a>0)?!0:i?!!(r===0&&K(t,n,e)||l===0&&K(t,o,e)||s===0&&K(n,t,o)||a===0&&K(n,e,o)):!1}function K(t,e,n){return e.x<=Math.max(t.x,n.x)&&e.x>=Math.min(t.x,n.x)&&e.y<=Math.max(t.y,n.y)&&e.y>=Math.min(t.y,n.y)}function Ut(t,e){let n=Math.min(t.x,e.x),o=Math.max(t.x,e.x),i=Math.min(t.y,e.y),r=Math.max(t.y,e.y),l=t;do{let s=l.next;if(l.x>o&&s.x>o||l.x<n&&s.x<n||l.y>r&&s.y>r||l.y<i&&s.y<i){l=s;continue}if(l.i!==t.i&&s.i!==t.i&&l.i!==e.i&&s.i!==e.i&&Mt(l,s,t,e))return!0;l=s}while(l!==t);return!1}function U(t,e){return E(t.prev,t,t.next)<0?E(t,e,t.next)>=0&&E(t,t.prev,e)>=0:E(t,e,t.prev)<0||E(t,t.next,e)<0}function Wt(t,e){let n=t,o=!1,i=(t.x+e.x)/2,r=(t.y+e.y)/2;do{let l=n.next;n.y>r!=l.y>r&&i<(l.x-n.x)*(r-n.y)/(l.y-n.y)+n.x&&(o=!o),n=l}while(n!==t);return o}function Et(t,e){let n=st(t.i,t.x,t.y),o=st(e.i,e.x,e.y),i=t.next,r=e.prev;return t.next=e,e.prev=t,n.next=i,i.prev=n,o.next=n,n.prev=o,r.next=o,o.prev=r,o}function gt(t,e,n,o){let i=st(t,e,n);return o?(i.next=o.next,i.prev=o,o.next.prev=i,o.next=i):(i.prev=i,i.next=i),i}function W(t){t.next.prev=t.prev,t.prev.next=t.next,t.prevZ&&(t.prevZ.nextZ=t.nextZ),t.nextZ&&(t.nextZ.prevZ=t.prevZ),ot&&Zt(t.prev,t.next)}function st(t,e,n){return{i:t,x:e,y:n,prev:null,next:null,z:0,prevZ:null,nextZ:null}}function Gt(t,e,n,o){let i=0;for(let r=e,l=n-o;r<n;r+=o)i+=(t[l]-t[r])*(t[r+1]+t[l+1]),l=r;return i}var G=Math.PI/180;function Nt(t,e){let n=Math.cos(e*G);return[n*Math.cos(t*G),Math.sin(e*G),-n*Math.sin(t*G)]}var $=(t,e)=>t[0]*e[0]+t[1]*e[1]+t[2]*e[2],ut=(t,e)=>[t[1]*e[2]-t[2]*e[1],t[2]*e[0]-t[0]*e[2],t[0]*e[1]-t[1]*e[0]];function q(t){let e=Math.hypot(t[0],t[1],t[2])||1;return[t[0]/e,t[1]/e,t[2]/e]}function z(t,e){return Math.hypot(t[0]-e[0],t[1]-e[1],t[2]-e[2])}function Ot(t,e){let n=[];for(let o=0;o<t.length;o++){let i=t[o],r=t[(o+1)%t.length];n.push(i);let l=Math.ceil(z(i,r)/e);for(let s=1;s<l;s++){let a=s/l;n.push(q([i[0]+(r[0]-i[0])*a,i[1]+(r[1]-i[1])*a,i[2]+(r[2]-i[2])*a]))}}return n}function Yt(t){let e=[];for(let[n,o]of t){let i=Nt(n,o);e.length&&z(e[e.length-1],i)<1e-7||e.push(i)}return e.length>1&&z(e[0],e[e.length-1])<1e-7&&e.pop(),e}function ct(t,e=4){let n=2*Math.sin(e*G/2),o=t.map(Yt).filter(u=>u.length>=3).map(u=>Ot(u,n));if(!o.length)return null;let i=[0,0,0];for(let u of o[0])i=[i[0]+u[0],i[1]+u[1],i[2]+u[2]];Math.hypot(...i)<1e-9&&(i=o[0][0]),i=q(i);let r=Math.abs(i[1])<.9?[0,1,0]:[1,0,0],l=q(ut(r,i)),s=ut(i,l),a=[],c=[],p=[];for(let u=0;u<o.length;u++){u>0&&p.push(a.length);for(let f of o[u]){let h=2/(1+Math.max(-.95,$(f,i)));c.push(h*$(f,l),h*$(f,s)),a.push(f)}}let m=at(c,p,2);if(!m.length)return null;let g=new Map,v=(u,f)=>{let h=u<f?u*4194304+f:f*4194304+u,w=g.get(h);if(w===void 0){let b=a[u],C=a[f];w=a.length,a.push(q([b[0]+C[0],b[1]+C[1],b[2]+C[2]])),g.set(h,w)}return w},x=[],d=[];for(let u=0;u<m.length;u+=3)d.push([m[u],m[u+1],m[u+2]]);let y=0;for(;d.length&&!(++y>4e6);){let[u,f,h]=d.pop(),w=z(a[u],a[f]),b=z(a[f],a[h]),C=z(a[h],a[u]),tt=Math.max(w,b,C);if(tt<=n*1.001)x.push(u,f,h);else if(tt===w){let H=v(u,f);d.push([u,H,h],[H,f,h])}else if(tt===b){let H=v(f,h);d.push([u,f,H],[u,H,h])}else{let H=v(h,u);d.push([u,f,H],[H,f,h])}}for(let u=0;u<x.length;u+=3){let f=a[x[u]],h=a[x[u+1]],w=a[x[u+2]],b=ut([h[0]-f[0],h[1]-f[1],h[2]-f[2]],[w[0]-f[0],w[1]-f[1],w[2]-f[2]]);if($(b,[f[0]+h[0]+w[0],f[1]+h[1]+w[1],f[2]+h[2]+w[2]])<0){let C=x[u+1];x[u+1]=x[u+2],x[u+2]=C}}let A=new Array(a.length*3);for(let u=0;u<a.length;u++)A[u*3]=a[u][0],A[u*3+1]=a[u][1],A[u*3+2]=a[u][2];return{positions:A,indices:x}}var N=Math.PI/180;function ft(t,e,n=1){let o=Math.cos(t*N);return new P(n*o*Math.cos(e*N),n*Math.sin(t*N),-n*o*Math.sin(e*N))}function bt(t,e,n=0,o=8){let i=ft(t[0],t[1]),r=ft(e[0],e[1]),l=i.angleTo(r),s=Math.max(o,Math.ceil(l/(2.5*N))),a=[];for(let c=0;c<=s;c++){let p=c/s,m=l<1e-6?i.clone():i.clone().multiplyScalar(Math.sin((1-p)*l)).addScaledVector(r,Math.sin(p*l)).normalize();a.push(m.multiplyScalar(1.0025+n*Math.sin(Math.PI*p)*Math.min(1,l/1.2)))}return a}function re(t,e=0){let n=[];for(let o=0;o<t.length-1;o++){let i=bt(t[o],t[o+1],e,3);o>0&&i.shift(),n.push(...i)}return n}var Xt=`
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aSide;
attribute float aT;
uniform vec2 uResolution;
uniform float uWidth;      // CSS pixels
uniform float uReveal;     // 0..1 of the path drawn
uniform float uHead;       // length of the arrow head as a share of the path (0 for none)
uniform vec3 uCamPos;
uniform float uPixelRatio;
varying float vT;
varying float vFacing;
varying float vAcross;
void main(){
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 a = projectionMatrix * modelViewMatrix * vec4(aPrev, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aNext, 1.0);
  vec2 sa = a.xy / a.w * uResolution;
  vec2 sb = b.xy / b.w * uResolution;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float w = uWidth;
  if(uHead > 0.0){
    float h0 = uReveal - uHead;
    if(aT > h0) w = uWidth * 3.0 * clamp((uReveal - aT) / uHead, 0.0, 1.0);
  }
  if(aT > uReveal + 0.0005) w = 0.0;
  p.xy += normal * aSide * w / uResolution * p.w;   // w is the full width in CSS pixels: half each side, times 2 for NDC
  gl_Position = p;
  vT = aT;
  vAcross = aSide;
  vec3 n = normalize(position);
  vFacing = dot(n, normalize(uCamPos - position));
}
`,Kt=`
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uReveal;
uniform float uDash;       // 0 solid, >0 dash count along the path
uniform float uFlow;       // moving highlights (ambient)
uniform float uClock;
varying float vT;
varying float vFacing;
varying float vAcross;
void main(){
  if(vT > uReveal + 0.001) discard;
  float a = uAlpha * smoothstep(-0.02, 0.16, vFacing);
  if(uDash > 0.0){
    float d = fract(vT * uDash);
    a *= smoothstep(0.0, 0.08, d) * (1.0 - smoothstep(0.55, 0.63, d));
  }
  vec3 col = uColor;
  if(uFlow > 0.0){
    float f = fract(vT * uFlow - uClock * 0.22);
    col = mix(col, vec3(1.0), smoothstep(0.80, 0.97, f) * 0.6);
  }
  float edge = 1.0 - smoothstep(0.65, 1.0, abs(vAcross));
  gl_FragColor = vec4(col, a * (0.55 + 0.45 * edge));
}
`,At=`
varying vec3 vPos;
void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,Rt=`
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uHatch;
uniform vec3 uSunDir;
varying vec3 vPos;
void main(){
  float light = 0.55 + 0.45 * smoothstep(-0.22, 0.5, dot(normalize(vPos), uSunDir));
  float a = uAlpha;
  if(uHatch > 0.0){
    float h = fract((gl_FragCoord.x + gl_FragCoord.y) / 9.0);
    a *= mix(0.55, 1.0, step(0.5, h));
  }
  gl_FragColor = vec4(uColor * light, a);
}
`,Jt=`
uniform float uSize;
uniform float uPixelRatio;
uniform vec3 uCamPos;
varying float vFacing;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixelRatio;
  vFacing = dot(normalize(position), normalize(uCamPos - position));
}
`,Qt=`
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uClock;
uniform float uPulse;
varying float vFacing;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if(r > 1.0) discard;
  float ph = fract(uClock * 0.45 * uPulse);
  float ring = exp(-pow((r - ph) * 9.0, 2.0)) * (1.0 - ph);
  float ring2 = exp(-pow((r - fract(ph + 0.5)) * 9.0, 2.0)) * (1.0 - fract(ph + 0.5));
  float core = 1.0 - smoothstep(0.10, 0.16, r);
  float a = max(core, max(ring, ring2) * 0.85) * uAlpha * smoothstep(0.0, 0.18, vFacing);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.5), a);
}
`,Tt=class{constructor(e){this.engine=e,this.group=new Y,e.scene.add(this.group),this.items=new Map,this.resolution=new xt(1,1),e.addLayer(this)}clear(){for(let e of[...this.items.keys()])this.remove(e)}remove(e){let n=this.items.get(e);n&&(n.object.removeFromParent(),n.object.traverse(o=>{o.geometry&&o.geometry.dispose(),o.material&&o.material.dispose()}),this.items.delete(e),this.engine.invalidate())}has(e){return this.items.has(e)}setAlpha(e,n){let o=this.items.get(e);o&&o.alpha!==n&&(o.alpha=n,this.engine.invalidate())}setReveal(e,n){let o=this.items.get(e);o&&o.reveal!==n&&(o.reveal=n,this.engine.invalidate())}addPath(e,n,o={}){this.remove(e);let i=n.length;if(i<2)return;let r=[0];for(let y=1;y<i;y++)r.push(r[y-1]+n[y].distanceTo(n[y-1]));let l=r[i-1]||1,s=new Float32Array(i*2*3),a=new Float32Array(i*2*3),c=new Float32Array(i*2*3),p=new Float32Array(i*2),m=new Float32Array(i*2);for(let y=0;y<i;y++){let A=n[y],u=n[Math.max(0,y-1)],f=n[Math.min(i-1,y+1)];for(let h=0;h<2;h++){let w=(y*2+h)*3;s[w]=A.x,s[w+1]=A.y,s[w+2]=A.z,a[w]=u.x,a[w+1]=u.y,a[w+2]=u.z,c[w]=f.x,c[w+1]=f.y,c[w+2]=f.z,p[y*2+h]=h?1:-1,m[y*2+h]=r[y]/l}}let g=new Uint16Array((i-1)*6);for(let y=0;y<i-1;y++){let A=y*2;g.set([A,A+1,A+2,A+1,A+3,A+2],y*6)}let v=new V;v.setAttribute("position",new T(s,3)),v.setAttribute("aPrev",new T(a,3)),v.setAttribute("aNext",new T(c,3)),v.setAttribute("aSide",new T(p,1)),v.setAttribute("aT",new T(m,1)),v.setIndex(new T(g,1)),v.boundingSphere=new B(new P,1.6);let x=new D({vertexShader:Xt,fragmentShader:Kt,uniforms:{uResolution:{value:this.resolution},uWidth:{value:o.width||3},uReveal:{value:1},uHead:{value:o.head?Math.min(.5,(o.headLen||.07)/Math.max(.15,l)):0},uCamPos:this.engine.earth.uniforms.uCamPos,uPixelRatio:{value:1},uColor:{value:new Z(o.color||"#ffd23f")},uAlpha:{value:1},uDash:{value:o.dash?Math.max(4,Math.round(l*(o.dash===!0?60:o.dash))):0},uFlow:{value:o.flow?Math.max(2,Math.round(l*9)):0},uClock:{value:0}},transparent:!0,depthTest:!1,depthWrite:!1,side:ht}),d=new O(v,x);d.frustumCulled=!1,d.renderOrder=o.order||9,this.group.add(d),this.items.set(e,{kind:"path",object:d,mat:x,alpha:o.alpha??1,reveal:o.reveal??1,baseAlpha:o.opacity??.95}),this.engine.invalidate()}addArc(e,n,o,i={}){this.addPath(e,bt(n,o,i.lift??.05),{head:!0,...i})}addArea(e,n,o={}){this.remove(e);let i=[n.map(([a,c])=>[c,a])],r=ct(i,4),l=new Y,s=new D({vertexShader:At,fragmentShader:Rt,uniforms:{uColor:{value:new Z(o.color||"#ff5d52")},uAlpha:{value:0},uHatch:{value:o.hatch?1:0},uSunDir:this.engine.earth.uniforms.uSunDir},transparent:!0,depthTest:!1,depthWrite:!1});if(r){let a=new V;a.setAttribute("position",new T(new Float32Array(r.positions),3)),a.setIndex(r.indices),a.boundingSphere=new B(new P,1.01);let c=new O(a,s);c.frustumCulled=!1,c.renderOrder=o.order||6,l.add(c)}this.group.add(l),this.items.set(e,{kind:"area",object:l,mat:s,alpha:o.alpha??1,baseAlpha:o.opacity??.34}),this.engine.invalidate()}addPolys(e,n,o={}){this.remove(e);let i=new Y,r=new D({vertexShader:At,fragmentShader:Rt,uniforms:{uColor:{value:new Z(o.color||"#ff5d52")},uAlpha:{value:0},uHatch:{value:o.hatch?1:0},uSunDir:this.engine.earth.uniforms.uSunDir},transparent:!0,depthTest:!1,depthWrite:!1}),l=[],s=[];for(let a of n){let c=ct(a,5);if(!c)continue;let p=l.length/3;for(let m of c.positions)l.push(m);for(let m of c.indices)s.push(p+m)}if(l.length){let a=new V;a.setAttribute("position",new T(new Float32Array(l),3)),a.setIndex(s),a.boundingSphere=new B(new P,1.01);let c=new O(a,r);c.frustumCulled=!1,c.renderOrder=o.order||6,i.add(c)}this.group.add(i),this.items.set(e,{kind:"area",object:i,mat:r,alpha:o.alpha??1,baseAlpha:o.opacity??.36}),this.engine.invalidate()}addRing(e,n,o,i={}){this.remove(e);let r=new V,l=ft(n,o,1.002);r.setAttribute("position",new T(new Float32Array([l.x,l.y,l.z]),3)),r.boundingSphere=new B(new P,1.1);let s=new D({vertexShader:Jt,fragmentShader:Qt,uniforms:{uSize:{value:i.size||70},uPixelRatio:{value:1},uCamPos:this.engine.earth.uniforms.uCamPos,uColor:{value:new Z(i.color||"#ffd23f")},uAlpha:{value:0},uClock:{value:0},uPulse:{value:i.pulse??1}},transparent:!0,depthTest:!1,depthWrite:!1}),a=new pt(r,s);a.frustumCulled=!1,a.renderOrder=11,this.group.add(a),this.items.set(e,{kind:"ring",object:a,mat:s,alpha:i.alpha??1,baseAlpha:1}),this.engine.invalidate()}update(e){if(!this.items.size)return;let n=this.engine;this.resolution.set(n.width,n.height);let o=n.renderer.getPixelRatio(),i=e.earth;for(let r of this.items.values()){let l=r.mat.uniforms;l.uAlpha.value=r.alpha*r.baseAlpha*i,r.object.visible=l.uAlpha.value>.003,l.uClock&&(l.uClock.value=n.clock),l.uPixelRatio&&(l.uPixelRatio.value=r.kind==="path"?1:o),l.uReveal&&(l.uReveal.value=r.reveal)}}};export{re as a,Tt as b};
