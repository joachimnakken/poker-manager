import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

/**
 * Applies the stored theme before first paint, so a color-themed device never
 * flashes the noir palette while React hydrates. Mirrors zustand-persist's
 * storage shape under the "poker-theme" key; the default is color.
 */
const themeInitScript = `try {
  var stored = JSON.parse(localStorage.getItem("poker-theme"));
  if (!stored || stored.state.theme !== "noir") document.documentElement.classList.add("theme-color");
} catch (e) {
  document.documentElement.classList.add("theme-color");
}`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Poker Tournament Manager",
  description: "Manage your home poker tournaments",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
      >
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
