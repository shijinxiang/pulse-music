/* Dot-matrix kinegram adapted from the supplied StyleKit reference.
 * Copyright (c) 2026 AnxForever, MIT. See assets/stylekit-LICENSE.txt.
 */
class PulseKine {
  constructor() {
    this.dirty = true;
    this.lastLight = "";
    this.items = [...document.querySelectorAll(".kine-word")].map((host) => {
      const canvas = document.createElement("canvas");
      canvas.className = "kine-canvas";
      canvas.setAttribute("aria-hidden", "true");
      host.append(canvas);
      return { host, canvas, context: canvas.getContext("2d"), points: [] };
    });
    this.observer = new ResizeObserver(() => {
      this.dirty = true;
    });
    for (const item of this.items) this.observer.observe(item.host);
    document.fonts.ready.then(() => {
      this.dirty = true;
    });
  }

  prepare(item, rectangle) {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = rectangle.width;
    const height = rectangle.height;
    const key = `${width},${height},${ratio}`;
    if (item.sizeKey === key && !this.dirty) return;
    item.sizeKey = key;
    item.canvas.width = Math.ceil(width * ratio);
    item.canvas.height = Math.ceil(height * ratio);
    item.context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const mask = document.createElement("canvas");
    mask.width = item.canvas.width;
    mask.height = item.canvas.height;
    const context = mask.getContext("2d", { willReadFrequently: true });
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const style = getComputedStyle(item.host);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.globalCompositeOperation = "lighter";
    context.fillStyle = "#f00";
    const text = item.host.querySelector(".kine-label").textContent;
    const metrics = context.measureText(text);
    const baseline =
      (height + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    context.fillText(text, 0, baseline);

    context.fillStyle = "#0f0";
    const radius = height * 0.3;
    for (let index = 0; index < 5; index += 1) {
      const x = (width * (index + 0.5)) / 5;
      const y = height / 2;
      context.beginPath();
      context.moveTo(x, y - radius);
      context.lineTo(x + radius * 0.22, y - radius * 0.22);
      context.lineTo(x + radius, y);
      context.lineTo(x + radius * 0.22, y + radius * 0.22);
      context.lineTo(x, y + radius);
      context.lineTo(x - radius * 0.22, y + radius * 0.22);
      context.lineTo(x - radius, y);
      context.lineTo(x - radius * 0.22, y - radius * 0.22);
      context.closePath();
      context.fill();
    }

    const pixels = context.getImageData(0, 0, mask.width, mask.height).data;
    const pitch = 1.3;
    item.points = [];
    for (let row = 0; (row + 0.5) * pitch < height; row += 1) {
      for (let column = 0; (column + 0.5) * pitch < width; column += 1) {
        const x = (column + 0.5) * pitch;
        const y = (row + 0.5) * pitch;
        const offset =
          (Math.floor(y * ratio) * mask.width + Math.floor(x * ratio)) * 4;
        const a = pixels[offset] > 128;
        const b = pixels[offset + 1] > 128;
        if (!a && !b) continue;
        item.points.push({
          x,
          y,
          image: a && b ? (row + column) % 2 : Number(b),
        });
      }
    }
    item.width = width;
    item.height = height;
    item.host.classList.add("kine-ready");
  }

  render(foil) {
    const key = `${foil.x},${foil.y},${scrollY},${foil.enabled}`;
    if (key === this.lastLight && !this.dirty) return;
    this.lastLight = key;
    const jobs = this.items
      .map((item) => ({ item, rectangle: item.host.getBoundingClientRect() }))
      .filter(({ rectangle }) =>
        rectangle.width && rectangle.height &&
        rectangle.bottom > 0 && rectangle.top < innerHeight,
      );
    for (const { item, rectangle } of jobs) {
      this.prepare(item, rectangle);
      const context = item.context;
      context.clearRect(0, 0, item.width, item.height);
      const centerX = foil.x - rectangle.left - item.width / 2;
      const centerY = foil.y - rectangle.top - item.height / 2;
      const directionLength = Math.max(1, Math.hypot(centerX, centerY));
      const horizontalLight = Math.abs(centerX) / directionLength;
      const verticalLight = Math.abs(centerY) / directionLength;
      item.host.style.setProperty(
        "--kine-base",
        (0.48 + horizontalLight * 0.24).toFixed(3),
      );
      for (const point of item.points) {
        const dx = foil.x - rectangle.left - point.x;
        const dy = foil.y - rectangle.top - point.y;
        const length = Math.hypot(dx, dy, 300);
        const horizontal = dx / length;
        const vertical = dy / length;
        const projection = point.image ? vertical : horizontal;
        const perpendicular = point.image ? horizontal : vertical;
        const direction = point.image ? verticalLight : horizontalLight;
        const intensity = Math.pow(direction, 3) *
          (0.45 + Math.exp(-Math.pow(perpendicular / 0.27, 2)) * 0.55);
        const color = foil.sample(Math.abs(projection)).map((channel) =>
          Math.min(255, Math.round(155 + channel * 0.39)),
        );
        context.fillStyle = `rgba(${color.join(",")},${intensity})`;
        context.beginPath();
        context.arc(point.x, point.y, 0.49, 0, Math.PI * 2);
        context.fill();
      }
    }
    this.dirty = false;
  }
}
window.PulseKine = PulseKine;
