// Server-only social helpers (Supabase access + authz checks).
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RATE_LIMIT_COUNT, RATE_LIMIT_WINDOW_MS } from "./rules";

export function needSocialMigration() {
  return NextResponse.json(
    { error: "Social needs a database update (migration 0006).", needsMigration: true },
    { status: 503 },
  );
}

interface FriendRow {
  from_id: string;
  to_id: string;
  status: string;
}

async function acceptedRows(
  db: SupabaseClient,
  a: string,
  b: string,
): Promise<FriendRow[]> {
  const { data, error } = await db
    .from("friend_requests")
    .select("from_id, to_id, status")
    .eq("status", "ACCEPTED")
    .or(`and(from_id.eq.${a},to_id.eq.${b}),and(from_id.eq.${b},to_id.eq.${a})`);
  if (error) throw error;
  return (data ?? []) as FriendRow[];
}

export async function areFriends(db: SupabaseClient, a: string, b: string): Promise<boolean> {
  return (await acceptedRows(db, a, b)).length > 0;
}

export async function isBlockedEither(db: SupabaseClient, a: string, b: string): Promise<boolean> {
  const { data, error } = await db
    .from("friend_blocks")
    .select("blocker_id")
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

// All accepted friend ids of `me` (bounded; capped at 200).
export async function friendIds(db: SupabaseClient, me: string): Promise<string[]> {
  const { data, error } = await db
    .from("friend_requests")
    .select("from_id, to_id")
    .eq("status", "ACCEPTED")
    .or(`from_id.eq.${me},to_id.eq.${me}`)
    .limit(200);
  if (error) throw error;
  const out = new Set<string>();
  for (const r of (data ?? []) as { from_id: string; to_id: string }[]) {
    out.add(r.from_id === me ? r.to_id : r.from_id);
  }
  return [...out];
}

// True when `me` sent RATE_LIMIT_COUNT+ rows to `table` in the last window.
export async function isRateLimited(
  db: SupabaseClient,
  table: "direct_messages" | "group_messages",
  me: string,
): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("from_id", me)
    .gte("created_at", since);
  if (error) throw error;
  return (count ?? 0) >= RATE_LIMIT_COUNT;
}

export async function isGroupMember(
  db: SupabaseClient,
  groupId: string,
  me: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("player_id", me)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
