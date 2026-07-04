// Procedural one-shot synthesis. Every drum sound and melodic loop in the app
// is rendered offline into an AudioBuffer at load time — zero sample downloads,
// so the app is playable in under a second even on bad connections.
import type { BassParams, HatParams, KickParams, KitDef, LoopParams, PercParams, SnareParams } from './kits'
import type { Role } from '../model'

const SR = 44100
const cache = new Map<string, AudioBuffer>()

function offline(seconds: number): OfflineAudioContext {
  return new OfflineAudioContext(1, Math.ceil(seconds * SR), SR)
}

function env(ctx: BaseAudioContext, at: number, peak: number, decay: number, curve = 4): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(peak, at + 0.002)
  g.gain.setTargetAtTime(0, at + 0.004, decay / curve)
  return g
}

function noiseSource(ctx: BaseAudioContext, seconds: number): AudioBufferSourceNode {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate)
  const d = buf.getChannelData(0)
  let seed = 1234567
  for (let i = 0; i < d.length; i++) {
    // fast deterministic PRNG so renders are identical every load
    seed = (seed * 1664525 + 1013904223) >>> 0
    d[i] = (seed / 0xffffffff) * 2 - 1
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  return src
}

function drive(ctx: BaseAudioContext, amount: number): WaveShaperNode {
  const ws = ctx.createWaveShaper()
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
  }
  ws.curve = curve
  ws.oversample = '2x'
  return ws
}

function renderKick(p: KickParams): Promise<AudioBuffer> {
  const ctx = offline(p.decay + 0.3)
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(p.f0, 0)
  osc.frequency.exponentialRampToValueAtTime(p.f1, p.sweep)
  const g = env(ctx, 0, 1, p.decay)
  const dr = drive(ctx, p.drive)
  osc.connect(g).connect(dr).connect(ctx.destination)
  osc.start(0)
  osc.stop(p.decay + 0.25)
  if (p.click > 0) {
    const n = noiseSource(ctx, 0.03)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    const ng = env(ctx, 0, p.click * 0.5, 0.015)
    n.connect(hp).connect(ng).connect(dr)
    n.start(0)
  }
  return ctx.startRendering()
}

function renderSnare(p: SnareParams): Promise<AudioBuffer> {
  const len = p.noiseDecay * 4 + 0.15
  const ctx = offline(len)
  if (p.kind === 'clap') {
    // classic clap: 3 tight bursts + a longer tail
    const offsets = [0, 0.012, 0.026, 0.026]
    const decays = [0.01, 0.01, 0.01, p.noiseDecay]
    for (let i = 0; i < offsets.length; i++) {
      const n = noiseSource(ctx, decays[i] * 4 + 0.05)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = p.bp
      bp.Q.value = 1.6
      const g = env(ctx, offsets[i], i === 3 ? 0.9 : 0.7, decays[i])
      n.connect(bp).connect(g).connect(ctx.destination)
      n.start(offsets[i])
    }
  } else {
    const n = noiseSource(ctx, len)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = p.bp
    bp.Q.value = 0.8
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 350
    const ng = env(ctx, 0, 0.8, p.noiseDecay)
    n.connect(bp).connect(hp).connect(ng).connect(ctx.destination)
    n.start(0)
    if (p.toneAmt > 0) {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(p.tone * 1.4, 0)
      osc.frequency.exponentialRampToValueAtTime(p.tone, 0.03)
      const g = env(ctx, 0, p.toneAmt, 0.09)
      osc.connect(g).connect(ctx.destination)
      osc.start(0)
      osc.stop(0.3)
    }
  }
  return ctx.startRendering()
}

function renderHat(p: HatParams): Promise<AudioBuffer> {
  const len = p.decay * 4 + 0.1
  const ctx = offline(len)
  const out = env(ctx, 0, 0.55, p.decay)
  out.connect(ctx.destination)
  const n = noiseSource(ctx, len)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = p.hp
  n.connect(hp).connect(out)
  n.start(0)
  if (p.metal > 0) {
    // 808-style metallic partials: stack of inharmonic squares
    const freqs = [263, 400, 421, 474, 587, 845]
    for (const f of freqs) {
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = f * 8.2
      const g = ctx.createGain()
      g.gain.value = (p.metal * 0.12) / freqs.length
      const bp = ctx.createBiquadFilter()
      bp.type = 'highpass'
      bp.frequency.value = p.hp
      o.connect(g).connect(bp).connect(out)
      o.start(0)
      o.stop(len)
    }
  }
  return ctx.startRendering()
}

function renderPerc(p: PercParams): Promise<AudioBuffer> {
  const len = p.decay * 4 + 0.15
  const ctx = offline(len)
  switch (p.kind) {
    case 'rim': {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = p.tune
      const g = env(ctx, 0, 0.6, p.decay)
      const n = noiseSource(ctx, 0.02)
      const ng = env(ctx, 0, 0.3, 0.008)
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 2500
      o.connect(g).connect(ctx.destination)
      n.connect(hp).connect(ng).connect(ctx.destination)
      o.start(0); o.stop(len); n.start(0)
      break
    }
    case 'cowbell': {
      for (const f of [p.tune, p.tune * 1.48]) {
        const o = ctx.createOscillator()
        o.type = 'square'
        o.frequency.value = f
        const g = env(ctx, 0, 0.3, p.decay)
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = p.tune * 1.2
        bp.Q.value = 2
        o.connect(bp).connect(g).connect(ctx.destination)
        o.start(0); o.stop(len)
      }
      break
    }
    case 'shaker': {
      const n = noiseSource(ctx, len)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = p.tune
      bp.Q.value = 1.4
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, 0)
      g.gain.linearRampToValueAtTime(0.5, 0.02)
      g.gain.setTargetAtTime(0, 0.025, p.decay / 3)
      n.connect(bp).connect(g).connect(ctx.destination)
      n.start(0)
      break
    }
    case 'tom': {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(p.tune * 1.6, 0)
      o.frequency.exponentialRampToValueAtTime(p.tune * 0.8, p.decay)
      const g = env(ctx, 0, 0.8, p.decay)
      o.connect(g).connect(ctx.destination)
      o.start(0); o.stop(len)
      break
    }
    case 'blip': {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = p.tune
      const g = env(ctx, 0, 0.5, p.decay)
      o.connect(g).connect(ctx.destination)
      o.start(0); o.stop(len)
      break
    }
    case 'snap': {
      const n = noiseSource(ctx, len)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = p.tune
      bp.Q.value = 3
      const g = env(ctx, 0, 0.8, p.decay)
      n.connect(bp).connect(g).connect(ctx.destination)
      n.start(0)
      break
    }
  }
  return ctx.startRendering()
}

function renderBass(p: BassParams, hz: number): Promise<AudioBuffer> {
  const len = p.decay * 3 + 0.4
  const ctx = offline(len)
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(hz * 2.2, 0)
  o.frequency.exponentialRampToValueAtTime(hz, 0.03)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, 0)
  g.gain.linearRampToValueAtTime(0.9, 0.006)
  g.gain.setTargetAtTime(0, 0.01, p.decay / 2.5)
  const dr = drive(ctx, p.drive)
  o.connect(g).connect(dr).connect(ctx.destination)
  o.start(0)
  o.stop(len)
  if (p.sub > 0.9) {
    const h = ctx.createOscillator()
    h.type = 'triangle'
    h.frequency.value = hz * 2
    const hg = env(ctx, 0, 0.15, p.decay * 0.6)
    h.connect(hg).connect(dr)
    h.start(0); h.stop(len)
  }
  return ctx.startRendering()
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

/** Render a 1-bar melodic loop at the kit's tempo. The Loop row chops into this. */
function renderLoop(p: LoopParams, bpm: number): Promise<AudioBuffer> {
  const barSec = (60 / bpm) * 4
  const ctx = offline(barSec)
  const stepSec = barSec / 16
  const master = ctx.createGain()
  master.gain.value = 0.8
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = p.cutoff
  lp.Q.value = 0.6
  master.connect(lp).connect(ctx.destination)

  for (const ev of p.events) {
    const at = ev.t * stepSec
    const dur = ev.dur * stepSec
    for (const m of ev.midi) {
      const hz = midiHz(m)
      if (p.voice === 'sub') {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = hz / 2
        const g = env(ctx, at, ev.vel, dur * 0.8)
        o.connect(g).connect(master)
        o.start(at); o.stop(at + dur + 0.3)
      } else if (p.voice === 'pluck') {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = hz
        const f = ctx.createBiquadFilter()
        f.type = 'lowpass'
        f.frequency.setValueAtTime(hz * 8, at)
        f.frequency.exponentialRampToValueAtTime(hz * 1.5, at + Math.min(dur, 0.35))
        f.Q.value = 3
        const g = env(ctx, at, ev.vel * 0.5, dur * 0.7)
        o.connect(f).connect(g).connect(master)
        o.start(at); o.stop(at + dur + 0.3)
      } else if (p.voice === 'stab') {
        for (const det of [-6, 0, 6]) {
          const o = ctx.createOscillator()
          o.type = 'sawtooth'
          o.frequency.value = hz
          o.detune.value = det
          const g = ctx.createGain()
          g.gain.setValueAtTime(0, at)
          g.gain.linearRampToValueAtTime(ev.vel * 0.2, at + 0.008)
          g.gain.setValueAtTime(ev.vel * 0.2, at + dur * 0.6)
          g.gain.linearRampToValueAtTime(0, at + dur)
          o.connect(g).connect(master)
          o.start(at); o.stop(at + dur + 0.1)
        }
      } else {
        // keys: soft FM-ish EP — sine carrier + gentle 2nd harmonic + tremolo
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = hz
        const o2 = ctx.createOscillator()
        o2.type = 'sine'
        o2.frequency.value = hz * 2
        const g = env(ctx, at, ev.vel * 0.5, dur, 2)
        const g2 = env(ctx, at, ev.vel * 0.12, dur * 0.5, 2)
        const trem = ctx.createOscillator()
        trem.frequency.value = 5.2
        const tremG = ctx.createGain()
        tremG.gain.value = 0.12
        trem.connect(tremG).connect(g.gain)
        o.connect(g).connect(master)
        o2.connect(g2).connect(master)
        o.start(at); o.stop(at + dur + 0.5)
        o2.start(at); o2.stop(at + dur + 0.5)
        trem.start(at); trem.stop(at + dur + 0.5)
      }
    }
  }
  if (p.vinyl > 0) {
    const n = noiseSource(ctx, barSec)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 4000
    const g = ctx.createGain()
    g.gain.value = p.vinyl * 0.02
    n.connect(hp).connect(g).connect(ctx.destination)
    n.start(0)
  }
  return ctx.startRendering()
}

export function loopBarSeconds(kit: KitDef): number {
  return (60 / kit.bpm) * 4
}

export async function getBuffer(kit: KitDef, role: Role): Promise<AudioBuffer> {
  const key = `${kit.id}.${role}`
  const hit = cache.get(key)
  if (hit) return hit
  let buf: AudioBuffer
  switch (role) {
    case 'kick': buf = await renderKick(kit.kick); break
    case 'snare': buf = await renderSnare(kit.snare); break
    case 'hatC': buf = await renderHat(kit.hatC); break
    case 'hatO': buf = await renderHat(kit.hatO); break
    case 'perc1': buf = await renderPerc(kit.perc1); break
    case 'perc2': buf = await renderPerc(kit.perc2); break
    case 'bass': buf = await renderBass(kit.bass, kit.bassHz); break
    case 'loop': buf = await renderLoop(kit.loop, kit.bpm); break
  }
  cache.set(key, buf)
  return buf
}

export function getBufferSync(kit: KitDef, role: Role): AudioBuffer | null {
  return cache.get(`${kit.id}.${role}`) ?? null
}

/** Pre-render every sound of a kit (called at boot for the active kit, lazily for others). */
export async function warmKit(kit: KitDef): Promise<void> {
  const roles: Role[] = ['kick', 'snare', 'hatC', 'hatO', 'perc1', 'perc2', 'bass', 'loop']
  await Promise.all(roles.map((r) => getBuffer(kit, r)))
}
