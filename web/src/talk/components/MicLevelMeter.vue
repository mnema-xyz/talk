<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useVoiceStore } from '../../stores/voice'
import { effectiveThreshold, createPeakHold } from '../lib/levelMeter'

// The microphone level bar: amber below the threshold (not transmitted), green
// above it (transmitted), with the loudest recent level marked. With
// `adjustable` the white threshold line is the noise gate's handle: the whole
// bar is a slider, so the line can be dragged (or moved with the arrow keys).
// Moving it by hand switches automatic sensitivity off.
const props = defineProps<{ numbers?: boolean; adjustable?: boolean }>()
const voiceStore = useVoiceStore()

function setThreshold(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value, 10)
  if (Number.isNaN(value)) return
  voiceStore.autoSensitivity = false
  voiceStore.sensitivityThreshold = value
  voiceStore.saveSettings()
}

// The marker shows what the gate really uses (auto mode ignores the slider).
const threshold = computed(() => effectiveThreshold(voiceStore))
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
      class="relative flex h-9 items-center overflow-hidden rounded-lg border border-mnema-border bg-mnema-canvas p-1"
      :class="props.adjustable && 'mic-gate'"
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
        :style="{ left: props.adjustable ? `calc(8px + (100% - 16px) * ${threshold / 100})` : `${threshold}%` }"
      ></div>

      <!-- The bar itself is the noise gate slider: an invisible native range over it, so
           mouse, touch and keyboard all move the white line. -->
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
/* The native slider stays in the layout for input but is not drawn; the white
   line above is its handle. The thumb is 16px wide, so the line is placed at
   8px + (100% - 16px) * value to sit exactly under the pointer. */
.mic-gate-input {
  height: 100%;
  opacity: 0;
  cursor: ew-resize;
  touch-action: none;
}
.mic-gate-input::-webkit-slider-runnable-track { height: 100%; }
.mic-gate-input::-webkit-slider-thumb { height: 100%; margin-top: 0; }
.mic-gate-input::-moz-range-track { height: 100%; }
.mic-gate-input::-moz-range-thumb { height: 100%; }
.mic-gate { cursor: ew-resize; }
.mic-gate-handle { width: 4px; border-radius: 2px; }
.mic-gate:has(.mic-gate-input:hover) .mic-gate-handle,
.mic-gate:has(.mic-gate-input:active) .mic-gate-handle { width: 6px; }
.mic-gate:has(.mic-gate-input:focus-visible) {
  outline: 2px solid var(--color-mnema-accent);
  outline-offset: 2px;
}
</style>
