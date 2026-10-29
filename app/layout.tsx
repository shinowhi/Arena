import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: "Arena (working title) — scan your work, slay the boss",
  description: "Gamified math gap finder: scan homework, diagnose weak skills, defeat boss questions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <div className="arena-bg" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}