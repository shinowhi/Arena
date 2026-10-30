export const DAMAGE_PER_HIT = 20;
export const PRIVATE_BOSS_HP = 100;

export function bossTtlSeconds(): number {
  return Number(process.env.BOSS_TTL_SECONDS ?? 14400);
}

export function rushBossHp(): number {
  return Number(process.env.RUSH_BOSS_HP ?? 2000);
}

export function worldBossHp(): number {
  return Number(process.env.WORLD_BOSS_HP ?? 1000);
}
