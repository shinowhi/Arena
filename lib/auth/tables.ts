// Canonical per-owner table inventory (sec-phase2a L5). Single source of
// truth: the delete route, the export route, and scripts/test-auth.mjs ALL
// import these arrays — add a player-linked table HERE and in the route(s),
// never in a mirror. DELETE_TABLES is ordered children-before-parents (the
// delete route follows this order); each table appears once even when it is
// deleted via two legs (legs live in the route). Export ≠ delete by design:
// the export keeps financial rows (orders, subscriptions, refunds, xu_ledger,
// vip_claims) plus classes (teachers are expired, not deleted) that deletion
// retains for accounting / continuity — see the route headers.
export const DELETE_TABLES = [
  "tutor_messages",
  "tutor_threads",
  "paper_attempts",
  "drill_sets",
  "scans",
  "attacks",
  "funnel_events",
  "exam_attempts",
  "exam_elo",
  "exam_duels",
  "exam_room_players",
  "exam_rooms",
  "pvp_sides",
  "raid_hits",
  "invite_claims",
  "parent_links",
  "market_claims",
  "market_posts",
  "player_codes",
  "friend_requests",
  "friend_blocks",
  "direct_messages",
  "group_messages",
  "group_members",
  "groups",
  "challenges",
  "gifts",
  "reports",
  "enrollments",
  "family_members",
  "families",
  "consents",
  "auth_links",
  "players",
] as const;
export type DeleteTable = (typeof DELETE_TABLES)[number];

export const EXPORT_TABLES = [
  "players",
  "scans",
  "attacks",
  "drill_sets",
  "paper_attempts",
  "tutor_threads",
  "tutor_messages",
  "orders",
  "subscriptions",
  "refunds",
  "xu_ledger",
  "vip_claims",
  "funnel_events",
  "families",
  "family_members",
  "enrollments",
  "classes",
  "auth_links",
  "consents",
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];
