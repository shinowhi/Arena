import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import ArenaBackdrop from "@/components/ArenaBackdrop";
import { SiteHeader, TabBar } from "@/components/SiteNav";
import "katex/dist/katex.min.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "BossLearn — quét bài, diệt boss",
  description: "Trợ thủ học tập gamified: quét bài tập, chẩn đoán kỹ năng yếu, đánh bại boss.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className={`min-h-full flex flex-col ${display.variable}`}>
        <div className="arena-bg" aria-hidden="true" />
        <ArenaBackdrop />
        <div className="arena-glitter pointer-events-none fixed inset-0 -z-1" aria-hidden="true">
          <div className="arena-glitter-inner" aria-hidden="true" />
          <div className="arena-glitter-inner arena-glitter-inner-b" aria-hidden="true" />
        </div>
        <Suspense>
          <SiteHeader />
        </Suspense>
        {children}
        <Suspense>
          <TabBar />
        </Suspense>
      </body>
    </html>
  );
}