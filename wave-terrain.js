class PulseWaveTerrain {
  constructor(canvas, { immersive = false, simulation = null } = {}) {
    this.canvas = canvas;
    this.immersive = immersive;
    this.simulation = simulation || {
      time: 0, lastFrame: 0, lastWhite: -10, lastPurple: -10,
      energy: 0, bass: 0, bands: new Float32Array(48), waves: [], sequence: 0,
    };
    this.lastDraw = -Infinity;
    this.dirty = true;
    this.zeroBands = new Float32Array(48);
    this.gl = canvas.getContext("webgl2", {
      alpha: true, antialias: true, depth: true,
      premultipliedAlpha: true, preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (this.gl) {
      try {
        this.initializeGL();
      } catch (error) {
        console.warn("波纹地形启用兼容绘制。", error.message);
        const replacement = canvas.cloneNode(false);
        canvas.replaceWith(replacement);
        this.canvas = replacement;
        this.gl = null;
      }
    }
    if (!this.gl) this.context = this.canvas.getContext("2d");
    this.canvas.dataset.renderer = this.gl ? "webgl2" : "canvas";
    this.canvas.dataset.effect = "wave-terrain";
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.initializeGL();
      this.uploadGrid();
      this.lost = false;
      this.dirty = true;
    });
  }

  initializeGL() {
    const gl = this.gl;
    const projection = `
      vec4 projectWorld(vec3 world) {
        float yaw = 0.32, pitch = 0.57, cameraDistance = 4.4;
        float x = world.x * cos(yaw) - world.z * sin(yaw);
        float z = world.x * sin(yaw) + world.z * cos(yaw);
        float y = z * sin(pitch) - world.y * cos(pitch);
        float depth = cameraDistance - z * cos(pitch) - world.y * sin(pitch);
        float clipX = x * uScale * cameraDistance * 2.0 / uViewport.x
          + (uCenter.x / uViewport.x * 2.0 - 1.0) * depth;
        float clipY = -y * uScale * cameraDistance * 2.0 / uViewport.y
          + (1.0 - uCenter.y / uViewport.y * 2.0) * depth;
        return vec4(clipX, clipY, 1.0168067 * depth - 0.2016807, depth);
      }
    `;
    const vertexSource = `#version 300 es
      precision highp float;
      precision highp int;
      layout(location=0) in vec3 aPosition;
      layout(location=1) in vec3 aNormal;
      uniform sampler2D uField;
      uniform int uGrid;
      uniform vec2 uViewport, uCenter;
      uniform float uSpacing, uScale;
      out vec3 vColor;
      out vec3 vLocal;
      out float vTop, vFade;
      ${projection}

      void main() {
        ivec2 cell = ivec2(gl_InstanceID % uGrid, gl_InstanceID / uGrid);
        vec4 field = texelFetch(uField, cell, 0);
        vec2 center = (vec2(cell) + 0.5 - float(uGrid) * 0.5) * uSpacing;
        vec3 world = vec3(center.x + aPosition.x * uSpacing * 0.95,
          aPosition.y * field.r, center.y + aPosition.z * uSpacing * 0.95);
        gl_Position = projectWorld(world);

        float shade = 0.26 + 0.74 * max(dot(aNormal, normalize(vec3(-0.4, 1.0, 0.6))), 0.0);
        float grain = fract(sin(dot(vec2(cell), vec2(127.1, 311.7))) * 43758.5453);
        vec3 base = vec3(0.0007, 0.0009, 0.003) * (0.65 + grain * 0.65);
        vec3 purple = vec3(0.25, 0.025, 0.88) * field.g;
        vec3 white = vec3(0.85, 0.88, 1.0) * field.b;
        vec3 warm = vec3(1.0, 0.54, 0.44) * field.a;
        vTop = max(aNormal.y, 0.0);
        vColor = base * shade + (purple + white + warm) * (0.38 + vTop * 0.62) * shade;
        vLocal = aPosition;
        float radial = length(center);
        float island = exp(-radial * radial * 1.5) * 0.2;
        float activation = field.g * 1.15 + field.b + field.a * 1.2;
        vFade = (1.0 - smoothstep(1.05, 1.88, radial)) * clamp(island + activation, 0.0, 1.0);
      }
    `;
    const fragmentSource = `#version 300 es
      precision highp float;
      uniform float uGain;
      in vec3 vColor, vLocal;
      in float vTop, vFade;
      out vec4 outputColor;
      vec3 toneMap(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }
      void main() {
        if (vFade < 0.01) discard;
        float edge = smoothstep(0.43, 0.5, max(abs(vLocal.x), abs(vLocal.z))) * vTop;
        vec3 color = vColor + vec3(0.008, 0.007, 0.018) * edge;
        color = pow(toneMap(color * uGain), vec3(1.0 / 2.2));
        outputColor = vec4(color * vFade, vFade);
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
    const link = (vertexSource, fragmentSource) => {
      const vertex = compile(gl.VERTEX_SHADER, vertexSource);
      const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program));
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return program;
    };
    this.program = link(vertexSource, fragmentSource);
    this.glowProgram = link(`#version 300 es
      precision highp float;
      precision highp int;
      uniform sampler2D uField;
      uniform int uGrid;
      uniform vec2 uViewport, uCenter;
      uniform float uSpacing, uScale, uRatio;
      out vec3 vGlow;
      out float vStrength;
      ${projection}
      void main() {
        ivec2 cell = ivec2(gl_VertexID % uGrid, gl_VertexID / uGrid);
        vec4 field = texelFetch(uField, cell, 0);
        vec2 center = (vec2(cell) + 0.5 - float(uGrid) * 0.5) * uSpacing;
        float strength = max(field.g, max(field.b, field.a * 0.55));
        if (strength < 0.04) {
          gl_Position = vec4(2, 2, 2, 1);
          gl_PointSize = 1.0;
          vGlow = vec3(0);
          vStrength = 0.0;
          return;
        }
        gl_Position = projectWorld(vec3(center.x, field.r, center.y));
        gl_PointSize = clamp(uSpacing * uScale * 4.4 / gl_Position.w * 3.2 * uRatio, 1.0, 90.0);
        vGlow = vec3(0.34, 0.04, 1.0) * field.g + vec3(0.85, 0.88, 1.0) * field.b
          + vec3(1.0, 0.55, 0.43) * field.a * 0.5;
        vStrength = strength * (1.0 - smoothstep(1.05, 1.88, length(center)));
      }
    `, `#version 300 es
      precision highp float;
      uniform float uGain;
      in vec3 vGlow;
      in float vStrength;
      out vec4 outputColor;
      void main() {
        float radius = length(gl_PointCoord * 2.0 - 1.0);
        float alpha = exp(-radius * radius * 4.5) * (1.0 - smoothstep(0.75, 1.0, radius));
        alpha *= vStrength * 0.025 * uGain;
        outputColor = vec4(min(vGlow, vec3(1)) * alpha, alpha);
      }
    `);

    const faces = [
      { normal: [0, 1, 0], corners: [[-0.5,1,-0.5],[0.5,1,-0.5],[0.5,1,0.5],[-0.5,1,0.5]] },
      { normal: [0, 0, 1], corners: [[-0.5,0,0.5],[0.5,0,0.5],[0.5,1,0.5],[-0.5,1,0.5]] },
      { normal: [1, 0, 0], corners: [[0.5,0,0.5],[0.5,0,-0.5],[0.5,1,-0.5],[0.5,1,0.5]] },
      { normal: [-1, 0, 0], corners: [[-0.5,0,-0.5],[-0.5,0,0.5],[-0.5,1,0.5],[-0.5,1,-0.5]] },
      { normal: [0, 0, -1], corners: [[0.5,0,-0.5],[-0.5,0,-0.5],[-0.5,1,-0.5],[0.5,1,-0.5]] },
      { normal: [0, -1, 0], corners: [[-0.5,0,-0.5],[0.5,0,-0.5],[0.5,0,0.5],[-0.5,0,0.5]] },
    ];
    const vertices = [], indices = [];
    faces.forEach((face, index) => {
      for (const corner of face.corners) vertices.push(...corner, ...face.normal);
      const offset = index * 4;
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    });
    this.vertexArray = gl.createVertexArray();
    gl.bindVertexArray(this.vertexArray);
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.uniforms = {};
    for (const name of ["uField", "uGrid", "uViewport", "uCenter", "uSpacing", "uScale", "uGain"])
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    this.glowUniforms = {};
    for (const name of ["uField", "uGrid", "uViewport", "uCenter", "uSpacing", "uScale", "uGain", "uRatio"])
      this.glowUniforms[name] = gl.getUniformLocation(this.glowProgram, name);
    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.uField, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
  }

  makeGrid(size) {
    this.gridSize = size;
    this.spacing = 3.8 / size;
    this.field = new Float32Array(size * size * 4);
    this.cells = [];
    let seed = 2164;
    const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const x = (column + 0.5 - size / 2) * this.spacing;
        const z = (row + 0.5 - size / 2) * this.spacing;
        const radiusSquared = x * x + z * z;
        const grain = random();
        const spikeSeed = random();
        this.cells.push({
          x, z, grain,
          core: Math.exp(-radiusSquared / 0.12),
          spread: Math.exp(-radiusSquared * 0.8),
          spike: spikeSeed > 0.986 ? 0.07 + random() * 0.24 : 0,
          band: Math.min(47, Math.floor(((Math.atan2(z, x) / (Math.PI * 2) + 1) % 1) * 48)),
        });
      }
    }
    if (!this.gl) {
      this.drawOrder = this.cells.map((_, index) => index).sort((a, b) =>
        (this.cells[a].x - this.cells[b].x) * Math.sin(0.32) +
        (this.cells[a].z - this.cells[b].z) * Math.cos(0.32));
    }
    this.uploadGrid();
  }

  uploadGrid() {
    if (!this.gl || !this.field) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.gridSize, this.gridSize,
      0, gl.RGBA, gl.FLOAT, this.field);
  }

  resize(width, height, ratio) {
    this.width = width;
    this.height = height;
    this.ratio = Math.min(ratio, width < 600 ? 1.25 : 1.5);
    this.canvas.width = Math.round(width * this.ratio);
    this.canvas.height = Math.round(height * this.ratio);
    this.x = width * (this.immersive || width <= 760 ? 0.5 : 2 / 3);
    this.y = height * (this.immersive ? 0.57 : 0.67);
    this.scale = Math.min(width * (width <= 760 ? 0.65 : 0.3), height * 0.66);
    this.interval = 1000 / (width < 600 ? 30 : 40);
    const size = this.gl ? (width < 600 ? 88 : width < 1200 ? 120 : 144) : 48;
    if (size !== this.gridSize) this.makeGrid(size);
    if (this.context) this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    this.dirty = true;
  }

  addWave(white, impact) {
    const state = this.simulation;
    const centers = [[-0.48,0.2],[0.36,-0.34],[-0.18,0.46],[0.46,0.3],[-0.38,-0.4],[0.06,0.04]];
    const center = centers[state.sequence++ % centers.length];
    state.waves.push({
      x: center[0], z: center[1], start: state.time, white,
      impact: Math.max(0.25, Math.min(1, impact)),
      speed: white ? 0.94 : 0.78,
      lifetime: white ? 2.7 : 3.1,
    });
    if (state.waves.length > 8) state.waves.shift();
  }

  advance(time, levels, enabled) {
    const state = this.simulation;
    if (state.lastFrame === time) return;
    const elapsed = state.lastFrame ? Math.min(64, Math.max(0, time - state.lastFrame)) / 1000 : 0;
    state.lastFrame = time;
    if (!enabled) {
      state.waves.length = 0;
      state.energy = state.bass = 0;
      state.bands.fill(0);
      return;
    }
    state.time += elapsed;
    state.waves = state.waves.filter((wave) => state.time - wave.start < wave.lifetime);
    let flux = 0;
    for (let index = 0; index < 48; index += 1) {
      flux += Math.max(0, levels.bands[index] - state.bands[index]) / 48;
      state.bands[index] = levels.bands[index];
    }
    const bassRise = Math.max(0, levels.bass - state.bass);
    const energyRise = Math.max(0, levels.energy - state.energy);
    const visualEnergy = Math.sqrt(levels.energy);
    const impact = Math.max(bassRise * 5, energyRise * 4, flux * 18, visualEnergy * 0.8);
    const whiteCadence = 0.65 + (1 - visualEnergy) * 0.95;
    const purpleCadence = 0.5 + (1 - visualEnergy) * 0.75;
    if (levels.energy > 0.06 && (bassRise > 0.045 || energyRise > 0.08 || flux > 0.027
      || state.time - state.lastWhite > whiteCadence)
      && state.time - state.lastWhite > 0.24) {
      this.addWave(true, impact);
      state.lastWhite = state.time;
    }
    if (levels.energy > 0.05 && (flux > 0.012 || state.time - state.lastPurple > purpleCadence)
      && state.time - state.lastPurple > 0.38) {
      this.addWave(false, impact * 0.85);
      state.lastPurple = state.time;
    }
    state.energy = levels.energy;
    state.bass = levels.bass;
  }

  updateField(levels, enabled) {
    const energy = enabled ? Math.sqrt(levels.energy) : 0;
    const bass = enabled ? Math.sqrt(levels.bass) : 0;
    const bands = enabled ? levels.bands : this.zeroBands;
    const waves = this.simulation.waves;
    for (let index = 0; index < this.cells.length; index += 1) {
      const cell = this.cells[index];
      const amplitude = bands[cell.band];
      let height = 0.005 + cell.grain * 0.012;
      height += cell.core * (0.015 + bass * 0.12 + energy * 0.045) * (0.25 + cell.grain * 1.35);
      height += cell.spike * 1.7 * (0.1 + amplitude * 0.9) * (0.15 + energy * 0.85) * cell.spread;
      height += amplitude * cell.grain * 0.024 * cell.spread;
      let purple = 0.012 * cell.spread;
      let white = 0;
      for (const wave of waves) {
        const age = this.simulation.time - wave.start;
        const dx = cell.x - wave.x, dz = cell.z - wave.z;
        const radius = 0.035 + age * wave.speed;
        const width = 0.045 + age * 0.014;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const delta = (distance - radius) / width;
        const strength = Math.exp(-delta * delta) * Math.exp(-age * 1.05) * wave.impact;
        height += strength * (wave.white ? 0.14 : 0.12) * (0.55 + cell.grain * 0.8);
        if (wave.white) white += strength * 1.3;
        else purple += strength * 1.9;
      }
      const offset = index * 4;
      this.field[offset] = height;
      this.field[offset + 1] = purple;
      this.field[offset + 2] = white;
      this.field[offset + 3] = cell.core * (0.005 + energy * 0.65 + bass * 0.36) * (0.55 + cell.grain * 0.7);
    }
  }

  render(time, levels, enabled) {
    if (this.lost) return;
    this.advance(time, levels, enabled);
    const active = enabled && (levels.energy > 0.001 || this.simulation.waves.length > 0);
    if (enabled !== this.lastEnabled) this.dirty = true;
    this.lastEnabled = enabled;
    if (!this.dirty && (time - this.lastDraw < this.interval || (!active && this.idle))) return;
    this.lastDraw = time;
    this.idle = !active;
    this.dirty = false;
    this.updateField(levels, enabled);
    if (!this.gl) {
      this.drawFallback();
      return;
    }
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gridSize, this.gridSize, gl.RGBA, gl.FLOAT, this.field);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(null);
    this.useFieldProgram(this.glowProgram, this.glowUniforms);
    gl.uniform1f(this.glowUniforms.uRatio, this.ratio);
    gl.drawArrays(gl.POINTS, 0, this.cells.length);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vertexArray);
    this.useFieldProgram(this.program, this.uniforms);
    gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, this.cells.length);
  }

  useFieldProgram(program, uniforms) {
    const gl = this.gl;
    gl.useProgram(program);
    gl.uniform1i(uniforms.uField, 0);
    gl.uniform1i(uniforms.uGrid, this.gridSize);
    gl.uniform2f(uniforms.uViewport, this.width, this.height);
    gl.uniform2f(uniforms.uCenter, this.x, this.y);
    gl.uniform1f(uniforms.uSpacing, this.spacing);
    gl.uniform1f(uniforms.uScale, this.scale);
    gl.uniform1f(uniforms.uGain, this.immersive ? 1 : 0.55);
  }

  project(x, y, z) {
    const horizontal = x * Math.cos(0.32) - z * Math.sin(0.32);
    const forward = x * Math.sin(0.32) + z * Math.cos(0.32);
    const depth = 4.4 - forward * Math.cos(0.57) - y * Math.sin(0.57);
    const factor = this.scale * 4.4 / depth;
    return [this.x + horizontal * factor, this.y + (forward * Math.sin(0.57) - y * Math.cos(0.57)) * factor];
  }

  drawFallback() {
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    const half = this.spacing * 0.475;
    for (const index of this.drawOrder) {
      const cell = this.cells[index], offset = index * 4;
      const height = this.field[offset];
      const purple = this.field[offset + 1], white = this.field[offset + 2], warm = this.field[offset + 3];
      const radiusSquared = cell.x * cell.x + cell.z * cell.z;
      const island = Math.exp(-radiusSquared * 1.5) * 0.2;
      const activation = Math.min(1, island + purple * 1.15 + white + warm * 1.2);
      const fade = Math.max(0, Math.min(1, (1.88 - Math.sqrt(radiusSquared)) / 0.83)) * activation;
      if (fade < 0.02) continue;
      const color = [3 + purple * 95 + white * 240 + warm * 235,
        3 + purple * 10 + white * 240 + warm * 135,
        8 + purple * 235 + white * 250 + warm * 110];
      const top = [[-half,-half],[half,-half],[half,half],[-half,half]]
        .map(([x,z]) => this.project(cell.x + x, height, cell.z + z));
      const frontLeft = this.project(cell.x - half, 0, cell.z + half);
      const frontRight = this.project(cell.x + half, 0, cell.z + half);
      const backRight = this.project(cell.x + half, 0, cell.z - half);
      const faces = [[top[3],top[2],frontRight,frontLeft], [top[2],top[1],backRight,frontRight], top];
      faces.forEach((points, face) => {
        const shade = face === 2 ? 1 : face === 0 ? 0.55 : 0.38;
        context.fillStyle = `rgba(${color.map(value => Math.min(255, Math.round(value * shade))).join(",")},${fade})`;
        context.beginPath();
        points.forEach(([x,y], point) => point ? context.lineTo(x,y) : context.moveTo(x,y));
        context.closePath();
        context.fill();
      });
    }
  }

  dispose() {
    if (!this.gl) return;
    this.gl.deleteTexture(this.texture);
    this.gl.deleteBuffer(this.vertexBuffer);
    this.gl.deleteBuffer(this.indexBuffer);
    this.gl.deleteVertexArray(this.vertexArray);
    this.gl.deleteProgram(this.program);
    this.gl.deleteProgram(this.glowProgram);
  }
}
window.PulseWaveTerrain = PulseWaveTerrain;
