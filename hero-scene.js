class PulseHeroScene {
  constructor(canvas, image) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.image = image;
    this.photo = document.createElement("canvas");
    this.parallax = { x: 0, y: 0 };
    this.camera = { x: 0, y: 0 };
    this.lastTime = 0;
    this.needsFrame = true;
    this.ready = false;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement);
    image.addEventListener("load", () => this.resize());
    if (image.complete && image.naturalWidth) this.resize();
  }

  resize() {
    if (!this.image.naturalWidth) return;
    const bounds = this.canvas.parentElement.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    this.width = bounds.width;
    this.height = bounds.height;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    for (const canvas of [this.canvas, this.photo]) {
      canvas.width = Math.round(this.width * ratio);
      canvas.height = Math.round(this.height * ratio);
    }
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const context = this.photo.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const scale = Math.min(
      this.width * (innerWidth > 760 ? 0.7 : 1) / this.image.naturalWidth,
      this.height / this.image.naturalHeight,
    );
    const width = this.image.naturalWidth * scale;
    const height = this.image.naturalHeight * scale;
    const x = this.width * (innerWidth > 760 ? 0.68 : 0.5) - width / 2;
    const y = (this.height - height) / 2;
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    context.fillRect(x, y, width, height);
    context.globalCompositeOperation = "lighten";
    context.filter = "grayscale(1) contrast(1.08)";
    context.drawImage(this.image, x, y, width, height);
    context.globalCompositeOperation = "source-over";
    context.filter = "none";
    const photoFadeX = context.createLinearGradient(x, 0, x + width, 0);
    photoFadeX.addColorStop(0, "transparent");
    photoFadeX.addColorStop(0.11, "#000");
    photoFadeX.addColorStop(0.91, "#000");
    photoFadeX.addColorStop(1, "transparent");
    const photoFadeY = context.createLinearGradient(0, y, 0, y + height);
    photoFadeY.addColorStop(0, "transparent");
    photoFadeY.addColorStop(0.04, "#000");
    photoFadeY.addColorStop(0.91, "#000");
    photoFadeY.addColorStop(1, "transparent");
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = photoFadeX;
    context.fillRect(0, 0, this.width, this.height);
    context.fillStyle = photoFadeY;
    context.fillRect(0, 0, this.width, this.height);
    context.globalCompositeOperation = "source-over";
    this.fadeX = this.context.createLinearGradient(0, 0, this.width, 0);
    this.fadeX.addColorStop(0, "transparent");
    this.fadeX.addColorStop(0.08, "#000");
    this.fadeX.addColorStop(0.85, "#000");
    this.fadeX.addColorStop(1, "transparent");
    this.fadeY = this.context.createLinearGradient(0, 0, 0, this.height);
    this.fadeY.addColorStop(0, "transparent");
    this.fadeY.addColorStop(0.04, "#000");
    this.fadeY.addColorStop(0.86, "#000");
    this.fadeY.addColorStop(1, "transparent");
    this.ready = true;
    this.needsFrame = true;
    this.canvas.parentElement.classList.add("hero-scene-ready");
  }

  setParallax(x, y) {
    if (this.parallax.x === x * 9 && this.parallax.y === y * 7) return;
    this.parallax.x = x * 9;
    this.parallax.y = y * 7;
    this.needsFrame = true;
  }

  render(time, _levels, enabled) {
    if (!this.ready) return;
    const elapsed = this.lastTime ? Math.min(64, Math.max(0, time - this.lastTime)) : 0;
    this.lastTime = time;
    const targetX = enabled ? this.parallax.x : 0;
    const targetY = enabled ? this.parallax.y : 0;
    const response = 1 - Math.exp(-elapsed / 130);
    this.camera.x += (targetX - this.camera.x) * response;
    this.camera.y += (targetY - this.camera.y) * response;
    const moving = Math.abs(targetX - this.camera.x) + Math.abs(targetY - this.camera.y) > 0.02;
    if (!this.needsFrame && !moving && enabled === this.lastEnabled) return;
    this.lastEnabled = enabled;
    this.needsFrame = moving;
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    context.drawImage(this.photo, this.camera.x, this.camera.y, this.width, this.height);
    context.save();
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = this.fadeX;
    context.fillRect(0, 0, this.width, this.height);
    context.fillStyle = this.fadeY;
    context.fillRect(0, 0, this.width, this.height);
    context.restore();
  }
}
window.PulseHeroScene = PulseHeroScene;
