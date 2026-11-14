class PulseHeroScene {
  constructor(canvas, image) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.image = image;
    this.container = canvas.parentElement;
    this.photo = document.createElement("canvas");
    this.metal = document.createElement("canvas");
    this.surface = document.createElement("canvas");
    this.width = 0;
    this.height = 0;
    this.ratio = 1;
    this.phase = 0;
    this.lastTime = 0;
    this.lastEnabled = null;
    this.needsFrame = true;
    this.ready = false;
    this.parallax = { x: 0, y: 0 };
    this.camera = { x: 0, y: 0 };
    this.colors = [
      [255, 108, 159],
      [255, 171, 103],
      [255, 229, 143],
      [143, 237, 170],
      [112, 223, 243],
      [135, 167, 255],
      [199, 151, 255],
    ];
    this.cloudRing = this.makeCloudRing(this.makeCloudTexture());
    this.cloudMist = this.makeCloudMist(this.cloudRing);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.container);
    image.addEventListener("load", () => this.resize());
    if (image.complete && image.naturalWidth) this.resize();
  }

  makeCloudTexture() {
    const width = 1024;
    const height = 160;
    let seed = 41;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const grids = [8, 16, 32, 64, 128].map((columns, octave) => {
      const rows = 4 * Math.pow(2, octave);
      const data = new Float32Array(columns * rows);
      for (let index = 0; index < data.length; index += 1)
        data[index] = random();
      return { columns, rows, data };
    });
    const sample = (grid, u, v) => {
      const x = (u - Math.floor(u)) * grid.columns;
      const y = (v - Math.floor(v)) * grid.rows;
      const left = Math.floor(x),
        top = Math.floor(y);
      const right = (left + 1) % grid.columns,
        bottom = (top + 1) % grid.rows;
      const dx = x - left,
        dy = y - top;
      const fx = dx * dx * (3 - 2 * dx),
        fy = dy * dy * (3 - 2 * dy);
      const a = grid.data[top * grid.columns + left];
      const b = grid.data[top * grid.columns + right];
      const c = grid.data[bottom * grid.columns + left];
      const d = grid.data[bottom * grid.columns + right];
      return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    };
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(width, height);
    const weights = [0.43, 0.27, 0.16, 0.09, 0.05];
    for (let y = 0; y < height; y += 1) {
      const v = y / (height - 1);
      const edge = Math.pow(Math.sin(Math.PI * v), 2);
      for (let x = 0; x < width; x += 1) {
        const u = x / width;
        const warpU = u + (sample(grids[0], u, v) - 0.5) * 0.08;
        const warpV = v + (sample(grids[1], u, v) - 0.5) * 0.22;
        let noise = 0;
        for (let octave = 0; octave < grids.length; octave += 1)
          noise += sample(grids[octave], warpU, warpV) * weights[octave];
        const center = 0.5 + Math.sin(u * Math.PI * 4) * 0.07;
        const envelope = Math.exp(-Math.pow((v - center) * 3, 2));
        const density = Math.pow(
          Math.max(0, Math.min(1, (noise - 0.34) * 2.4)),
          1.35,
        );
        const colorIndex = u * this.colors.length;
        const first = Math.floor(colorIndex);
        const fraction = colorIndex - first;
        const blend = fraction * fraction * (3 - 2 * fraction);
        const a = this.colors[first],
          b = this.colors[(first + 1) % this.colors.length];
        const index = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1)
          pixels.data[index + channel] =
            a[channel] + (b[channel] - a[channel]) * blend;
        pixels.data[index + 3] = Math.round(
          Math.min(0.78, density * envelope * edge * 1.75) * 255,
        );
      }
    }
    context.putImageData(pixels, 0, 0);
    context.putImageData(pixels, width, 0);
    return canvas;
  }

  resize() {
    if (!this.image.naturalWidth) return;
    const rectangle = this.container.getBoundingClientRect();
    if (!rectangle.width || !rectangle.height) return;
    this.width = rectangle.width;
    this.height = rectangle.height;
    this.ratio = Math.min(devicePixelRatio || 1, 1.5);
    for (const canvas of [this.canvas, this.photo, this.metal, this.surface]) {
      canvas.width = Math.round(this.width * this.ratio);
      canvas.height = Math.round(this.height * this.ratio);
    }
    this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    const scale = Math.min(
      (this.width * (innerWidth > 760 ? 0.7 : 1)) / this.image.naturalWidth,
      this.height / this.image.naturalHeight,
    );
    const width = this.image.naturalWidth * scale;
    const height = this.image.naturalHeight * scale;
    this.photoRect = {
      x: this.width * (innerWidth > 760 ? 0.68 : 0.5) - width / 2,
      y: (this.height - height) / 2,
      width,
      height,
    };
    const photoContext = this.photo.getContext("2d");
    photoContext.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    photoContext.drawImage(
      this.image,
      this.photoRect.x,
      this.photoRect.y,
      width,
      height,
    );

    // A display-time luminance mask keeps the refracted light on the chrome.
    const metalContext = this.metal.getContext("2d", {
      willReadFrequently: true,
    });
    metalContext.drawImage(this.photo, 0, 0);
    const pixels = metalContext.getImageData(
      0,
      0,
      this.metal.width,
      this.metal.height,
    );
    for (let index = 0; index < pixels.data.length; index += 4) {
      const brightness =
        (pixels.data[index] * 0.2126 +
          pixels.data[index + 1] * 0.7152 +
          pixels.data[index + 2] * 0.0722) /
        255;
      const reflectivity = Math.max(0, Math.min(1, (brightness - 0.08) / 0.72));
      pixels.data[index + 3] = Math.round(
        pixels.data[index + 3] * reflectivity,
      );
    }
    metalContext.putImageData(pixels, 0, 0);
    this.ready = true;
    this.needsFrame = true;
    this.container.classList.add("hero-scene-ready");
  }

  setParallax(x, y) {
    if (this.parallax.x === x * 9 && this.parallax.y === y * 7) return;
    this.parallax.x = x * 9;
    this.parallax.y = y * 7;
    this.needsFrame = true;
  }

  makeCloudRing(texture) {
    const size = 1024;
    const radius = 360;
    const band = 250;
    const source = texture
      .getContext("2d")
      .getImageData(0, 0, texture.width, texture.height);
    const period = texture.width / 2;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x - size / 2,
          dy = y - size / 2;
        const distance = Math.hypot(dx, dy);
        const v = 0.5 + (distance - radius) / band;
        if (v <= 0 || v >= 1) continue;
        const u = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
        const sx = Math.min(period - 1, Math.floor(u * period));
        const sy = Math.min(texture.height - 1, Math.floor(v * texture.height));
        const sourceIndex = (sy * texture.width + sx) * 4;
        const destination = (y * size + x) * 4;
        pixels.data[destination] = source.data[sourceIndex];
        pixels.data[destination + 1] = source.data[sourceIndex + 1];
        pixels.data[destination + 2] = source.data[sourceIndex + 2];
        pixels.data[destination + 3] = source.data[sourceIndex + 3];
      }
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }

  makeCloudMist(texture) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1024;
    const context = canvas.getContext("2d");
    context.filter = "blur(14px)";
    context.drawImage(texture, 0, 0);
    return canvas;
  }

  drawOrbit(front, energy) {
    const desktop = innerWidth > 760;
    const radiusX = this.width * (desktop ? 0.39 : 0.37);
    const radiusY = this.photoRect.height * 0.28;
    const rotation = 0.17 + Math.sin(this.phase * 0.5) * 0.045;
    const layers = [
      { offset: -8, scale: 1.03, opacity: 0.17, texture: this.cloudMist },
      { offset: 0, scale: 1, opacity: 0.3, texture: this.cloudRing },
      { offset: 8, scale: 0.98, opacity: 0.15, texture: this.cloudMist },
    ];
    const context = this.context;
    for (const layer of layers) {
      context.save();
      context.globalCompositeOperation = "screen";
      context.globalAlpha = layer.opacity * (1 + energy * 0.12);
      context.translate(this.width * (desktop ? 0.56 : 0.5), this.height * 0.55 + layer.offset);
      context.rotate(rotation);
      context.scale(
        (radiusX / 360) * layer.scale,
        (radiusY / 360) * layer.scale,
      );
      context.beginPath();
      context.rect(-600, front ? 0 : -600, 1200, 600);
      context.clip();
      context.rotate(-this.phase + layer.offset * 0.008);
      context.drawImage(layer.texture, -512, -512);
      context.restore();
    }
  }

  drawRefraction(energy) {
    const context = this.surface.getContext("2d");
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, this.width, this.height);
    const center = this.width * (0.5 + Math.sin(this.phase * 1.3) * 0.32);
    const bandWidth = Math.max(75, this.width * 0.2);
    for (let row = 0; row < this.height; row += 12) {
      const sourceY = Math.round(row * this.ratio);
      const sourceHeight = Math.min(
        Math.round(12 * this.ratio),
        this.photo.height - sourceY,
      );
      if (sourceHeight <= 0) break;
      const offset =
        Math.sin(row * 0.035 + this.phase * 2) * (1.1 + energy * 1.5);
      context.drawImage(
        this.photo,
        0,
        sourceY,
        this.photo.width,
        sourceHeight,
        offset,
        row,
        this.width,
        sourceHeight / this.ratio,
      );
    }
    const spectrum = context.createLinearGradient(
      center - bandWidth,
      0,
      center + bandWidth,
      this.height,
    );
    spectrum.addColorStop(0, "transparent");
    for (let index = 0; index < 7; index += 1) {
      spectrum.addColorStop(
        0.18 + index * 0.105,
        `rgba(${this.colors[index].join(",")},0.26)`,
      );
    }
    spectrum.addColorStop(1, "transparent");
    context.globalCompositeOperation = "source-atop";
    context.fillStyle = spectrum;
    context.fillRect(0, 0, this.width, this.height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(this.metal, 0, 0, this.width, this.height);
    const mask = context.createLinearGradient(
      center - bandWidth,
      0,
      center + bandWidth,
      this.height,
    );
    mask.addColorStop(0, "transparent");
    mask.addColorStop(0.42, "rgba(255,255,255,0.22)");
    mask.addColorStop(0.5, "rgba(255,255,255,0.42)");
    mask.addColorStop(0.58, "rgba(255,255,255,0.22)");
    mask.addColorStop(1, "transparent");
    context.fillStyle = mask;
    context.fillRect(0, 0, this.width, this.height);
    context.globalCompositeOperation = "source-over";
    this.context.drawImage(this.surface, 0, 0, this.width, this.height);
  }

  render(time, levels, enabled) {
    if (!this.ready) return;
    const elapsed = this.lastTime
      ? Math.max(0, Math.min(64, time - this.lastTime))
      : 0;
    this.lastTime = time;
    if (!enabled && this.lastEnabled === false && !this.needsFrame) return;
    this.lastEnabled = enabled;
    this.needsFrame = false;
    if (enabled)
      this.phase =
        (this.phase + (elapsed / 60000) * Math.PI * 2) % (Math.PI * 4);
    const response = 1 - Math.exp(-elapsed / 130);
    this.camera.x += (this.parallax.x - this.camera.x) * response;
    this.camera.y += (this.parallax.y - this.camera.y) * response;
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    context.save();
    context.translate(enabled ? this.camera.x : 0, enabled ? this.camera.y : 0);
    if (enabled) this.drawOrbit(false, levels.energy);
    context.drawImage(this.photo, 0, 0, this.width, this.height);
    if (enabled) {
      this.drawRefraction(levels.energy);
      this.drawOrbit(true, levels.energy);
    }
    context.restore();
  }
}
window.PulseHeroScene = PulseHeroScene;
