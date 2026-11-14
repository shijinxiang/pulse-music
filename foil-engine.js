/* Diffraction material adapted from the supplied StyleKit reference.
 * Copyright (c) 2026 AnxForever, MIT. See assets/stylekit-LICENSE.txt.
 */
class PulseFoil {
  constructor() {
    this.enabled = true;
    this.x = innerWidth * 0.72;
    this.y = innerHeight * 0.22;
    this.dirty = true;
    this.collect = true;
    this.elements = [];
    this.pointerVisible = false;
    this.cursor = document.querySelector("#note-cursor");
    this.finePointer = matchMedia("(any-hover: hover) and (any-pointer: fine)");
    this.makeSpectrum();
    this.makeGlints();

    document.addEventListener(
      "pointermove",
      (event) => {
        if (!this.enabled || event.pointerType !== "mouse") return;
        this.x = event.clientX;
        this.y = event.clientY;
        this.pointerVisible = this.finePointer.matches;
        this.dirty = true;
      },
      { passive: true },
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (this.enabled) {
          this.x = event.clientX;
          this.y = event.clientY;
        }
        this.dirty = true;
      },
      { passive: true },
    );
    for (const name of [
      "pointerup",
      "keyup",
      "keydown",
      "focusin",
      "focusout",
    ]) {
      document.addEventListener(name, () => {
        this.dirty = true;
      });
    }
    document.addEventListener(
      "scroll",
      () => {
        this.dirty = true;
      },
      { passive: true, capture: true },
    );
    document.addEventListener("pointerout", (event) => {
      if (!event.relatedTarget) this.hideCursor();
    });
    window.addEventListener("blur", () => this.hideCursor());
    window.addEventListener("resize", () => {
      this.hideCursor();
      this.x = innerWidth * 0.72;
      this.y = innerHeight * 0.22;
      this.invalidate();
    });
    this.finePointer.addEventListener("change", () => this.hideCursor());
    document.querySelector("#immersive").addEventListener("close", () => {
      this.hideCursor();
      this.dirty = true;
    });
  }

  static wavelength(wavelength) {
    if (wavelength < 380 || wavelength > 780) return [0, 0, 0];
    const gaussian = (center, lower, upper) => {
      const distance =
        (wavelength - center) / (wavelength < center ? lower : upper);
      return Math.exp(-0.5 * distance * distance);
    };
    const X =
      1.056 * gaussian(599.8, 37.9, 31) +
      0.362 * gaussian(442, 16, 26.7) -
      0.065 * gaussian(501.1, 20.4, 26.2);
    const Y =
      0.821 * gaussian(568.8, 46.9, 40.5) + 0.286 * gaussian(530.9, 16.3, 31.1);
    const Z = 1.217 * gaussian(437, 11.8, 36) + 0.681 * gaussian(459, 26, 13.8);
    return [
      3.2406 * X - 1.5372 * Y - 0.4986 * Z,
      -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
      0.0557 * X - 0.204 * Y + 1.057 * Z,
    ].map((channel) => Math.max(0, Y + (channel - Y) * 0.66) * 0.8);
  }

  static diffraction(projection) {
    const wavelength = Math.abs(projection) * 1500;
    const orders = [1, 2, 3].map((order) =>
      PulseFoil.wavelength(wavelength / order),
    );
    return orders[0].map((channel, index) => {
      const light =
        (channel + orders[1][index] * 0.5 + orders[2][index] * 0.3) * 1.6;
      const mapped = Math.min(
        1,
        Math.max(
          0,
          (light * (2.51 * light + 0.03)) /
            (light * (2.43 * light + 0.59) + 0.14),
        ),
      );
      return Math.round(
        255 *
          (mapped <= 0.0031308
            ? 12.92 * mapped
            : 1.055 * Math.pow(mapped, 1 / 2.4) - 0.055),
      );
    });
  }

  makeSpectrum() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    const image = context.createImageData(1024, 1);
    for (let index = 0; index < 1024; index += 1) {
      const color = PulseFoil.diffraction(
        (((index + 0.5) / 1024) * 2 - 1) * 1.25,
      );
      image.data.set([...color, 255], index * 4);
    }
    this.spectrum = image.data;
    context.putImageData(image, 0, 0);
    document.documentElement.style.setProperty(
      "--spectrum",
      `url(${canvas.toDataURL()})`,
    );
  }

  sample(projection) {
    const index =
      Math.max(
        0,
        Math.min(1023, Math.floor(((projection + 1.25) / 2.5) * 1024)),
      ) * 4;
    return [
      this.spectrum[index],
      this.spectrum[index + 1],
      this.spectrum[index + 2],
    ];
  }

  makeGlints() {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const texture = (size, draw) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      context.fillStyle = "#000";
      context.fillRect(0, 0, size, size);
      draw(context);
      return `url(${canvas.toDataURL()})`;
    };
    const root = document.documentElement.style;
    root.setProperty(
      "--sparkle",
      texture(192, (context) => {
        for (let index = 0; index < 70; index += 1) {
          context.globalAlpha = 0.45 + random() * 0.55;
          context.fillStyle =
            random() < 0.45
              ? "#fff"
              : `rgb(${PulseFoil.diffraction(0.28 + random() * 0.24).join(" ")})`;
          context.beginPath();
          context.arc(
            random() * 192,
            random() * 192,
            0.6 + random(),
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }),
    );
    root.setProperty(
      "--glint",
      texture(140, (context) => {
        context.globalCompositeOperation = "lighter";
        for (let index = 0; index < 9; index += 1) {
          const x = random() * 140,
            y = random() * 140,
            radius = 9 + random() * 16;
          const glow = context.createRadialGradient(x, y, 0, x, y, radius);
          glow.addColorStop(0, "#fff");
          glow.addColorStop(1, "transparent");
          context.fillStyle = glow;
          context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
      }),
    );
  }

  colorAt(x, y) {
    const distance = Math.hypot(x - this.x, y - this.y);
    return this.sample(distance / Math.hypot(distance, 300));
  }

  invalidate() {
    this.collect = true;
    this.dirty = true;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.hideCursor();
    this.dirty = true;
  }

  hideCursor() {
    this.pointerVisible = false;
    document.body.classList.remove("note-cursor-active");
  }

  update() {
    if (!this.dirty) return;
    if (this.collect) {
      this.elements = [...document.querySelectorAll("[data-foil]")];
      this.collect = false;
    }
    const measurements = this.elements
      .filter((element) => element.isConnected)
      .map((element) => ({
        element,
        rectangle: element.getBoundingClientRect(),
      }))
      .filter(
        ({ rectangle }) =>
          rectangle.width &&
          rectangle.height &&
          rectangle.bottom > -80 &&
          rectangle.top < innerHeight + 80,
      );

    for (const { element, rectangle } of measurements) {
      const kind = element.dataset.foil;
      const pressed =
        element.matches(":active, .pressed") ||
        Boolean(element.closest(".music-pad.pressed"));
      const lampY = this.y + (pressed ? 70 : 0);
      const dx = rectangle.left + rectangle.width / 2 - this.x;
      const dy = rectangle.top + rectangle.height / 2 - lampY;
      const style = element.style;
      style.setProperty("--lx", `${this.x - rectangle.left}px`);
      style.setProperty("--ly", `${lampY - rectangle.top}px`);
      if (kind === "pearl" || kind === "glitter") continue;
      if (kind === "seal") {
        const distance = Math.hypot(dx, dy);
        const projection = distance / Math.hypot(distance, 300);
        style.setProperty(
          "--la",
          `${(Math.atan2(-dx, dy) * 180) / Math.PI}deg`,
        );
        style.setProperty("--sc", `rgb(${this.sample(projection).join(" ")})`);
        style.setProperty(
          "--sc2",
          `rgb(${this.sample(projection * 0.93).join(" ")})`,
        );
        continue;
      }
      const half =
        kind === "text"
          ? rectangle.width / 2
          : Math.hypot(rectangle.width, rectangle.height) / 2 + 1;
      const center = kind === "text" ? dx : Math.hypot(dx, dy);
      const depth = kind === "text" ? dy * dy + 90000 : 90000;
      const projection = (value) => value / Math.sqrt(value * value + depth);
      const middle = (projection(center) + 1.25) / 2.5;
      const spread = Math.max(
        ((projection(center + half) - projection(center - half)) / 5) * 2.6,
        0.03,
      );
      const size = half / spread;
      style.setProperty("--k", `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`);
      style.setProperty("--dg", `${2 * half}px`);
      style.setProperty("--bs", `${size}px`);
      style.setProperty("--bp", `${-(middle - spread) * size}px`);
    }

    if (this.enabled && this.pointerVisible && this.finePointer.matches) {
      const container =
        document.querySelector("#immersive[open]") || document.body;
      if (this.cursor.parentElement !== container)
        container.append(this.cursor);
      const projection =
        0.27 +
        (this.x / Math.max(1, innerWidth)) * 0.43 +
        (this.y / Math.max(1, innerHeight)) * 0.17;
      const color = this.sample(projection).map((channel) =>
        Math.round(160 + channel * 0.37),
      );
      const second = this.sample(projection + 0.08).map((channel) =>
        Math.round(140 + channel * 0.45),
      );
      this.cursor.style.transform = `translate3d(${this.x - 6}px, ${this.y - 27}px, 0) rotate(-12deg)`;
      this.cursor.style.backgroundImage = `linear-gradient(135deg, #fff 5%, rgb(${color.join(" ")}) 48%, rgb(${second.join(" ")}))`;
      document.body.classList.add("note-cursor-active");
    }
    this.dirty = false;
  }
}
window.PulseFoil = PulseFoil;
