/**
 * The English catalogue — the source of truth for every other language.
 *
 * The `Messages` type is derived from this object, so a translation is either
 * complete or it does not compile. Keys are flat and dotted rather than nested:
 * a flat record makes "which keys is `es` missing" a single type error listing
 * them, where a nested shape reports one branch at a time.
 *
 * Placeholders are `{name}`. Anything that varies with a count uses the
 * `_one`/`_other` suffix pair and is read through `t.count`, because a language
 * that pluralises differently from English must not be forced through an
 * English `n === 1` test written at the call site.
 */
export const en = {
  // --- shared chrome --------------------------------------------------------
  'common.back': 'Back',
  'common.backArrow': '← Back',
  'common.leaveArrow': '← Leave',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.quit': 'Quit',
  'common.you': 'You',
  'common.loading': 'Loading…',

  // --- home -----------------------------------------------------------------
  'home.eyebrow': 'pull up a chair',
  'home.tagline': 'A cozy card game engine for quick rounds and loud victories.',
  'home.play': 'Play',
  'home.joinPrompt': 'Have a room code? Join a table →',
  'home.shelfNote': 'a growing shelf of card games',
  'home.profileLabel': 'Open your profile',
  'home.profileFallback': 'Profile',

  // --- sound ----------------------------------------------------------------
  'sound.mute': 'Mute sound',
  'sound.unmute': 'Unmute sound',
  'sound.on': 'Sound on',
  'sound.off': 'Sound off',
  'sound.heading': 'Sound',
  'sound.playing': 'playing at the table',
  'sound.waiting': 'starts on your first tap',

  // --- language -------------------------------------------------------------
  'language.label': 'Language',
  'language.change': 'Change language',
  'language.heading': 'Language',
  'language.hint': 'Applies everywhere, right away. Your choice is kept on this device.',
  'language.current': 'Current language: {language}',

  // --- game shelf -----------------------------------------------------------
  'shelf.heading': 'The game shelf',
  'shelf.search': 'Search games…',
  'shelf.clearSearch': 'Clear game search',
  'shelf.gamesLabel': 'Games',
  'shelf.noMatch': 'Try a style like trick-taking, shedding, rummy, or slap.',
  'shelf.moreSoon': 'More games join the shelf soon.',
  'shelf.soon': 'Soon',
  'shelf.resultsFound_one': '{count} game found',
  'shelf.resultsFound_other': '{count} games found',
  'shelf.readyToPlay': '{count} games ready to play',
  'shelf.oneEngine': 'One engine, many tables.',

  // --- join -----------------------------------------------------------------
  'join.heading': 'Join a table',
  'join.hint': 'Type the four characters your friend shared.',
  'join.codeLabel': 'Room code, {entered} of {total} entered',
  'join.knocking': 'Knocking…',
  'join.submit': 'Pull up a chair',
  'join.connecting': 'Connecting securely…',
  'join.unreachable': 'Could not reach table {code}. Check the code and your connection.',
  'join.unreachableGeneric': 'Could not reach that table.',
  'join.seated': 'You have a seat. The table opens when the host deals.',

  // --- room lobby -----------------------------------------------------------
  'room.codeLabel': 'Room code',
  'room.connected': 'The table is connected',
  'room.reconnecting': 'Reconnecting — your seat is saved',
  'room.finding': 'Finding the table…',
  'room.copyLink': 'Copy link',
  'room.copied': 'Copied!',
  'room.shareTitle': 'Join my parlour',
  'room.seatsLabel': 'Table seats',
  'room.ready': 'Ready',
  'room.rejoining': 'Rejoining…',
  'room.openChair': 'Open chair',
  'room.start': 'Start match',
  'room.sendFailed': 'The move could not be sent.',
  'room.waitingFor_one': 'Waiting for {count} more',
  'room.waitingFor_other': 'Waiting for {count} more',
  'room.shareText': 'Room {code}',

  // --- table ----------------------------------------------------------------
  'table.menu': 'Table menu',
  'table.dealing': 'Dealing…',

  // --- match end ------------------------------------------------------------
  'matchEnd.playAgain': 'Play again',
  'matchEnd.complete': 'Match complete',
  'matchEnd.none': 'No match on record',
  'matchEnd.noneHint': 'Finish a game at the table and the podium will fill in here.',
  'matchEnd.playSolo': 'Play solo',

  // --- profile --------------------------------------------------------------
  'profile.heading': 'Profile',
  'profile.identity': 'Identity',
  'profile.yourName': 'Your name',
  'profile.namePlaceholder': 'Anonymous regular',
  'profile.pickAvatar': 'Pick an avatar',
  'profile.character': 'Character',
  'profile.lifetime': 'Lifetime at the table',
  'profile.lifetimeLabel': 'Lifetime stats',
  'profile.resetStats': 'Reset stats',
  'profile.confirmReset': 'Tap again to confirm',
  'profile.regulars': 'Your regulars',
  'profile.regularsHint': "Local-only matchups, keyed to each friend's Parlour profile.",
  'profile.regularsLabel': 'Head-to-head history',
  'profile.clearHistory': 'Clear history',
  'profile.confirmForget': 'Tap again to forget',
  'profile.noRegulars': 'Finish a match with a friend and your rivalry will appear here.',
  'profile.comfort': 'Comfort',
  'profile.comfortLabel': 'Accessibility',
  'profile.reduceMotion': 'Reduce motion',
  'profile.reduceMotionHint': 'Calms celebrations and ambient movement everywhere.',

  // --- stats ----------------------------------------------------------------
  'stats.games': 'Games',
  'stats.wins': 'Wins',
  'stats.winRate': 'Win rate',
  'stats.blitzes': 'Blitzes',
  'stats.knockSuccess': 'Knock success',
  'stats.bestStreak': 'Best streak',

  // --- setup ----------------------------------------------------------------
  'setup.botSkill': 'Bot skill',
  'setup.easy': 'Easy',
  'setup.medium': 'Medium',
  'setup.hard': 'Hard',
  'setup.seats': 'Seats',
  'setup.seatCount_one': '{count} seat',
  'setup.seatCount_other': '{count} seats',

  // --- install --------------------------------------------------------------
  'install.add': 'Add',
  'install.install': 'Install',
  'install.installApp': 'Install app',
  'install.addToHome': 'Add to Home Screen',
  'install.either': 'Install app or Add to Home screen',
  'install.closeInstructions': 'Close install instructions',
  'install.shareStep': 'Tap Share in your browser toolbar.',
  'install.menuStep': 'Open your browser menu.',
  'install.tapEither': 'Tap {add} or {install}.',

  // --- scene ----------------------------------------------------------------
  'scene.label': 'Background scene',
  'scene.campfire': 'Campfire',
  'scene.casino': 'Casino',
  'scene.snug': 'Snug',
} as const;

/**
 * Every message key in the app. Derived from English so a new key is available
 * to every locale the moment it is added — and missing from none of them.
 */
export type MessageKey = keyof typeof en;

/** A complete catalogue. Every locale file is checked against this. */
export type Messages = Readonly<Record<MessageKey, string>>;

/**
 * Keys that vary with a count, named without their `_one`/`_other` suffix.
 *
 * Derived from the `_other` variants because every plural key must have one —
 * `_other` is the category every language uses, `_one` is not. Asking `t.count`
 * for a key with no plural forms is therefore a compile error rather than a
 * string that silently ignores its number.
 */
export type PluralKey = MessageKey extends infer Key
  ? Key extends `${infer Base}_other`
    ? Base
    : never
  : never;
