/**
 * The whole demo as one fixed list. Each step says whose phone is shown, how far
 * into the scripted story the game engine has run (`n` = guided steps applied),
 * which screen to draw, the one button on that screen, and two lines of story.
 */
import type { PlayerId } from '../domain/types';

export type ScreenKind =
  | 'splash' | 'home' | 'match' | 'result' | 'pickTime' | 'lock' | 'invite' | 'booked' | 'checkin'
  | 'rematch' | 'oneEach' | 'backup' | 'partnerInvite' | 'club' | 'grudge' | 'seriesEnd' | 'clubResult';

export interface Step {
  who: PlayerId;
  n: number;
  screen: ScreenKind;
  cta: string;
  chapter: string;
  what: string;
  why: string;
  /** Show the story clock at the start of this round's window. */
  atWindow?: boolean;
}

export const STEPS: Step[] = [
  { who: 'riya', n: 0, screen: 'splash', cta: 'Tap to play', chapter: 'Start',
    what: 'Riya opens the Ludo app, as she does most evenings.',
    why: 'Badla lives inside the normal game. There is no new app and no new habit to learn.' },
  { who: 'riya', n: 0, screen: 'home', cta: 'Play Quick', chapter: 'The capture',
    what: "You are Riya, with 1,000 gold. You start a normal public Quick match.",
    why: 'Badla starts from an ordinary public match, so it needs no new habit to begin.' },
  { who: 'riya', n: 1, screen: 'match', cta: 'Roll the dice', chapter: 'The capture',
    what: 'Matched with Gunjan. Your last token is close to home.',
    why: 'The board and dice are scripted so the demo plays the same way every time.' },
  { who: 'riya', n: 4, screen: 'match', cta: "Gunjan's turn", chapter: 'The capture',
    what: 'You rolled 3. Your token is one square from your safe home lane.',
    why: 'One square from safety is the most painful place to be caught.' },
  { who: 'riya', n: 5, screen: 'match', cta: 'Finish the match', chapter: 'The capture',
    what: 'Gunjan rolled 3 and sent you home. "😂 so close."',
    why: 'This capture is the trigger. Players remember it, and it gives them a reason to come back.' },
  { who: 'riya', n: 6, screen: 'result', cta: 'Take Badla', chapter: 'Take Badla',
    what: 'Gunjan wins, and you lose 100 gold. The Badla card offers revenge: first to two wins.',
    why: 'The card shows on about 65% of close losses, and about 22% of those become an invite.' },
  { who: 'riya', n: 6, screen: 'pickTime', cta: 'Send challenge', chapter: 'Book tomorrow',
    what: 'Smart Fixture suggests tomorrow 20:15, when you both usually play.',
    why: 'Booking a later time creates a reason to open the app tomorrow: about 1.22 extra active days per player per month.' },
  { who: 'gunjan', n: 7, screen: 'lock', cta: 'Open the notification', chapter: 'The invite',
    what: "Gunjan isn't in the app. Her phone gets one notification.",
    why: 'Reaching players who are offline is worth about 0.50 extra active days. The cap is two Badla alerts a day.' },
  { who: 'gunjan', n: 7, screen: 'invite', cta: 'Accept · 200 gold', chapter: 'The invite',
    what: 'Gunjan sees the challenge, the price and the time, and accepts.',
    why: 'Gold moves only when both players show up and tap Ready.' },
  { who: 'gunjan', n: 8, screen: 'booked', cta: 'Skip to tomorrow 20:15', chapter: 'Book tomorrow',
    what: 'Booked: a fixture ticket for tomorrow evening.',
    why: 'Tomorrow is a day Riya usually skips, so this match is a likely extra active day.' },
  { who: 'riya', n: 8, screen: 'checkin', cta: 'Ready · 200 gold', chapter: 'Fixture day', atWindow: true,
    what: 'Next day, 20:15. Both phones get "Your table is ready". Riya taps Ready; Gunjan does the same on hers.',
    why: 'This counts only if Riya would have skipped today (about 60% of cases).' },
  { who: 'riya', n: 10, screen: 'rematch', cta: 'Roll the dice', chapter: 'Fixture day',
    what: 'The Badla match. You need exactly 2 to finish.',
    why: 'It is the same Ludo endgame, short and decisive.' },
  { who: 'riya', n: 12, screen: 'oneEach', cta: 'Make it a Grudge Night', chapter: 'Fixture day',
    what: 'You rolled 2 and won. One each: the series is 1-1.',
    why: 'At 1-1 there are three options: play the decider now, book it, or make it a club event.' },
  { who: 'riya', n: 14, screen: 'backup', cta: 'Invite Ananya', chapter: 'Bring backup',
    what: 'Grudge Night is a 2v2 decider. Each captain brings a friend. Gunjan brings Shruti.',
    why: 'Partners are extra players who come back for someone else’s rivalry (about 0.30 extra days each).' },
  { who: 'ananya', n: 15, screen: 'partnerInvite', cta: "Join Riya's side · 100 gold", chapter: 'Bring backup',
    what: 'Ananya gets her own invitation, with her own entry and possible win.',
    why: 'Each partner agrees for themselves. Nobody is signed up by someone else.' },
  { who: 'dev', n: 18, screen: 'club', cta: 'Pick Riya & Ananya', chapter: 'Grudge Night',
    what: 'All four confirmed, so the match appears in the club. Dev is not playing, but he can pick a side for free.',
    why: 'Clubmates who come back to see the result add about 0.23 extra active days.' },
  { who: 'riya', n: 23, screen: 'grudge', cta: 'Play the decider', chapter: 'Grudge Night', atWindow: true,
    what: 'Grudge Night, 21:00. All four are ready. Riya and Ananya need exactly 3 and 2.',
    why: 'Four players and a club audience come back on the same evening.' },
  { who: 'riya', n: 29, screen: 'seriesEnd', cta: "See Dev's result", chapter: 'Series end',
    what: 'Riya and Ananya win the decider. Riya wins the series 2-1.',
    why: 'Lift = participants × extra days ÷ 7.5. In the base case that is about +10% DAU, a target to test.' },
  { who: 'dev', n: 29, screen: 'clubResult', cta: 'Start again', chapter: 'Series end',
    what: 'Dev bet right on Riya and Ananya, and they won, so he gets 100 gold coins.',
    why: 'One capture brought five players back on a second day.' },
];
