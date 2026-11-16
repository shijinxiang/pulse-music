const tracks = window.PULSE_CATALOG;
const audio = new PulseAudio();
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const foil = new PulseFoil();
const padMaterials = new PulsePadMaterials();
const padButtons = $$(".music-pad");
const heroScene = new PulseHeroScene($("#hero-scene"), $("#hero-image"));
const liquidGlass = new PulseLiquidGlass();
const lyrics = new PulseLyrics(audio);
const collectionLabels = { memory: "青春回放", night: "深夜慢听", screen: "影视回声", energy: "轻快律动" };

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
  effects:
    !motionPreference.matches && Boolean(readPreference("pulse-effects", true)),
  lastVolume: 0.65,
  seeking: false,
};

const genreCarousel = new PulseGenreCarousel($("#genre-carousel"), (filter) => {
  if (state.filter === filter) return;
  state.filter = filter;
  renderTracks();
});

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
  const filtered = tracks.filter((track) => {
    const matchesView = state.view !== "favorites" || state.favorites.has(track.id);
    const matchesGenre = state.filter === "all" || (track.genres || [track.genre]).includes(state.filter);
    const matchesCollection = !state.collection || (track.collections || []).includes(state.collection);
    const searchable = `${track.title} ${track.artist || ""} ${track.style} ${track.mood} ${(track.tags || []).join(" ")}`.toLowerCase();
    return matchesView && matchesGenre && matchesCollection && searchable.includes(state.query.toLowerCase().trim());
  });
  if (state.view !== "discover" || state.query || state.collection) return filtered;
  const featured = state.filter === "all" ? filtered.filter((track) => track.homeRank != null).sort((a,b) => a.homeRank - b.homeRank) : filtered;
  return featured.slice(0, 8);
}

function coverStyle(track) {
  return track.cover ? `style="background-image:url(${track.cover})"` : "";
}

function renderTracks() {
  const filtered = visibleTracks();
  $("#track-grid").innerHTML = filtered
    .map((track) => {
      const liked = state.favorites.has(track.id);
      return `<article class="track-card collector-card${audio.playing && track.id === state.currentId ? " playing" : ""}" data-track="${track.id}">
      <span class="material-rim foil light" data-foil="foil" aria-hidden="true"></span>
      <div class="cover-wrap">
        <div class="cover-image album-art catalog-art-${track.art}" ${coverStyle(track)} role="img" aria-label="${escapeText(track.title)} 音乐封面"></div>
        <div class="cover-shade"></div>
        <span class="track-artist">${escapeText(track.artist || "本地音乐")}</span><span class="cover-title">${escapeText(track.coverTitle)}</span>
        <button class="cover-select" data-play="${track.id}" aria-label="播放 ${escapeText(track.title)}"></button>
        <span class="cover-play material-pearl" data-foil="pearl" aria-hidden="true">${icon("play")}</span>
      </div>
      <div class="track-info-row"><h3 class="track-name"><button class="track-title-button" data-play="${track.id}">${escapeText(track.title)}</button></h3><button class="icon-button like-button" data-like="${track.id}" aria-label="${liked ? "取消收藏" : "收藏"} ${escapeText(track.title)}" aria-pressed="${liked}">${icon("heart")}</button></div>
      <div class="track-meta"><span class="track-meta-left">${escapeText(track.artist || "本地音乐")} · ${escapeText(track.style)}</span><span class="track-bpm">${track.local ? formatTime(track.duration) : `${track.bpm} BPM`}</span></div>
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
  renderQueue();
  foil.invalidate();
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
  $("#queue-list").innerHTML = visibleTracks()
    .map(
      (track) =>
        `<button class="queue-row${track.id === state.currentId ? " current" : ""}" data-play="${track.id}" aria-label="播放 ${escapeText(track.title)}"><span class="queue-art album-art catalog-art-${track.art}" ${coverStyle(track)}></span><span class="queue-details"><strong>${escapeText(track.title)}</strong><small>${escapeText(track.artist || "本地音乐")} · ${escapeText(track.style)}</small></span>${icon(track.id === state.currentId && audio.playing ? "pause" : "play")}</button>`,
    )
    .join("");
  foil.invalidate();
}

function updateFilterChips(filter) {
  genreCarousel.sync(filter);
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
  $("#breadcrumb-current").textContent = collection ? collectionLabels[collection] : labels[view];
  $("#section-title").innerHTML = `${collection ? collectionLabels[collection] : titles[view] || titles.discover}<span class="lime-dot">.</span>`;
  $("#all-music").hidden = view === "library";
  $("#library-import").hidden = view !== "library";
  document.querySelector('[data-filter="all"]').textContent = view === "discover" ? "为你精选" : "全部风格";
  $("#collection-select").value = collection || "";
  updateFilterChips("all");
  renderTracks();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateTrackInfo() {
  const track = currentTrack();
  $("#player-title").textContent = track.title;
  $("#player-artist").textContent = `${track.artist || "本地音乐"} · ${track.style}`;
  $("#player-art").className = `player-art album-art catalog-art-${track.art}`;
  $("#player-art").style.backgroundImage = track.cover ? `url(${track.cover})` : "";
  $("#immersive-title").textContent = track.title;
  $("#immersive-style").textContent = `${track.artist || "本地音乐"} · ${track.style}`;
  $("#immersive-duration").textContent = formatTime(track.duration);
  lyrics.setTrack(track);
  $("#immersive-bpm").textContent = track.local
    ? formatTime(track.duration)
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
    `<span class="material-rim foil light" data-foil="foil" aria-hidden="true"></span>${icon(audio.playing ? "pause" : "play")}<span>${audio.playing ? "暂停音乐" : "即刻开听"}</span>`;
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
  const visible = visibleTracks();
  const queue = visible.length ? visible : tracks;
  let index = queue.findIndex((track) => track.id === state.currentId);
  if (state.shuffle && queue.length > 1) {
    index =
      (index + 1 + Math.floor(Math.random() * (queue.length - 1))) %
      queue.length;
  } else {
    index = (index + direction + queue.length) % queue.length;
  }
  await startTrack(queue[index].id, false);
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
    setView("library", button.dataset.collection),
  ),
);
$$(".brand, .mobile-brand").forEach((link) =>
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setView("discover");
  }),
);
$(".page-footer .footer-brand").addEventListener("click", (event) => {
  event.preventDefault();
  setView("discover");
});
$("#all-music").addEventListener("click", () => setView("library"));
$("#reset-filter").addEventListener("click", () => setView("discover"));
$("#collection-select").addEventListener("change", (event) => {
  setView("library", event.target.value || null);
});
$("#search").addEventListener("input", (event) => {
  if (state.view === "studio" || (state.view === "discover" && event.target.value.trim())) {
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
$("#immersive-previous").addEventListener("click", () => advanceTrack(-1));
$("#immersive-next").addEventListener("click", () => advanceTrack(1));
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
for (const progress of $$("#progress, #immersive-progress")) {
  progress.addEventListener("pointerdown", () => { state.seeking = true; });
  progress.addEventListener("input", (event) => {
    state.seeking = true;
    event.target.style.setProperty("--fill", `${event.target.value}%`);
    const position = formatTime(audio.duration * Number(event.target.value) / 100);
    $("#current-time").textContent = position;
    $("#immersive-current").textContent = position;
  });
  progress.addEventListener("change", async (event) => {
    try { await audio.seek(audio.duration * Number(event.target.value) / 100); }
    catch { toast("这一段暂时无法定位，请重新点击播放。"); }
    state.seeking = false;
    updatePlayback();
  });
  progress.addEventListener("pointercancel", () => { state.seeking = false; });
}
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
  foil.setEnabled(state.effects);
  liquidGlass.setEnabled(state.effects);
  genreCarousel.setEnabled(state.effects && !motionPreference.matches);
  $("#effects-toggle").setAttribute("aria-pressed", String(state.effects));
  $("#effects-toggle").setAttribute(
    "aria-label",
    state.effects ? "关闭互动特效" : "开启互动特效",
  );
  $("#effects-toggle span:nth-child(2)").textContent = state.effects
    ? "特效已开启"
    : "特效已关闭";
  if (!state.effects) {
    particles.length = 0;
    rings.length = 0;
    trailPointer = null;
    $("#hero-image").style.transform = "";
    heroScene.setParallax(0, 0);
    $(".sound-orb").style.setProperty("--orb-scale", 1);
  }
}
$("#effects-toggle").addEventListener("click", () => {
  state.effects = !state.effects;
  savePreference("pulse-effects", state.effects);
  updateEffects();
});
motionPreference.addEventListener("change", (event) => {
  if (!event.matches) return;
  state.effects = false;
  updateEffects();
});
$("#reverb-toggle").addEventListener("click", () => {
  audio.setReverb(!audio.reverbEnabled);
  $("#reverb-toggle").setAttribute("aria-pressed", String(audio.reverbEnabled));
  $("#reverb-toggle .reverb-state").textContent = audio.reverbEnabled
    ? "ON"
    : "OFF";
});

async function playNote(index, target) {
  const pad = padButtons.find((button) => Number(button.dataset.note) === index);
  if (!pad) return;
  try {
    await audio.playPad(index);
  } catch (error) {
    toast(error.message);
    return;
  }
  pad.classList.add("pressed");
  foil.invalidate();
  clearTimeout(pad.releaseTimer);
  pad.releaseTimer = setTimeout(() => {
    pad.classList.remove("pressed");
    foil.invalidate();
  }, 260);
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
    event.target.closest("input, textarea, select, [contenteditable=true]")
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
  const pad = padButtons.find((button) => button.dataset.key === event.key.toLowerCase());
  if (pad && !event.repeat) playNote(Number(pad.dataset.note));
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
const terrain = new PulseWaveTerrain($("#music-visualizer"));
const visualizerCanvas = terrain.canvas;
const immersiveTerrain = new PulseWaveTerrain($("#soundscape"), {
  immersive: true,
  simulation: terrain.simulation,
});
const sceneCanvas = $("#immersive-particles");
const scene = sceneCanvas.getContext("2d");
const heroWaveCanvas = $("#hero-waveform");
const heroWaveContext = heroWaveCanvas.getContext("2d");
let heroWaveWidth = 0;
let heroWaveHeight = 0;
let heroVisible = true;
const heroElement = $("#hero");
const heroArt = $(".hero-art");
const heroNotes = $$(".hero-note").map((element) => ({
  element,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  anchorX: 0,
  anchorY: 0,
}));
let heroGeometry = null;
let heroGeometryDirty = true;
let heroPointer = null;
let lastHeroDepth = "";
const particles = [];
const rings = [];
const notes = ["♪", "♫", "♬", "♩"];
const noteColors = [
  "#ff647e",
  "#ffae57",
  "#ffe46b",
  "#b9ff65",
  "#62eadd",
  "#77afff",
  "#d99aff",
];
let trailPointer = null;
let trailColor = 0;
let width = window.innerWidth;
let height = window.innerHeight;
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
let orb = { x: width / 2, y: height * 0.38 };
let pointerDown = false;
let lastPointerNote = 0;

function resizeCanvas() {
  foil.invalidate();
  width = window.innerWidth;
  height = window.innerHeight;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  [canvas, sceneCanvas].forEach((element) => {
    element.width = Math.floor(width * pixelRatio);
    element.height = Math.floor(height * pixelRatio);
  });
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  scene.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  terrain.resize(width, height, pixelRatio);
  immersiveTerrain.resize(width, height, pixelRatio);
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
window.addEventListener("resize", () => {
  heroGeometryDirty = true;
});
new ResizeObserver(() => {
  heroGeometryDirty = true;
}).observe(heroElement);
window.addEventListener("blur", () => {
  heroPointer = null;
});
document.fonts.ready.then(resizeCanvas);

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
  heroWaveContext.strokeStyle = "#d6d3e3";
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

function burst(x, y, intensity = 1, color = "#d6d3e3") {
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
    const lifetime = isNote ? 850 : 450;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      lifetime,
      expiresAt: performance.now() + lifetime,
      size: isNote ? 17 + Math.random() * 14 : 1 + Math.random() * 2,
      note: isNote ? notes[Math.floor(Math.random() * notes.length)] : "",
      rotation: Math.random() * 0.6 - 0.3,
      color: isNote ? noteColors[trailColor++ % noteColors.length] : color,
    });
  }
  rings.push({ x, y, radius: 4, life: 1, color });
  if (particles.length > 240) particles.splice(0, particles.length - 240);
  if (rings.length > 16) rings.shift();
}

document.addEventListener(
  "pointermove",
  (event) => {
    if (!state.effects || event.pointerType === "touch") return;
    const now = performance.now();
    const previous = trailPointer;
    const distance = previous
      ? Math.hypot(event.clientX - previous.x, event.clientY - previous.y)
      : 20;
    if (previous && distance < 10) return;
    if (previous && now - previous.time < 14) return;
    const continuous = previous && now - previous.time < 90;
    const count = continuous
      ? Math.min(5, Math.max(1, Math.floor(distance / 18)))
      : 1;
    for (let index = 1; index <= count; index += 1) {
      const fraction = index / count;
      const color = noteColors[trailColor++ % noteColors.length];
      particles.push({
        x: continuous
          ? previous.x + (event.clientX - previous.x) * fraction
          : event.clientX,
        y: continuous
          ? previous.y + (event.clientY - previous.y) * fraction
          : event.clientY,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.7 - Math.random() * 0.5,
        life: 1,
        lifetime: 300,
        expiresAt: now + 300,
        size: 20 + Math.min(distance * 0.08, 12),
        note: notes[trailColor % notes.length],
        rotation: (Math.random() - 0.5) * 0.6,
        color,
      });
    }
    trailPointer = { x: event.clientX, y: event.clientY, time: now };
    if (particles.length > 240) particles.splice(0, particles.length - 240);
  },
  { passive: true },
);

window.addEventListener("blur", () => {
  trailPointer = null;
});
document.addEventListener("pointerleave", () => {
  trailPointer = null;
});

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
  heroPointer = null;
  if (!$("#immersive").open) $("#immersive").showModal();
  document.documentElement.style.overflow = "hidden";
  resizeCanvas();
  lyrics.open();
}
["#hero-immersive", "#expand", "#player-art"].forEach((selector) =>
  $(selector).addEventListener("click", openImmersive),
);
$("#immersive-close").addEventListener("click", () => $("#immersive").close());
$("#immersive").addEventListener("close", () => {
  lyrics.close();
  pointerDown = false;
  document.documentElement.style.overflow = "";
  $(".sound-orb").style.removeProperty("--orb-scale");
});
$(".immersive-top .footer-brand").addEventListener("click", (event) => {
  event.preventDefault();
  $("#immersive").close();
  setView("discover");
});
function padIndexAt(clientX) {
  return Math.max(0, Math.min(audio.padNotes.length - 1,
    Math.floor(clientX / width * audio.padNotes.length)));
}

$("#immersive").addEventListener("pointerdown", (event) => {
  if (event.target.closest("button, a, .lyrics-viewport, .immersive-track-meta, .immersive-footer")) return;
  pointerDown = true;
  burst(event.clientX, event.clientY, 1.3);
  audio
    .playPad(padIndexAt(event.clientX))
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
      .playPad(padIndexAt(event.clientX))
      .catch((error) => toast(error.message));
  }
});
heroElement.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse") return;
  heroPointer = { x: event.clientX, y: event.clientY };
}, { passive: true });
heroElement.addEventListener("pointerleave", () => {
  heroPointer = null;
});

function updateHeroMotion(delta) {
  if (heroGeometryDirty) {
    const rectangle = heroElement.getBoundingClientRect();
    heroGeometry = {
      left: rectangle.left,
      top: rectangle.top + scrollY,
      width: rectangle.width,
      height: rectangle.height,
    };
    for (const note of heroNotes) {
      const bounds = note.element.getBoundingClientRect();
      note.anchorX = bounds.left + bounds.width / 2 - note.x;
      note.anchorY = bounds.top + scrollY + bounds.height / 2 - note.y;
    }
    heroGeometryDirty = false;
  }
  const enabled = state.effects && !motionPreference.matches;
  const depth = enabled ? Math.min(scrollY, heroGeometry.height) : 0;
  const depthKey = `${depth},${enabled}`;
  if (depthKey !== lastHeroDepth) {
    lastHeroDepth = depthKey;
    heroArt.style.setProperty("--hero-scroll", `${depth * (width > 760 ? 0.13 : 0.08)}px`);
    visualizerCanvas.style.transform = `translate3d(0, ${enabled ? -Math.min(scrollY * 0.055, 80) : 0}px, 0)`;
  }
  const pointer = enabled && heroVisible && heroGeometry.width && heroGeometry.height
    ? heroPointer : null;
  const top = heroGeometry.top - scrollY;
  heroScene.setParallax(
    pointer ? (pointer.x - heroGeometry.left) / heroGeometry.width - 0.5 : 0,
    pointer ? (pointer.y - top) / heroGeometry.height - 0.5 : 0,
  );
  const damping = Math.exp(-0.29 * delta);
  for (const note of heroNotes) {
    let targetX = 0;
    let targetY = enabled ? depth * 0.065 : 0;
    if (pointer && !note.element.matches(":focus-visible, :active")) {
      const dx = note.anchorX - pointer.x;
      const dy = note.anchorY - scrollY + targetY - pointer.y;
      const distance = Math.hypot(dx, dy);
      const force = Math.pow(Math.max(0, 1 - distance / 132), 2) * 60;
      const direction = Math.max(distance, 1);
      targetX = (dx / direction) * force;
      targetY += (dy / direction) * force;
      targetX = Math.max(28 - note.anchorX, Math.min(width - 28 - note.anchorX, targetX));
    }
    note.vx = (note.vx + (targetX - note.x) * 0.085 * delta) * damping;
    note.vy = (note.vy + (targetY - note.y) * 0.085 * delta) * damping;
    note.x += note.vx * delta;
    note.y += note.vy * delta;
    if (!enabled) note.x = note.y = note.vx = note.vy = 0;
    note.element.style.translate = `${note.x.toFixed(2)}px ${note.y.toFixed(2)}px`;
  }
}

function drawSoundscape(time, levels) {
  immersiveTerrain.render(time, levels, state.effects && !motionPreference.matches);
  scene.clearRect(0, 0, width, height);
  if (state.effects)
    $(".sound-orb").style.setProperty("--orb-scale", 1 + levels.bass * 0.075);
  drawParticles(scene);
}

let previousFrame = performance.now();
let lastUiFrame = 0;
function animate(time) {
  const delta = Math.min((time - previousFrame) / 16.67, 2);
  previousFrame = time;
  updateHeroMotion(delta);
  genreCarousel.update(time, state.view !== "studio" && !$("#immersive").open && !document.hidden && document.hasFocus());
  foil.update();
  context.clearRect(0, 0, width, height);
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vy += 0.018 * delta;
    particle.life = Math.min(
      1,
      Math.max(0, (particle.expiresAt - time) / particle.lifetime),
    );
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
  lyrics.update();
  if ($("#immersive").open) drawSoundscape(time, levels);
  else {
    padMaterials.render(foil, time);
    if (heroVisible)
      heroScene.render(time, levels, state.effects && !motionPreference.matches);
    terrain.render(time, levels, state.effects && !motionPreference.matches);
    drawHeroWaveform(levels);
  }
  if (time - lastUiFrame > 90) {
    lastUiFrame = time;
    if (!state.seeking) {
      const position = audio.position;
      const progress = audio.duration ? (position / audio.duration) * 100 : 0;
      $("#current-time").textContent = formatTime(position);
      $("#immersive-current").textContent = formatTime(position);
      $("#immersive-progress").value = progress;
      $("#immersive-progress").style.setProperty("--fill", `${progress}%`);
      $("#progress").value = progress;
      $("#progress").style.setProperty("--fill", `${progress}%`);
      $("#immersive-progress").setAttribute("aria-valuetext", `${formatTime(position)}，共 ${formatTime(audio.duration)}`);
      $("#progress").setAttribute(
        "aria-valuetext",
        `${formatTime(position)}，共 ${formatTime(audio.duration)}`,
      );
    }
    $$("#player-spectrum i").forEach((bar, index) => {
      const energy = state.effects ? levels.bands[index * 4] : 0;
      bar.style.height = `${3 + energy * 18}px`;
    });
  }
  requestAnimationFrame(animate);
}

window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  audio.dispose();
  padMaterials.dispose();
  liquidGlass.dispose();
  genreCarousel.dispose();
  terrain.dispose();
  immersiveTerrain.dispose();
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
