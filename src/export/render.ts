// Offline WAV export: replay the project through an OfflineAudioContext with
// the same voice/bus logic as live playback, then encode 16-bit PCM.
import { NUM_STEPS, type Project } from '../model'
import { kitForTrack } from '../audio/kits'
import { getBuffer, loopBarSeconds } from '../audio/synth'

export async function renderProjectWav(project: Project, loops = 2): Promise<Blob> {
  const stepDur = 60 / project.bpm / 4
  const chain = project.chainOn && project.chain.length ? project.chain : [project.current]
  const totalSteps = chain.length * NUM_STEPS * loops
  const seconds = totalSteps * stepDur + 1.2
  const sr = 44100
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr)

  // master chain mirrors the live bus
  const duck = ctx.createGain()
  const glue = ctx.createDynamicsCompressor()
  glue.threshold.value = -14
  glue.ratio.value = 3
  glue.attack.value = 0.01
  glue.release.value = 0.16
  const clip = ctx.createWaveShaper()
  const n = 2048
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) curve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 1.4)
  clip.curve = curve
  const master = ctx.createGain()
  master.gain.value = 0.9
  duck.connect(glue)
  glue.connect(clip).connect(master).connect(ctx.destination)

  // pre-render every needed buffer
  const buffers = new Map<string, AudioBuffer>()
  for (const patIdx of chain) {
    for (const track of project.patterns[patIdx].tracks) {
      const k = kitForTrack(project.kitId, track.sound)
      const key = `${k.id}.${track.role}`
      if (!buffers.has(key)) buffers.set(key, await getBuffer(k, track.role))
    }
  }

  let t = 0.05
  for (let loop = 0; loop < loops; loop++) {
    for (const patIdx of chain) {
      const pattern = project.patterns[patIdx]
      const anySolo = pattern.tracks.some((tr) => tr.solo)
      for (let step = 0; step < NUM_STEPS; step++) {
        const swing = step % 2 === 1 ? project.swing * stepDur * 0.6 : 0
        const stepTime = t + step * stepDur + swing
        for (const track of pattern.tracks) {
          if (track.mute || (anySolo && !track.solo)) continue
          const s = track.steps[step]
          if (!s.on) continue
          const k = kitForTrack(project.kitId, track.sound)
          const buf = buffers.get(`${k.id}.${track.role}`)!
          const nRat = Math.max(1, Math.min(4, s.ratchet))
          for (let r = 0; r < nRat; r++) {
            const at = stepTime + s.nudge * stepDur + (r * stepDur) / nRat
            const src = ctx.createBufferSource()
            src.buffer = buf
            const g = ctx.createGain()
            g.gain.value = s.vel * track.vol
            src.connect(g).connect(track.role === 'kick' ? glue : duck)
            if (track.role === 'loop') {
              const barSec = loopBarSeconds(k)
              const rate = (project.bpm / k.bpm) * Math.pow(2, s.pitch / 12)
              src.playbackRate.value = rate
              const offset = (step / NUM_STEPS) * barSec
              src.start(at, offset)
              const stopAt = at + Math.min((barSec - offset) / rate, (60 / project.bpm) * 2)
              g.gain.setValueAtTime(s.vel * track.vol, stopAt - 0.03)
              g.gain.linearRampToValueAtTime(0, stopAt)
              src.stop(stopAt + 0.01)
            } else {
              src.playbackRate.value = Math.pow(2, s.pitch / 12)
              src.start(at)
            }
            if (track.role === 'kick') {
              duck.gain.setValueAtTime(1, at)
              duck.gain.linearRampToValueAtTime(0.5, at + 0.02)
              duck.gain.setTargetAtTime(1, at + 0.04, 0.09)
            }
          }
        }
      }
      t += NUM_STEPS * stepDur
    }
  }

  const rendered = await ctx.startRendering()
  return encodeWav(rendered)
}

function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels
  const len = buf.length * ch * 2
  const arr = new ArrayBuffer(44 + len)
  const view = new DataView(arr)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF')
  view.setUint32(4, 36 + len, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, ch, true)
  view.setUint32(24, buf.sampleRate, true)
  view.setUint32(28, buf.sampleRate * ch * 2, true)
  view.setUint16(32, ch * 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, len, true)
  let o = 44
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i))
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]))
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      o += 2
    }
  }
  return new Blob([arr], { type: 'audio/wav' })
}
