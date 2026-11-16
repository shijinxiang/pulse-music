class PulseGenreCarousel {
  constructor(root, onChange) {
    this.root = root;
    this.ring = root.querySelector('.genre-ring');
    this.camera = root.querySelector('.genre-camera');
    this.buttons = [...root.querySelectorAll('[data-filter]')];
    this.status = root.querySelector('[role="status"]');
    this.onChange = onChange;
    this.position = 0;
    this.target = null;
    this.selected = -1;
    this.hovering = false;
    this.focused = false;
    this.travel = 0;
    this.origin = 0;
    this.enabled = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.abortController = new AbortController();
    this.slots = this.buttons.map((button, index) => {
      const slot = document.createElement('div');
      slot.className = 'genre-slot';
      button.classList.add('genre-face', 'genre-front');
      const back = document.createElement('span');
      back.className = 'genre-face genre-back';
      back.setAttribute('aria-hidden', 'true');
      back.textContent = button.textContent;
      this.ring.append(slot);
      slot.append(button, back);
      button.addEventListener('click', () => this.goTo(index));
      return { element: slot, button, back };
    });
    const options = { signal: this.abortController.signal };
    root.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      this.hovering = true;
      this.origin = this.position;
      this.travel = 0;
    }, options);
    root.addEventListener('pointerleave', () => {
      this.hovering = false;
      if (this.target === null) this.target = Math.round(this.position);
    }, options);
    root.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') this.focused = false;
    }, options);
    root.addEventListener('focusin', (event) => {
      this.focused = event.target.matches(':focus-visible');
    }, options);
    root.addEventListener('focusout', (event) => {
      this.focused = root.contains(event.relatedTarget);
      this.origin = this.position;
      this.travel = 0;
    }, options);
    root.addEventListener('keydown', (event) => {
      this.focused = true;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        this.advance(event.key === 'ArrowRight' ? 1 : -1);
      }
      if (event.key === 'Home') {
        event.preventDefault();
        this.goTo(0);
      }
    }, options);
    root.querySelector('.genre-previous').addEventListener('click', () => this.advance(-1), options);
    root.querySelector('.genre-next').addEventListener('click', () => this.advance(1), options);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(root);
    this.resize();
    root.classList.add('carousel-ready');
  }

  wrap(value) {
    const count = this.buttons.length;
    return ((value + count / 2) % count + count) % count - count / 2;
  }

  resize() {
    const width = this.root.clientWidth;
    if (!width) return;
    this.radius = Math.min(width * 0.43, 440);
    this.visibleLimit = width < 600 ? 1.25 : 2.25;
    const cardWidth = Math.min(216, Math.max(88, width * 0.31));
    this.root.style.setProperty('--tag-width', `${cardWidth}px`);
    this.camera.style.transform = `translateY(${-this.radius * Math.sin(9 * Math.PI / 180)}px) translateZ(${-this.radius}px) rotateX(-9deg)`;
    this.draw(false);
  }

  goTo(index) {
    const delta = this.wrap(index - this.position);
    this.target = this.position + delta;
    if (!this.enabled) {
      this.position = this.target;
      this.target = null;
      this.draw(true);
    }
  }

  advance(direction) {
    this.target = (this.target ?? Math.round(this.position)) + direction;
    if (!this.enabled) {
      this.position = this.target;
      this.target = null;
      this.draw(true);
    }
  }

  sync(filter) {
    const index = this.buttons.findIndex((button) => button.dataset.filter === filter);
    this.position += this.wrap((index < 0 ? 0 : index) - this.position);
    this.target = null;
    this.origin = this.position;
    this.travel = 0;
    this.draw(false);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.position = Math.round(this.position);
      this.target = null;
      this.origin = this.position;
      this.travel = 0;
      this.draw(false);
    }
  }

  update(time, canRotate) {
    const elapsed = this.lastTime ? Math.min(64, Math.max(0, time - this.lastTime)) : 0;
    this.lastTime = time;
    if (!canRotate) return;
    if (this.target !== null) {
      this.position += (this.target - this.position) * (1 - Math.exp(-elapsed / 100));
      if (Math.abs(this.target - this.position) < 0.001) {
        this.position = this.target;
        this.target = null;
        this.origin = this.position;
        this.travel = 0;
      }
      this.draw(true);
    } else if (this.enabled && this.hovering && !this.focused) {
      this.travel += elapsed / 3400;
      const step = Math.floor(this.travel);
      const fraction = this.travel - step;
      const eased = Math.max(0, (fraction - 0.25) / 0.75);
      const stepped = eased * eased * (3 - 2 * eased);
      this.position = this.origin + step + fraction * 0.45 + stepped * 0.55;
      this.draw(true);
    }
  }

  draw(notify) {
    if (!this.radius) return;
    const count = this.buttons.length;
    const step = 360 / count;
    const selected = ((Math.round(this.position) % count) + count) % count;
    this.ring.style.transform = `rotateY(${-((this.position % count) * step)}deg)`;
    this.slots.forEach(({ element, button, back }, index) => {
      const distance = this.wrap(index - this.position);
      const angle = Math.abs(distance * step);
      const visible = Math.abs(distance) <= this.visibleLimit;
      element.hidden = !visible;
      if (!visible) return;
      const highlight = Math.max(0, 1 - angle / 55);
      const light = highlight * highlight * (3 - 2 * highlight);
      const fade = Math.min(1, Math.max(0, (this.visibleLimit - Math.abs(distance)) / 0.25));
      element.style.transform = `translate(-50%, -50%) rotateY(${index * step}deg) translateZ(${this.radius + light * 28}px)`;
      element.style.setProperty('--tag-fade', (0.68 + light * 0.32) * fade);
      element.style.setProperty('--tag-light', light);
      element.style.setProperty('--tag-scale', 0.62 + 0.38 * Math.cos(angle * Math.PI / 180) ** 2);
      element.style.setProperty('--tag-facing', `${-distance * step * 0.8}deg`);
      if (back.textContent !== button.textContent) back.textContent = button.textContent;
    });
    const changed = selected !== this.selected;
    if (changed) {
      this.buttons.forEach((button, index) => {
        button.classList.toggle('active', index === selected);
        button.setAttribute('aria-pressed', String(index === selected));
      });
    }
    this.selected = selected;
    if (notify && changed) {
      this.onChange(this.buttons[selected].dataset.filter);
      this.status.textContent = `${this.buttons[selected].textContent}，已更新歌单`;
    }
  }

  dispose() {
    this.observer.disconnect();
    this.abortController.abort();
  }
}
window.PulseGenreCarousel = PulseGenreCarousel;
