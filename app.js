const tracks = [
  {
    id: "neon",
    title: "Neon Afterglow",
    coverTitle: "Neon\nAfterglow",
    genre: "electronic",
    style: "电子浪潮",
    mood: "深夜驰行",
    bpm: 110,
    duration: 144,
    root: 45,
    melody: [0, 7, 10, 12, 7, 3, 0, 14, 12, 7, 3, 10],
    art: 0,
  },
  {
    id: "lunar",
    title: "Lunar Drift",
    coverTitle: "lunar\ndrift",
    genre: "ambient",
    style: "氛围漫游",
    mood: "星际漂浮",
    bpm: 76,
    duration: 160,
    root: 48,
    melody: [0, 7, 12, 14, 19, 12],
    art: 1,
  },
  {
    id: "soft",
    title: "Soft Focus",
    coverTitle: "soft\nfocus",
    genre: "lofi",
    style: "Lo-fi 时刻",
    mood: "温柔放空",
    bpm: 82,
    duration: 156,
    root: 50,
    melody: [0, 3, 7, 10, 7, 5, 3, 0, 12, 10, 7, 3],
    art: 2,
  },
  {
    id: "green",
    title: "Green Room",
    coverTitle: "GREEN\nROOM",
    genre: "house",
    style: "律动 House",
    mood: "自由律动",
    bpm: 122,
    duration: 132,
    root: 43,
    melody: [0, 0, 7, 10, 12, 7, 0, 3, 10, 7, 3, 12],
    art: 3,
  },
];

const audio = new PulseAudio();
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

function readPreference(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Playback also works with storage disabled. */
  }
}

const savedFavorites = readPreference("pulse-favorites", []);
const state = {
  currentId: tracks[0].id,
  view: "discover",
  filter: "all",
  collection: null,
  query: "",
  favorites: new Set(
    Array.isArray(savedFavorites)
      ? savedFavorites.filter((id) => typeof id === "string")
      : [],
  ),
  shuffle: false,
  repeat: false,
  effects: Boolean(readPreference("pulse-effects", !motionPreference.matches)),
  lastVolume: 0.65,
  seeking: false,
};

function escapeText(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function formatTime(seconds) {
  const duration = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`;
}

function currentTrack() {
  return tracks.find((track) => track.id === state.currentId) || tracks[0];
}

let toastTimer;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3200);
}

function visibleTracks() {
  return tracks.filter((track) => {
    const matchesView =
      state.view !== "favorites" || state.favorites.has(track.id);
    const matchesGenre = state.filter === "all" || track.genre === state.filter;
    const matchesCollection =
      !state.collection ||
      (state.collection === "night"
        ? ["electronic", "ambient"].includes(track.genre)
        : ["ambient", "lofi"].includes(track.genre));
    const searchable =
      `${track.title} ${track.style} ${track.mood} ${track.genre}`.toLowerCase();
    return (
      matchesView &&
      matchesGenre &&
      matchesCollection &&
      searchable.includes(state.query.toLowerCase().trim())
    );
  });
}

function renderTracks() {
  const filtered = visibleTracks();
  $("#track-grid").innerHTML = filtered
    .map((track) => {
      const liked = state.favorites.has(track.id);
      return `<article class="track-card${audio.playing && track.id === state.currentId ? " playing" : ""}" data-track="${track.id}">
      <div class="cover-wrap">
        <div class="cover-image album-art art-${track.art}" role="img" aria-label="${escapeText(track.title)} 专辑封面"></div>
        <div class="cover-shade"></div>
        <span class="cover-title">${escapeText(track.coverTitle)}</span>
        <button class="cover-select" data-play="${track.id}" aria-label="播放 ${escapeText(track.title)}"></button>
        <span class="cover-play" aria-hidden="true">${icon("play")}</span>
      </div>
      <div class="track-info-row"><h3 class="track-name"><button class="track-title-button" data-play="${track.id}">${escapeText(track.title)}</button></h3><button class="icon-button like-button" data-like="${track.id}" aria-label="${liked ? "取消收藏" : "收藏"} ${escapeText(track.title)}" aria-pressed="${liked}">${icon("heart")}</button></div>
      <div class="track-meta"><span class="track-meta-left"><span>${escapeText(track.style)}</span><span class="track-meta-dot"></span><span>${escapeText(track.mood)}</span></span><span class="track-bpm">${track.local ? formatTime(track.duration) : `${track.bpm} BPM`}</span></div>
    </article>`;
    })
    .join("");
  $("#empty-state").hidden = filtered.length > 0;
  $("#track-grid").hidden = filtered.length === 0;
  $("#empty-message").textContent = state.query
    ? `没有找到“${state.query}”，换一个声音关键词试试。`
    : state.filter !== "all"
      ? "这个风格里还没有音乐，试试其他频率。"
      : "点击音乐旁的爱心，收藏你的心动频率。";
  updateCardPlayback();
  updateFavoriteCount();
}

function updateCardPlayback() {
  $$(".track-card").forEach((card) => {
    const track = tracks.find((item) => item.id === card.dataset.track);
    const playing = card.dataset.track === state.currentId && audio.playing;
    card.classList.toggle("playing", playing);
    const button = card.querySelector(".cover-play");
    button.innerHTML = icon(playing ? "pause" : "play");
    card
      .querySelectorAll("[data-play]")
      .forEach((control) =>
        control.setAttribute(
          "aria-label",
          `${playing ? "暂停" : "播放"} ${track.title}`,
        ),
      );
  });
}

function updateFavoriteCount() {
  $("#favorite-count").textContent = tracks.filter((track) =>
    state.favorites.has(track.id),
  ).length;
}

function renderQueue() {
  $("#queue-list").innerHTML = tracks
    .map(
      (track) =>
        `<button class="queue-row${track.id === state.currentId ? " current" : ""}" data-play="${track.id}" aria-label="播放 ${escapeText(track.title)}"><span class="queue-art album-art art-${track.art}"></span><span class="queue-details"><strong>${escapeText(track.title)}</strong><small>${escapeText(track.style)} · ${formatTime(track.duration)}</small></span>${icon(track.id === state.currentId && audio.playing ? "pause" : "play")}</button>`,
    )
    .join("");
}

function setView(view, collection = null) {
  state.view = view;
  state.collection = collection;
  state.filter = "all";
  state.query = "";
  $("#search").value = "";
  document.body.classList.remove(
    "view-discover",
    "view-library",
    "view-favorites",
    "view-studio",
    "is-searching",
  );
  document.body.classList.add(`view-${view}`);
  $$(".nav-item").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const labels = {
    discover: "发现音乐",
    favorites: "我的收藏",
    library: "音乐资料库",
    studio: "节拍实验室",
  };
  const titles = {
    discover: "此刻，听点什么",
    favorites: "让你心动的频率",
    library: "探索全部音乐",
  };
  $("#breadcrumb-current").textContent = collection
    ? collection === "night"
      ? "深夜漫游"
      : "专注时刻"
    : labels[view];
  $("#section-title").innerHTML =
    `${collection ? (collection === "night" ? "给深夜，一点回响" : "把世界，调成静音") : titles[view] || titles.discover}<span class="lime-dot">.</span>`;
  $("#all-music").hidden = view === "library";
  $("#library-import").hidden = view !== "library";
  $$(".filter-chip").forEach((button) => {
    const active = button.dataset.filter === "all";
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderTracks();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateTrackInfo() {
  const track = currentTrack();
  $("#player-title").textContent = track.title;
  $("#player-artist").textContent =
    `${track.local ? "LOCAL MUSIC" : "PULSE ORIGINAL"} · ${track.style}`;
  $("#player-art").className = `player-art album-art art-${track.art}`;
  $("#immersive-title").textContent = track.title;
  $("#immersive-style").textContent =
    `${track.local ? "LOCAL MUSIC" : "PULSE ORIGINAL"} · ${track.style}`;
  $("#immersive-bpm").textContent = track.local
    ? "YOUR FREQUENCY"
    : `${track.bpm} BPM`;
  $("#duration").textContent = formatTime(track.duration);
  updateLikes();
  renderQueue();
}

function updatePlayback() {
  document.body.classList.toggle("is-playing", audio.playing);
  ["#play", "#immersive-play"].forEach((selector) => {
    $(selector).innerHTML = icon(audio.playing ? "pause" : "play");
    $(selector).setAttribute("aria-label", audio.playing ? "暂停" : "播放");
  });
  $("#hero-play").innerHTML =
    `${icon(audio.playing ? "pause" : "play")}<span>${audio.playing ? "暂停音乐" : "即刻开听"}</span>`;
  $("#hero-status").textContent = audio.playing
    ? `正在共振 · ${currentTrack().title}`
    : "声音就绪，等你按下播放";
  updateCardPlayback();
  renderQueue();
}

async function startTrack(id, toggle = true) {
  const track = tracks.find((item) => item.id === id);
  if (!track) return;
  if (id === state.currentId && audio.playing && toggle) {
    audio.pause();
    updatePlayback();
    return;
  }
  if (id !== state.currentId) {
    state.currentId = id;
    audio.load(track);
    updateTrackInfo();
  }
  try {
    await audio.play();
  } catch (error) {
    audio.pause();
    toast(error.message || "播放暂时没有成功，请再次点击播放。");
  }
  updatePlayback();
}

function togglePlayback() {
  startTrack(state.currentId);
}

async function advanceTrack(direction = 1) {
  let index = tracks.findIndex((track) => track.id === state.currentId);
  if (state.shuffle && tracks.length > 1) {
    index =
      (index + 1 + Math.floor(Math.random() * (tracks.length - 1))) %
      tracks.length;
  } else {
    index = (index + direction + tracks.length) % tracks.length;
  }
  await startTrack(tracks[index].id, false);
}

function updateLikes() {
  $$("[data-like]").forEach((button) => {
    const liked = state.favorites.has(button.dataset.like);
    const track = tracks.find((item) => item.id === button.dataset.like);
    button.setAttribute("aria-pressed", String(liked));
    button.setAttribute(
      "aria-label",
      `${liked ? "取消收藏" : "收藏"} ${track.title}`,
    );
  });
  const liked = state.favorites.has(state.currentId);
  $("#player-like").setAttribute("aria-pressed", String(liked));
  $("#player-like").setAttribute(
    "aria-label",
    liked ? "取消收藏当前音乐" : "收藏当前音乐",
  );
  updateFavoriteCount();
}

function toggleLike(id) {
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
    toast("已从收藏中移除");
  } else {
    state.favorites.add(id);
    toast("心动频率，已收藏");
  }
  savePreference("pulse-favorites", [...state.favorites]);
  if (state.view === "favorites") renderTracks();
  updateLikes();
}

audio.onEnded = async () => {
  if (state.repeat) {
    await audio.seek(0);
    await startTrack(state.currentId, false);
  } else {
    await advanceTrack();
  }
};
audio.onMetadata = () => {
  updateTrackInfo();
  if (currentTrack().local) renderTracks();
};
audio.onError = (message) => {
  toast(message);
  updatePlayback();
};

$$("[data-view]").forEach((button) =>
  button.addEventListener("click", () => setView(button.dataset.view)),
);
$$("[data-collection]").forEach((button) =>
  button.addEventListener("click", () =>
    setView("discover", button.dataset.collection),
  ),
);
$(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  setView("discover");
});
$(".page-footer .footer-brand").addEventListener("click", (event) => {
  event.preventDefault();
  setView("discover");
});
$("#all-music").addEventListener("click", () => setView("library"));
$("#reset-filter").addEventListener("click", () => setView("discover"));
$$("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    $$(".filter-chip").forEach((chip) => {
      chip.classList.toggle("active", chip === button);
      chip.setAttribute("aria-pressed", String(chip === button));
    });
    renderTracks();
  }),
);
$("#search").addEventListener("input", (event) => {
  if (state.view === "studio") {
    const query = event.target.value;
    setView("library");
    $("#search").value = query;
  }
  state.query = event.target.value;
  document.body.classList.toggle("is-searching", Boolean(state.query));
  renderTracks();
});
document.addEventListener("click", (event) => {
  const playButton = event.target.closest("[data-play]");
  const likeButton = event.target.closest("[data-like]");
  if (playButton) startTrack(playButton.dataset.play);
  if (likeButton) toggleLike(likeButton.dataset.like);
  if (event.target.closest("button") && !event.target.closest("[data-note]"))
    burst(event.clientX, event.clientY, 0.55);
});
$("#play").addEventListener("click", togglePlayback);
$("#hero-play").addEventListener("click", togglePlayback);
$("#immersive-play").addEventListener("click", togglePlayback);
$("#next").addEventListener("click", () => advanceTrack());
$("#previous").addEventListener("click", async () => {
  if (audio.position > 3) await audio.seek(0);
  else await advanceTrack(-1);
});
$("#player-like").addEventListener("click", () => toggleLike(state.currentId));
$("#shuffle").addEventListener("click", () => {
  state.shuffle = !state.shuffle;
  $("#shuffle").setAttribute("aria-pressed", String(state.shuffle));
  toast(state.shuffle ? "随机播放已开启" : "按顺序播放");
});
$("#repeat").addEventListener("click", () => {
  state.repeat = !state.repeat;
  $("#repeat").setAttribute("aria-pressed", String(state.repeat));
  toast(state.repeat ? "单曲循环已开启" : "顺序循环播放");
});

function setVolume(value) {
  audio.setVolume(value);
  $("#volume").value = Math.round(value * 100);
  $("#volume").style.setProperty("--fill", `${value * 100}%`);
  $("#mute").innerHTML = icon(value === 0 ? "muted" : "volume");
  $("#mute").setAttribute("aria-label", value === 0 ? "恢复音量" : "静音");
  if (value > 0) state.lastVolume = value;
}
$("#volume").addEventListener("input", (event) =>
  setVolume(Number(event.target.value) / 100),
);
$("#mute").addEventListener("click", () =>
  setVolume(audio.volume > 0 ? 0 : state.lastVolume),
);
$("#progress").addEventListener("pointerdown", () => {
  state.seeking = true;
});
$("#progress").addEventListener("input", (event) => {
  const value = Number(event.target.value);
  state.seeking = true;
  event.target.style.setProperty("--fill", `${value}%`);
  $("#current-time").textContent = formatTime((audio.duration * value) / 100);
});
$("#progress").addEventListener("change", async (event) => {
  try {
    await audio.seek((audio.duration * Number(event.target.value)) / 100);
  } catch {
    toast("这一段暂时无法定位，请重新点击播放。");
  }
  state.seeking = false;
  updatePlayback();
});
$("#progress").addEventListener("pointercancel", () => {
  state.seeking = false;
});
document.addEventListener("pointerup", () => {
  if (state.seeking)
    requestAnimationFrame(() => {
      state.seeking = false;
    });
});

function toggleQueue(open) {
  $("#queue-panel").hidden = !open;
  $("#queue-toggle").setAttribute("aria-expanded", String(open));
}
$("#queue-toggle").addEventListener("click", () =>
  toggleQueue($("#queue-panel").hidden),
);
$("#queue-close").addEventListener("click", () => toggleQueue(false));
document.addEventListener("click", (event) => {
  if (!event.target.closest("#queue-panel, #queue-toggle")) toggleQueue(false);
});

function updateEffects() {
  document.body.classList.toggle("motion-off", !state.effects);
  $("#effects-toggle").setAttribute("aria-pressed", String(state.effects));
  $("#effects-toggle span:nth-child(2)").textContent = state.effects
    ? "特效已开启"
    : "特效已关闭";
  if (!state.effects) {
    particles.length = 0;
    rings.length = 0;
    $("#hero-image").style.transform = "";
  }
}
$("#effects-toggle").addEventListener("click", () => {
  state.effects = !state.effects;
  savePreference("pulse-effects", state.effects);
  updateEffects();
});
$("#reverb-toggle").addEventListener("click", () => {
  audio.setReverb(!audio.reverbEnabled);
  $("#reverb-toggle").setAttribute("aria-pressed", String(audio.reverbEnabled));
  $("#reverb-toggle").innerHTML =
    `<span class="status-dot"></span>空间混响 ${audio.reverbEnabled ? "ON" : "OFF"}`;
});

async function playNote(index, target) {
  try {
    await audio.playPad(index);
  } catch (error) {
    toast(error.message);
    return;
  }
  const pad = $(`.music-pad[data-note="${index}"]`);
  pad.classList.add("pressed");
  clearTimeout(pad.releaseTimer);
  pad.releaseTimer = setTimeout(() => pad.classList.remove("pressed"), 260);
  const rectangle = (target || pad).getBoundingClientRect();
  burst(
    rectangle.x + rectangle.width / 2,
    rectangle.y + rectangle.height * 0.4,
    1.6,
    getComputedStyle(pad).getPropertyValue("--pad-color").trim(),
  );
}
$$("[data-note]").forEach((button) =>
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    playNote(Number(button.dataset.note), button);
  }),
);
$$("[data-note]").forEach((button) =>
  button.addEventListener("click", (event) => {
    if (event.detail === 0) playNote(Number(button.dataset.note), button);
  }),
);
document.addEventListener("keydown", (event) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target.matches("input, textarea, [contenteditable=true]")
  )
    return;
  if (event.code === "Space" && !event.target.closest("button, a")) {
    event.preventDefault();
    if (!event.repeat) togglePlayback();
    return;
  }
  if (event.key === "/") {
    event.preventDefault();
    if ($("#immersive").open) $("#immersive").close();
    $("#search").focus();
    return;
  }
  const index = ["a", "s", "d", "f", "g", "h"].indexOf(event.key.toLowerCase());
  if (index !== -1 && !event.repeat) playNote(index);
  if (event.key === "Escape") toggleQueue(false);
});

const fileUrls = new Set();
let localSequence = 0;
function inspectAudio(url) {
  return new Promise((resolve, reject) => {
    const probe = new Audio();
    const timer = setTimeout(() => finish(new Error("读取音频超时")), 8000);
    function finish(error) {
      clearTimeout(timer);
      const duration = probe.duration;
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.removeAttribute("src");
      probe.load();
      if (error || !Number.isFinite(duration) || duration <= 0)
        reject(error || new Error("音频时长无法读取"));
      else resolve(duration);
    }
    probe.preload = "metadata";
    probe.onloadedmetadata = () => finish();
    probe.onerror = () => finish(new Error("音频无法解码"));
    probe.src = url;
  });
}
$("#import-button").addEventListener("click", () => $("#file-input").click());
$("#library-import").addEventListener("click", () => $("#file-input").click());
$("#file-input").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  if (!files.length) return;
  $("#import-button").disabled = true;
  $("#library-import").disabled = true;
  const imported = await Promise.all(
    files.map(async (file) => {
      const url = URL.createObjectURL(file);
      try {
        const duration = await inspectAudio(url);
        localSequence += 1;
        fileUrls.add(url);
        const title = file.name.replace(/\.[^/.]+$/, "");
        return {
          id: `local-${localSequence}`,
          title,
          coverTitle: title.length > 22 ? `${title.slice(0, 20)}…` : title,
          local: true,
          url,
          duration,
          genre: "local",
          style: "本地音乐",
          mood: "你的声音",
          art: (localSequence - 1) % 4,
        };
      } catch {
        URL.revokeObjectURL(url);
        return null;
      }
    }),
  );
  const valid = imported.filter(Boolean);
  tracks.push(...valid);
  $("#import-button").disabled = false;
  $("#library-import").disabled = false;
  event.target.value = "";
  if (valid.length) {
    setView("library");
    renderQueue();
    toast(
      `已导入 ${valid.length} 首音乐，刷新后可重新导入${valid.length < files.length ? "。部分文件无法读取" : ""}`,
    );
  } else {
    toast("这些文件暂时无法播放，请试试 MP3、WAV 或 OGG。");
  }
});

const canvas = $("#particles");
const context = canvas.getContext("2d");
const sceneCanvas = $("#soundscape");
const scene = sceneCanvas.getContext("2d");
const heroWaveCanvas = $("#hero-waveform");
const heroWaveContext = heroWaveCanvas.getContext("2d");
let heroWaveWidth = 0;
let heroWaveHeight = 0;
let heroVisible = true;
const particles = [];
const rings = [];
const notes = ["♪", "♫", "♬", "♩"];
const starfield = Array.from({ length: 85 }, () => ({
  x: Math.random(),
  y: Math.random(),
  size: Math.random() * 1.5 + 0.4,
  phase: Math.random() * Math.PI * 2,
}));
let width = window.innerWidth;
let height = window.innerHeight;
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
let orb = { x: width / 2, y: height * 0.38 };
let pointerDown = false;
let lastPointerNote = 0;

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  [canvas, sceneCanvas].forEach((element) => {
    element.width = Math.floor(width * pixelRatio);
    element.height = Math.floor(height * pixelRatio);
  });
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  scene.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  resizeHeroWaveform();
  if ($("#immersive").open) {
    const rectangle = $(".sound-orb").getBoundingClientRect();
    orb = {
      x: rectangle.x + rectangle.width / 2,
      y: rectangle.y + rectangle.height / 2,
    };
  }
}
window.addEventListener("resize", resizeCanvas);

function resizeHeroWaveform() {
  const rectangle = heroWaveCanvas.getBoundingClientRect();
  heroWaveWidth = rectangle.width;
  heroWaveHeight = rectangle.height;
  heroWaveCanvas.width = Math.floor(heroWaveWidth * pixelRatio);
  heroWaveCanvas.height = Math.floor(heroWaveHeight * pixelRatio);
  heroWaveContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

new ResizeObserver(resizeHeroWaveform).observe(heroWaveCanvas);
new IntersectionObserver(([entry]) => {
  heroVisible = entry.isIntersecting;
}).observe($("#hero"));

function drawHeroWaveform(levels) {
  if (!heroVisible || !heroWaveWidth) return;
  heroWaveContext.clearRect(0, 0, heroWaveWidth, heroWaveHeight);
  if (!state.effects || !levels.waveform || levels.energy < 0.005) return;
  heroWaveContext.beginPath();
  heroWaveContext.strokeStyle = "#ceff57";
  heroWaveContext.lineWidth = 1;
  const samples = levels.waveform;
  for (let index = 0; index < samples.length; index += 1) {
    const x = (index / (samples.length - 1)) * heroWaveWidth;
    const y =
      heroWaveHeight / 2 +
      ((samples[index] - 128) / 128) * heroWaveHeight * 0.9;
    if (index === 0) heroWaveContext.moveTo(x, y);
    else heroWaveContext.lineTo(x, y);
  }
  heroWaveContext.stroke();
}

function burst(x, y, intensity = 1, color = "#ceff57") {
  if (!state.effects) return;
  if (!x && !y) {
    x = width / 2;
    y = height / 2;
  }
  const count = Math.round(14 * intensity);
  for (let index = 0; index < count; index += 1) {
    const isNote = index < Math.ceil(intensity * 3);
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 2.5 + 0.8;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      decay: isNote ? 0.009 : 0.022,
      size: isNote ? 17 + Math.random() * 14 : 1 + Math.random() * 2,
      note: isNote ? notes[Math.floor(Math.random() * notes.length)] : "",
      rotation: Math.random() * 0.6 - 0.3,
      color,
    });
  }
  rings.push({ x, y, radius: 4, life: 1, color });
  if (particles.length > 240) particles.splice(0, particles.length - 240);
  if (rings.length > 16) rings.shift();
}

function drawParticles(target) {
  target.save();
  for (const particle of particles) {
    target.save();
    target.globalAlpha = Math.max(0, particle.life);
    target.translate(particle.x, particle.y);
    target.rotate(particle.rotation);
    target.fillStyle = particle.color;
    target.shadowColor = particle.color;
    target.shadowBlur = particle.note ? 16 : 8;
    if (particle.note) {
      target.font = `italic ${particle.size}px Georgia,serif`;
      target.fillText(particle.note, 0, 0);
    } else {
      target.beginPath();
      target.arc(0, 0, particle.size, 0, Math.PI * 2);
      target.fill();
    }
    target.restore();
  }
  for (const ring of rings) {
    target.globalAlpha = Math.max(0, ring.life * 0.65);
    target.strokeStyle = ring.color;
    target.lineWidth = 1;
    target.beginPath();
    target.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    target.stroke();
  }
  target.restore();
}

function openImmersive() {
  toggleQueue(false);
  if (!$("#immersive").open) $("#immersive").showModal();
  document.documentElement.style.overflow = "hidden";
  resizeCanvas();
  burst(orb.x, orb.y, 2);
}
["#hero-immersive", "#expand", "#player-art"].forEach((selector) =>
  $(selector).addEventListener("click", openImmersive),
);
$("#immersive-close").addEventListener("click", () => $("#immersive").close());
$("#immersive").addEventListener("close", () => {
  pointerDown = false;
  document.documentElement.style.overflow = "";
  $(".sound-orb").style.removeProperty("--orb-scale");
});
$(".immersive-top .footer-brand").addEventListener("click", (event) => {
  event.preventDefault();
  $("#immersive").close();
  setView("discover");
});
$("#immersive").addEventListener("pointerdown", (event) => {
  if (event.target.closest("button, a")) return;
  pointerDown = true;
  burst(event.clientX, event.clientY, 1.3);
  audio
    .playPad(Math.min(5, Math.floor((event.clientX / width) * 6)))
    .catch((error) => toast(error.message));
});
document.addEventListener("pointerup", () => {
  pointerDown = false;
});
$("#immersive").addEventListener("pointercancel", () => {
  pointerDown = false;
});
$("#immersive").addEventListener("pointermove", (event) => {
  if (!pointerDown || !state.effects) return;
  burst(event.clientX, event.clientY, 0.18);
  if (performance.now() - lastPointerNote > 180) {
    lastPointerNote = performance.now();
    audio
      .playPad(Math.min(5, Math.floor((event.clientX / width) * 6)))
      .catch((error) => toast(error.message));
  }
});
$("#hero").addEventListener("pointermove", (event) => {
  if (!state.effects || event.pointerType === "touch") return;
  const rectangle = $("#hero").getBoundingClientRect();
  const x = (event.clientX - rectangle.x) / rectangle.width - 0.5;
  const y = (event.clientY - rectangle.y) / rectangle.height - 0.5;
  $("#hero-image").style.transform =
    `translate(${x * 12}px,${y * 10}px) scale(1.035)`;
});
$("#hero").addEventListener("pointerleave", () => {
  $("#hero-image").style.transform = "";
});

function drawSoundscape(time, levels) {
  scene.clearRect(0, 0, width, height);
  const glow = scene.createRadialGradient(
    orb.x,
    orb.y,
    10,
    orb.x,
    orb.y,
    Math.max(width, height) * 0.65,
  );
  glow.addColorStop(0, `rgba(119,175,35,${0.08 + levels.energy * 0.13})`);
  glow.addColorStop(0.5, "rgba(40,70,13,0.025)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  scene.fillStyle = glow;
  scene.fillRect(0, 0, width, height);
  const motion = state.effects ? time * 0.0001 : 0;
  for (const star of starfield) {
    const x =
      (star.x * width + Math.sin(motion + star.phase) * 16 + width) % width;
    const y = (star.y * height - motion * 9 + height * 10) % height;
    scene.fillStyle = `rgba(195,230,152,${0.12 + (Math.sin(motion * 2 + star.phase) + 1) * 0.12})`;
    scene.beginPath();
    scene.arc(x, y, star.size, 0, Math.PI * 2);
    scene.fill();
  }
  const radius = width < 700 ? 127 : 149;
  for (let index = 0; index < 90; index += 1) {
    const angle = (index / 90) * Math.PI * 2 - Math.PI / 2;
    const bin = levels.bins
      ? levels.bins[Math.min(90, Math.floor((index % 45) * 1.4))] / 255
      : 0;
    const length = state.effects ? 3 + bin * 55 : 3;
    scene.strokeStyle = `rgba(206,255,87,${0.15 + bin * 0.6})`;
    scene.lineWidth = 2;
    scene.beginPath();
    scene.moveTo(
      orb.x + Math.cos(angle) * radius,
      orb.y + Math.sin(angle) * radius,
    );
    scene.lineTo(
      orb.x + Math.cos(angle) * (radius + length),
      orb.y + Math.sin(angle) * (radius + length),
    );
    scene.stroke();
  }
  if (state.effects)
    $(".sound-orb").style.setProperty("--orb-scale", 1 + levels.bass * 0.075);
  drawParticles(scene);
}

let previousFrame = performance.now();
let lastUiFrame = 0;
let lastBeatNote = 0;
function animate(time) {
  const delta = Math.min((time - previousFrame) / 16.67, 2);
  previousFrame = time;
  context.clearRect(0, 0, width, height);
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vy += 0.018 * delta;
    particle.life -= particle.decay * delta;
    particle.rotation += 0.003 * delta;
    if (particle.life <= 0) particles.splice(index, 1);
  }
  for (let index = rings.length - 1; index >= 0; index -= 1) {
    rings[index].radius += 1.8 * delta;
    rings[index].life -= 0.025 * delta;
    if (rings[index].life <= 0) rings.splice(index, 1);
  }
  drawParticles(context);
  const levels = audio.getLevels();
  drawHeroWaveform(levels);
  if ($("#immersive").open) drawSoundscape(time, levels);
  if (
    state.effects &&
    audio.playing &&
    levels.bass > 0.35 &&
    time - lastBeatNote > 650
  ) {
    lastBeatNote = time;
    if ($("#immersive").open) {
      const angle = Math.random() * Math.PI * 2;
      burst(orb.x + Math.cos(angle) * 150, orb.y + Math.sin(angle) * 150, 0.4);
    } else {
      const hero = $("#hero").getBoundingClientRect();
      if (hero.bottom > 0 && hero.top < height)
        burst(
          hero.right - hero.width * (0.15 + Math.random() * 0.3),
          hero.top + hero.height * (0.3 + Math.random() * 0.5),
          0.35,
        );
    }
  }
  if (time - lastUiFrame > 90) {
    lastUiFrame = time;
    if (!state.seeking) {
      const position = audio.position;
      const progress = audio.duration ? (position / audio.duration) * 100 : 0;
      $("#current-time").textContent = formatTime(position);
      $("#progress").value = progress;
      $("#progress").style.setProperty("--fill", `${progress}%`);
      $("#progress").setAttribute(
        "aria-valuetext",
        `${formatTime(position)}，共 ${formatTime(audio.duration)}`,
      );
    }
    $$("#player-spectrum i").forEach((bar, index) => {
      const energy =
        state.effects && levels.bins ? levels.bins[index * 2 + 1] / 255 : 0;
      bar.style.height = `${3 + energy * 18}px`;
    });
  }
  requestAnimationFrame(animate);
}

window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  audio.dispose();
  fileUrls.forEach((url) => URL.revokeObjectURL(url));
});

audio.load(tracks[0]);
document.body.classList.add("view-discover");
$(".nav-item.active").setAttribute("aria-current", "page");
$$(".filter-chip").forEach((button) => {
  button.setAttribute(
    "aria-pressed",
    String(button.classList.contains("active")),
  );
});
resizeCanvas();
updateEffects();
renderTracks();
updateTrackInfo();
updatePlayback();
requestAnimationFrame(animate);
