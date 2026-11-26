<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useVoiceStore } from '../../stores/voice'
import { effectiveThreshold, createPeakHold, gateLineLeft, thresholdAt } from '../lib/levelMeter'

// The microphone level bar: amber below the threshold (not transmitted), green
// above it (transmitted), with the loudest recent level marked. With
// `adjustable` the white threshold line is the noise gate's handle. The bar
// follows the pointer for the whole press (a native range thumb only moves
// when the press starts on the thumb, so a click on the line and a drag did
// nothing). Arrow keys use the range underneath. Moving it by hand switches
// automatic sensitivity off.
const props = defineProps<{ numbers?: boolean; adjustable?: boolean }>()
const voiceStore = useVoiceStore()
const dragging = shallowRef(false)

function commitThreshold(value: number) {
  if (!voiceStore.autoSensitivity && voiceStore.sensitivityThreshold === value) return
  voiceStore.autoSensitivity = false
  voiceStore.sensitivityThreshold = value
  voiceStore.saveSettings()
}

// The line is positioned in the padding box. The border sits outside that.
function pointerBox(el: HTMLElement): { left: number; width: number } {
  const rect = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0
  const borderRight = Number.parseFloat(style.borderRightWidth) || 0
  return { left: rect.left + borderLeft, width: Math.max(0, rect.width - borderLeft - borderRight) }
}

function setThreshold(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value, 10)
  if (Number.isNaN(value)) return
  commitThreshold(value)
}

function onPointerDown(e: PointerEvent) {
  if (!props.adjustable || e.button !== 0 || !e.isPrimary) return
  const el = e.currentTarget as HTMLElement
  dragging.value = true
  try { el.setPointerCapture(e.pointerId) } catch { /* move events still reach the bar while the pointer is over it */ }
  e.preventDefault()
  commitThreshold(thresholdAt(e.clientX, pointerBox(el)))
  el.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  // A move with no button held means the release was missed. Do not keep dragging.
  if (e.buttons === 0) {
    dragging.value = false
    return
  }
  commitThreshold(thresholdAt(e.clientX, pointerBox(e.currentTarget as HTMLElement)))
}

function endDrag() {
  dragging.value = false
}

// The marker shows what the gate really uses (auto mode ignores the slider).
const threshold = computed(() => effectiveThreshold(voiceStore))
const lineLeft = computed(() => props.adjustable ? gateLineLeft(threshold.value) : `${threshold.value}%`)
const isAboveThreshold = computed(() => voiceStore.currentInputLevel >= threshold.value)

const peakHold = createPeakHold()
const peakLevel = ref(0)
watch(() => voiceStore.currentInputLevel, level => {
  peakLevel.value = peakHold(level)
})
defineExpose({ peakLevel, threshold })
</script>

<template>
  <div class="stack-2">
    <div
      data-testid="mic-level"
      class="relative flex h-9 items-center overflow-hidden rounded-lg border border-mnema-border bg-mnema-canvas p-1"
      :class="props.adjustable && 'mic-gate'"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
    >
      <!-- The meter role sits on the level itself, so the slider is not nested inside a meter -->
      <div
        role="meter"
        :aria-label="$t('audio.levelLabel')"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="voiceStore.currentInputLevel"
        class="h-full rounded-md transition-[width,background-color] duration-(--motion-press) motion-reduce:transition-none"
        :class="isAboveThreshold ? 'bg-mnema-accent' : 'bg-mnema-warning'"
        :style="{ width: `${voiceStore.currentInputLevel}%` }"
      ></div>

      <!-- Peak marker (loudest level of the last moments) -->
      <div
        v-if="peakLevel > 0"
        class="pointer-events-none absolute top-1.5 bottom-1.5 w-0.5 rounded-sm"
        :class="peakLevel >= threshold ? 'bg-mnema-accent-hover' : 'bg-mnema-amber'"
        :style="{ left: `${peakLevel}%` }"
      ></div>

      <!-- Threshold marker; with `adjustable` it is the visible handle of the slider below -->
      <div
        data-gate-marker
        class="pointer-events-none absolute top-0 bottom-0 z-10 w-1 bg-white shadow-lg motion-reduce:transition-none"
        :class="props.adjustable ? 'mic-gate-handle -translate-x-1/2' : 'transition-[left]'"
        :style="{ left: lineLeft }"
      ></div>

      <!-- Keyboard and assistive tech. The pointer is handled by the bar: this
           input stays out of hit testing, because a native range does not follow
           a drag that starts on the track. -->
      <input
        v-if="props.adjustable"
        type="range"
        min="0"
        max="100"
        :value="threshold"
        :aria-label="$t('audio.sensitivity')"
        :aria-valuetext="$t('audio.threshold', { value: threshold })"
        data-testid="noise-gate"
        class="mic-gate-input absolute inset-0 z-20"
        @input="setThreshold"
      />
    </div>

    <div v-if="props.numbers" class="flex items-center justify-between font-mono text-xs text-mnema-tertiary">
      <span :class="isAboveThreshold ? 'font-bold text-mnema-accent' : 'text-mnema-warning'">
        {{ $t('audio.level', { level: voiceStore.currentInputLevel, peak: peakLevel }) }}
      </span>
      <span class="font-bold text-mnema-text">
        {{ $t('audio.threshold', { value: threshold }) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* The range stays in the tree for the keyboard and is not a hit target. */
.mic-gate-input {
  height: 100%;
  opacity: 0;
  pointer-events: none;
}
.mic-gate { cursor: ew-resize; touch-action: none; user-select: none; }
.mic-gate-handle { width: 4px; border-radius: 2px; }
.mic-gate:hover .mic-gate-handle,
.mic-gate:active .mic-gate-handle { width: 6px; }
.mic-gate:has(.mic-gate-input:focus-visible) {
  outline: 2px solid var(--color-mnema-accent);
  outline-offset: 2px;
}
</style>
