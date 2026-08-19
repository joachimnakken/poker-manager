"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { CODE_LENGTH, parseJoinTarget } from "@/lib/join-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "starting" | "scanning" | "denied" | "unavailable";

/**
 * Points the back camera at the projector's join QR. Decoding is done in JS rather than
 * with the platform barcode API, which Safari does not implement — and iOS is where this
 * app lives. Typing the five characters is always available as a fallback, since the
 * projector shows them in huge type right under the QR.
 */
export function QrScanner({ onJoin }: { onJoin: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  // The callback must not restart the camera when a parent re-renders.
  const onJoinRef = useRef(onJoin);
  onJoinRef.current = onJoin;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        setStatus("denied");
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) {
        return;
      }
      video.srcObject = stream;
      // playsInline matters on iOS, where video otherwise takes over the screen.
      await video.play().catch(() => undefined);
      setStatus("scanning");

      const canvas = canvasRef.current!;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;

      const read = () => {
        if (stopped) {
          return;
        }
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          // Decode at a modest size: a QR across the room needs far less than 1080p,
          // and jsQR scans every pixel it is handed.
          const width = 480;
          const height = Math.round((video.videoHeight / video.videoWidth) * width) || 480;
          canvas.width = width;
          canvas.height = height;
          context.drawImage(video, 0, 0, width, height);
          const image = context.getImageData(0, 0, width, height);
          const found = jsQR(image.data, width, height, { inversionAttempts: "dontInvert" });
          const code = found ? parseJoinTarget(found.data) : null;
          if (code) {
            stopped = true;
            onJoinRef.current(code);
            return;
          }
        }
        frame = requestAnimationFrame(read);
      };
      frame = requestAnimationFrame(read);
    }

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function submitTyped(event: React.FormEvent) {
    event.preventDefault();
    const code = parseJoinTarget(typed);
    if (code) {
      onJoinRef.current(code);
    } else {
      setTypedError("That is not a join code");
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black/40">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
          data-testid="scanner-video"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* A frame to aim with. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-3/5 w-3/5 rounded-2xl border-4 border-white/70" />
        </div>

        {status !== "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-6 text-center">
            <p className="text-sm text-white/80">
              {status === "starting" && "Starting the camera…"}
              {status === "denied" &&
                "No camera access. Allow it in your browser settings, or type the code below."}
              {status === "unavailable" &&
                "This device has no camera available. Type the code below."}
            </p>
          </div>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Point at the join code on the screen
      </p>

      <form onSubmit={submitTyped} className="flex gap-2">
        <Input
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value.toUpperCase());
            setTypedError(null);
          }}
          placeholder="Enter code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={CODE_LENGTH}
          className="text-center font-mono tracking-[0.3em] uppercase placeholder:tracking-normal placeholder:normal-case placeholder:font-sans"
          data-testid="join-code-input"
        />
        <Button type="submit" disabled={!typed.trim()}>
          Join
        </Button>
      </form>
      {typedError && <p className="text-center text-sm text-destructive">{typedError}</p>}
    </div>
  );
}
