class PulseNebulaField {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.playhead = 0;
    this.lastTime = 0;
    this.frameIndex = -1;
    this.lastDraw = "";
    this.frame = document.createElement("canvas");
    this.frame.width = this.frame.height = 224;
    this.frameContext = this.frame.getContext("2d");
    this.edgeMask = this.makeEdgeMask();
    this.atlas = new Image();
    this.atlas.addEventListener("load", () => {
      this.ready = true;
      this.lastDraw = "";
    });
    this.atlas.src = "assets/nebula-reference-atlas.webp";
  }

  makeEdgeMask() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 224;
    const context = canvas.getContext("2d");
    const horizontal = context.createLinearGradient(0, 0, 224, 0);
    horizontal.addColorStop(0, "transparent");
    horizontal.addColorStop(0.1, "#fff");
    horizontal.addColorStop(0.9, "#fff");
    horizontal.addColorStop(1, "transparent");
    context.fillStyle = horizontal;
    context.fillRect(0, 0, 224, 224);
    const vertical = context.createLinearGradient(0, 0, 0, 224);
    vertical.addColorStop(0, "transparent");
    vertical.addColorStop(0.2, "#fff");
    vertical.addColorStop(0.84, "#fff");
    vertical.addColorStop(1, "transparent");
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = vertical;
    context.fillRect(0, 0, 224, 224);
    return canvas;
  }

  resize(width, height, ratio) {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const desktop = width > 760;
    this.x = width * (desktop ? 2 / 3 : 0.5);
    this.y = height * 0.59;
    this.size = desktop
      ? Math.min(width * 0.82, height * 1.5)
      : Math.min(width * 1.35, height * 0.86);
    this.lastDraw = "";
  }

  render(time, levels, enabled) {
    const elapsed = this.lastTime ? Math.max(0, Math.min(64, time - this.lastTime)) : 0;
    this.lastTime = time;
    if (!this.ready) return;
    const energy = enabled ? levels.energy : 0;
    const bass = enabled ? levels.bass : 0;
    let middle = 0;
    let treble = 0;
    if (enabled) {
      for (let index = 12; index < 32; index += 1) middle += levels.bands[index] / 20;
      for (let index = 32; index < 48; index += 1) treble += levels.bands[index] / 16;
    }
    if (energy > 0.001)
      this.playhead = (this.playhead + elapsed * (0.35 + energy * 0.9)) % 2000;
    const index = Math.floor(this.playhead / 40) % 50;
    const key = `${index},${energy.toFixed(3)},${bass.toFixed(3)},${middle.toFixed(3)},${treble.toFixed(3)}`;
    if (key === this.lastDraw) return;
    this.lastDraw = key;

    if (index !== this.frameIndex) {
      this.frameIndex = index;
      const context = this.frameContext;
      context.globalCompositeOperation = "source-over";
      context.clearRect(0, 0, 224, 224);
      // All fifty frames are lossless copies of the user's original GIF.
      context.drawImage(
        this.atlas,
        (index % 5) * 224,
        Math.floor(index / 5) * 224,
        224, 224,
        0, 0,
        224, 224,
      );
      context.globalCompositeOperation = "destination-in";
      context.drawImage(this.edgeMask, 0, 0);
    }
    const context = this.context;
    const size = this.size * (1 + bass * 0.065);
    const height = size * (1 + middle * 0.04);
    context.clearRect(0, 0, this.width, this.height);
    context.save();
    context.globalCompositeOperation = "screen";
    context.globalAlpha = energy > 0.001 ? 0.72 + energy * 0.28 : 0.26;
    context.filter = `brightness(${0.85 + energy * 0.55 + treble * 0.35})`;
    context.drawImage(this.frame, this.x - size / 2, this.y - height / 2, size, height);
    context.restore();
  }
}
window.PulseNebulaField = PulseNebulaField;
