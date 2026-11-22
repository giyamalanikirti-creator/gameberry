/** Illustrative inputs from the case model; replace with Ludo STAR analytics. */
export const DAU = 1_500_000;
export const DAU_MAU = 0.25;
/** Active days per monthly player = 30 × DAU/MAU. */
export const BASE_DAYS = 30 * DAU_MAU; // 7.5

export interface DauInputs {
  participation: number; // share of MAU who play a Badla next-day round
  extraDays: number; // net extra active days per participant per month
}

export const SNAPS: Record<'low' | 'base' | 'high', DauInputs> = {
  low: { participation: 0.25, extraDays: 1.53 },
  base: { participation: 0.34, extraDays: 2.26 },
  high: { participation: 0.45, extraDays: 2.82 },
};

/** Lift = participants × extra days / 7.5. */
export function dauLift({ participation, extraDays }: DauInputs): { lift: number; extraDau: number } {
  const lift = (participation * extraDays) / BASE_DAYS;
  return { lift, extraDau: lift * DAU };
}

export function formatLift(lift: number): string {
  return `+${(lift * 100).toFixed(1)}%`;
}

export function formatDauK(extra: number): string {
  return `+${Math.floor(extra / 1000)}K`;
}

/** Base-case funnel, unchanged from the research doc. */
export const FUNNEL: Array<{ id: string; label: string; rate: number; branch?: boolean }> = [
  { id: 'card', label: 'Capture card shown', rate: 0.65 },
  { id: 'invite', label: 'Card becomes an invite', rate: 0.22 },
  { id: 'accepted', label: 'Invite accepted', rate: 0.6 },
  { id: 'partner_invited', label: 'Partner invited (Doubles)', rate: 1, branch: true },
  { id: 'partner_accepted', label: 'Partner accepted (Doubles)', rate: 1, branch: true },
  { id: 'tomorrow', label: 'Set for tomorrow', rate: 0.5 },
  { id: 'turnup', label: 'Both turn up', rate: 0.66 },
  { id: 'inactive_day', label: 'Played on an otherwise inactive day', rate: 0.6 },
];
