// Helpers for the input level meter in the audio settings. The meter has to
// stay readable when the threshold sits above the current level, otherwise
// there is nothing to calibrate the noise gate against.

// Threshold the voice-activity gate uses while "Automatisch ermitteln" is on
// (see setupSpeakingDetection in talk/composables/useWebRTC.js).
export const AUTO_THRESHOLD = 25

// How long the peak marker stays at the loudest recent level.
export const PEAK_HOLD_MS = 1500

/** Width of the gate handle. The line stays this far inside the bar, under the pointer. */
export const GATE_THUMB_PX = 16

/** CSS `left` of the gate line for a threshold of 0-100, centered on the pointer. */
export function gateLineLeft(percent: number): string {
  const inset = GATE_THUMB_PX / 2
  return `calc(${inset}px + (100% - ${GATE_THUMB_PX}px) * ${percent / 100})`
}

/** Threshold 0-100 for a pointer at `clientX` over the level bar. */
export function thresholdAt(clientX: number, bar: { left: number; width: number }): number {
  const span = bar.width - GATE_THUMB_PX
  if (span <= 0) return 0
  const ratio = (clientX - bar.left - GATE_THUMB_PX / 2) / span
  return Math.round(Math.min(100, Math.max(0, ratio * 100)))
}

/** The threshold the noise gate actually applies, as a number 0-100. */
export interface ThresholdSettings {
  autoSensitivity: boolean
  sensitivityThreshold: number | string
}

export interface VoiceGateSettings extends ThresholdSettings {
  inputMode: 'activity' | 'ptt'
  isPttPressed: boolean
  hangoverMs: number
}

export function effectiveThreshold({ autoSensitivity, sensitivityThreshold }: ThresholdSettings): number {
  return autoSensitivity ? AUTO_THRESHOLD : Number(sensitivityThreshold)
}

/**
 * Returns a function (level, now) => peak that follows rising levels at once
 * and keeps the highest level for PEAK_HOLD_MS before dropping back.
 */
export function createPeakHold(holdMs = PEAK_HOLD_MS) {
  let peak = 0
  let peakAt = -Infinity
  return (level: number, now = Date.now()) => {
    if (level >= peak || now - peakAt > holdMs) {
      peak = level
      peakAt = now
    }
    return peak
  }
}

/**
 * The voice gate shared by the call and the mic test: open while push-to-talk
 * is held, or (voice activity) while the level reaches the threshold and for
 * the hangover time after it, so trailing words are not cut off. Each gate
 * keeps its own hangover clock.
 */
export function createVoiceGate(settings: VoiceGateSettings, now = () => Date.now()) {
  let lastAbove = -Infinity
  return function gateOpen(level: number) {
    if (settings.inputMode === 'ptt') return !!settings.isPttPressed
    if (level >= effectiveThreshold(settings)) {
      lastAbove = now()
      return true
    }
    return now() - lastAbove < settings.hangoverMs
  }
}
