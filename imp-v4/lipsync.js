/**
 * LipSyncEngine v2.0 — Real-Time Audio Phoneme Detection
 * Works on ANY audio. No timeline, no lyrics needed.
 *
 * Pipeline:
 *   AudioBuffer → SpectralAnalyzer → PhonemeClassifier
 *              → SingingExaggerator → TimingInterpolator → MouthRenderer
 */

// ============================================================================
// VISEME SHAPE LIBRARY — 8 bar heights in px
// ============================================================================

const VISEME_SHAPES = {
  REST:     [3,  3,  3,  3,  3,  3,  3,  3],
  CLOSED:   [2,  2,  2,  2,  2,  2,  2,  2],
  OPEN_AA:  [7,  22, 36, 42, 42, 36, 22, 7 ],
  OPEN_AE:  [10, 30, 44, 50, 50, 44, 30, 10],
  OPEN_EE:  [18, 24, 28, 26, 26, 28, 24, 18],
  OPEN_IH:  [12, 20, 26, 24, 24, 26, 20, 12],
  OPEN_OO:  [5,  18, 34, 40, 40, 34, 18, 5 ],
  OPEN_UW:  [4,  14, 28, 36, 36, 28, 14, 4 ],
  OPEN_ER:  [10, 22, 34, 38, 38, 34, 22, 10],
  MID_OPEN: [8,  18, 28, 32, 32, 28, 18, 8 ],
  DENTAL:   [6,  10, 14, 12, 12, 14, 10, 6 ],
  SIBILANT: [8,  14, 18, 16, 16, 18, 14, 8 ],
  NASAL:    [4,  8,  12, 14, 14, 12, 8,  4 ],
  SING_BIG: [8,  24, 40, 46, 46, 40, 24, 8 ],
  SING_MID: [8,  20, 32, 38, 38, 32, 20, 8 ],
};

const EMOTION_MODS = {
  sleeping:[0.25,0.3], bored:[0.55,0.6], curious:[0.85,0.9], content:[1.0,1.0],
  happy:[1.1,1.1], excited:[1.35,1.3], grooving:[1.2,1.2], singing:[1.3,1.0],
  focused:[0.9,0.85], loving:[1.05,0.95], hyped:[1.5,1.4],
};

// ============================================================================
// SPECTRAL ANALYZER
// ============================================================================

const SpectralAnalyzer = {
  _analyser: null,
  _timeData: null,
  _freqData: null,
  _sampleRate: 44100,

  init(analyserNode, sampleRate) {
    this._analyser   = analyserNode;
    this._sampleRate = sampleRate || 44100;
    this._timeData   = new Float32Array(analyserNode.fftSize);
    this._freqData   = new Float32Array(analyserNode.frequencyBinCount);
  },

  analyze() {
    if (!this._analyser) return null;
    this._analyser.getFloatTimeDomainData(this._timeData);
    this._analyser.getFloatFrequencyData(this._freqData);

    const td = this._timeData, fd = this._freqData;
    const sr = this._sampleRate, bins = fd.length;
    const binHz = sr / (bins * 2);

    // RMS energy
    let rms = 0;
    for (let i = 0; i < td.length; i++) rms += td[i] * td[i];
    rms = Math.sqrt(rms / td.length);

    // Zero crossing rate
    let zcr = 0;
    for (let i = 1; i < td.length; i++) if ((td[i] >= 0) !== (td[i-1] >= 0)) zcr++;
    zcr /= td.length;

    // Band energy helper
    const band = (loHz, hiHz) => {
      const lo = Math.floor(loHz / binHz), hi = Math.min(Math.ceil(hiHz / binHz), bins - 1);
      let s = 0, n = 0;
      for (let i = lo; i <= hi; i++) { s += Math.pow(10, fd[i] / 20); n++; }
      return n > 0 ? s / n : 0;
    };

    const lowMid   = band(250,  800);
    const midFreq  = band(800,  2000);
    const hiMid    = band(2000, 4000);
    const presence = band(4000, 8000);
    const total    = band(20, 16000) + 0.0001;

    // Formant proxies
    const F1 = band(300, 900)  / total;  // jaw openness
    const F2 = band(900, 2500) / total;  // front vs back

    // Spectral centroid
    let scN = 0, scD = 0;
    for (let i = 0; i < bins; i++) { const l = Math.pow(10, fd[i]/20); scN += i*l; scD += l; }
    const centroid = scD > 0 ? (scN / scD) * binHz : 0;

    // Pitch (simplified autocorrelation)
    const pitch = this._pitch(td, sr);

    return { rms, zcr, F1, F2, centroid, pitch,
             norm_presence: presence / total, lowMid, midFreq, hiMid };
  },

  _pitch(td, sr) {
    const min = Math.floor(sr / 800), max = Math.min(Math.floor(sr / 80), td.length / 2);
    let best = -1, period = 0;
    for (let p = min; p <= max; p++) {
      let c = 0;
      for (let i = 0; i < td.length - p; i++) c += td[i] * td[i+p];
      if (c > best) { best = c; period = p; }
    }
    return period > 0 ? sr / period : 0;
  }
};

// ============================================================================
// ONSET DETECTOR — spectral flux for syllable/beat detection
// ============================================================================

const OnsetDetector = {
  _prev: new Array(8).fill(0),
  _hist: new Array(20).fill(0),
  _idx:  0, _last: 0,

  detect(fd, now) {
    if (!fd) return { isOnset: false, strength: 0 };
    const bins = fd.length, chunk = Math.floor(bins / 8);
    let flux = 0;
    for (let b = 0; b < 8; b++) {
      let e = 0;
      for (let i = b*chunk; i < (b+1)*chunk; i++) e += Math.pow(10, fd[i]/20);
      e /= chunk;
      const d = e - this._prev[b];
      if (d > 0) flux += d;
      this._prev[b] = e;
    }
    this._hist[this._idx++ % 20] = flux;
    const avg = this._hist.reduce((a,b) => a+b,0) / 20;
    const isOnset = flux > avg * 1.8 && flux > 0.004 && (now - this._last) > 70;
    if (isOnset) this._last = now;
    return { isOnset, strength: Math.min(1, flux / (avg * 3 + 0.001)) };
  },

  reset() { this._prev.fill(0); this._hist.fill(0); this._idx = 0; this._last = 0; }
};

// ============================================================================
// PHONEME CLASSIFIER — F1/F2 formant model
// ============================================================================

const PhonemeClassifier = {
  classify(feat, isSilent) {
    if (!feat || isSilent || feat.rms < 0.006) return 'REST';
    const { rms, zcr, F1, F2, centroid, pitch, norm_presence } = feat;

    // Sibilant: high ZCR + high presence
    if (zcr > 0.18 && norm_presence > 0.22 && F1 < 0.18) return 'SIBILANT';
    // Fricative
    if (zcr > 0.13 && norm_presence > 0.14) return 'DENTAL';
    // Nasal: very low energy + low centroid
    if (rms < 0.035 && centroid < 700 && zcr < 0.06) return 'NASAL';
    // Plosive closure
    if (zcr < 0.025 && rms < 0.012) return 'CLOSED';

    // Voiced: use formant map
    const isVoiced = pitch > 60 && zcr < 0.17;
    if (isVoiced || rms > 0.05) {
      const open  = F1 * 6;   // jaw openness 0-1
      const front = F2 * 4;   // front/back 0-1

      if (open < 0.32 && front > 0.62) return 'OPEN_EE';
      if (open < 0.32 && front > 0.40) return 'OPEN_IH';
      if (open > 0.62 && front < 0.48) return 'OPEN_AA';
      if (open > 0.46 && front < 0.44) return 'OPEN_AE';
      if (open < 0.28 && front < 0.28) return 'OPEN_UW';
      if (open < 0.48 && front < 0.38) return 'OPEN_OO';
      if (open > 0.3  && open < 0.55)  return 'OPEN_ER';
      return open > 0.5 ? 'OPEN_AA' : 'OPEN_IH';
    }
    return 'MID_OPEN';
  }
};

// ============================================================================
// SINGING EXAGGERATOR — makes the robot *look* like it's actually singing
// ============================================================================

const SingingExaggerator = {
  _phase: 0, _beatPhase: 0, _vibratoPhase: 0,
  _holdTimer: 0, _holdStrength: 0,
  _prevViseme: 'REST',

  process(viseme, rms, isOnset, onsetStr, dt, emotionAmp) {
    this._phase        += dt * 5.5;
    this._beatPhase    += dt * 7.5;
    this._vibratoPhase += dt * 13.0;

    const isVowel = viseme.startsWith('OPEN_') || viseme === 'SING_BIG' || viseme === 'SING_MID';
    const isRest  = viseme === 'REST';

    // Hold detection
    if (viseme === this._prevViseme && isVowel) {
      this._holdTimer   += dt;
      this._holdStrength = Math.min(1, this._holdTimer / 0.35);
    } else {
      this._holdTimer = 0; this._holdStrength = 0;
    }
    this._prevViseme = viseme;

    // Energy gate — this is the key: make mouth open PROPORTIONAL to audio energy
    // So it really looks like it's singing loudly when loud, closed when quiet
    const energyGate  = Math.max(0, (rms - 0.01) / 0.09);
    const energyScale = 0.35 + Math.min(1, energyGate) * 1.4;

    // Beat bounce on vowels (rhythmic jaw movement)
    const beatBounce = isVowel
      ? 1.0 + Math.max(0, Math.sin(this._beatPhase)) * 0.14 * Math.min(1, energyGate)
      : 1.0;

    // Vibrato on held notes
    const vibrato = isVowel && this._holdStrength > 0.25
      ? 1.0 + Math.sin(this._vibratoPhase) * 0.08 * this._holdStrength
      : 1.0;

    // Onset punch shrinks mouth briefly → looks like consonant
    const onsetShrink = (isOnset && !isRest) ? (1 - onsetStr * 0.35) : 1.0;

    // Upgrade to SING shapes at high energy + voiced
    let effectiveViseme = viseme;
    if (isVowel && rms > 0.11 && energyGate > 0.75) {
      effectiveViseme = (viseme === 'OPEN_AA' || viseme === 'OPEN_AE') ? 'SING_BIG' : 'SING_MID';
    }

    const base   = VISEME_SHAPES[effectiveViseme] || VISEME_SHAPES.REST;
    const scale  = energyScale * beatBounce * vibrato * emotionAmp * onsetShrink;

    const heights = base.map((h, i) => {
      const wobble = isVowel ? 1.0 + Math.sin(this._phase + i * 0.9) * 0.045 : 1.0;
      return Math.max(2, h * scale * wobble);
    });

    return { viseme: effectiveViseme, heights, openness: Math.max(...heights) / 62,
             isRest: isRest && rms < 0.015 };
  },

  reset() {
    this._phase = this._beatPhase = this._vibratoPhase = 0;
    this._holdTimer = this._holdStrength = 0;
    this._prevViseme = 'REST';
  }
};

// ============================================================================
// TIMING INTERPOLATOR
// ============================================================================

class TimingInterpolator {
  constructor() { this.cur = new Array(8).fill(3); this.tgt = new Array(8).fill(3); }

  setTarget(h) { this.tgt = h; }
  snapClosed()  { this.cur.fill(2); }

  step(speedMult = 1.0) {
    const s = Math.min(0.98, 0.18 * speedMult * 3.5);
    for (let i = 0; i < 8; i++) this.cur[i] += (this.tgt[i] - this.cur[i]) * s;
    return this.cur;
  }

  reset() { this.cur.fill(3); this.tgt.fill(3); }
}

// ============================================================================
// LIPSYNC ENGINE — Main export
// ============================================================================

const LipSyncEngine = (() => {
  const interp  = new TimingInterpolator();
  let emotion   = 'happy';
  let ready     = false;
  let prevOnset = false;
  let lastTick  = 0;
  let benchmarkMode = false;

  return {
    init(analyserNode, sampleRate) {
      if (!analyserNode) return;
      SpectralAnalyzer.init(analyserNode, sampleRate || 44100);
      OnsetDetector.reset();
      SingingExaggerator.reset();
      interp.reset();
      lastTick = performance.now();
      ready = true;
      console.log('[LipSyncEngine v2] Real-time spectral analysis active');
    },

    tick(isPlaying) {
      const now = performance.now();
      const dt  = Math.min(0.05, (now - lastTick) / 1000);
      lastTick  = now;

      if (!ready || !isPlaying) {
        interp.setTarget(new Array(8).fill(3));
        return { viseme:'REST', heights: interp.step(1), openness:0, isRest:true, phoneme:'SIL' };
      }

      const feat = SpectralAnalyzer.analyze();
      if (!feat) return { viseme:'REST', heights: new Array(8).fill(3), openness:0, isRest:true, phoneme:'SIL' };

      // Onset
      const onset = OnsetDetector.detect(SpectralAnalyzer._freqData, now);
      if (onset.isOnset && onset.strength > 0.45 && !prevOnset) interp.snapClosed();
      prevOnset = onset.isOnset;

      // Classify
      const viseme = PhonemeClassifier.classify(feat, feat.rms < 0.006);

      // Emotion
      const mod = EMOTION_MODS[emotion] || EMOTION_MODS.happy;

      // Exaggerate
      const result = SingingExaggerator.process(
        viseme, feat.rms, onset.isOnset, onset.strength, dt, mod[0]
      );

      interp.setTarget(result.heights);
      const heights = interp.step(mod[1]);

      const phonemeMap = {
        OPEN_AA:'AA', OPEN_AE:'AE', OPEN_EE:'IY', OPEN_IH:'IH', OPEN_OO:'OW',
        OPEN_UW:'UW', OPEN_ER:'ER', MID_OPEN:'N', SIBILANT:'S', DENTAL:'F',
        NASAL:'M', CLOSED:'P', SING_BIG:'AA', SING_MID:'AH', REST:'SIL'
      };

      return {
        viseme: result.viseme,
        heights,
        openness: result.openness,
        isRest: result.isRest,
        phoneme: phonemeMap[result.viseme] || 'AH'
      };
    },

    setEmotion(e)    { emotion = e; },
    isActive()       { return ready; },
    isBenchmarkMode(){ return benchmarkMode; },
    activateBenchmark()   { benchmarkMode = true; },
    deactivateBenchmark() { benchmarkMode = false; },
    loadTimeline()   { /* real-time analysis — no timeline needed */ },
    loadFromLyrics() { /* real-time analysis — no timeline needed */ },
    reset() {
      interp.reset();
      SingingExaggerator.reset();
      OnsetDetector.reset();
      lastTick = performance.now();
    },

    VISEME_SHAPES,
    VisemeMapper: { map: v => v },
  };
})();
