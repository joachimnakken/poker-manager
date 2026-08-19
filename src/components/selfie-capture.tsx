"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Small on purpose: a face at list size, not a photograph. */
const SIZE = 256;
const QUALITY = 0.75;

type Status = "starting" | "ready" | "denied" | "unavailable";

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
