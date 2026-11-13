import { Suspense } from "react";
import Link from "next/link";
import { createAuthClient } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { SUPPORT_CONTACT } from "@/lib/auth/support";
import MeActions from "./me-actions";

// Phase-2a account page (server shell + Suspense like /vip: the status block
// reads cookies, so it streams inside Suspense). Shows the login email, the
// linked player, and the role; the client island owns export/delete/logout.

export const metadata = {
  title: "My account — Arena",
  description: "Your login, linked progress, data export, and account deletion.",
};

type MeStatus = {
  authed: boolean;
  email: string | null;
  playerId: string | null;
  role: string | null;
};

async function loadStatus(): Promise<MeStatus> {
  const out: MeStatus = { authed: false, email: null, playerId: null, role: null };
  try {
    const auth = await createAuthClient();
    const user = await getAuthUser(auth);
    if (!user) return out;
    out.authed = true;
    out.email = user.email;
    const supabase = await createClient();
    const r = await supabase
      .from("auth_links")
      .select("player_id, role")
      .eq("auth_user_id", user.id)
      .limit(1);
    if (r.error || !Array.isArray(r.data) || r.data.length === 0) return out;
    const link = r.data[0] as { player_id: string; role: string };
    out.playerId = link.player_id;
    out.role = link.role;
    return out;
  } catch {
    return out;
  }
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

async function AccountStatus() {
  const s = await loadStatus();
  if (!s.authed) {
    return (
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">You are browsing as a guest</p>
        <p className="mt-1 text-sm text-zinc-400">
          Log in to sync your progress across devices and manage your data.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-full bg-emerald-600 px-6 py-2.5 font-bold text-white"
        >
          Log in
        </Link>
      </section>
    );
  }
  return (
    <>
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-zinc-400">Email</dt>
            <dd className="font-semibold break-all text-zinc-100">{s.email ?? "—"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-zinc-400">Linked player</dt>
            <dd className="font-mono font-semibold text-zinc-100">
              {s.playerId ? shortId(s.playerId) : "not linked yet"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-zinc-400">Role</dt>
            <dd className="font-semibold text-zinc-100 capitalize">{s.role ?? "—"}</dd>
          </div>
        </dl>
        {s.role === "parent" ? (
          <p className="mt-4 text-sm text-zinc-400">
            Manage your kids and parental consents on the{" "}
            <Link href="/family" className="font-semibold text-emerald-300 underline">
              Family page
            </Link>
            .
          </p>
        ) : null}
      </section>
      <MeActions />
    </>
  );
}

export default function MePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Account</p>
      <h1 className="mt-1 text-2xl font-extrabold text-zinc-100">My account</h1>

      <Suspense fallback={<p className="mt-6 text-sm text-zinc-500">Loading your account…</p>}>
        <AccountStatus />
      </Suspense>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Your data, your call</p>
        <p className="mt-1 text-sm text-zinc-400">
          Export downloads everything linked to your login as one JSON file. Delete erases your
          game progress, family links, and login — most of it instantly, and anything needing
          manual cleanup within 72 hours of your request. Questions? Email {SUPPORT_CONTACT}.
        </p>
      </section>
    </main>
  );
}
