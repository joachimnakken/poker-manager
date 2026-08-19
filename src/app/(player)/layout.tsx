import { InstallGate } from "@/components/install-gate";

/**
 * Everything a player sees. On a phone none of it is reachable until the app is on the
 * home screen; the host's pages are outside this group and keep working in a browser.
 */
export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return <InstallGate>{children}</InstallGate>;
}
