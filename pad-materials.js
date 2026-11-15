/* Eight optical materials adapted from the supplied StyleKit swatch source.
 * Copyright (c) 2026 AnxForever, MIT. See assets/stylekit-LICENSE.txt.
 */
class PulsePadMaterials {
  constructor() {
    const types = { film: 0, straight: 1, star: 2, glitter: 3, dots: 10, ice: 11, pillar: 12, ripple: 13 };
    this.items = [...document.querySelectorAll(".music-pad[data-material]")].map((host, index) => {
      const canvas = document.createElement("canvas");
      canvas.className = "pad-material-canvas";
      canvas.setAttribute("aria-hidden", "true");
      host.prepend(canvas);
      host.dataset.materialRenderer = "css";
      return {
        host,
        canvas,
        context: canvas.getContext("2d"),
        material: types[host.dataset.material],
        angle: Number(host.dataset.materialAngle || 30) * Math.PI / 180,
        light: Number(host.dataset.materialLight || 0),
        seed: index * 7.31,
      };
    });
    this.surface = document.createElement("canvas");
    this.surface.width = this.surface.height = 1;
    this.gl = this.surface.getContext("webgl2", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    this.lastKey = "";
    this.lastFrame = -Infinity;
    if (!this.gl) return;
    try {
      this.initializeGL();
    } catch (error) {
      console.warn("音块材质启用兼容绘制。", error.message);
      this.gl = null;
      return;
    }
    this.surface.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
    });
    this.surface.addEventListener("webglcontextrestored", () => {
      this.initializeGL();
      this.lost = false;
      this.lastKey = "";
    });
  }

  initializeGL() {
    const gl = this.gl;
    const fragmentSource = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uSpec;
uniform vec2 uSize, uOrigin, uC;
uniform vec3 uLight;
uniform float uDpr, uTop, uMat, uK, uSeed, uLite, uBase;
uniform mat3 uRot;

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 h32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + 1.), f.x), f.y); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
vec3 sat(vec3 c, float k) { float l = dot(c, vec3(.2126, .7152, .0722)); return max(mix(vec3(l), c, k), 0.); }
// 波长（纳米）对应的颜色，表是按 CIE 1931 配色函数算好的
vec3 spec(float lam) { float x = (lam - 380.) / 400.; return x > 0. && x < 1. ? texture(uSpec, vec2(x, .5)).rgb : vec3(0.); }
// 衍射光栅：h 是光线和视线在膜面上的投影之和，k 是光栅矢量（垂直于刻槽），d 是刻槽间距（纳米）。
// 沿 k 的分量决定反射回来的波长（一、二、三级），垂直 k 的分量偏离 0 越多越暗，sig 管这道反光带有多宽
vec3 grating(vec2 h, vec2 k, float d, float sig) {
  float u = abs(dot(h, k)) * d, w = dot(h, vec2(-k.y, k.x)) / sig;
  return (spec(u) + .5 * spec(u * .5) + .3 * spec(u / 3.)) * exp(-w * w);
}vec3 env(vec3 r) { return mix(vec3(.05, .05, .06), vec3(.34, .34, .38), smoothstep(-.7, .9, -r.y)); }
void main() {
  vec2 q = vec2(gl_FragCoord.x, uTop - gl_FragCoord.y) / uDpr;   // 零件里的位置，CSS 像素，y 朝下
  vec2 P = uOrigin + q, px = q * uDpr;
  vec3 N = uRot * vec3(0., 0., 1.), T = uRot * vec3(1., 0., 0.), B = uRot * vec3(0., 1., 0.);
  // 人从稍高一点的地方往下看：灯在指针正上方时，指针底下也能看到第一级彩光，不只是一块白
  vec3 V = normalize(vec3(0., -.26, 1.));
  vec3 L = normalize(vec3(uLight.xy - P, uLight.z));
  vec3 Hs = L + V;
  vec2 h = vec2(dot(Hs, T), dot(Hs, B));
  float hz = dot(Hs, N), hl = dot(h, h);
  vec3 R = reflect(-V, N);
  // 镀铝的膜本身是一面镜子：照出屋子，加上灯的一点镜面高光和一圈宽一点的晕
  vec3 metal = env(R) * (1. + 1.6 * uLite) + vec3(1., .97, .93) * (exp(-hl / .0025) * 2.4 + exp(-hl / .05) * .3);
  vec3 col;
  if (uMat < .5) {
    // 彩虹膜：两组互相垂直的刻槽（交叉光栅），灯从哪个方向来，总有一组衍射出彩光；底子是顺着一个方向拉过丝的银，
    // 刻槽疏密随位置慢慢变一点，彩虹带就不是笔直的
    vec2 k1 = vec2(cos(uK), sin(uK)), k2 = vec2(-k1.y, k1.x);
    float st = vn(vec2(dot(q, k2) * .06, dot(q, k1) * 1.6) + uSeed) * (1. - .6 * uLite);   // 浅色款上要印字，拉丝淡一些
    float d = 1650. + 240. * (vn(q / 120. + uSeed) - .5);
    vec3 hc = grating(h, k1, d, .38) + grating(h, k2, d * 1.07, .38);
    col = metal * (.68 + .14 * st - .25 * uLite) * uBase + hc * (1.1 + .18 * st + .3 * uLite);
  } else if (uMat < 1.5) {
    // 拉丝直纹：刻槽方向固定，顺着刻槽有一道道拉丝，刻槽方向跟着拉丝抖一点
    float st = vn(vec2(dot(q, vec2(-sin(uK), cos(uK))) * .03, dot(q, vec2(cos(uK), sin(uK))) * .7));
    float ka = uK + (st - .5) * .18;
    vec3 hc = grating(h, vec2(cos(ka), sin(ka)), 1500., .32);
    col = metal * (.55 + .35 * st) * uBase + hc * (1.1 + .6 * st);
  } else if (uMat < 2.5) {
    // 星芒：同心圆刻槽，只有和 h 平行的那条半径最亮，倾斜时那道彩虹绕着中心转；分 36 个扇区，相邻扇区疏密不同
    vec2 c = q - uC * uSize;
    float rr = length(c);
    vec2 kr = c / max(rr, 1e-3), kt = vec2(-kr.y, kr.x);
    float a = atan(c.y, c.x) / 6.2832 * 36. + 36.;
    float sec = floor(a), fa = fract(a);
    float edge = min(fa, 1. - fa) * rr * 6.2832 / 36. * uDpr;
    float nb = fa < .5 ? sec - 1. : sec + 1.;
    float d0 = 1240. + 190. * h12(vec2(mod(sec, 36.), 3.)), d1 = 1240. + 190. * h12(vec2(mod(nb, 36.), 3.));
    float dd = mix(d1, d0, .5 + .5 * smoothstep(0., 1.5, edge));
    vec3 hc = grating(h, kr, dd, .05) * 1.6 + grating(h, kr, dd, .17) * .4 + grating(h, kt, 1720., .06) * .3;
    float rings = .9 + .1 * sin(rr * uDpr * 1.6);   // 刻槽密到看不清，只留一点同心的纹路
    col = metal * .55 * rings * uBase + hc;
  } else if (uMat < 3.5) {
    // 碎钻：几千粒朝向各不相同的小碎片，底子是暗的镜面。六成是小光栅，角度对上时亮成很饱和的颜色；其余是小镜子，正对灯时白光一闪
    float cs = 4.6;
    vec2 gp = px / cs, ip = floor(gp), fp = fract(gp);
    float F1 = 9., F2 = 9.;
    vec2 id1 = ip;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 oc = vec2(float(i), float(j));
      vec2 dl = oc + .1 + .8 * h32(ip + oc + uSeed).xy - fp;
      float dd = dot(dl, dl);
      if (dd < F1) { F2 = F1; F1 = dd; id1 = ip + oc; } else if (dd < F2) F2 = dd;
    }
    float gap = sqrt(F2) - sqrt(F1);
    vec3 r1 = h32(id1 + uSeed + 17.3), r2 = h32(id1 + uSeed + 3.7);
    vec2 tl = (r2.xy - .5) * .9;
    vec2 hs = h - tl * hz;
    vec3 nf = normalize(N + T * tl.x + B * tl.y);
    vec3 gc = env(reflect(-V, nf)) * (.01 + .04 * r1.z) * (.3 + .7 * uBase);   // 碎片大多数角度下是暗的，和大卡的边框一样
    if (r2.z < .6) { float th = r1.x * 6.2832; gc += sat(grating(hs, vec2(cos(th), sin(th)), 1050. + 800. * r1.y, .026), 1.9) * 2.8 * (.25 + .75 * r1.z * r1.z); }
    else gc += vec3(1., .97, .92) * exp(-dot(hs, hs) / .004) * 5.;
    col = mix(vec3(.018, .016, .022), gc, .7 + .3 * smoothstep(0., 1.2 / cs, gap));
    // 最亮的那几粒带星芒：粗一级的格子里每格挑一粒，正好对上灯时亮成一颗四角星
    float c2 = cs * 3.2;
    vec2 si = floor(px / c2);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 id = si + vec2(float(i), float(j));
      vec2 tl2 = (h32(id + uSeed + 5.3).xy - .5) * .9, hs2 = h - tl2 * hz;
      float I = exp(-dot(hs2, hs2) / .0035);
      if (I < .03) continue;
      vec3 r3 = h32(id + uSeed + 91.7);
      vec2 d = px - (id + .15 + .7 * r3.xy) * c2;
      float len = 2.5 + 8. * I;
      float rays = exp(-abs(d.y) * 1.5 - abs(d.x) / len) + exp(-abs(d.x) * 1.5 - abs(d.y) / len);
      col += mix(vec3(1., .98, .95), sat(spec(430. + 240. * r3.z), 1.6) * 1.5, .4) * I * (exp(-dot(d, d) * .35) * 2.5 + rays * .9);
    }
  } else if (uMat < 10.5) {
    // 点阵：每 2.4 个 CSS 像素一个小圆点，刻槽朝向绕着中心转成螺旋。灯在哪个方向，朝向对得上的点连成几条螺旋臂，灯一转，臂跟着转
    float pitch = 2.4;
    vec2 cp = q / pitch, ci = floor(cp), cq = (ci + .5) * pitch - uSize * .5;
    float a = atan(cq.y, cq.x) * 2. + length(cq) * .07 + (vn(ci * .09 + uSeed) - .5) * .5;
    float aa = .8 / (pitch * uDpr);
    float dm = 1. - smoothstep(.36 - aa, .36 + aa, length(fract(cp) - .5));
    col = vec3(.02, .019, .03) + metal * .04 + dm * (grating(h, vec2(cos(a), sin(a)), 1500., .3) * 2.4 + vec3(.03));
  } else if (uMat < 11.5) {
    // 碎冰：膜面裂成一块块碎片，每块的刻槽朝向、疏密和倾角都不一样，裂缝是一道道亮的银线
    vec2 gp = q / 15. + uSeed, ip = floor(gp), fp = fract(gp);
    float F1 = 9., F2 = 9.;
    vec2 id1 = ip;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 oc = vec2(float(i), float(j));
      vec2 dl = oc + .5 + .45 * (h32(ip + oc).xy - .5) * 2. - fp;
      float dd = dot(dl, dl);
      if (dd < F1) { F2 = F1; F1 = dd; id1 = ip + oc; } else if (dd < F2) F2 = dd;
    }
    vec3 r1 = h32(id1 + 9.1);
    vec2 tl = (h32(id1 + 2.3).xy - .5) * .35, hs = h - tl * hz;
    float a = r1.x * 6.2832;
    vec3 c = grating(hs, vec2(cos(a), sin(a)), 1300. + 500. * r1.y, .2) * (1.3 + .8 * r1.z);
    float crack = 1. - smoothstep(0., 1.3 / (15. * uDpr), sqrt(F2) - sqrt(F1));
    col = metal * (.32 + .25 * r1.z) + c;
    col = mix(col, metal * 1.3 + vec3(.06), crack * .75);
  } else if (uMat < 12.5) {
    // 光柱：一条条 7 像素宽的竖条，刻槽大体是竖的，每条的角度和疏密差一点，倾斜时彩虹一根根跳过去
    float w = 7., si = floor(q.x / w), fx = fract(q.x / w);
    vec3 r = h32(vec2(si, 3.) + uSeed);
    float a = (r.x - .5) * .9;
    vec3 c = grating(h, vec2(cos(a), sin(a)), 1300. + 500. * r.y, .5) * 1.6;
    float seam = smoothstep(0., .1, fx) * smoothstep(1., .9, fx);
    col = (metal * .45 + c) * (.6 + .4 * seam);
  } else if (uMat < 13.5) {
    // 波纹：刻槽是一圈圈偏心的涟漪，膜面跟着波峰波谷起伏，彩虹顺着波纹一圈圈流
    vec2 cq = q - uSize * vec2(.32, .38);
    float rr = length(cq);
    float ph = rr * .32 + 1.8 * sin(atan(cq.y, cq.x) * 3. + rr * .05);
    vec2 kr = cq / max(rr, 1e-3);
    vec2 hs = h - kr * cos(ph) * .3 * hz;
    col = metal * (.42 + .18 * sin(ph)) + grating(hs, kr, 1500., .4) * 1.3;
  }
  col = pow(aces(col), vec3(1. / 2.2));
  o = vec4(col + (h12(gl_FragCoord.xy) - .5) / 255., 1.);
}`;
    const vertexSource = "#version 300 es\nin vec2 aPosition;\nvoid main() { gl_Position = vec4(aPosition, 0.0, 1.0); }";
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.bindAttribLocation(this.program, 0, "aPosition");
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(this.program));
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(this.program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const spectrum = new Float32Array(256 * 4);
    for (let index = 0; index < 256; index += 1) {
      spectrum.set(PulseFoil.wavelength(380 + 400 * (index + 0.5) / 256), index * 4);
      spectrum[index * 4 + 3] = 1;
    }
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 256, 1, 0, gl.RGBA, gl.FLOAT, spectrum);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.uniforms = {};
    for (const name of ["uSpec", "uSize", "uOrigin", "uC", "uLight", "uDpr",
      "uTop", "uMat", "uK", "uSeed", "uLite", "uBase", "uRot"])
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    gl.uniform1i(this.uniforms.uSpec, 0);
    gl.uniform1f(this.uniforms.uBase, 1);
    gl.uniformMatrix3fv(this.uniforms.uRot, false, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
  }

  render(foil, time) {
    if (!this.gl || this.lost) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const jobs = this.items.map((item) => ({
      item,
      bounds: item.host.getBoundingClientRect(),
      width: item.host.offsetWidth,
      height: item.host.offsetHeight,
      pressed: item.host.classList.contains("pressed") || item.host.matches(":active"),
    })).filter(({ bounds }) => bounds.width && bounds.height &&
      bounds.bottom > 0 && bounds.top < innerHeight + 40);
    if (!jobs.length) return;
    const lightX = foil.enabled ? foil.x : innerWidth * 0.72;
    const lightY = foil.enabled ? foil.y : innerHeight * 0.22;
    const key = [lightX.toFixed(1), lightY.toFixed(1), ratio, ...jobs.map((job) =>
      [job.item.seed, job.bounds.left.toFixed(1), job.bounds.top.toFixed(1),
        job.width, job.height, job.pressed].join(","))].join("|");
    if (key === this.lastKey || time - this.lastFrame < 1000 / 45) return;
    this.lastKey = key;
    this.lastFrame = time;
    const gl = this.gl;
    const uniforms = this.uniforms;
    const maxWidth = Math.max(...jobs.map((job) => Math.round(job.width * ratio)));
    const maxHeight = Math.max(...jobs.map((job) => Math.round(job.height * ratio)));
    if (this.surface.width < maxWidth) this.surface.width = maxWidth;
    if (this.surface.height < maxHeight) this.surface.height = maxHeight;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1f(uniforms.uTop, this.surface.height);
    for (const { item, bounds, width, height, pressed } of jobs) {
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (item.canvas.width !== pixelWidth || item.canvas.height !== pixelHeight) {
        item.canvas.width = pixelWidth;
        item.canvas.height = pixelHeight;
      }
      gl.viewport(0, this.surface.height - pixelHeight, pixelWidth, pixelHeight);
      gl.uniform2f(uniforms.uSize, width, height);
      gl.uniform2f(uniforms.uOrigin, bounds.left + (bounds.width - width) / 2,
        bounds.top + (bounds.height - height) / 2);
      gl.uniform2f(uniforms.uC, 0.5, 0.5);
      gl.uniform3f(uniforms.uLight, lightX, lightY + (pressed ? 70 : 0), 540);
      gl.uniform1f(uniforms.uDpr, pixelWidth / width);
      gl.uniform1f(uniforms.uMat, item.material);
      gl.uniform1f(uniforms.uK, item.angle);
      gl.uniform1f(uniforms.uSeed, item.seed);
      gl.uniform1f(uniforms.uLite, item.light);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      item.context.clearRect(0, 0, pixelWidth, pixelHeight);
      item.context.drawImage(this.surface, 0, 0, pixelWidth, pixelHeight,
        0, 0, pixelWidth, pixelHeight);
      item.host.classList.add("pad-material-ready");
      item.host.dataset.materialRenderer = "webgl2";
    }
  }

  dispose() {
    if (!this.gl) return;
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteTexture(this.texture);
    this.gl.deleteProgram(this.program);
  }
}
window.PulsePadMaterials = PulsePadMaterials;
