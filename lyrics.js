class PulseLyrics {
  constructor(audio) {
    this.audio = audio;
    this.dialog = document.querySelector('#immersive');
    this.viewport = document.querySelector('#lyrics-viewport');
    this.list = document.querySelector('#lyrics-list');
    this.heading = document.querySelector('.immersive-track-meta');
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.index = -1;
    this.manualUntil = 0;
    this.generation = 0;
    this.lines = [];
    this.viewport.addEventListener('wheel', () => this.pauseFollowing(), { passive: true });
    this.viewport.addEventListener('touchstart', () => this.pauseFollowing(), { passive: true });
    this.viewport.addEventListener('keydown', () => this.pauseFollowing());
    this.list.addEventListener('click', (event) => {
      const line = event.target.closest('[data-lyric-time]');
      if (!line) return;
      this.manualUntil = 0;
      this.audio.seek(Number(line.dataset.lyricTime)).catch(() => {});
    });
  }

  pauseFollowing() {
    this.manualUntil = performance.now() + 4000;
    this.pendingCenter = true;
  }

  setTrack(track) {
    if (this.trackId === track.id) return;
    this.trackId = track.id;
    const common = [
      '让旋律慢慢展开', '把这一刻留在耳边', '灯光轻轻掠过夜色', '熟悉的声音再次响起',
      '那些走过的长街', '那些没说完的故事', '随着节拍轻轻摇晃', '让思绪停留片刻',
      '在时光里听见回声', '让心情跟着音乐', '下一段旋律正在靠近', '这一刻，只管聆听',
    ];
    const openings = {
      rock: ['让鼓点唤醒此刻', '让声音走向远方'],
      sweet: ['把轻快放进今天', '让微笑跟着节拍'],
      folk: ['晚风穿过安静的路', '故事随着吉他响起'],
      rnb: ['让律动慢慢靠近', '让心跳找到节奏'],
      cantopop: ['旧唱片翻过这一页', '熟悉的旋律再次响起'],
      ost: ['画面随着音乐展开', '故事停在记忆深处'],
      pop: ['重逢在熟悉的旋律', '把回忆轻轻打开'],
    };
    const text = [...(openings[track.genre] || openings.pop), ...common];
    const count = Math.max(text.length, Math.ceil(track.duration / 7));
    this.lines = Array.from({ length: count }, (_, index) => ({
      time: index * track.duration / count,
      text: text[index % text.length],
    }));
    this.list.replaceChildren(...this.lines.map((line) => {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.lyricTime = line.time;
      button.textContent = line.text;
      button.setAttribute('aria-label', `跳至歌词预览 ${line.text}`);
      row.append(button);
      return row;
    }));
    this.rows = [...this.list.children];
    this.index = -1;
    this.manualUntil = 0;
    this.pendingCenter = true;
    if (this.dialog.open) this.open();
  }

  open() {
    const generation = ++this.generation;
    this.intro?.cancel();
    this.dialog.classList.remove('lyrics-ready');
    this.manualUntil = 0;
    this.pendingCenter = true;
    const bounds = this.heading.getBoundingClientRect();
    const dx = innerWidth / 2 - bounds.left - bounds.width / 2;
    const dy = innerHeight / 2 - bounds.top - bounds.height / 2;
    const scale = Math.min(1.8, (innerWidth - 48) / Math.max(1, bounds.width));
    if (this.motion.matches || document.body.classList.contains('motion-off')) {
      this.dialog.classList.add('lyrics-ready');
      return;
    }
    this.intro = this.heading.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 1 },
      { transform: 'translate(0, 0) scale(1)', opacity: 0.56 },
    ], { duration: 1100, delay: 350, fill: 'both', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    this.intro.finished.then(() => {
      if (generation === this.generation && this.dialog.open) this.dialog.classList.add('lyrics-ready');
    }).catch(() => {});
  }

  close() {
    this.generation += 1;
    this.intro?.cancel();
    this.dialog.classList.remove('lyrics-ready');
  }

  update() {
    if (!this.dialog.open || !this.lines.length) return;
    let low = 0;
    let high = this.lines.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.lines[middle].time <= this.audio.position) low = middle;
      else high = middle - 1;
    }
    if (low !== this.index) {
      this.index = low;
      this.rows.forEach((row, index) => {
        row.dataset.distance = Math.min(3, Math.abs(index - low));
        if (index === low) row.firstElementChild.setAttribute('aria-current', 'true');
        else row.firstElementChild.removeAttribute('aria-current');
      });
      this.pendingCenter = true;
    }
    if (this.pendingCenter && performance.now() >= this.manualUntil) {
      const row = this.rows[this.index];
      this.viewport.scrollTo({
        top: row.offsetTop - this.viewport.clientHeight / 2 + row.clientHeight / 2,
        behavior: this.motion.matches ? 'instant' : 'smooth',
      });
      this.pendingCenter = false;
    }
  }
}
window.PulseLyrics = PulseLyrics;
