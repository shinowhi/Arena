import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import ArenaBackdrop from "@/components/ArenaBackdrop";
import "katex/dist/katex.min.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Arena — scan your work, slay the boss",
  description: "Gamified math gap finder: scan homework, diagnose weak skills, defeat boss questions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`min-h-full flex flex-col ${display.variable}`}>
        <div className="arena-bg" aria-hidden="true" />
        <ArenaBackdrop />
        <div className="arena-glitter pointer-events-none fixed inset-0 -z-1" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}