import { DAY, zonedParts } from '../domain/time';
import { botMove, moveLudo, newLudo, rollLudo } from './ludo';
import {
  counterpart, dayOf, DEBT_AGE, debtGroups, inWindow, isPending, latestCard, ledger, linked, nextSunday,
  pairKey, PEOPLE, samePair, SERIES_AGE, seriesFor, settingsFor, STICKERS, suggestedNow, WINDOW,
  type Card, type Debt, type Event, type Kaat, type Match, type Pair, type Person, type RivalryState, type Series,
} from './model';

export type Action = { actor: Person } & (
  | { type: 'play' | 'finishDemo' }
  | { type: 'roll' | 'move'; matchId: string; rolls: number; token?: number }
  | { type: 'ask'; debtId: string }
  | { type: 'decider'; seriesId: string }
  | { type: 'respond'; id: string; response: 'now' | 'tomorrow' | 'pass' }
  | { type: 'ready' | 'reschedule'; id: string }
  | { type: 'confirm'; id: string; start: number }
  | { type: 'propose'; id: string; start: number }
  | { type: 'clock'; to: number }
  | { type: 'sticker'; matchId: string; sticker: (typeof STICKERS)[number] }
  | { type: 'view'; screen: 'lobby' | 'result' | 'kaat' | 'invite' | 'ledger'; id?: string }
  | { type: 'openPush'; id: string }
  | { type: 'setting'; key: 'guided' | 'autoGunjan' | 'sound'; value: boolean }
  | { type: 'pairSetting'; key: 'muted' | 'blocked' | 'theme' | 'derby'; rival: Person }
);

function log(s: RivalryState, actor: Person, name: string, detail?: Event['detail']) {
  s.events.push({ actor, name, at: s.now, detail });
}

function nextId(s: RivalryState, prefix: string) { return `${prefix}-${++s.seq}`; }

export function activeMatch(s: RivalryState) { return s.matches.find(match => match.id === s.active); }
const isLive = (s: RivalryState) => !!activeMatch(s);
const windowAt = (start: number) => ({ start, end: start + WINDOW });

function pairState(s: RivalryState, a: Person, b: Person) {
  return s.settings[pairKey(a, b)] ??= settingsFor(s, a, b);
}

function markDay(s: RivalryState, person: Person, at: number, incremental: boolean) {
  const date = dayOf(at, person);
  if (s.activities.some(entry => entry.person === person && entry.date === date)) return false;
  s.activities.push({ person, date, incremental });
  return true;
}

function notify(s: RivalryState, card: Card, actor: Person, kind: 'window' | 'ready', at: number, sender?: Person) {
  if (!linked(s, ...card.pair)) return;
  const hour = zonedParts(at, PEOPLE[actor].zone).hour;
  if (hour < 7 || hour >= 23 || s.pushes.filter(push => push.actor === actor && dayOf(push.at, actor) === dayOf(at, actor)).length >= 2) return;
  const id = `${card.id}/${kind}/${actor}`;
  if (!s.pushes.some(push => push.id === id)) s.pushes.push({ id, actor, kind, at, cardId: card.id, sender, read: false });
}

function makeCard(s: RivalryState, series: Series, actor: Person, kind: Card['kind'], debtId?: string) {
  const card: Card = { id: nextId(s, 'invite'), pair: series.pair, seriesId: series.id, from: actor, kind, debtId,
    status: 'asked', askedAt: s.now, confirmed: [], changes: [], ready: [], visit: [] };
  s.cards.push(card);
  return card;
}

function makeSeries(s: RivalryState, pair: Pair, opening?: Match, derby = false) {
  const winner = opening && opening.board.winner ? opening.pair[opening.board.winner === 'red' ? 0 : 1] : undefined;
  const series: Series = { id: nextId(s, 'series'), pair, openingId: opening?.id, opens: s.now, closes: s.now + SERIES_AGE,
    wins: winner ? [winner] : [], derby };
  s.series.push(series);
  return series;
}

export function score(series: Series, person: Person) { return series.wins.filter(winner => winner === person).length; }
export function tied(series: Series) { return !series.derby && series.wins.length === 2 && score(series, series.pair[0]) === 1; }

function todaysMatches(s: RivalryState, pair: Pair, at: number, windowStart?: number) {
  return s.matches.filter(match => {
    if (match.mode !== 'badla' || !samePair(match.pair, ...pair)) return false;
    const start = s.cards.find(c => c.id === match.cardId)?.window?.start ?? match.at;
    return dayOf(start, pair[0]) === dayOf(windowStart ?? at, pair[0]);
  }).length;
}
export function canInvite(s: RivalryState, pair: Pair) {
  return linked(s, ...pair) && settingsFor(s, ...pair).cooldown <= s.now;
}

function canPlay(s: RivalryState, pair: Pair, start?: number) {
  return canInvite(s, pair) && todaysMatches(s, pair, s.now, start) < 3;
}

function startMatch(s: RivalryState, pair: Pair, card?: Card) {
  if (isLive(s)) return false;
  if (card && !canPlay(s, pair, card.window?.start)) return false;
  const id = nextId(s, 'match');
  const match: Match = { id, pair, mode: card ? 'badla' : 'public', cardId: card?.id, at: s.now,
    board: newLudo(s.guided, !card, s.seed + s.seq * 7469), kaats: [] };
  s.matches.push(match);
  s.active = id;
  if (card) { card.matchId = id; card.status = 'playing'; }
  for (const person of pair) {
    markDay(s, person, card?.window?.start ?? s.now, false);
    log(s, person, 'match_start', { matchId: id, mode: match.mode, rival: counterpart(pair, person) });
  }
  return true;
}

function recordCapture(s: RivalryState, match: Match, actor: Person) {
  const move = match.board.lastMove!;
  const capture = move.capture!;
  const victim = counterpart(match.pair, actor);
  const replay = {
    id: `${match.id}-kaat-${match.board.rolls}`, matchId: match.id, kind: 'capture' as const, actor,
    color: move.color, tokenIndex: move.tokenIndex, roll: move.roll,
    before: move.before, after: move.after, path: move.path,
    capture: { ...capture, player: victim, to: -1 as const },
  };
  const kaat: Kaat = { replay, at: s.now, spaces: capture.from, attacker: actor, victim };
  match.kaats.push(kaat);
  log(s, actor, 'capture', { victim, squaresLost: kaat.spaces, matchId: match.id });
  if (match.mode !== 'public' || kaat.spaces < 10 || !linked(s, actor, victim)) return;
  const existing = s.debts.find(debt => debt.from === victim && debt.rival === actor && debt.matchId === match.id);
  if (existing) {
    if (kaat.spaces > existing.kaat.spaces) existing.kaat = kaat;
    return;
  }
  const debt: Debt = { id: nextId(s, 'debt'), from: victim, rival: actor, matchId: match.id, kaat, until: s.now + DEBT_AGE, status: 'open' };
  s.debts.push(debt);
  const older = s.debts.filter(item => item.from === victim && item.status === 'open' && item.until > s.now);
  if (older.length > 5) older[0].status = 'dropped';
}

function settle(s: RivalryState, match: Match, winner: Person) {
  s.active = null;
  match.endedAt = s.now;
  const card = s.cards.find(item => item.id === match.cardId);
  if (!card) return;
  card.status = 'settled';
  const series = seriesFor(s, card);
  series.wins.push(winner);
  const pair = pairState(s, ...card.pair);
  pair.misses = 0;
  pair.cooldown = 0;
  for (const debt of s.debts) {
    if (samePair(card.pair, debt.from, debt.rival) && debt.status === 'open' && debt.until > s.now) debt.status = 'settled';
  }
  log(s, winner, 'badla_played', { winner, matchId: match.id, seriesId: series.id, scheduled: !!card.window });
  if (tied(series)) log(s, winner, 'decider_offered', { seriesId: series.id });
}

function takeTurn(s: RivalryState, boardMatch: Match, actor: Person, token?: number) {
  const color = boardMatch.pair[0] === actor ? 'red' : 'yellow';
  if (!boardMatch.pair.includes(actor)) return false;
  const board = token === undefined ? rollLudo(boardMatch.board, color) : moveLudo(boardMatch.board, color, token);
  if (board === boardMatch.board) return false;
  boardMatch.board = board;
  if (token !== undefined && board.lastMove?.capture) recordCapture(s, boardMatch, actor);
  if (board.winner) settle(s, boardMatch, actor);
  return true;
}

function createDerbies(s: RivalryState) {
  for (const [key, pair] of Object.entries(s.settings)) {
    const people = key.split(':') as Pair;
    if (pair.derby.length !== 2 || !linked(s, ...people)) continue;
    let next = pair.nextDerby ?? nextSunday(s.now, people[0]);
    if (next + WINDOW <= s.now) next = nextSunday(s.now - WINDOW, people[0]);
    pair.nextDerby = next;
    if (s.cards.some(card => card.kind === 'derby' && samePair(card.pair, ...people) && card.window?.start === next)) continue;
    if (s.cards.some(card => samePair(card.pair, ...people) && isPending(card))) continue;
    const series = makeSeries(s, people, undefined, true);
    series.closes = next + WINDOW;
    const card = makeCard(s, series, people[0], 'derby');
    card.window = windowAt(next);
    card.status = 'confirmed';
    card.confirmed = [...people];
  }
}

function reconcile(s: RivalryState) {
  for (const card of s.cards) {
    const series = seriesFor(s, card);
    const { window } = card;
    if (card.status === 'playing') continue;
    if ((card.status === 'confirmed' || card.status === 'open') && window && s.now >= window.end) {
      card.status = 'missed';
      if (card.kind !== 'derby') {
        const pair = pairState(s, ...card.pair);
        pair.misses++;
        if (pair.misses >= 2) pair.cooldown = window.end + 7 * DAY;
      } else card.status = 'closed';
      continue;
    }
    if (s.now >= series.closes && isPending(card)) {
      card.status = 'closed';
      continue;
    }
    if (card.status === 'asked' && card.debtId && !s.debts.some(debt => debt.id === card.debtId && debt.until > s.now)) card.status = 'closed';
    if (card.status === 'proposed' && window && s.now >= window.start) card.status = 'closed';
    if (card.status === 'confirmed' && inWindow(s, card)) {
      card.status = 'open';
      for (const person of card.pair) notify(s, card, person, 'window', window!.start);
    }
  }
}

function showWindow(s: RivalryState, card: Card, person: Person) {
  if (card.status !== 'open' || !inWindow(s, card) || !card.pair.includes(person) || !linked(s, ...card.pair) || card.visit.includes(person)) return false;
  card.visit.push(person);
  const start = card.window!.start;
  const newDay = dayOf(start, person) !== dayOf(card.askedAt, person);
  if (newDay && markDay(s, person, start, true)) log(s, person, 'return_day_active', { id: card.id, day: dayOf(start, person) });
  return true;
}

function confirm(s: RivalryState, card: Card, actor: Person) {
  const window = card.window!;
  if (card.status !== 'proposed' || card.confirmed.includes(actor) || s.now >= window.start) return false;
  card.confirmed.push(actor);
  if (card.confirmed.length === 2) {
    card.status = 'confirmed';
    log(s, actor, 'appointment_confirmed', { id: card.id, start: window.start, tomorrow: dayOf(window.start, actor) !== dayOf(s.now, actor) });
  }
  return true;
}

function configureWindow(card: Card, actor: Person, start: number) {
  card.status = 'proposed';
  card.window = windowAt(start);
  card.proposedBy = actor;
  card.confirmed = [actor];
  card.ready = [];
  card.visit = [];
}

function cardAction(s: RivalryState, card: Card, a: Extract<Action, { id: string }>) {
  const { actor } = a;
  if (!card.pair.includes(actor) || !linked(s, ...card.pair)) return false;
  const series = seriesFor(s, card);
  if (a.type === 'respond' && card.status === 'asked' && actor !== card.from) {
    if (a.response === 'pass') card.status = 'passed';
    else if (a.response === 'now') {
      if (!startMatch(s, card.pair, card)) return false;
    } else {
      const start = suggestedNow(s, series);
      if (start <= s.now || !canPlay(s, card.pair, start)) return false;
      configureWindow(card, actor, start);
    }
    log(s, actor, 'invite_response', { id: card.id, response: a.response });
    return true;
  }
  if (a.type === 'propose' && ['proposed', 'confirmed'].includes(card.status) && !card.changes.includes(actor) &&
      a.start > s.now && a.start + WINDOW <= series.closes) {
    card.changes.push(actor);
    configureWindow(card, actor, a.start);
    return true;
  }
  if (a.type === 'confirm') return card.window?.start === a.start && confirm(s, card, actor);
  if (a.type === 'ready' && card.status === 'open' && inWindow(s, card) && canPlay(s, card.pair, card.window?.start)) {
    showWindow(s, card, actor);
    if (card.ready.includes(actor)) return card.ready.length === 2 && startMatch(s, card.pair, card);
    card.ready.push(actor);
    log(s, actor, 'ready_tapped', { id: card.id });
    if (card.ready.length === 2) startMatch(s, card.pair, card);
    else notify(s, card, counterpart(card.pair, actor), 'ready', s.now, actor);
    return true;
  }
  if (a.type === 'reschedule' && card.status === 'missed' && latestCard(s, ...card.pair)?.id === card.id &&
      settingsFor(s, ...card.pair).misses === 1 && card.kind !== 'derby') {
    const start = suggestedNow(s, series);
    if (start <= s.now) return false;
    card.status = 'closed';
    configureWindow(makeCard(s, series, actor, card.kind, card.debtId), actor, start);
    return true;
  }
  return false;
}

function apply(s: RivalryState, a: Action): boolean {
  const person = a.actor;
  switch (a.type) {
    case 'play': return (person === 'riya' || person === 'gunjan') && startMatch(s, ['riya', 'gunjan']);
    case 'roll':
    case 'move': {
      const match = activeMatch(s);
      if (!match || match.id !== a.matchId || match.board.rolls !== a.rolls || (a.type === 'move' && a.token === undefined)) return false;
      return takeTurn(s, match, person, a.type === 'move' ? a.token : undefined);
    }
    case 'finishDemo': {
      const match = activeMatch(s);
      if (!match || match.board.dice.kind !== 'guided' || !match.kaats.length || !match.pair.includes(person)) return false;
      for (let step = 0; step < 1600 && !match.endedAt; step++) {
        const actor = match.pair[match.board.turn === 'red' ? 0 : 1];
        takeTurn(s, match, actor, botMove(match.board));
      }
      return true;
    }
    case 'ask': {
      const debt = debtGroups(s, person).find(item => item.debt.id === a.debtId)?.debt;
      const opening = s.matches.find(match => match.id === debt?.matchId);
      if (!debt || !opening?.endedAt || !canInvite(s, opening.pair) || s.cards.some(card => samePair(card.pair, ...opening.pair) && isPending(card))) return false;
      const series = makeSeries(s, opening.pair, opening);
      makeCard(s, series, person, 'rematch', debt.id);
      log(s, person, 'badla_asked', { rival: debt.rival, squaresLost: debt.kaat.spaces });
      return true;
    }
    case 'decider': {
      const series = s.series.find(item => item.id === a.seriesId);
      if (!series || !series.pair.includes(person) || !tied(series) || s.now >= series.closes || !canInvite(s, series.pair) ||
        s.cards.some(card => samePair(card.pair, ...series.pair) && isPending(card))) return false;
      makeCard(s, series, person, 'decider');
      log(s, person, 'badla_asked', { rival: counterpart(series.pair, person), decider: true });
      return true;
    }
    case 'respond':
    case 'confirm':
    case 'ready':
    case 'reschedule':
    case 'propose': {
      const card = s.cards.find(item => item.id === a.id);
      return !!card && cardAction(s, card, a);
    }
    case 'clock': {
      if (!Number.isFinite(a.to) || a.to <= s.now) return false;
      s.now = a.to;
      for (const pair of Object.values(s.settings)) if (pair.cooldown > 0 && pair.cooldown <= s.now) {
        pair.cooldown = 0;
        pair.misses = 0;
      }
      reconcile(s);
      createDerbies(s);
      reconcile(s);
      return true;
    }
    case 'sticker': {
      const match = s.matches.find(item => item.id === a.matchId);
      if (!match?.endedAt || match.mode !== 'badla' || match.sticker || !STICKERS.includes(a.sticker) ||
        match.pair[match.board.winner === 'red' ? 0 : 1] !== person) return false;
      match.sticker = a.sticker;
      return true;
    }
    case 'view': {
      if (a.screen === 'lobby') log(s, person, 'lobby_view');
      else if (a.screen === 'ledger' && a.id && a.id in PEOPLE) log(s, person, 'ledger_view', { rival: a.id });
      else if (a.screen === 'invite') {
        const card = s.cards.find(item => item.id === a.id && item.pair.includes(person));
        if (!card || !linked(s, ...card.pair)) return false;
        if (card.status === 'asked' && card.from !== person && !s.events.some(e => e.name === 'invite_received' && e.actor === person && e.detail?.id === card.id))
          log(s, person, 'invite_received', { id: card.id, rival: card.from });
        return showWindow(s, card, person) || card.status === 'asked';
      } else if (a.screen === 'result') {
        const match = s.matches.find(item => item.id === a.id && item.pair.includes(person) && item.endedAt);
        const debt = match && debtGroups(s, person).find(item => item.debt.matchId === match.id)?.debt;
        if (!debt) return false;
        log(s, person, 'badla_card_shown', { rival: debt.rival, squaresLost: debt.kaat.spaces });
      } else if (a.screen === 'kaat') {
        const kaat = s.matches.flatMap(match => match.kaats).find(item => item.replay.id === a.id && [item.victim, item.attacker].includes(person));
        if (!kaat) return false;
        log(s, person, 'kaat_shown', { rival: kaat.attacker === person ? kaat.victim : kaat.attacker, squaresLost: kaat.spaces });
      } else return false;
      return true;
    }
    case 'openPush': {
      const push = s.pushes.find(item => item.id === a.id && item.actor === person);
      if (!push || push.read) return false;
      push.read = true;
      const card = s.cards.find(item => item.id === push.cardId);
      if (card) showWindow(s, card, person);
      return true;
    }
    case 'setting':
      s[a.key] = a.value;
      return true;
    case 'pairSetting': {
      const { rival, key } = a;
      if (rival === person) return false;
      if ((key === 'theme' || key === 'derby') && ledger(s, person, rival).level !== 'Nemesis') return false;
      const pair = pairState(s, person, rival);
      pair[key] = pair[key].includes(person) ? pair[key].filter(id => id !== person) : [...pair[key], person];
      if (key === 'derby' && rival !== 'riya' && rival !== 'gunjan') pair.derby = pair.derby.includes(person) ? [person, rival] : [];
      const disconnected = !linked(s, person, rival);
      if (disconnected || (key === 'derby' && pair.derby.length < 2)) {
        for (const card of s.cards) {
          if (!samePair(card.pair, person, rival) || !isPending(card)) continue;
          if (disconnected) {
            const match = activeMatch(s);
            if (match?.id === card.matchId && match) { match.cancelled = true; s.active = null; }
            card.status = 'closed';
          } else if (card.kind === 'derby' && card.status !== 'playing') card.status = 'closed';
        }
      }
      if (key === 'derby') { createDerbies(s); reconcile(s); }
      return true;
    }
  }
}

export function reduce(s: RivalryState, a: Action): RivalryState {
  const next = structuredClone(s);
  return apply(next, a) ? next : s;
}
