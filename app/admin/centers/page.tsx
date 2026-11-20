import { Suspense } from "react";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyAdmin } from "@/lib/game/player-sign";
import CentersTable, { type CenterClass } from "./centers-table";

// Admin center desk (server component: every query runs server-side).
// Same arena_admin cookie gate as /admin. Lists centers and classes with
// enrollment counts; the status toggle (client island) PATCHes
// /api/admin/centers, which flips status through the set_class_status RPC.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold tracking-widest text-amber-400">Quản trị</p>
      <h1 className="mt-1 text-2xl font-extrabold text-zinc-100">Quầy trung tâm</h1>
      <a href="/admin" className="mt-2 inline-block text-sm text-amber-400 underline hover:text-amber-300">
        Về bảng điều khiển
      </a>
      <div className="mt-6">{children}</div>
    </main>
  );
}

async function loadCenters(): Promise<{
  centers: { id: string; name: string }[];
  classes: CenterClass[];
  missing: boolean;
}> {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return { centers: [], classes: [], missing: true };
  }
  const [centers, classes, enrollments] = await Promise.all([
    supabase.from("centers").select("id, name").order("created_at", { ascending: false }).limit(200),
    supabase
      .from("classes")
      .select("id, center_id, name, teacher_player_id, plan_code, seats, status, join_code, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("enrollments").select("class_id").eq("active", true).limit(20000),
  ]);
  if (centers.error || classes.error || enrollments.error) {
    return { centers: [], classes: [], missing: true };
  }
  const counts = new Map<string, number>();
  for (const row of (enrollments.data as { class_id: string }[] | null) ?? []) {
    counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
  }
  const rows = ((classes.data as Omit<CenterClass, "enrolled">[] | null) ?? []).map((c) => ({
    ...c,
    enrolled: counts.get(c.id) ?? 0,
  }));
  return { centers: (centers.data ?? []) as { id: string; name: string }[], classes: rows, missing: false };
}

async function CentersBody() {
  const store = await cookies();
  if (!verifyAdmin(store.get("arena_admin")?.value)) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
        Đang khóa — <a href="/admin" className="text-amber-400 underline hover:text-amber-300">mở bằng khóa quản trị</a> trước.
      </p>
    );
  }
  const { centers, classes, missing } = await loadCenters();
  if (missing) {
    return (
      <p className="rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
        Chưa có dữ liệu trung tâm — chạy migration supabase/migrations/0018_center.sql trong Supabase
        và đặt SUPABASE_SERVICE_ROLE_KEY trên máy chủ.
      </p>
    );
  }
  const centerName = new Map(centers.map((c) => [c.id, c.name]));
  return (
    <>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold tabular-nums text-zinc-200">Trung tâm ({centers.length})</h2>
        {centers.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Chưa có trung tâm nào.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {centers.map((c) => (
              <li key={c.id} className="flex justify-between gap-3">
                <span>{c.name}</span>
                <span className="font-mono text-xs text-zinc-500">{c.id.slice(0, 8)}…</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold tabular-nums text-zinc-200">Lớp học ({classes.length})</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Giai đoạn thu thủ công: chuyển lớp chưa đóng tiền sang hết hạn (học sinh giữ chỗ nhưng mất
          VIP); chuyển lại sang đang mở khi đã đóng tiền.
        </p>
        <CentersTable classes={classes} centerName={Object.fromEntries(centerName)} />
      </section>
    </>
  );
}

export default function CentersPage() {
  if (!process.env.ADMIN_SECRET) {
    return (
      <Shell>
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
          Chưa cấu hình quản trị — cần đặt ADMIN_SECRET trên máy chủ trước.
        </p>
      </Shell>
    );
  }
  return (
    <Shell>
      <Suspense fallback={<p className="text-sm text-zinc-500">Đang tải trung tâm…</p>}>
        <CentersBody />
      </Suspense>
    </Shell>
  );
}
