import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

// Exam center: one hub for every exam mode. Server component, no data fetch.
const MODES = [
  { href: "/thpt", title: "THPTQG mock", desc: "50 questions · 90 minutes · numeric answers" },
  { href: "/vact", title: "V-ACT mock", desc: "120 questions · 150 minutes · 4 choices" },
  { href: "/hsa", title: "HSA mock", desc: "150 questions · per-part clocks · P3 choice" },
  { href: "/duel", title: "Exam duel", desc: "Head-to-head section battle · ELO ranked" },
  { href: "/royale", title: "Battle royale", desc: "Up to 8 players · 30s rounds · last scholar wins" },
  { href: "/adaptive", title: "Adaptive drill", desc: "Weakest skill first · level matched to you" },
  { href: "/essay", title: "Essay grading", desc: "Snap free response · rubric + machine audit" },
  { href: "/tutor", title: "AI tutor", desc: "Free study chat · never reveals answers" },
  { href: "/transparency", title: "Transparency", desc: "Live question-bank numbers · how we verify" },
];

export default function ExamHubPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Exam center"
        title={<>Pick your <span className="arena-title">battle</span></>}
        sub="National mocks, ranked duels, adaptive drills, and the tutor — all verified where machines can verify."
      />
      <div className="flex flex-col gap-3">
        {MODES.map((m) => (
          <Link key={m.href} href={m.href} className="arena-card rounded-2xl p-5 transition-opacity hover:opacity-90">
            <p className="font-display text-lg font-extrabold text-zinc-100">{m.title}</p>
            <p className="mt-1 text-sm text-zinc-400">{m.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
