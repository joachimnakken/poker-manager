"use client";

function createBeep(frequency: number, duration: number, volume: number = 0.3): void {
  if (typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.value = volume;
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // Audio not supported
  }
}

export function playWarningSound(): void {
  createBeep(880, 0.3, 0.2);
}

export function playLevelChangeSound(): void {
  createBeep(660, 0.15, 0.3);
  setTimeout(() => createBeep(880, 0.15, 0.3), 200);
  setTimeout(() => createBeep(1100, 0.3, 0.3), 400);
}
