// The playback engine: a lookahead scheduler ("A Tale of Two Clocks") driving
// buffer voices through a per-track mixer into a master chain that makes
// everything sound produced by default: kick-keyed sidechain duck → glue
// compressor → soft-clip limiter.
import { NUM_STEPS, ROLES, type Project, type Role, type Step } from '../model'
import { KIT_MAP, kitForTrack, type KitDef } from './kits'
import { getBufferSync, loopBarSeconds, warmKit } from './synth'

export interface EngineEvent {
  time: number // audible time on the audio clock
  type: 'step' | 'hit' | 'duck'
  step?: number
  pattern?: number
  role?: Role
  vel?: number
}

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD = 0.12
const DUCK_DEPTH = 0.5

type ActiveVoice = { src: AudioBufferSourceNode; gain: GainNode; until: number }

class Engine {
  private ctx: AudioContext | null = null
  private trackGains = new Map<Role, GainNode>()
  private duck!: GainNode
  private fxFilter!: BiquadFilterNode
  private masterGain!: GainNode
  private stutterOsc: OscillatorNode | null = null
  private stutterDepth: GainNode | null = null

  private timer: number | null = null
  private nextTime = 0
  private step = 0
  private pattern = 0
  private chainPos = 0
  playing = false
  /** total steps scheduled since play — exposed for tests */
  ticks = 0

  private events: EngineEvent[] = []
  /** live note-repeat overlay from the perform pads; scheduled sample-tight */
  private repeat: { role: Role; vel: number; pitch: number; div: number } | null = null
  private chokeGroups = new Map<string, ActiveVoice[]>()
  private rngState = 987654321

  private getProject: () => Project = () => {
    throw new Error('engine not bound')
  }
  private onPatternAdvance: (idx: number) => void = () => {}

  bind(getProject: () => Project, onPatternAdvance: (idx: number) => void) {
    this.getProject = getProject
    this.onPatternAdvance = onPatternAdvance
  }

  /** Must be called from a user gesture the first time. */
  context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' })
      this.buildBus(this.ctx)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private buildBus(ctx: AudioContext) {
    this.duck = ctx.createGain()
    const glue = ctx.createDynamicsCompressor()
    glue.threshold.value = -14
    glue.ratio.value = 3
    glue.attack.value = 0.01
    glue.release.value = 0.16
    glue.knee.value = 8
    const clip = ctx.createWaveShaper()
    const n = 2048
    const curve = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * 1.4
      curve[i] = Math.tanh(x)
    }
    clip.curve = curve
    clip.oversample = '2x'
    this.fxFilter = ctx.createBiquadFilter()
    this.fxFilter.type = 'lowpass'
    this.fxFilter.frequency.value = 19000
    this.fxFilter.Q.value = 0.9
    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = 0.9

    this.duck.connect(glue)
    for (const role of ROLES) {
      const g = ctx.createGain()
      // the kick bypasses the ducker so it punches through its own sidechain
      g.connect(role === 'kick' ? glue : this.duck)
      this.trackGains.set(role, g)
    }
    glue.connect(clip).connect(this.fxFilter).connect(this.masterGain).connect(ctx.destination)
  }

  /** Audible-time compensation so visuals line up with sound on laggy stacks. */
  private outLatency(): number {
    const c = this.ctx!
    return (c.outputLatency || c.baseLatency || 0)
  }

  private rand(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0
    return this.rngState / 0xffffffff
  }

  drainEvents(now: number): EngineEvent[] {
    const due: EngineEvent[] = []
    let i = 0
    while (i < this.events.length && this.events[i].time <= now) i++
    if (i > 0) due.push(...this.events.splice(0, i))
    return due
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  currentPattern(): number {
    return this.pattern
  }

  async start() {
    const ctx = this.context()
    const project = this.getProject()
    await warmKit(KIT_MAP[project.kitId] ?? Object.values(KIT_MAP)[0])
    if (this.playing) return
    this.playing = true
    this.step = 0
    this.ticks = 0
    this.chainPos = 0
    this.pattern = project.chainOn ? project.chain[0] ?? project.current : project.current
    this.nextTime = ctx.currentTime + 0.08
    this.timer = window.setInterval(() => this.tick(), LOOKAHEAD_MS)
    this.tick()
  }

  stop() {
    this.playing = false
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.events = []
    // release anything ringing
    const t = this.ctx?.currentTime ?? 0
    for (const voices of this.chokeGroups.values()) {
      for (const v of voices) {
        try {
          v.gain.gain.setTargetAtTime(0, t, 0.03)
          v.src.stop(t + 0.15)
        } catch { /* already stopped */ }
      }
    }
    this.chokeGroups.clear()
  }

  private tick() {
    const ctx = this.ctx!
    const project = this.getProject()
    while (this.nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(project, this.pattern, this.step, this.nextTime)
      const stepDur = 60 / project.bpm / 4
      this.nextTime += stepDur
      this.step++
      this.ticks++
      if (this.step >= NUM_STEPS) {
        this.step = 0
        if (project.chainOn && project.chain.length > 0) {
          this.chainPos = (this.chainPos + 1) % project.chain.length
          this.pattern = project.chain[this.chainPos]
          this.onPatternAdvance(this.pattern)
        } else {
          this.pattern = project.current
        }
      }
    }
  }

  private swingOffset(project: Project, step: number, stepDur: number): number {
    return step % 2 === 1 ? project.swing * stepDur * 0.6 : 0
  }

  private scheduleStep(project: Project, patternIdx: number, step: number, time: number) {
    const stepDur = 60 / project.bpm / 4
    const t = time + this.swingOffset(project, step, stepDur)
    const pattern = project.patterns[patternIdx]
    const lat = this.outLatency()
    this.events.push({ time: t + lat, type: 'step', step, pattern: patternIdx })

    const anySolo = pattern.tracks.some((tr) => tr.solo)
    for (const track of pattern.tracks) {
      if (track.mute || (anySolo && !track.solo)) continue
      const s = track.steps[step]
      if (!s.on) continue
      const kit = kitForTrack(project.kitId, track.sound)
      const hitTime = t + s.nudge * stepDur
      const n = Math.max(1, Math.min(4, s.ratchet))
      for (let r = 0; r < n; r++) {
        const rt = hitTime + (r * stepDur) / n
        const rvel = s.vel * (r === 0 ? 1 : 0.75 + 0.25 * (r / n))
        this.playVoice(kit, track.role, rt, rvel, s, track.vol, project, step)
      }
      this.events.push({ time: hitTime + lat, type: 'hit', role: track.role, vel: s.vel, step })
    }

    const rep = this.repeat
    if (rep && step % Math.max(1, rep.div) === 0) {
      const track = pattern.tracks[ROLES.indexOf(rep.role)]
      const st: Step = { on: true, vel: rep.vel, pitch: rep.pitch, ratchet: rep.div === 0.5 ? 2 : 1, nudge: 0 }
      const kit = kitForTrack(project.kitId, track.sound)
      for (let r = 0; r < st.ratchet; r++) {
        this.playVoice(kit, rep.role, t + (r * stepDur) / st.ratchet, rep.vel, st, track.vol, project, step)
      }
      this.events.push({ time: t + lat, type: 'hit', role: rep.role, vel: rep.vel, step })
    }
  }

  /** div: 2 = 1/8, 1 = 1/16, 0.5 = 1/32. null stops the repeat. */
  setRepeat(rep: { role: Role; vel: number; pitch: number; div: number } | null) {
    this.repeat = rep
  }

  /** Fire a sound immediately (pad hits, sound auditions). */
  trigger(role: Role, vel = 1, pitch = 0, soundOverride: string | null = null) {
    const ctx = this.context()
    const project = this.getProject()
    const pattern = project.patterns[project.current]
    const track = pattern.tracks[ROLES.indexOf(role)]
    const kit = kitForTrack(project.kitId, soundOverride ?? track.sound)
    const step: Step = { on: true, vel, pitch, ratchet: 1, nudge: 0 }
    this.playVoice(kit, role, ctx.currentTime + 0.005, vel, step, track.vol, project, 0)
    this.events.push({ time: ctx.currentTime + this.outLatency(), type: 'hit', role, vel })
  }

  private playVoice(
    kit: KitDef,
    role: Role,
    time: number,
    vel: number,
    step: Step,
    trackVol: number,
    project: Project,
    stepIdx: number,
  ) {
    const ctx = this.ctx!
    const buf = getBufferSync(kit, role)
    if (!buf) {
      // kit still rendering (hot-swap): warm it and drop this hit gracefully
      void warmKit(kit)
      return
    }
    const src = ctx.createBufferSource()
    src.buffer = buf

    let rate = Math.pow(2, step.pitch / 12)
    let gainVal = Math.max(0, Math.min(1.2, vel)) * trackVol

    // anti-machine-gun humanization: tiny per-hit pitch/gain jitter on
    // noise-based voices; melodic rows stay in tune
    if (role === 'hatC' || role === 'hatO' || role === 'snare' || role === 'perc1' || role === 'perc2') {
      rate *= 1 + (this.rand() - 0.5) * 0.04
      gainVal *= Math.pow(10, ((this.rand() - 0.5) * 3) / 20)
    }

    const g = ctx.createGain()
    g.gain.value = gainVal
    src.playbackRate.value = rate
    src.connect(g).connect(this.trackGains.get(role)!)

    if (role === 'loop') {
      // chop mode: step N starts the loop buffer at bar position N/16,
      // rate-locked to the project tempo
      const barSec = loopBarSeconds(kit)
      const tempoRate = (project.bpm / kit.bpm) * Math.pow(2, step.pitch / 12)
      src.playbackRate.value = tempoRate
      const offset = (stepIdx / NUM_STEPS) * barSec
      const maxPlay = barSec - offset
      src.start(time, offset)
      const stopAt = time + Math.min(maxPlay / tempoRate, (60 / project.bpm) * 2)
      g.gain.setValueAtTime(gainVal, stopAt - 0.03)
      g.gain.linearRampToValueAtTime(0, stopAt)
      src.stop(stopAt + 0.01)
      this.choke('loop', time, { src, gain: g, until: stopAt })
    } else {
      src.start(time)
      const until = time + buf.duration / rate
      if (role === 'hatO' || role === 'hatC') this.choke('hat', time, { src, gain: g, until }, role === 'hatC')
      if (role === 'bass') this.choke('bass', time, { src, gain: g, until })
      if (role === 'kick') this.sidechain(time)
    }
  }

  /** Kill still-ringing voices in a group at `time` (open hat choked by closed hat, mono 808). */
  private choke(group: string, time: number, voice: ActiveVoice, killOnly = false) {
    const list = this.chokeGroups.get(group) ?? []
    const keep: ActiveVoice[] = []
    for (const v of list) {
      if (v.until > time) {
        v.gain.gain.setTargetAtTime(0, time, 0.008)
        try { v.src.stop(time + 0.06) } catch { /* raced */ }
      } else {
        // expired on its own; drop it
      }
    }
    if (!killOnly) keep.push(voice)
    this.chokeGroups.set(group, keep)
  }

  private sidechain(time: number) {
    const p = this.duck.gain
    p.cancelScheduledValues(time)
    p.setValueAtTime(1, time)
    p.linearRampToValueAtTime(1 - DUCK_DEPTH, time + 0.02)
    p.setTargetAtTime(1, time + 0.04, 0.09)
    this.events.push({ time: time + this.outLatency(), type: 'duck' })
  }

  setTrackVolume(role: Role, v: number) {
    if (!this.ctx) return
    const g = this.trackGains.get(role)
    if (g) g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
  }

  // ---- performable master FX (hold = on, release = snap back) ----
  filterHold(on: boolean) {
    if (!this.ctx) return
    const f = this.fxFilter.frequency
    const t = this.ctx.currentTime
    f.cancelScheduledValues(t)
    if (on) f.exponentialRampToValueAtTime(320, t + 0.25)
    else f.exponentialRampToValueAtTime(19000, t + 0.2)
  }

  stutterHold(on: boolean, bpm: number) {
    if (!this.ctx) return
    const ctx = this.ctx
    if (on && !this.stutterOsc) {
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.value = bpm / 60 * 4 // 1/16 gate
      const depth = ctx.createGain()
      depth.gain.value = 0.5
      osc.connect(depth).connect(this.masterGain.gain)
      this.masterGain.gain.setValueAtTime(0.45, ctx.currentTime)
      osc.start()
      this.stutterOsc = osc
      this.stutterDepth = depth
    } else if (!on && this.stutterOsc) {
      this.stutterOsc.stop()
      this.stutterOsc.disconnect()
      this.stutterDepth?.disconnect()
      this.stutterOsc = null
      this.stutterDepth = null
      this.masterGain.gain.setTargetAtTime(0.9, ctx.currentTime, 0.02)
    }
  }

  /** Nearest step to "now" for quantized punch-in recording. */
  quantizeNow(bpm: number): number {
    if (!this.ctx || !this.playing) return 0
    // nextTime is when this.step will sound; count back from that anchor
    const stepDur = 60 / bpm / 4
    const stepsFromNext = (this.ctx.currentTime - this.nextTime) / stepDur
    let idx = Math.round(this.step + stepsFromNext)
    idx = ((idx % NUM_STEPS) + NUM_STEPS) % NUM_STEPS
    return idx
  }
}

export const engine = new Engine()
