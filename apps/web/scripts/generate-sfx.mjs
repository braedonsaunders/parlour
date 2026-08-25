import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API_URL = 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128';
const AUDIO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');
const STYLE =
  'Close-mic studio sound design for a premium cozy tabletop card game. Warm, tactile, polished, natural paperboard, felt, and wood. Start immediately. No speech, no crowd, no ambience, no long reverb tail.';

const sounds = [
  {
    name: 'card-draw-stock',
    duration: 0.7,
    prompt:
      'One standard playing card pulled briskly from the top of a paper card deck: fingertip contact, crisp paperboard scrape, then a light lift. Exactly one action.',
  },
  {
    name: 'card-draw-discard',
    duration: 0.65,
    prompt:
      'One face-up playing card lifted from a discard pile on green felt: a distinct papery peel, tiny edge flick, and clean pickup. Exactly one action.',
  },
  {
    name: 'card-discard-flight',
    duration: 0.65,
    prompt:
      'One playing card whipped a short distance horizontally through the air, a fast compact paperboard swish. No landing impact; only the flight.',
  },
  {
    name: 'card-land-table',
    duration: 0.55,
    prompt:
      'One playing card lands face-up on a felt-covered wooden card table: crisp paperboard slap, tiny edge bounce, immediate settle. No throw or whoosh.',
  },
  {
    name: 'card-flip',
    duration: 0.6,
    prompt:
      'One playing card flips over quickly on a felt card table: tight double paper flutter followed by a soft face-up contact. Exactly one card.',
  },
  {
    name: 'deal-card',
    duration: 0.55,
    prompt:
      'One standard playing card dealt briskly across green felt: short papery zip followed by a soft precise slap. A single dealer action, not a whole deck.',
  },
  {
    name: 'stock-shuffle',
    duration: 1.35,
    prompt:
      'Two hands perform one tight overhand shuffle of a standard paper playing-card deck, controlled card flutter, ending with one tidy square-up tap on felt.',
  },
  {
    name: 'turn-ready',
    duration: 0.5,
    prompt:
      'A single subtle turn-ready notification: a soft felted wooden tick layered with a tiny warm ceramic ping. Tactile, calm, not electronic, no melody.',
  },
  {
    name: 'ui-press',
    duration: 0.5,
    prompt:
      'One small premium game-menu button press: soft wooden mechanism, muted felt click, minuscule friendly pop. Tactile and understated, no digital beep.',
  },
  {
    name: 'knock-thud',
    duration: 0.8,
    outputDuration: 0.5,
    sourceHitDuration: 0.16,
    repeatAtMs: 190,
    prompt:
      'Exactly two distinct human knuckle knocks on a solid wooden card table in a natural knock-knock rhythm: dry close-mic wood impacts with a clear short gap, tiny tabletop resonance, then silence. Firm and unmistakable, not violent.',
  },
  {
    name: 'life-chip-loss',
    duration: 0.85,
    prompt:
      'One clay casino chip skids briefly across felt, tips over, and clinks against one other chip. Clear tactile loss token sound, compact and bittersweet.',
  },
  {
    name: 'blitz-burst',
    duration: 2.1,
    prompt:
      'A compact spectacular casual-game victory burst for scoring exactly 31: heavy opening impact, rapid fan of playing cards, warm brass rise, bright coin sparkles, decisive final hit. Energetic and charming.',
  },
  {
    name: 'win-celebration',
    duration: 2.8,
    prompt:
      'Short premium casual-game match victory jingle: warm upright piano and muted brass ascending flourish, clay chips and card-fan accents, joyful final major chord. Cozy pub character, memorable but not childish.',
  },
  {
    name: 'lose-sting',
    duration: 1.8,
    prompt:
      'Short gentle card-game defeat sting: three descending warm muted piano and marimba notes, soft paper card settle at the end. Wry and good-natured, not tragic.',
  },
  {
    name: 'wild-surge',
    duration: 1.2,
    prompt:
      'A vivid multicolor Wild card activation: crisp card slap blooms into a fast prismatic magical ribbon, bright glass sparkles, compact bass finish. Playful premium game effect.',
  },
  {
    name: 'reverse-whoosh',
    duration: 0.85,
    prompt:
      'Two fast circular paperboard whooshes reverse direction around the listener, ending in a neat wooden tick. Clear reversal gesture, playful, compact, no voice.',
  },
  {
    name: 'skip-swipe',
    duration: 0.7,
    prompt:
      'A playing card makes one abrupt sideways swipe across felt, followed by a small hollow wooden pop that signals a skipped turn. Snappy and playful.',
  },
  {
    name: 'draw-stack',
    duration: 1,
    prompt:
      'Four playing cards rapidly slap onto a growing pile in an accelerating rhythm, each contact slightly heavier, ending with a short tense low impact. Clear card punishment stack.',
  },
  {
    name: 'color-select',
    duration: 0.65,
    prompt:
      'One color selection accent: tiny paper card flick followed by a single clean prismatic glass ping and a very short warm shimmer. Precise, bright, no melody.',
  },
  {
    name: 'wild-caught',
    duration: 0.7,
    outputDuration: 0.5,
    prompt:
      'Half-second playful caught-you penalty sting: sharp card-edge snap first, two descending muted brass and wood notes spaced across the middle, then one tiny prismatic pop near the end. Fill the duration, cheeky, clear, never harsh.',
  },
  {
    name: 'hearts-pass-commit',
    duration: 0.5,
    outputDuration: 0.38,
    prompt:
      'Exactly three playing cards slide briskly together across a wooden card table in one compact motion: warm paperboard whoosh with a crisp three-card edge flick at the end. Immediate and decisive.',
  },
  {
    name: 'hearts-trick-sweep',
    duration: 0.55,
    outputDuration: 0.44,
    prompt:
      'Exactly four playing cards are gathered quickly off felt toward one player in a single sweep: tight paperboard scrape and slide, ending with one very soft satisfying glass chime. Compact and warm.',
  },
  {
    name: 'hearts-point-heart',
    duration: 0.5,
    outputDuration: 0.3,
    prompt:
      'One low muted heartbeat-like pulse for receiving a penalty point in a cozy card game: ominous but soft, felt-damped and warm, with no harsh click and no ambience.',
  },
  {
    name: 'hearts-queen-drop',
    duration: 0.65,
    outputDuration: 0.5,
    prompt:
      'A dark heavy playing-card thud on a wooden table followed immediately by a tiny minor-key two-note sting: a compact good-natured oh-no moment, weighty but not frightening.',
  },
  {
    name: 'hearts-hearts-broken',
    duration: 0.5,
    outputDuration: 0.36,
    prompt:
      'One crisp dry snap like a paper seal breaking, transitioning instantly into a short airy card whoosh. Clear rule-unlocked signal, compact and polished, no glass breaking.',
  },
  {
    name: 'hearts-moon-shoot',
    duration: 1.2,
    outputDuration: 0.95,
    tempo: 0.5,
    prompt:
      'A one-second shoot-the-moon celebration: silver shimmer rises continuously for two-thirds, then one bright triumphant brass-and-card-fan hit lands near the end with a clean tail. Spectacular, no early finish.',
  },
  {
    name: 'gin-knock-rap',
    duration: 0.5,
    outputDuration: 0.4,
    prompt:
      'Exactly two quick dry human knuckle raps on a solid wooden card table, close together, tight decay. Lighter than a fist knock, confident and unmistakable, with no reverb.',
  },
  {
    name: 'gin-burst',
    duration: 0.85,
    outputDuration: 0.75,
    tempo: 0.4,
    prompt:
      'A compact Gin Rummy celebration: a fast rising warm shimmer into one bright brass-and-playing-card fanfare hit, lighter and shorter than a full match victory, with a clean finish.',
  },
  {
    name: 'gin-big-gin',
    duration: 1.05,
    outputDuration: 0.95,
    prompt:
      'A premium rare Big Gin celebration under one second: one bright fanfare hit, a brief dramatic beat, then a higher grander second hit with a short silver sparkle tail. Warm pub-game character.',
  },
  {
    name: 'gin-undercut-sting',
    duration: 0.6,
    outputDuration: 0.5,
    tempo: 0.6,
    prompt:
      'A compact playful gotcha sting for an undercut in Gin Rummy: two warm plucked notes descend with a tiny cheeky wooden pop at the end. Wry, friendly, never harsh.',
  },
  {
    name: 'cribbage-peg-move',
    outputPath: 'cribbage/peg-move.mp3',
    duration: 0.5,
    outputDuration: 0.12,
    prompt:
      'Two extremely quick dry wooden cribbage peg taps: lift click then set-down clack, with minuscule hardwood resonance. Tight, tactile, close-mic, and complete within one tenth of a second.',
  },
  {
    name: 'cribbage-score-run',
    outputPath: 'cribbage/score-run.mp3',
    duration: 0.5,
    outputDuration: 0.26,
    prompt:
      'A bright ascending three-note plucked arpeggio for scoring a run in cribbage, warm cozy pub timbre, fast and compact with no lingering reverb.',
  },
  {
    name: 'cribbage-score-pair',
    outputPath: 'cribbage/score-pair.mp3',
    duration: 0.5,
    outputDuration: 0.18,
    prompt:
      'One compact two-part score accent: a warm low wooden thunk immediately followed by a friendly higher pop. Tactile and pitchable for pair, trip, or quad scoring.',
  },
  {
    name: 'cribbage-score-fifteen',
    outputPath: 'cribbage/score-fifteen.mp3',
    duration: 0.5,
    outputDuration: 0.22,
    prompt:
      'A soft warm two-note chime for scoring exactly fifteen in cribbage, mid-register, rounded attack, cozy pub character, concise and non-digital.',
  },
  {
    name: 'cribbage-count-thirtyone',
    outputPath: 'cribbage/count-thirtyone.mp3',
    duration: 0.55,
    outputDuration: 0.35,
    prompt:
      'A very short rising paper-and-wood zip that resolves into one satisfying warm brass ding for reaching exactly thirty-one in cribbage. Immediate, clear, compact.',
  },
  {
    name: 'cribbage-go-knock',
    outputPath: 'cribbage/go-knock.mp3',
    duration: 0.5,
    outputDuration: 0.18,
    prompt:
      'Exactly one light friendly knuckle knock on a small wooden card table, dry and close, with a tiny natural resonance. Not a heavy fist thud.',
  },
  {
    name: 'cribbage-heels-flourish',
    outputPath: 'cribbage/heels-flourish.mp3',
    duration: 0.55,
    outputDuration: 0.4,
    prompt:
      'A jaunty two-note muted-brass and plucked-string flourish for his heels in cribbage, upbeat and cheeky, warm pub character, with a crisp compact ending.',
  },
  {
    name: 'cribbage-crib-slide',
    outputPath: 'cribbage/crib-slide.mp3',
    duration: 0.5,
    outputDuration: 0.2,
    prompt:
      'Exactly two face-down playing cards slide together a short distance onto felt, one soft compact paperboard friction swish ending in a muted settle. No voice or impact.',
  },
  {
    name: 'cribbage-show-reveal',
    outputPath: 'cribbage/show-reveal.mp3',
    duration: 0.5,
    outputDuration: 0.26,
    prompt:
      'One playing card flips face-up with a crisp paperboard snap, followed instantly by a tiny subtle warm sparkle tail. Clear hand-reveal accent, premium and compact.',
  },
  {
    name: 'cribbage-skunk-sting',
    outputPath: 'cribbage/skunk-sting.mp3',
    duration: 0.65,
    outputDuration: 0.55,
    tempo: 0.6,
    prompt:
      'A short low comic bassoon-like wah-wah sting for being skunked in cribbage, two gently descending notes, cozy and good-natured, never harsh or humiliating.',
  },
  {
    name: 'euchre-order-up',
    duration: 0.5,
    outputDuration: 0.32,
    prompt:
      'A confident compact euchre call: exactly two quick wooden table knocks followed immediately by a short ascending major-third pluck. Warm pub character, meaning pick it up.',
  },
  {
    name: 'euchre-trump-called',
    duration: 0.5,
    outputDuration: 0.32,
    prompt:
      'A confident compact second-round euchre trump call: two close wooden ticks followed by a descending major-third pluck with a tiny bright tail. Same warm pub family as a bid.',
  },
  {
    name: 'euchre-pass',
    duration: 0.5,
    outputDuration: 0.18,
    prompt:
      'One muted low brush tick for passing during a euchre bid, non-committal and understated, felt-damped, warm, and complete almost instantly.',
  },
  {
    name: 'euchre-alone',
    duration: 0.6,
    outputDuration: 0.5,
    prompt:
      'A compact dramatic going-alone accent in euchre: low warm string swell blooms into a clear glassy shimmer, bold and confident, no voice and no long reverb.',
  },
  {
    name: 'euchre-dealer-pickup',
    duration: 0.5,
    outputDuration: 0.34,
    prompt:
      'One playing card slides into a dealer hand with a neat paperboard scoop, followed by a very quick two-card riffle tail. Tactile, close, and concise.',
  },
  {
    name: 'euchre-trick-collect',
    duration: 0.55,
    outputDuration: 0.4,
    prompt:
      'Four playing cards sweep together across felt toward a trick winner in one soft whoosh, resolving with one warm marimba-like wooden pluck. Compact and satisfying.',
  },
  {
    name: 'euchre-euchre-sting',
    duration: 0.75,
    outputDuration: 0.7,
    prompt:
      'A short comic-tragic sting for getting euchred: two warm muted pub-instrument notes fall in a minor interval, followed by a tiny wooden punctuation. Wry, friendly, not harsh.',
  },
  {
    name: 'euchre-march-fanfare',
    duration: 0.7,
    outputDuration: 0.65,
    tempo: 0.7,
    prompt:
      'A triumphant compact euchre march fanfare: bright three-note ascending brass-and-plucked-string arpeggio into one confident hit, warm pub-game character and clean ending.',
  },
  {
    name: 'euchre-score-chime',
    duration: 0.5,
    outputDuration: 0.22,
    prompt:
      'One warm concise scoring accent combining a small wooden peg click with a rounded single pluck. Designed to stack cleanly at short intervals, with no lingering tail.',
  },
  {
    name: 'ratscrew-slap-win',
    outputPath: 'sfx/ratscrew/slap-win.mp3',
    duration: 0.5,
    outputDuration: 0.22,
    mono: true,
    prompt:
      'One big satisfying open-palm slap on a solid wooden card table: punchy close-mic thwack transient with a short warm tabletop body. Signature game hit, strong but not painful.',
  },
  {
    name: 'ratscrew-mislap',
    outputPath: 'sfx/ratscrew/mislap.mp3',
    duration: 0.5,
    outputDuration: 0.3,
    mono: true,
    prompt:
      'One dull false palm slap on a wooden card table followed by a tiny low comic buzz tail. Disappointed and playful, felt-damped, compact, and never harsh.',
  },
  {
    name: 'ratscrew-window-open',
    outputPath: 'sfx/ratscrew/window-open.mp3',
    duration: 0.5,
    outputDuration: 0.16,
    mono: true,
    prompt:
      'An extremely quick alerting rise made from a tiny paper-card whoosh into one crisp wooden tick. It draws attention to a slap window without sounding electronic or alarming.',
  },
  {
    name: 'ratscrew-challenge',
    outputPath: 'sfx/ratscrew/challenge.mp3',
    duration: 0.5,
    outputDuration: 0.24,
    mono: true,
    prompt:
      'A compact tense two-note sting for a face-card challenge, moving from one low warm pluck to one higher tight pluck. Suspenseful, clear, and free of any long tail.',
  },
  {
    name: 'ratscrew-scoop',
    outputPath: 'sfx/ratscrew/scoop.mp3',
    duration: 0.5,
    outputDuration: 0.34,
    mono: true,
    prompt:
      'A hand swiftly gathers a large loose pile of playing cards across felt: one broad paperboard swipe followed by a short dense card-edge riffle under the palm.',
  },
  {
    name: 'ratscrew-burn',
    outputPath: 'sfx/ratscrew/burn.mp3',
    duration: 0.5,
    outputDuration: 0.2,
    mono: true,
    prompt:
      'One penalty playing card slides a short distance beneath a pile on felt and ends with a soft muted paperboard thock. Quick, tactile, and slightly sheepish.',
  },
  {
    name: 'ratscrew-comeback',
    outputPath: 'sfx/ratscrew/comeback.mp3',
    duration: 0.5,
    outputDuration: 0.24,
    mono: true,
    prompt:
      'A tiny bright rising two-note chime blip for rejoining a frantic card game, warm and celebratory but deliberately small, with an immediate clean finish.',
  },
  {
    name: 'president-set-slam',
    duration: 0.5,
    outputDuration: 0.25,
    prompt:
      'A small set of playing cards lands together hard on a felt-covered wooden table: one punchy layered paperboard slap with a bright edge snap tail. Bigger than a single-card landing.',
  },
  {
    name: 'president-pass',
    duration: 0.5,
    outputDuration: 0.18,
    prompt:
      'A soft muted two-part pass accent: tiny low felt kick followed by a restrained wooden tap, casual nope energy, unobtrusive and designed for frequent play.',
  },
  {
    name: 'president-pile-clear',
    duration: 0.5,
    outputDuration: 0.38,
    prompt:
      'A loose pile of playing cards sweeps quickly away across felt in one rising paperboard whoosh, ending with a neat soft gather. Clear pile-reset gesture, concise and satisfying.',
  },
  {
    name: 'president-crown',
    duration: 0.8,
    outputDuration: 0.75,
    tempo: 0.55,
    prompt:
      'A short triumphant coronation accent for becoming President: bright bell opens into one warm brass fanfare hit with a tiny sparkle finish. Celebratory but smaller than match victory.',
  },
  {
    name: 'president-scum',
    duration: 0.75,
    outputDuration: 0.7,
    tempo: 0.55,
    prompt:
      'A compact comedic descending wah-wah sting for receiving the lowest card-table role, using warm muted pub instruments. Good-natured, wry, and never harsh.',
  },
  {
    name: 'president-role-chime',
    duration: 0.5,
    outputDuration: 0.35,
    prompt:
      'A neutral warm two-note role-announcement chime, balanced and friendly, made from rounded wood and soft brass tones with a short clean tail.',
  },
  {
    name: 'president-exchange-swish',
    duration: 0.5,
    outputDuration: 0.3,
    prompt:
      'One or two playing cards are pushed firmly across a felt table between players: compact paper-textured slide swish with a soft decisive settle, no voice or flourish.',
  },
  {
    name: 'poker-chips-soft',
    duration: 0.5,
    outputDuration: 0.16,
    mono: true,
    prompt:
      'Exactly three or four clay poker chips are set down gently together on close-mic felt in one motion: one soft muted ceramic cluster with no ring, bounce, music, or table-room sound. Subtle enough for constant calls and blinds.',
  },
  {
    name: 'poker-chips-hard',
    duration: 0.5,
    outputDuration: 0.28,
    mono: true,
    prompt:
      'A substantial stack of clay poker chips is pushed firmly across close-mic felt and released: short dense chip clatter, soft felt slide, authoritative settle. Clearly heavier than a gentle three-chip call, but the same muted clay objects.',
  },
  {
    name: 'poker-fold',
    duration: 0.5,
    outputDuration: 0.22,
    mono: true,
    prompt:
      'Exactly two playing cards are flicked face-down together and skid a few inches away across close-mic poker felt: quick dry paperboard snap and dismissive short slide, then silence.',
  },
  {
    name: 'poker-check',
    duration: 0.5,
    outputDuration: 0.145,
    sourceHitDuration: 0.055,
    repeatAtMs: 68,
    postGainDb: -6,
    mono: true,
    prompt:
      'Exactly one light human knuckle tap on a felt-covered wooden poker table: close-mic, soft, dry, compact, with almost no resonance. A quiet checking gesture, not a forceful Gin Rummy knock.',
  },
  {
    name: 'poker-board',
    duration: 0.5,
    outputDuration: 0.2,
    mono: true,
    prompt:
      'Exactly one playing card turns face-up and is laid onto close-mic poker felt: a quick clean paperboard flip snap and soft flat contact, no flourish or long tail. Designed to repeat cleanly three times in rapid succession.',
  },
  {
    name: 'poker-pot',
    duration: 0.55,
    outputDuration: 0.46,
    mono: true,
    prompt:
      'A large mixed pot of clay poker chips is swept in one motion from the middle of a close-mic felt table toward one seat: broad felt slide, dense muted chip movement, then a satisfying compact settle.',
  },
  {
    name: 'poker-award',
    duration: 0.75,
    outputDuration: 0.65,
    mono: true,
    prompt:
      'A won pot of clay poker chips arrives and settles warmly in front of a player on close-mic felt: smooth chip slide into a generous rounded clatter, then a clean satisfying finish. No fanfare or melody.',
  },
  {
    name: 'poker-bust',
    duration: 0.85,
    outputDuration: 0.75,
    postGainDb: 8,
    mono: true,
    prompt:
      'A friendly final poker elimination sting: one last clay chip tips over on felt, followed by two warm muted notes descending like a gentle sigh. Conclusive and good-natured, not tragic, flashy, or casino-like.',
  },
  {
    name: 'poker-blinds-up',
    duration: 0.75,
    outputDuration: 0.65,
    postGainDb: 4,
    mono: true,
    prompt:
      'One restrained dealer time signal for poker blinds increasing: a low warm clockwork tick blooms into a single rounded brass table bell chime with a short clean decay. Calm authority, no melody or alarm.',
  },
  {
    name: 'freecell-park',
    duration: 0.5,
    outputDuration: 0.28,
    mono: true,
    prompt:
      'One playing card slots neatly into a small wooden FreeCell parking space: short paperboard slide, tiny hollow wood tick, immediate settle. Precise and tactile, no melody.',
  },
  {
    name: 'freecell-home',
    duration: 0.5,
    outputDuration: 0.32,
    mono: true,
    prompt:
      'One playing card lands home on a FreeCell foundation pile: crisp paperboard slap into a warm rounded wood-and-glass pluck. Satisfying, compact, designed to stack cleanly.',
  },
  {
    name: 'spider-suit-clear',
    duration: 0.85,
    outputDuration: 0.7,
    tempo: 0.55,
    prompt:
      'A completed same-suit King-to-Ace run lifts off a Spider tableau: rising paperboard zipper of thirteen cards, then one bright warm pluck and a short sparkle tail. Celebratory but smaller than match victory.',
  },
  {
    name: 'spider-row-deal',
    duration: 0.7,
    outputDuration: 0.5,
    prompt:
      'Ten playing cards deal in one quick left-to-right row across felt: a compact paperboard zip-zip-zip ending in a soft collective slap. One dealer action, not a shuffle.',
  },
  {
    name: 'pyramid-pair',
    duration: 0.55,
    outputDuration: 0.36,
    mono: true,
    prompt:
      'Two free playing cards snap together and vanish from a pyramid: two quick paperboard ticks that fuse into one warm wooden pop. Clear pair-removed gesture, compact and friendly.',
  },
  {
    name: 'pyramid-king',
    duration: 0.5,
    outputDuration: 0.3,
    mono: true,
    prompt:
      'One King lifts off a solitaire pyramid alone: a slightly heavier paperboard peel and a single low warm pluck. Distinct from a two-card pair, decisive and short.',
  },
  {
    name: 'pyramid-hole-out',
    duration: 0.65,
    outputDuration: 0.5,
    prompt:
      'A leftover-score settle for Pyramid solitaire: remaining cards hush onto felt, then one gentle rounded chime. Good-natured hole-complete, not a victory fanfare.',
  },
];

const masterTargets = {
  'card-draw-stock': -22,
  'card-draw-discard': -22,
  'card-discard-flight': -24,
  'card-land-table': -22,
  'card-flip': -22,
  'deal-card': -25,
  'stock-shuffle': -22,
  'turn-ready': -24,
  'ui-press': -25,
  'knock-thud': -18,
  'life-chip-loss': -21,
  'blitz-burst': -17,
  'win-celebration': -18,
  'lose-sting': -20,
  'wild-surge': -19,
  'reverse-whoosh': -21,
  'skip-swipe': -21,
  'draw-stack': -19,
  'color-select': -22,
  'wild-caught': -19,
  'hearts-pass-commit': -16,
  'hearts-trick-sweep': -16,
  'hearts-point-heart': -16,
  'hearts-queen-drop': -16,
  'hearts-hearts-broken': -16,
  'hearts-moon-shoot': -16,
  'gin-knock-rap': -18,
  'gin-burst': -18,
  'gin-big-gin': -18,
  'gin-undercut-sting': -18,
  'cribbage-peg-move': -18,
  'cribbage-score-run': -18,
  'cribbage-score-pair': -18,
  'cribbage-score-fifteen': -18,
  'cribbage-count-thirtyone': -18,
  'cribbage-go-knock': -18,
  'cribbage-heels-flourish': -18,
  'cribbage-crib-slide': -18,
  'cribbage-show-reveal': -18,
  'cribbage-skunk-sting': -18,
  'euchre-order-up': -18,
  'euchre-trump-called': -18,
  'euchre-pass': -18,
  'euchre-alone': -18,
  'euchre-dealer-pickup': -18,
  'euchre-trick-collect': -18,
  'euchre-euchre-sting': -18,
  'euchre-march-fanfare': -18,
  'euchre-score-chime': -18,
  'ratscrew-slap-win': -18,
  'ratscrew-mislap': -18,
  'ratscrew-window-open': -20,
  'ratscrew-challenge': -18,
  'ratscrew-scoop': -18,
  'ratscrew-burn': -18,
  'ratscrew-comeback': -18,
  'president-set-slam': -18,
  'president-pass': -20,
  'president-pile-clear': -18,
  'president-crown': -18,
  'president-scum': -18,
  'president-role-chime': -18,
  'president-exchange-swish': -18,
  'poker-chips-soft': -17,
  'poker-chips-hard': -16,
  'poker-fold': -16,
  'poker-check': -17,
  'poker-board': -17,
  'poker-pot': -16,
  'poker-award': -16,
  'poker-bust': -16,
  'poker-blinds-up': -16,
  'freecell-park': -18,
  'freecell-home': -18,
  'spider-suit-clear': -17,
  'spider-row-deal': -18,
  'pyramid-pair': -18,
  'pyramid-king': -18,
  'pyramid-hole-out': -18,
};

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const only = option('only')?.split(',').filter(Boolean) ?? null;
const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const masterOnly = process.argv.includes('--master-only');
const selected = only ? sounds.filter((sound) => only.includes(sound.name)) : sounds;

if (only && selected.length !== only.length) {
  const known = new Set(sounds.map((sound) => sound.name));
  const unknown = only.filter((name) => !known.has(name));
  throw new Error(`Unknown sound name(s): ${unknown.join(', ')}`);
}

for (const sound of selected) {
  const promptLength = `${STYLE} ${sound.prompt}`.length;
  if (promptLength > 450) {
    throw new Error(
      `Prompt for ${sound.name} is ${promptLength} characters; ElevenLabs allows 450`,
    );
  }
}

if (dryRun) {
  for (const sound of selected) {
    console.log(
      `${sound.outputPath ?? `sfx/${sound.name}.mp3`} (${sound.duration}s source, ${masterTargets[sound.name]} LUFS)`,
    );
  }
  process.exit(0);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!masterOnly && !apiKey) throw new Error('ELEVENLABS_API_KEY is required');

let generated = 0;
let skipped = 0;
let characterCost = 0;

for (const sound of selected) {
  const relativeOutput = sound.outputPath ?? join('sfx', `${sound.name}.mp3`);
  const output = join(AUDIO_ROOT, relativeOutput);
  mkdirSync(dirname(output), { recursive: true });
  if (masterOnly) {
    if (!existsSync(output)) throw new Error(`Cannot master missing sound: ${sound.name}`);
    console.log(`master ${sound.name}`);
    master(
      output,
      output,
      masterTargets[sound.name],
      sound.outputDuration,
      sound.mono,
      sound.tempo,
      sound.repeatAtMs,
      sound.sourceHitDuration,
      sound.postGainDb,
    );
    continue;
  }

  if (!force && existsSync(output)) {
    console.log(`skip ${sound.name} (already exists)`);
    skipped += 1;
    continue;
  }

  console.log(`generate ${sound.name}`);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: `${STYLE} ${sound.prompt}`,
      duration_seconds: sound.duration,
      prompt_influence: 0.65,
      model_id: 'eleven_text_to_sound_v2',
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`ElevenLabs ${response.status} for ${sound.name}: ${detail}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 1_000)
    throw new Error(`ElevenLabs returned truncated audio for ${sound.name}`);

  const source = `${output}.source.mp3`;
  try {
    writeFileSync(source, audio);
    master(
      source,
      output,
      masterTargets[sound.name],
      sound.outputDuration,
      sound.mono,
      sound.tempo,
      sound.repeatAtMs,
      sound.sourceHitDuration,
      sound.postGainDb,
    );
  } finally {
    rmSync(source, { force: true });
  }

  generated += 1;
  characterCost += Number(response.headers.get('character-cost') ?? 0);
}

console.log(`done: ${generated} generated, ${skipped} skipped, character cost ${characterCost}`);

function master(
  input,
  output,
  targetLufs,
  outputDuration,
  mono = false,
  tempo,
  repeatAtMs,
  sourceHitDuration,
  postGainDb,
) {
  if (typeof targetLufs !== 'number') throw new Error(`Missing mastering target for ${output}`);
  const temporary = `${output}.master.mp3`;
  const sourceFilters = [];
  if (typeof tempo === 'number') sourceFilters.push(...atempoFilters(tempo));
  if (typeof repeatAtMs === 'number') {
    if (!(repeatAtMs > 0) || !(sourceHitDuration > 0)) {
      throw new Error(`Invalid authored repeat for ${output}`);
    }
    sourceFilters.push(
      `atrim=duration=${sourceHitDuration}`,
      'asetpts=PTS-STARTPTS',
      'asplit=2[first][second]',
    );
  }

  const outputFilters = [];
  if (typeof outputDuration === 'number') {
    const fadeDuration = Math.min(0.04, outputDuration / 5);
    outputFilters.push(
      `atrim=duration=${outputDuration}`,
      `afade=t=out:st=${outputDuration - fadeDuration}:d=${fadeDuration}`,
    );
  }
  outputFilters.push(`loudnorm=I=${targetLufs}:TP=-1.5:LRA=7`);
  if (typeof postGainDb === 'number') outputFilters.push(`volume=${postGainDb}dB`);
  outputFilters.push('alimiter=limit=0.6:attack=5:release=50:level=false');

  const filterArgs =
    typeof repeatAtMs === 'number'
      ? [
          '-filter_complex',
          `[0:a]${sourceFilters.join(',')};[second]adelay=${repeatAtMs}:all=1,volume=0.94[delayed];[first][delayed]amix=inputs=2:duration=longest:normalize=0,${outputFilters.join(',')}[mastered]`,
          '-map',
          '[mastered]',
        ]
      : ['-af', [...sourceFilters, ...outputFilters].join(',')];
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      input,
      ...filterArgs,
      '-ar',
      '44100',
      ...(mono ? ['-ac', '1'] : []),
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '128k',
      temporary,
    ],
    { encoding: 'utf8' },
  );

  if (result.error) throw new Error(`ffmpeg is required to master SFX: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${output}: ${result.stderr.slice(0, 500)}`);
  }

  try {
    renameSync(temporary, output);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function atempoFilters(tempo) {
  if (!Number.isFinite(tempo) || tempo <= 0) throw new Error(`Invalid audio tempo: ${tempo}`);
  const filters = [];
  let remaining = tempo;
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining}`);
  return filters;
}
