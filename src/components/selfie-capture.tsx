"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Small on purpose: a face at list size, not a photograph. */
const SIZE = 256;
const QUALITY = 0.75;

type Status = "starting" | "ready" | "denied" | "unavailable";

/**
 * Photo Booth's colour effects, which are all reachable with CSS filters — the same
 * string drives the live preview and the canvas, so what you framed is what you get.
 * The geometric ones (bulge, twirl) would need a shader and are not here.
 */
const FILTERS = [
  { name: "Normal", css: "none" },
  { name: "Mono", css: "grayscale(1) contrast(1.15)" },
  { name: "Sepia", css: "sepia(0.85) contrast(1.05)" },
  { name: "Pop", css: "saturate(2.4) contrast(1.3)" },
  { name: "Noir", css: "grayscale(1) contrast(1.7) brightness(0.9)" },
  { name: "Thermal", css: "invert(1) hue-rotate(170deg) saturate(3)" },
  { name: "X-Ray", css: "invert(1) grayscale(1) contrast(1.4)" },
  { name: "Glow", css: "brightness(1.2) saturate(1.5) blur(0.4px)" },
];

/**
 * The front camera, for the picture that goes on your profile. Offered once, when a
 * profile is new — and always skippable, because someone joining a poker night should
 * never be stuck behind a camera permission they do not want to give.
 */
export function SelfieCapture({
  onCapture,
  onSkip,
  title = "Add a photo",
}: {
  onCapture: (base64: string) => Promise<unknown>;
  onSkip: () => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState(FILTERS[0]);
  // Without canvas filter support the capture would ignore the effect and quietly hand
  // back a plain photo, so the picker is only offered where it actually applies.
  const [canFilter, setCanFilter] = useState(false);

  useEffect(() => {
    const context = document.createElement("canvas").getContext("2d");
    setCanFilter(context !== null && "filter" in context);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" } },
          audio: false,
        });
      } catch {
        setStatus("denied");
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setStatus("ready");
    }

    void start();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || saving) return;

    // Centre-crop to a square first, so faces are not squashed by the sensor's aspect.
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext("2d")!;
    // The same filter string the preview is using, so the result matches the framing.
    if (canFilter) {
      context.filter = filter.css;
    }
    // Mirror it: a selfie preview is mirrored, and an unmirrored result looks wrong.
    context.translate(SIZE, 0);
    context.scale(-1, 1);
    context.drawImage(video, sx, sy, side, side, 0, 0, SIZE, SIZE);

    setSaving(true);
    try {
      await onCapture(canvas.toDataURL("image/jpeg", QUALITY).split(",")[1]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onSkip} data-testid="skip-selfie">
          Skip
        </Button>
      </div>

      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black/40">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full scale-x-[-1] object-cover"
          style={{ filter: filter.css }}
          data-testid="selfie-video"
        />
        <canvas ref={canvasRef} className="hidden" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-6 text-center">
            <p className="text-sm text-white/80">
              {status === "starting" && "Starting the camera…"}
              {status === "denied" && "No camera access. You can skip this and add one later."}
              {status === "unavailable" && "No camera on this device. Skip for now."}
            </p>
          </div>
        )}
      </div>

      {canFilter && status === "ready" && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((option) => (
            <button
              key={option.name}
              onClick={() => setFilter(option)}
              data-testid={`filter-${option.name}`}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
                option.name === filter.name
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}

      <Button
        className="w-full"
        disabled={status !== "ready" || saving}
        onClick={capture}
        data-testid="take-selfie"
      >
        {saving ? "Saving…" : "Take photo"}
      </Button>
    </div>
  );
}
