import PageHeader from "@/components/ui/PageHeader";
import MasteryClient from "./mastery-client";

// Mastery dashboard (server shell: static-safe, no cookies at the top level —
// all per-visitor state loads client-side inside MasteryClient).
export default function MasteryPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Tiến độ của bạn"
        title={
          <>
            Bảng <span className="arena-title">thành thạo</span>
          </>
        }
        sub="Mọi kỹ năng bạn đã luyện, xếp theo độ thành thạo. Luyện điểm yếu và xem cột điểm tăng lên."
      />
      <MasteryClient />
    </main>
  );
}
