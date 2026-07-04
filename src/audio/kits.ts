import type { Role } from '../model'

export interface KickParams { f0: number; f1: number; sweep: number; decay: number; click: number; drive: number }
export interface SnareParams { kind: 'snare' | 'clap'; tone: number; toneAmt: number; noiseDecay: number; bp: number }
export interface HatParams { decay: number; hp: number; metal: number }
export interface PercParams { kind: 'rim' | 'cowbell' | 'shaker' | 'tom' | 'blip' | 'snap'; tune: number; decay: number }
export interface BassParams { decay: number; drive: number; sub: number }
export interface LoopEvent { t: number; dur: number; midi: number[]; vel: number }
export interface LoopParams {
  voice: 'pluck' | 'keys' | 'stab' | 'sub'
  cutoff: number
  vinyl: number
  events: LoopEvent[]
}

export interface KitDef {
  id: string
  name: string
  genre: string
  /** CSS accent colors — the whole UI re-themes per kit */
  accent: string
  accentSoft: string
  bpm: number
  /** semitone scale used by dice + perform pads for the 808 row */
  scale: number[]
  /** base frequency of the 808 at pitch 0 */
  bassHz: number
  kick: KickParams
  snare: SnareParams
  hatC: HatParams
  hatO: HatParams
  perc1: PercParams
  perc2: PercParams
  bass: BassParams
  loop: LoopParams
}

// Loops are written as 1-bar note event lists (t/dur in 16th steps, midi absolute).
// They render once per kit into an AudioBuffer and the Loop row chops into them.

const Am = (o: number) => [57 + o, 60 + o, 64 + o] // A minor triad helper

export const KITS: KitDef[] = [
  {
    id: 'trap',
    name: 'Purple Heat',
    genre: 'Trap',
    accent: '#a78bfa',
    accentSoft: 'rgba(167,139,250,0.22)',
    bpm: 140,
    scale: [0, 3, 5, 7, 10, 12],
    bassHz: 55, // A1
    kick: { f0: 160, f1: 42, sweep: 0.055, decay: 0.45, click: 0.5, drive: 2.2 },
    snare: { kind: 'snare', tone: 190, toneAmt: 0.4, noiseDecay: 0.16, bp: 1800 },
    hatC: { decay: 0.045, hp: 8200, metal: 0.7 },
    hatO: { decay: 0.4, hp: 7600, metal: 0.7 },
    perc1: { kind: 'rim', tune: 1750, decay: 0.05 },
    perc2: { kind: 'snap', tune: 1200, decay: 0.09 },
    bass: { decay: 0.9, drive: 2.6, sub: 1 },
    loop: {
      voice: 'pluck',
      cutoff: 2400,
      vinyl: 0,
      events: [
        { t: 0, dur: 3, midi: [69], vel: 0.9 },
        { t: 3, dur: 2, midi: [72], vel: 0.7 },
        { t: 6, dur: 2, midi: [76], vel: 0.8 },
        { t: 8, dur: 3, midi: [74], vel: 0.75 },
        { t: 12, dur: 4, midi: [67], vel: 0.85 },
      ],
    },
  },
  {
    id: 'boombap',
    name: 'Dusty Crates',
    genre: 'Boom Bap',
    accent: '#fbbf24',
    accentSoft: 'rgba(251,191,36,0.20)',
    bpm: 92,
    scale: [0, 2, 3, 5, 7, 10],
    bassHz: 55,
    kick: { f0: 120, f1: 48, sweep: 0.04, decay: 0.28, click: 0.8, drive: 1.6 },
    snare: { kind: 'snare', tone: 230, toneAmt: 0.55, noiseDecay: 0.22, bp: 1400 },
    hatC: { decay: 0.06, hp: 7000, metal: 0.45 },
    hatO: { decay: 0.32, hp: 6400, metal: 0.45 },
    perc1: { kind: 'shaker', tune: 4200, decay: 0.07 },
    perc2: { kind: 'tom', tune: 160, decay: 0.22 },
    bass: { decay: 0.55, drive: 1.4, sub: 0.8 },
    loop: {
      voice: 'keys',
      cutoff: 1500,
      vinyl: 0.15,
      events: [
        { t: 0, dur: 6, midi: Am(0), vel: 0.75 },
        { t: 8, dur: 6, midi: [55, 58, 62], vel: 0.7 },
      ],
    },
  },
  {
    id: 'house',
    name: 'Neon Warehouse',
    genre: 'House',
    accent: '#22d3ee',
    accentSoft: 'rgba(34,211,238,0.20)',
    bpm: 124,
    scale: [0, 2, 4, 7, 9, 12],
    bassHz: 55,
    kick: { f0: 140, f1: 46, sweep: 0.045, decay: 0.32, click: 0.35, drive: 2.0 },
    snare: { kind: 'clap', tone: 0, toneAmt: 0, noiseDecay: 0.24, bp: 1300 },
    hatC: { decay: 0.05, hp: 8800, metal: 0.6 },
    hatO: { decay: 0.28, hp: 8000, metal: 0.6 },
    perc1: { kind: 'rim', tune: 1900, decay: 0.045 },
    perc2: { kind: 'cowbell', tune: 560, decay: 0.12 },
    bass: { decay: 0.35, drive: 1.8, sub: 0.7 },
    loop: {
      voice: 'stab',
      cutoff: 3200,
      vinyl: 0,
      events: [
        { t: 2, dur: 2, midi: [57, 60, 64, 67], vel: 0.85 },
        { t: 6, dur: 2, midi: [57, 60, 64, 67], vel: 0.7 },
        { t: 10, dur: 2, midi: [55, 59, 62, 67], vel: 0.85 },
        { t: 14, dur: 2, midi: [55, 59, 62, 67], vel: 0.7 },
      ],
    },
  },
  {
    id: 'lofi',
    name: 'Rainy Window',
    genre: 'Lo-Fi',
    accent: '#f0a6b8',
    accentSoft: 'rgba(240,166,184,0.20)',
    bpm: 76,
    scale: [0, 2, 3, 7, 8, 12],
    bassHz: 49, // G1-ish, mellower
    kick: { f0: 100, f1: 44, sweep: 0.05, decay: 0.3, click: 0.2, drive: 1.3 },
    snare: { kind: 'snare', tone: 170, toneAmt: 0.35, noiseDecay: 0.18, bp: 1100 },
    hatC: { decay: 0.05, hp: 6200, metal: 0.3 },
    hatO: { decay: 0.25, hp: 5600, metal: 0.3 },
    perc1: { kind: 'shaker', tune: 3600, decay: 0.09 },
    perc2: { kind: 'blip', tune: 980, decay: 0.08 },
    bass: { decay: 0.7, drive: 1.2, sub: 1 },
    loop: {
      voice: 'keys',
      cutoff: 1100,
      vinyl: 0.35,
      events: [
        { t: 0, dur: 7, midi: [55, 58, 62, 65], vel: 0.65 },
        { t: 8, dur: 7, midi: [53, 57, 60, 64], vel: 0.6 },
      ],
    },
  },
]

export const KIT_MAP: Record<string, KitDef> = Object.fromEntries(KITS.map((k) => [k.id, k]))

export function kitForTrack(projectKitId: string, soundOverride: string | null): KitDef {
  return KIT_MAP[soundOverride ?? projectKitId] ?? KIT_MAP[projectKitId] ?? KITS[0]
}

export type SoundRole = Exclude<Role, never>
