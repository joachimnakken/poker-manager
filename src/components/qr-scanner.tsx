"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, X } from "lucide-react";
import { CODE_LENGTH, parseJoinTarget } from "@/lib/join-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "idle" | "starting" | "scanning" | "denied" | "unavailable";

/**
 * Joining a table: type the five characters from the screen, or turn on the camera and
 * scan the QR.
 *
 * The camera stays off until asked for. Starting it on arrival meant every guest was
 * handed a permission prompt before they had done anything, and plenty of them would
 * rather just type the code — which is on the projector in huge type right under the QR.
 * Asking on a tap is also the more reliable way to get permission on iOS.
 *
 * Decoding is done in JS rather than with the platform barcode API, which Safari does
 * not implement, and iOS is where this app lives.
 */
export function QrScanner({ onJoin }: { onJoin: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const onJoinRef = useRef(onJoin);
  onJoinRef.current = onJoin;

  const wanted = status !== "idle";

  useEffect(() => {
    if (!wanted) {
      return;
    }
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
  }, [wanted]);

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
      <form onSubmit={submitTyped} className="space-y-2">
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
          className="h-14 text-center text-2xl font-mono tracking-[0.3em] uppercase placeholder:text-base placeholder:tracking-normal placeholder:normal-case placeholder:font-sans"
          data-testid="join-code-input"
        />
        <Button type="submit" className="h-12 w-full" disabled={!typed.trim()}>
          Join
        </Button>
      </form>
      {typedError && <p className="text-center text-sm text-destructive">{typedError}</p>}

      {status === "idle" ? (
        <button
          onClick={() => setStatus("starting")}
          data-testid="open-scanner"
          className="flex w-full flex-col items-center gap-2 rounded-2xl border border-border bg-card/60 py-8 text-muted-foreground transition-colors active:bg-card"
        >
          <Camera className="h-10 w-10" strokeWidth={1.5} aria-hidden />
          <span className="text-sm font-medium">Scan the code instead</span>
        </button>
      ) : (
        <div className="space-y-2">
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

            <button
              onClick={() => setStatus("idle")}
              data-testid="close-scanner"
              aria-label="Turn the camera off"
              className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>

            {status !== "scanning" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-6 text-center">
                <p className="text-sm text-white/80">
                  {status === "starting" && "Starting the camera…"}
                  {status === "denied" &&
                    "No camera access. Allow it in your browser settings, or type the code above."}
                  {status === "unavailable" &&
                    "This device has no camera available. Type the code above."}
                </p>
              </div>
            )}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Point at the join code on the screen
          </p>
        </div>
      )}
    </div>
  );
}
