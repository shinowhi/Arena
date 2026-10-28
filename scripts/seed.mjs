// Seed demo data (labelled as seed). Run from arena/: node scripts/seed.mjs
// Requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^[\x22\x27]|[\x22\x27]$/g, "");
  }
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: player, error: pErr } = await supabase.from("players").insert({ display_name: "seed-demo" }).select("id").single();
if (pErr || !player) { console.error("SEED FAIL player: " + (pErr ? pErr.message : "no data")); process.exit(1); }
const rows = [
  ["chain_rule", "differentiation_rules"],
  ["chain_rule", "differentiation_rules"],
  ["chain_rule", "functions_graphs"],
  ["integration_by_parts", "substitution_rule"],
  ["integration_by_parts", "antiderivatives"],
  ["derivatives_trig", "trig_functions"]
].map(function (pair) { return { player_id: player.id, questions: [{ seed: true }], weak_skill: pair[0], root_cause: pair[1], confidence: 0.75 }; });
const { error } = await supabase.from("scans").insert(rows);
if (error) { console.error("SEED FAIL scans: " + error.message); process.exit(1); }
console.log("SEED OK: 1 player + " + rows.length + " scans (labelled seed-demo)");
