/* File playback and interactive synthesizer. Audio starts after a listener gesture. */
class PulseAudio {
  constructor() {
    this.context = null;
    this.padNotes = [60, 62, 64, 65, 67, 69, 71, 72];
    this.track = null;
    this.playing = false;
    this.offset = 0;
    this.volume = 0.65;
    this.voices = new Set();
    this.operation = 0;
    this.timer = null;
    this.reverbEnabled = true;
    this.visualBands = new Float32Array(48);
    this.levels = {
      bass: 0,
      energy: 0,
      rms: 0,
      bands: this.visualBands,
      bins: null,
      waveform: null,
    };
    this.resetAnalysis();
    this.onEnded = () => {};
    this.onError = () => {};
    this.onMetadata = () => {};
    this.localAudio = new Audio();
    this.localAudio.preload = "metadata";
    this.localAudio.addEventListener("ended", () => {
      this.playing = false;
      this.onEnded();
    });
    this.localAudio.addEventListener("loadedmetadata", () => {
      if (this.track?.local && Number.isFinite(this.localAudio.duration)) {
        this.track.duration = this.localAudio.duration;
        this.onMetadata();
      }
    });
    this.localAudio.addEventListener("error", () => {
      if (!this.track?.local) return;
      this.playing = false;
      this.onError("这个音频暂时无法解码，请试试 MP3、WAV 或 OGG 文件。");
    });
  }

  async initialize() {
    if (!this.context) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass)
        throw new Error("当前浏览器暂不支持 Web Audio，请使用新版浏览器打开。");
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * 0.8;
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -20;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 4;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.55;
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.waveformData = new Uint8Array(this.analyser.fftSize);
      this.frequencyDb = new Float32Array(this.analyser.frequencyBinCount);
      this.timeData = new Float32Array(this.analyser.fftSize);
      this.levels.bins = this.frequencyData;
      this.levels.waveform = this.waveformData;
      const binHz = this.context.sampleRate / this.analyser.fftSize;
      const maxHz = Math.min(16000, this.context.sampleRate / 2);
      // Logarithmic bands keep bass, voices and treble visible at every sample rate.
      this.bandRanges = Array.from(this.visualBands, (_, index) => {
        const lowHz = 35 * Math.pow(maxHz / 35, index / 48);
        const highHz = 35 * Math.pow(maxHz / 35, (index + 1) / 48);
        const start = Math.max(1, Math.floor(lowHz / binHz));
        const end = Math.min(
          this.frequencyData.length,
          Math.max(start + 1, Math.floor(highHz / binHz)),
        );
        return { start, end };
      });
      this.master.connect(this.compressor);
      this.compressor.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = 0.6;
      this.musicBus.connect(this.master);
      this.padBus = this.context.createGain();
      this.padBus.gain.value = 0.6;
      this.padBus.connect(this.master);
      this.mediaSource = this.context.createMediaElementSource(this.localAudio);
      this.mediaSource.connect(this.musicBus);
      this.createReverb();
      this.createNoise();
    }
    if (this.context.state !== "running") await this.context.resume();
  }

  createReverb() {
    const length = Math.floor(this.context.sampleRate * 2.4);
    const impulse = this.context.createBuffer(
      2,
      length,
      this.context.sampleRate,
    );
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        data[index] =
          (Math.random() * 2 - 1) * Math.pow(1 - index / length, 3.4);
      }
    }
    this.reverb = this.context.createConvolver();
    this.reverb.buffer = impulse;
    this.reverbGain = this.context.createGain();
    this.reverbGain.gain.value = this.reverbEnabled ? 0.32 : 0;
    this.padBus.connect(this.reverb);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);
  }

  createNoise() {
    this.noiseBuffer = this.context.createBuffer(
      1,
      this.context.sampleRate,
      this.context.sampleRate,
    );
    const data = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1)
      data[index] = Math.random() * 2 - 1;
  }

  load(track) {
    this.pause();
    this.resetAnalysis();
    this.track = track;
    this.offset = 0;
    if (track.local) {
      this.localAudio.src = track.url;
      this.localAudio.load();
    } else {
      this.localAudio.removeAttribute("src");
      this.localAudio.load();
    }
  }

  async play() {
    if (!this.track) return;
    const operation = ++this.operation;
    await this.initialize();
    if (operation !== this.operation) return;
    if (this.track.local) {
      if (this.localAudio.ended) this.localAudio.currentTime = 0;
      try {
        await this.localAudio.play();
      } catch (error) {
        if (operation !== this.operation) return;
        throw error;
      }
      if (operation !== this.operation) return;
      this.playing = true;
      return;
    }
    if (this.offset >= this.duration) this.offset = 0;
    this.startedAt = this.context.currentTime - this.offset;
    this.nextStep = Math.ceil(this.offset / this.stepDuration);
    this.playing = true;
    this.schedule();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  pause() {
    this.operation += 1;
    if (this.playing && this.track && !this.track.local)
      this.offset = this.position;
    this.playing = false;
    this.localAudio.pause();
    clearInterval(this.timer);
    this.timer = null;
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* A scheduled voice may already have ended. */
      }
    }
    this.voices.clear();
  }

  async seek(seconds) {
    const nextPosition = Math.max(0, Math.min(seconds, this.duration));
    this.resetAnalysis();
    if (this.track?.local) {
      this.localAudio.currentTime = nextPosition;
      return;
    }
    const resume = this.playing;
    this.pause();
    this.offset = nextPosition;
    if (resume && nextPosition >= this.duration) {
      this.offset = 0;
      this.onEnded();
      return;
    }
    if (resume) await this.play();
  }

  get duration() {
    return this.track?.duration || 0;
  }

  get position() {
    if (this.track?.local) return this.localAudio.currentTime || 0;
    if (!this.playing) return this.offset;
    return Math.max(
      0,
      Math.min(this.context.currentTime - this.startedAt, this.duration),
    );
  }

  get stepDuration() {
    return 60 / this.track.bpm / 4;
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master)
      this.master.gain.setTargetAtTime(
        this.volume * 0.8,
        this.context.currentTime,
        0.025,
      );
  }

  setReverb(enabled) {
    this.reverbEnabled = enabled;
    if (this.reverbGain)
      this.reverbGain.gain.setTargetAtTime(
        enabled ? 0.32 : 0,
        this.context.currentTime,
        0.05,
      );
  }

  registerVoice(source, tracked = true, nodes = []) {
    if (tracked) this.voices.add(source);
    source.addEventListener(
      "ended",
      () => {
        this.voices.delete(source);
        source.disconnect();
        for (const node of nodes) node.disconnect();
      },
      { once: true },
    );
  }

  tone(
    midi,
    time,
    duration,
    volume,
    type = "sine",
    destination = this.musicBus,
    tracked = true,
  ) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    filter.type = "lowpass";
    filter.frequency.value = type === "sawtooth" ? 1300 : 5800;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(
      volume,
      time + Math.min(0.025, duration / 4),
    );
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
    this.registerVoice(oscillator, tracked, [filter, gain]);
  }

  kick(time, volume = 0.7) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.setValueAtTime(145, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.18);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.34);
    oscillator.connect(gain);
    gain.connect(this.musicBus);
    oscillator.start(time);
    oscillator.stop(time + 0.36);
    this.registerVoice(oscillator, true, [gain]);
  }

  noise(time, duration, volume, cutoff) {
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = cutoff;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    source.start(time);
    source.stop(time + duration + 0.01);
    this.registerVoice(source, true, [filter, gain]);
  }

  schedule() {
    if (!this.playing || this.track.local) return;
    if (this.position >= this.duration) {
      this.pause();
      this.offset = 0;
      this.onEnded();
      return;
    }
    const horizon = this.context.currentTime + 0.12;
    while (this.startedAt + this.nextStep * this.stepDuration < horizon) {
      const time = this.startedAt + this.nextStep * this.stepDuration;
      if (
        time >= this.context.currentTime &&
        this.nextStep * this.stepDuration < this.duration
      ) {
        this.scheduleStep(this.nextStep, time);
      }
      this.nextStep += 1;
    }
  }

  scheduleStep(step, time) {
    const track = this.track;
    const sixteenth = step % 16;
    const bar = Math.floor(step / 16);
    const chordOffsets = [0, -3, -5, -2];
    const root = track.root + chordOffsets[Math.floor(bar / 2) % 4];
    const beat = 60 / track.bpm;
    const ambient = track.genre === "ambient";
    const lofi = track.genre === "lofi";
    const house = track.genre === "house";
    const intro = bar < 2 ? 0.55 : 1;
    const fade = Math.min(1, (track.duration - step * this.stepDuration) / 4);

    if (sixteenth === 0) {
      const chord = ambient ? [0, 7, 14, 17] : [0, 3, 7, 10];
      for (const interval of chord) {
        this.tone(root + 12 + interval, time, beat * 5, 0.034 * fade, "sine");
        this.tone(
          root + 12 + interval + 0.035,
          time + 0.012,
          beat * 4,
          0.015 * fade,
          "triangle",
        );
      }
    }

    if (ambient) {
      if (sixteenth === 0 && bar % 2 === 0) this.kick(time, 0.18 * fade);
      if ([0, 7, 10].includes(sixteenth)) {
        const notes = [0, 7, 12, 14, 19, 24, 19, 14];
        const note = notes[(bar + Math.floor(sixteenth / 3)) % notes.length];
        this.tone(root + 24 + note, time, beat * 2.6, 0.05 * fade, "sine");
      }
      return;
    }

    const kickSteps = lofi ? [0, 7, 10] : [0, 4, 8, 12];
    if (kickSteps.includes(sixteenth))
      this.kick(time, (lofi ? 0.52 : 0.72) * intro * fade);
    if ([4, 12].includes(sixteenth)) {
      this.noise(time, lofi ? 0.12 : 0.16, 0.15 * intro * fade, 1600);
      this.tone(50, time, 0.1, 0.1 * fade, "triangle");
    }
    if (sixteenth % 2 === 0 || (house && bar % 4 === 3)) {
      const swing = lofi && sixteenth % 4 === 2 ? 0.023 : 0;
      this.noise(
        time + swing,
        sixteenth % 4 === 2 ? 0.09 : 0.035,
        0.05 * intro * fade,
        7800,
      );
    }
    if ([0, 6, 8, 14].includes(sixteenth)) {
      const octave = sixteenth === 14 ? 0 : -12;
      this.tone(
        root + octave,
        time + 0.01,
        beat * 0.65,
        0.18 * fade,
        "triangle",
      );
    }
    const melodySteps = lofi ? [2, 5, 10, 13] : [0, 3, 6, 8, 11, 14];
    if (melodySteps.includes(sixteenth)) {
      const melody = track.melody;
      const note =
        melody[(bar * 3 + melodySteps.indexOf(sixteenth)) % melody.length];
      const type = house ? "sawtooth" : "sine";
      this.tone(
        root + 24 + note,
        time + (lofi ? 0.018 : 0),
        beat * (lofi ? 1.2 : 0.7),
        (house ? 0.055 : 0.085) * fade,
        type,
      );
      if (!house)
        this.tone(
          root + 36 + note,
          time + beat * 0.75,
          beat * 0.8,
          0.018 * fade,
          "sine",
        );
    }
  }

  async playPad(index) {
    const note = this.padNotes[index];
    if (!Number.isFinite(note)) return;
    await this.initialize();
    const time = this.context.currentTime + 0.005;
    this.tone(note, time, 1.6, 0.25, "sine", this.padBus, false);
    this.tone(
      note + 12,
      time,
      0.8,
      0.065,
      "triangle",
      this.padBus,
      false,
    );
  }

  resetAnalysis() {
    this.visualReference = 0.06;
    this.lastAnalysisAt = this.context?.currentTime || 0;
    this.visualBands.fill(0);
    this.levels.bass = 0;
    this.levels.energy = 0;
    this.levels.rms = 0;
  }

  getLevels() {
    if (!this.analyser) return this.levels;
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.waveformData);
    this.analyser.getFloatFrequencyData(this.frequencyDb);
    this.analyser.getFloatTimeDomainData(this.timeData);
    const now = this.context.currentTime;
    const elapsed = Math.max(0, Math.min(0.1, now - this.lastAnalysisAt));
    this.lastAnalysisAt = now;
    let power = 0;
    for (const sample of this.timeData) power += sample * sample;
    const rms = Math.sqrt(power / this.timeData.length);
    this.levels.rms = rms;
    // Follow the music's own loudness. A fixed floor keeps silence and noise still.
    const referenceRate = rms > this.visualReference ? 0.06 : 2.5;
    this.visualReference +=
      (rms - this.visualReference) * (1 - Math.exp(-elapsed / referenceRate));
    const reference = Math.max(0.018, this.visualReference);
    let bass = 0;
    for (let index = 0; index < this.visualBands.length; index += 1) {
      const { start, end } = this.bandRanges[index];
      let bandPower = 0;
      for (let bin = start; bin < end; bin += 1) {
        bandPower += Math.pow(10, this.frequencyDb[bin] / 10);
      }
      const bandAmplitude = Math.sqrt(bandPower);
      const target =
        rms > 0.0002
          ? Math.min(1, Math.sqrt(bandAmplitude / reference) * 0.74)
          : 0;
      const response = target > this.visualBands[index] ? 0.035 : 0.18;
      this.visualBands[index] +=
        (target - this.visualBands[index]) *
        (1 - Math.exp(-elapsed / response));
      if (index < 13) bass = Math.max(bass, this.visualBands[index]);
    }
    this.levels.bass = bass;
    const energy = rms > 0.0002 ? Math.min(1, (rms / reference) * 0.72) : 0;
    this.levels.energy +=
      (energy - this.levels.energy) * (1 - Math.exp(-elapsed / 0.12));
    return this.levels;
  }

  dispose() {
    this.pause();
    this.localAudio.removeAttribute("src");
    this.localAudio.load();
    this.context?.close();
  }
}

window.PulseAudio = PulseAudio;
