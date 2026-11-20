import PageHeader from "@/components/ui/PageHeader";
import CenterClient from "./center-client";

// Center hub (server shell: static-safe, no cookies at the top level — all
// per-visitor roles load client-side inside CenterClient via /api/center/me).
export default function CenterPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Trung tâm học tập"
        title={
          <>
            Lớp học <span className="arena-title">trung tâm</span>
          </>
        }
        sub="Thầy cô mở lớp bằng mã vào lớp và bài tập. Học sinh trong lớp đang mở được full VIP."
      />
      <CenterClient />
    </main>
  );
}
