/**
 * Named dice fixtures. Each gives the seeded distances and roll sequence for a
 * singles and a Doubles round. Distances are listed in turn order:
 * singles (Riya, Gunjan); Doubles (Riya, Gunjan, Ananya, Shruti).
 * The engine derives every result from these; nothing here names a winner.
 */
export type FixtureName = 'comeback' | 'decider' | 'sweep-gunjan' | 'sweep-riya' | 'decider-riya';

export interface FixtureScript {
  distances: number[];
  rolls: number[];
}

export interface Fixture {
  name: FixtureName;
  label: string;
  singles: FixtureScript;
  doubles: FixtureScript;
}

export const FIXTURES: Record<FixtureName, Fixture> = {
  comeback: {
    name: 'comeback',
    label: "Guided Doubles comeback (Riya's side)",
    singles: { distances: [2, 3], rolls: [2] },
    doubles: { distances: [2, 3, 2, 3], rolls: [2, 1, 2] },
  },
  decider: {
    name: 'decider',
    label: "Guided decider (Gunjan's side)",
    singles: { distances: [3, 2], rolls: [1, 2] },
    doubles: { distances: [3, 2, 3, 2], rolls: [1, 2, 1, 2] },
  },
  'sweep-gunjan': {
    name: 'sweep-gunjan',
    label: "Gunjan's side wins round 2 (2–0 sweep)",
    singles: { distances: [4, 2], rolls: [1, 2] },
    doubles: { distances: [4, 2, 4, 2], rolls: [1, 2, 1, 2] },
  },
  'sweep-riya': {
    name: 'sweep-riya',
    label: "Riya's side wins in straight rolls",
    singles: { distances: [2, 4], rolls: [2] },
    doubles: { distances: [2, 4, 2, 4], rolls: [2, 1, 2] },
  },
  'decider-riya': {
    name: 'decider-riya',
    label: "Alternate decider (Riya's side)",
    singles: { distances: [3, 4], rolls: [3] },
    doubles: { distances: [3, 3, 2, 4], rolls: [3, 1, 2] },
  },
};

export const FIXTURE_NAMES = Object.keys(FIXTURES) as FixtureName[];

/** The guided story: round 2 is the comeback, round 3 is the decider. */
export function guidedFixtureFor(roundIndex: number): FixtureName {
  return roundIndex >= 3 ? 'decider' : 'comeback';
}
