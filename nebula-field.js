class PulseNebulaField {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.rotation = 0;
    this.lastTime = 0;
    this.idle = false;
    this.dirty = true;
    this.palette = [
      [245, 111, 174],
      [246, 171, 112],
      [238, 219, 146],
      [144, 218, 172],
      [120, 209, 226],
      [143, 164, 232],
      [190, 145, 231],
    ];
    this.colors = Array.from({ length: 21 }, (_, index) =>
      this.rainbow(index / 21),
    );
    this.groups = Array.from({ length: this.colors.length * 3 }, () => []);
    this.haze = this.makeHaze();
    let seed = 19;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let index = 0; index < 9000; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius =
        index % 5 === 0
          ? 0.3 + random() * 1.6
          : 1 + (random() + random() + random() - 1.5) * 0.26;
      const height = (random() + random() + random() - 1.5) * 0.16;
      const color = Math.min(
        this.colors.length - 1,
        Math.floor((angle / (Math.PI * 2)) * this.colors.length),
      );
      const group = color + Math.floor(random() * 3) * this.colors.length;
      this.groups[group].push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        height: height + Math.sin(angle * 3 + radius * 11) * 0.025,
        band: Math.min(47, Math.floor((angle / (Math.PI * 2)) * 48)),
        size: 0.3 + random() * 0.8,
      });
    }
  }

  rainbow(position) {
    const fraction = (position - Math.floor(position)) * this.palette.length;
    const index = Math.floor(fraction);
    const weight = fraction - index;
    const a = this.palette[index],
      b = this.palette[(index + 1) % this.palette.length];
    return a.map((channel, color) =>
      Math.round(channel + (b[color] - channel) * weight),
    );
  }

  makeHaze() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (x - size / 2) / (size / 2),
          dy = (y - size / 2) / (size / 2);
        const distance = Math.hypot(dx, dy);
        if (distance < 0.3 || distance > 1) continue;
        const color = this.rainbow(Math.atan2(dy, dx) / (Math.PI * 2));
        const alpha =
          Math.exp(-Math.pow((distance - 0.63) / 0.17, 2)) *
          Math.sin(distance * Math.PI);
        const index = (y * size + x) * 4;
        pixels.data.set([...color, Math.round(alpha * 90)], index);
      }
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }

  resize(width, height, ratio) {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.x = width * (width > 760 ? 2 / 3 : 0.5);
    this.y = height * 0.59;
    this.radius = width * (width > 760 ? 0.24 : 0.34);
    this.stride = width < 600 ? 3 : 1;
    this.dirty = true;
  }

  render(time, levels, enabled) {
    const elapsed = this.lastTime
      ? Math.max(0, Math.min(64, time - this.lastTime))
      : 0;
    this.lastTime = time;
    const energy = enabled ? levels.energy : 0;
    const active = energy > 0.001;
    if (!active && this.idle && !this.dirty) return;
    this.idle = !active;
    this.dirty = false;
    if (active) this.rotation += elapsed * 0.000012 * (0.2 + energy);
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    const radius = this.radius * (1 + (enabled ? levels.bass : 0) * 0.045);
    context.save();
    context.translate(this.x, this.y);
    context.scale(1, 0.42);
    context.globalAlpha = 0.14 + energy * 0.24;
    context.rotate(this.rotation);
    context.drawImage(
      this.haze,
      -radius * 1.6,
      -radius * 1.6,
      radius * 3.2,
      radius * 3.2,
    );
    context.restore();

    const cosine = Math.cos(this.rotation),
      sine = Math.sin(this.rotation);
    context.save();
    context.globalCompositeOperation = "screen";
    for (let groupIndex = 0; groupIndex < this.groups.length; groupIndex += 1) {
      const color = this.colors[groupIndex % this.colors.length];
      const opacity = 0.08 + Math.floor(groupIndex / this.colors.length) * 0.07;
      context.fillStyle = `rgb(${color.join(" ")})`;
      context.globalAlpha = opacity * (0.95 + energy * 1.8);
      context.beginPath();
      const group = this.groups[groupIndex];
      for (let index = 0; index < group.length; index += this.stride) {
        const point = group[index];
        const amplitude = active ? levels.bands[point.band] : 0;
        const x = point.x * cosine - point.z * sine;
        const z = point.x * sine + point.z * cosine;
        const perspective = 3.7 / (3.7 - z * 0.55);
        const height = (point.height + amplitude * 0.18) * radius;
        const screenX = this.x + x * radius * perspective;
        const screenY =
          this.y + (z * radius * 0.39 - height * 0.92) * perspective;
        const size = (0.45 + point.size * 0.7 + amplitude * 0.7) * perspective;
        context.rect(screenX, screenY, size, size);
      }
      context.fill();
    }
    context.restore();
  }
}
window.PulseNebulaField = PulseNebulaField;
