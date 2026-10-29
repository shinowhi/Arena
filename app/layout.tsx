import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: "Arena — find the hole in your math, then slay it",
  description:
    "Scan your math work, let AI trace the mistake to its root cause, then defeat a boss of 5 machine-verified questions.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

