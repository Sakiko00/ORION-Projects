/**
 * Shared Audio Context Manager
 *
 * Provides a singleton AudioContext + AnalyserNode that the MusicPlayer
 * connects its <audio> element to, and the AudioVisualizer consumes
 * for frequency data.
 */

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let connectedElement: HTMLAudioElement | null = null;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function getAnalyser(): AnalyserNode | null {
  return analyser;
}

export function isAudioContextActive(): boolean {
  return audioContext !== null && audioContext.state === 'running';
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Connect an <audio> element to the shared analyser.
 * Called once by MusicPlayer when audio starts playing.
 */
export function connectAudioElement(el: HTMLAudioElement) {
  // Avoid reconnecting the same element
  if (el === connectedElement && sourceNode) return;

  // If a previous element was connected, disconnect it
  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch {
      /* ignore */
    }
  }

  // Create AudioContext lazily (requires user gesture)
  if (!audioContext) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audioContext = new AC();
    const newAnalyser = audioContext.createAnalyser();
    newAnalyser.fftSize = 256;
    newAnalyser.smoothingTimeConstant = 0.82;
    newAnalyser.connect(audioContext.destination);
    analyser = newAnalyser;
  }

  // Resume if suspended (browser autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  sourceNode = audioContext.createMediaElementSource(el);
  sourceNode.connect(analyser!);
  connectedElement = el;

  notify();
}

/**
 * Resume AudioContext (call on user interaction).
 */
export function resumeAudioContext() {
  if (audioContext?.state === 'suspended') {
    audioContext.resume();
  }
}
