class PulseLiquidGlass {
  constructor() {
    this.controls = [...document.querySelectorAll([
      ".sidebar", ".topbar", ".nav-item", ".collection-link",
      ".import-button", ".search-box", ".effects-toggle",
      ".filter-chip", ".playlist-button", ".all-music-link", ".player",
      ".player .icon-button", "#play", ".queue-panel", "#queue-close",
      ".immersive-controls button",
    ].join(","))];
    this.maps = new Map();
    this.sequence = 0;
    this.active = null;
    this.enabled = true;
    this.abortController = new AbortController();
    this.finePointer = matchMedia("(pointer: fine)");
    this.reducedTransparency = matchMedia("(prefers-reduced-transparency: reduce)");
    const chromium = /Chrome|Chromium|Edg\//.test(navigator.userAgent);
    this.canRefract = chromium && CSS.supports("backdrop-filter", 'url("#glass")');
    this.definitions = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.definitions.classList.add("glass-definitions");
    this.definitions.setAttribute("aria-hidden", "true");
    this.definitions.setAttribute("width", "0");
    this.definitions.setAttribute("height", "0");
    this.defs = document.createElementNS(this.definitions.namespaceURI, "defs");
    this.definitions.append(this.defs);
    document.body.append(this.definitions);
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const { target } of entries) this.updateOptics(target);
      this.pruneMaps();
    });
    for (const control of this.controls) {
      control.classList.add("liquid-glass");
      this.resizeObserver.observe(control);
    }
    const eventOptions = { passive: true, signal: this.abortController.signal };
    document.addEventListener("pointermove", (event) => this.moveLight(event), eventOptions);
    document.addEventListener("pointerdown", (event) => this.press(event), eventOptions);
    document.addEventListener("pointerup", () => this.release(), eventOptions);
    document.addEventListener("pointercancel", () => this.release(), eventOptions);
    window.addEventListener("blur", () => this.release(), eventOptions);
    this.reducedTransparency.addEventListener("change", () => {
      for (const control of this.controls) this.updateOptics(control);
    }, eventOptions);
  }

  updateOptics(control) {
    const width = control.offsetWidth;
    const height = control.offsetHeight;
    if (!width || !height) return;
    const enabled = this.canRefract && !this.reducedTransparency.matches;
    control.dataset.glassRenderer = enabled ? "refraction" : "frosted";
    if (!enabled) {
      control.style.removeProperty("--glass-filter");
      delete control.dataset.glassMap;
      return;
    }
    const radius = Math.min(parseFloat(getComputedStyle(control).borderTopLeftRadius) || 24, width / 2, height / 2);
    const blur = control.matches(".sidebar, .player, .topbar, .queue-panel") ? 3 : 0.65;
    const key = `${width}:${height}:${Math.round(radius)}:${blur}`;
    if (!this.maps.has(key)) this.maps.set(key, this.makeFilter(width, height, radius, blur));
    const filter = this.maps.get(key);
    control.dataset.glassMap = key;
    control.style.setProperty("--glass-filter", `url("#${filter.id}")`);
  }

  makeFilter(width, height, radius, blurRadius) {
    // Snell refraction through a rounded rim, with a neutral, undistorted center.
    const rim = Math.min(20, height * 0.3, radius * 0.7);
    const thickness = Math.min(12, height * 0.24);
    const maxShift = 18;
    const resolution = Math.min(1, 1600 / width);
    const mapWidth = Math.max(1, Math.round(width * resolution));
    const mapHeight = Math.max(1, Math.round(height * resolution));
    const canvas = document.createElement("canvas");
    canvas.width = mapWidth;
    canvas.height = mapHeight;
    const context = canvas.getContext("2d");
    const image = context.createImageData(mapWidth, mapHeight);
    for (let row = 0; row < mapHeight; row += 1) {
      for (let column = 0; column < mapWidth; column += 1) {
        const x = (column + 0.5) / mapWidth * width - width / 2;
        const y = (row + 0.5) / mapHeight * height - height / 2;
        const qx = Math.abs(x) - width / 2 + radius;
        const qy = Math.abs(y) - height / 2 + radius;
        const cornerX = Math.max(0, qx);
        const cornerY = Math.max(0, qy);
        const cornerLength = Math.hypot(cornerX, cornerY);
        const distance = radius - cornerLength - Math.min(Math.max(qx, qy), 0);
        const offset = (row * mapWidth + column) * 4;
        let shiftX = 0;
        let shiftY = 0;
        if (distance > 0 && distance < rim) {
          const profile = Math.max(0.015, distance / rim);
          const slope = thickness / rim * (1 - profile) / Math.sqrt(1 - (1 - profile) ** 2);
          const incident = Math.atan(slope);
          const refracted = Math.asin(Math.sin(incident) / 1.45);
          const shift = Math.min(maxShift, Math.tan(incident - refracted) * thickness);
          let normalX = 0;
          let normalY = 0;
          if (cornerLength > 0) {
            normalX = cornerX / cornerLength;
            normalY = cornerY / cornerLength;
          } else if (qx > qy) {
            normalX = 1;
          } else {
            normalY = 1;
          }
          shiftX = normalX * Math.sign(x) * shift;
          shiftY = normalY * Math.sign(y) * shift;
        }
        image.data[offset] = Math.round(128 + shiftX / maxShift * 127);
        image.data[offset + 1] = Math.round(128 + shiftY / maxShift * 127);
        image.data[offset + 2] = 128;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    const filter = document.createElementNS(this.definitions.namespaceURI, "filter");
    const id = `pulse-glass-${++this.sequence}`;
    const setAttributes = (element, attributes) => {
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    };
    setAttributes(filter, { id, x: "0", y: "0", width, height, filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" });
    const texture = document.createElementNS(this.definitions.namespaceURI, "feImage");
    setAttributes(texture, { x: "0", y: "0", width, height, preserveAspectRatio: "none", href: canvas.toDataURL(), result: "rim" });
    const blur = document.createElementNS(this.definitions.namespaceURI, "feGaussianBlur");
    setAttributes(blur, { in: "SourceGraphic", stdDeviation: blurRadius, result: "scene" });
    const displacement = document.createElementNS(this.definitions.namespaceURI, "feDisplacementMap");
    setAttributes(displacement, { in: "scene", in2: "rim", scale: maxShift * 2, xChannelSelector: "R", yChannelSelector: "G" });
    filter.append(texture, blur, displacement);
    this.defs.append(filter);
    return { id, element: filter };
  }

  pruneMaps() {
    const used = new Set(this.controls.map((control) => control.dataset.glassMap));
    for (const [key, filter] of this.maps) {
      if (used.has(key)) continue;
      filter.element.remove();
      this.maps.delete(key);
    }
  }

  moveLight(event) {
    if (!this.enabled || !this.finePointer.matches) return;
    const control = event.target.closest(".liquid-glass");
    if (!control) return;
    const bounds = control.getBoundingClientRect();
    control.style.setProperty("--glass-light-x", `${event.clientX - bounds.left}px`);
    control.style.setProperty("--glass-light-y", `${event.clientY - bounds.top}px`);
    if (!this.active || this.active.pointerId !== event.pointerId) return;
    const distance = Math.min(28, Math.abs(event.clientX - this.active.x));
    this.active.control.style.setProperty("--glass-stretch", 1 + distance / 900);
  }

  press(event) {
    if (!this.enabled || event.button !== 0 || !event.isPrimary) return;
    const control = event.target.closest("button.liquid-glass");
    if (!control || control.disabled) return;
    this.release();
    this.active = { control, pointerId: event.pointerId, x: event.clientX };
    control.classList.add("glass-pressed");
  }

  release() {
    if (!this.active) return;
    this.active.control.classList.remove("glass-pressed");
    this.active.control.style.removeProperty("--glass-stretch");
    this.active = null;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) return;
    this.release();
    for (const control of this.controls) {
      control.style.removeProperty("--glass-light-x");
      control.style.removeProperty("--glass-light-y");
    }
  }

  dispose() {
    this.release();
    this.resizeObserver.disconnect();
    this.abortController.abort();
    this.definitions.remove();
  }
}
window.PulseLiquidGlass = PulseLiquidGlass;
