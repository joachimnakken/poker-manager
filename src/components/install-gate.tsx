"use client";

import { useEffect, useState } from "react";
import { isStandalone } from "@/lib/identity";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios-safari" | "ios-other" | "android" | "desktop" | "unknown";

function detect(): Platform {
  const ua = window.navigator.userAgent;
  const iOS = /iphone|ipad|ipod/i.test(ua) || (/Mac/.test(ua) && "ontouchend" in document);
  if (iOS) {
    // Only Safari can add to the home screen on iOS; Chrome and Firefox there cannot.
    return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "ios-other" : "ios-safari";
  }
  if (/android/i.test(ua)) {
    return "android";
  }
  // A coarse pointer with no touch is a desktop; the host works there in a browser.
  return window.matchMedia("(pointer: fine)").matches ? "desktop" : "unknown";
}

/**
 * The player app is meant to live on the home screen, so on a phone that is the only
 * thing offered until it is installed. Desktop passes straight through — that is where
 * the host runs the night, in an ordinary browser.
 *
 * Neither platform allows an app to install itself. Chrome hands us an event we can turn
 * into one tap; iOS has no install API at all, so there the honest answer is to point at
 * the Share button.
 */
export function InstallGate({ children }: { children: React.ReactNode }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    setInstalled(isStandalone());
    setPlatform(detect());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Standalone and desktop are only knowable after mount, so hold rather than flash the
  // wrong screen at someone who already has the app.
  if (platform === null) {
    return null;
  }
  if (installed || platform === "desktop") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen px-4 pt-safe pb-safe max-w-md mx-auto space-y-4">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold">Add Poker to your home screen</h1>
        <p className="text-sm text-muted-foreground">
          The table, your seat and the clock live in the app. It takes a few seconds.
        </p>
      </div>

      {platform === "android" && (
        <Card>
          <CardContent className="space-y-3 py-4">
            {event ? (
              <>
                <p className="text-sm">One tap and it is on your home screen.</p>
                <Button
                  className="w-full"
                  data-testid="install-app"
                  onClick={async () => {
                    await event.prompt();
                    await event.userChoice;
                  }}
                >
                  Install
                </Button>
              </>
            ) : (
              <Steps
                steps={[
                  "Open the ⋮ menu, top right",
                  "Tap “Add to Home screen” or “Install app”",
                  "Confirm, then open Poker from your home screen",
                ]}
              />
            )}
          </CardContent>
        </Card>
      )}

      {platform === "ios-safari" && (
        <Card>
          <CardContent className="py-4">
            <Steps
              steps={[
                "Tap the Share button at the bottom of Safari — the square with an arrow",
                "Scroll down and tap “Add to Home Screen”",
                "Tap Add, then open Poker from your home screen",
              ]}
            />
          </CardContent>
        </Card>
      )}

      {platform === "ios-other" && (
        <Card>
          <CardContent className="space-y-2 py-4">
            <p className="text-sm font-medium">Open this page in Safari first</p>
            <p className="text-sm text-muted-foreground">
              On iPhone only Safari can add an app to the home screen. Copy this address
              into Safari, then use Share → Add to Home Screen.
            </p>
          </CardContent>
        </Card>
      )}

      {platform === "unknown" && (
        <Card>
          <CardContent className="py-4">
            <Steps
              steps={[
                "Open your browser's menu",
                "Look for “Install app” or “Add to Home screen”",
                "Open Poker from your home screen afterwards",
              ]}
            />
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Already added it? Open Poker from your home screen rather than the browser.
      </p>
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {index + 1}
          </span>
          <span className="text-sm">{step}</span>
        </li>
      ))}
    </ol>
  );
}
