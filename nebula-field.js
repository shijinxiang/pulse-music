class PulseNebulaField {
  constructor(canvas, { immersive = false, motion = null } = {}) {
    this.canvas = canvas;
    this.immersive = immersive;
    this.motion = motion || { time: 0, lastFrame: 0 };
    this.lastDraw = -Infinity;
    this.dirty = true;
    this.zeroBands = new Float32Array(48);
    this.points = this.makePoints(90000);
    this.gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (this.gl) {
      try {
        this.initializeGL();
      } catch (error) {
        console.warn("粒子云启用兼容绘制。", error.message);
        const replacement = canvas.cloneNode(false);
        canvas.replaceWith(replacement);
        this.canvas = replacement;
        this.gl = null;
      }
    }
    if (!this.gl) this.context = this.canvas.getContext("2d");
    this.canvas.dataset.renderer = this.gl ? "webgl" : "canvas";
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.initializeGL();
      this.lost = false;
      this.dirty = true;
    });
  }

  makePoints(count) {
    const points = new Float32Array(count * 6);
    let seed = 374;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let index = 0; index < count; index += 1) {
      // Interleave the torus, surrounding ground and inner plumes at every quality level.
      const layer = index % 100;
      const kind = layer < 66 ? 0 : layer < 84 ? 1 : 0.5;
      const spread = random() + random() + random() - 1.5;
      let radius = 0.73 + spread * 0.18;
      if (kind === 1) radius = 0.3 + Math.sqrt(random()) * 1.3;
      if (kind === 0.5) radius = Math.sqrt(random()) * 0.72;
      points.set([
        random() * Math.PI * 2,
        radius,
        (random() + random() - 1) * 0.045,
        random(),
        0.35 + random() * 1.2,
        kind,
      ], index * 6);
    }
    return points;
  }

  initializeGL() {
    const gl = this.gl;
    const vertexSource = `
      precision highp float;
      attribute vec4 aData;
      attribute vec2 aDetails;
      uniform vec2 uViewport, uCenter;
      uniform float uScale, uRatio, uTime, uEnergy, uBass, uVolume, uGain;
      uniform float uBands[48];
      varying vec3 vColor;
      varying float vAlpha;

      float hash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float cloudNoise(vec3 p) {
        return noise(p) * 0.57 + noise(p * 2.07 + 11.3) * 0.28
          + noise(p * 4.17 + 23.1) * 0.15;
      }
      void main() {
        float plane = step(0.9, aDetails.y);
        float inside = step(0.3, aDetails.y) * (1.0 - plane);
        int band = int(floor(aData.x / 6.2831853 * 47.999));
        float amplitude = uBands[band];
        float angle = aData.x + uTime * (0.12 + 0.025 / (aData.y + 0.3));
        float radius = aData.y * (1.0 - uBass * 0.09 * (1.0 - plane));
        radius += sin(angle * 3.0 - uTime * 0.24) * 0.014;
        vec2 orbit = vec2(cos(angle), sin(angle)) * radius;
        float cloud = cloudNoise(vec3(orbit * 5.8, uTime * 0.19 + aData.w * 0.2));
        float detail = noise(vec3(orbit * 23.0, uTime * 0.12));
        float filament = smoothstep(0.27, 0.72, cloud);
        orbit += vec2(sin(angle * 5.0 + cloud * 6.0), cos(angle * 4.0 - cloud * 5.0))
          * (cloud - 0.4) * 0.055;
        orbit *= 1.0 - inside * uBass * 0.28;
        float elevation = aData.z + (cloud - 0.4) * 0.13;
        elevation += amplitude * (0.055 + filament * 0.11) * (1.0 - plane * 0.75);
        elevation += sin(angle * 4.0 + uTime * 0.3) * 0.012;
        elevation += inside * uBass * 0.12;
        elevation *= 1.0 - plane * 0.65;
        float perspective = 3.6 / (3.6 - orbit.y * 0.68 + elevation * 0.1);
        vec2 projected = vec2(orbit.x, orbit.y * 0.43 - elevation * 0.94) * perspective;
        vec2 pixel = uCenter + projected * uScale;
        gl_Position = vec4(pixel.x / uViewport.x * 2.0 - 1.0,
          1.0 - pixel.y / uViewport.y * 2.0, 0.0, 1.0);
        float size = (0.75 + aDetails.x * 0.9 + amplitude * 0.7) * perspective;
        float resolutionScale = clamp(uScale / 720.0, 0.65, 1.8);
        gl_PointSize = size * uRatio * resolutionScale * mix(1.0, 12.0, uVolume);

        vec3 shadow = vec3(0.11, 0.17, 0.35);
        vec3 violet = vec3(0.40, 0.25, 0.76);
        vec3 color = mix(shadow, violet, filament);
        vec3 spectrum = 0.55 + 0.45 * cos(angle + vec3(0.1, 2.2, 4.3));
        color = mix(color, spectrum, 0.12 * filament);
        color += vec3(0.27, 0.30, 0.42) * pow(detail, 5.0) * (0.3 + amplitude);
        float radialFade = 1.0 - smoothstep(1.0, 1.65, radius);
        float clump = 0.15 + filament * 0.85;
        float alpha = (0.12 + uEnergy * 0.12) * clump * radialFade;
        alpha *= mix(1.0, 0.28, plane);
        alpha *= mix(1.0, 0.12 + uBass * 1.5, inside);
        alpha *= mix(1.0, 0.07, uVolume);
        vColor = color;
        vAlpha = alpha * uGain;
      }
    `;
    const fragmentSource = `
      precision highp float;
      uniform float uVolume;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float radius = length(gl_PointCoord * 2.0 - 1.0);
        float falloff = exp(-radius * radius * mix(5.8, 3.2, uVolume));
        falloff *= 1.0 - smoothstep(0.74, 1.0, radius);
        float alpha = vAlpha * falloff;
        gl_FragColor = vec4(vColor * alpha, alpha);
      }
    `;
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
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(this.program));
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.points, gl.STATIC_DRAW);
    this.attributes = {
      data: gl.getAttribLocation(this.program, "aData"),
      details: gl.getAttribLocation(this.program, "aDetails"),
    };
    this.uniforms = {};
    for (const name of ["uViewport", "uCenter", "uScale", "uRatio", "uTime",
      "uEnergy", "uBass", "uVolume", "uGain", "uBands"])
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
  }

  resize(width, height, ratio) {
    this.width = width;
    this.height = height;
    this.ratio = Math.min(ratio, width < 600 ? 1.25 : 1.5);
    this.canvas.width = Math.round(width * this.ratio);
    this.canvas.height = Math.round(height * this.ratio);
    this.x = width * (this.immersive || width <= 760 ? 0.5 : 2 / 3);
    this.y = height * (this.immersive ? 0.46 : 0.59);
    this.scale = Math.min(width * (width <= 760 ? 0.7 : 0.5), height * 0.9);
    this.drawCount = width < 600 ? 40000 : 90000;
    this.volumeCount = width < 600 ? 9000 : 18000;
    this.interval = 1000 / (width < 600 ? 30 : 45);
    if (this.context) this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    this.dirty = true;
  }

  render(time, levels, enabled) {
    if (this.lost) return;
    const elapsed = this.motion.lastFrame
      ? Math.max(0, Math.min(64, time - this.motion.lastFrame)) : 0;
    this.motion.lastFrame = time;
    const energy = enabled ? levels.energy : 0;
    if (energy > 0.001) this.motion.time += elapsed * 0.001 * (0.25 + energy * 1.2);
    if (!this.dirty && time - this.lastDraw < this.interval) return;
    if (!this.dirty && energy < 0.001 && this.idle) return;
    this.lastDraw = time;
    this.idle = energy < 0.001;
    this.dirty = false;
    const bands = enabled ? levels.bands : this.zeroBands;
    const bass = enabled ? levels.bass : 0;
    if (!this.gl) {
      this.drawFallback(bands, bass, energy);
      return;
    }
    const gl = this.gl;
    const uniforms = this.uniforms;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.attributes.data);
    gl.vertexAttribPointer(this.attributes.data, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.attributes.details);
    gl.vertexAttribPointer(this.attributes.details, 2, gl.FLOAT, false, 24, 16);
    gl.uniform2f(uniforms.uViewport, this.width, this.height);
    gl.uniform2f(uniforms.uCenter, this.x, this.y);
    gl.uniform1f(uniforms.uScale, this.scale);
    gl.uniform1f(uniforms.uRatio, this.ratio);
    gl.uniform1f(uniforms.uTime, this.motion.time);
    gl.uniform1f(uniforms.uEnergy, energy);
    gl.uniform1f(uniforms.uBass, bass);
    gl.uniform1f(uniforms.uGain, this.immersive ? 3.2 : 2.6);
    gl.uniform1fv(uniforms.uBands, bands);
    gl.uniform1f(uniforms.uVolume, 1);
    gl.drawArrays(gl.POINTS, 0, this.volumeCount);
    gl.uniform1f(uniforms.uVolume, 0);
    gl.drawArrays(gl.POINTS, 0, this.drawCount);
  }

  drawFallback(bands, bass, energy) {
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    context.save();
    context.globalCompositeOperation = "lighter";
    for (let index = 0; index < 9000; index += 1) {
      const offset = index * 6;
      const angle = this.points[offset] + this.motion.time * 0.14;
      const radius = this.points[offset + 1] * (1 - bass * 0.09);
      const band = Math.min(47, Math.floor(this.points[offset] / (Math.PI * 2) * 48));
      const amplitude = bands[band];
      const cloud = Math.sin(angle * 5 + this.motion.time * 0.2) *
        Math.cos(radius * 16 - this.motion.time * 0.3) * 0.5 + 0.5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const perspective = 3.6 / (3.6 - z * 0.68);
      const elevation = this.points[offset + 2] + cloud * 0.07 + amplitude * 0.1;
      const alpha = (0.07 + energy * 0.07) * (0.2 + cloud * 0.8);
      context.fillStyle = `rgba(121,91,200,${alpha})`;
      context.fillRect(this.x + x * this.scale * perspective,
        this.y + (z * 0.43 - elevation * 0.94) * this.scale * perspective,
        1.2 * perspective, 1.2 * perspective);
    }
    context.restore();
  }

  dispose() {
    if (!this.gl) return;
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}
window.PulseNebulaField = PulseNebulaField;
