"use client";

import { useEffect, useState } from "react";
import { isStandalone } from "@/lib/identity";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Offers to put the app on the home screen. Neither platform allows this to happen on
 * its own: Chrome hands us an event we can turn into one tap, and iOS has no install API
 * at all, so there the best we can do is point at the Share button.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [iOS, setIOS] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

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

  if (installed) {
    return null;
  }

  if (event) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="text-sm">
            <div className="font-medium">Add to your home screen</div>
            <div className="text-xs text-muted-foreground">Opens straight into your table</div>
          </div>
          <Button
            size="sm"
            data-testid="install-app"
            onClick={async () => {
              await event.prompt();
              await event.userChoice;
              setEvent(null);
            }}
          >
            Install
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (iOS) {
    return (
      <Card>
        <CardContent className="py-3">
          <div className="text-sm font-medium">Add to your home screen</div>
          <p className="text-xs text-muted-foreground">
            Tap the Share button, then &ldquo;Add to Home Screen&rdquo;. It then opens straight
            into your table.
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
}
