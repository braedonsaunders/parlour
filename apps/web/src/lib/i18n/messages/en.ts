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
  'shelf.choose': 'Choose your game',
  'shelf.search': 'Search games…',
  'shelf.searchLabel': 'Search games',
  'shelf.clearSearch': 'Clear game search',
  'shelf.pickTable': 'Pick a table',
  'shelf.libraryCopy': 'Solo, with bots, or around the room with friends.',
  'shelf.gamesLabel': 'Games',
  'shelf.noMatch': 'Try a style like trick-taking, shedding, rummy, or slap.',
  'shelf.noMatchTitle': 'No game on the shelf matches “{query}”',
  'shelf.showEvery': 'Show every game',
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

  // --- how to play ----------------------------------------------------------
  'howto.heading': 'How to play',
  'howto.playTitle': 'How to play {title}',
  'howto.close': 'Close how to play',
  'howto.objective': 'How you win',

  // --- setup ----------------------------------------------------------------
  'setup.botSkill': 'Bot skill',
  'setup.easy': 'Easy',
  'setup.medium': 'Medium',
  'setup.hard': 'Hard',
  'setup.seats': 'Seats',
  'setup.seatCount_one': '{count} seat',
  'setup.seatCount_other': '{count} seats',
  'setup.backToGames': '← Games',
  'setup.tableSetup': 'Table setup',
  'setup.advancedOptions': 'Advanced options',
  'setup.houseRules': 'House rules',
  'setup.matchFormat': 'Match format',
  'setup.matchRules': 'Match rules',
  'setup.rules': 'Rules',
  'setup.table': 'Table',
  'setup.changed_one': '{count} changed',
  'setup.changed_other': '{count} changed',
  'setup.houseRulesNote':
    'House rules — these change how the game plays, not just how long it runs.',
  'setup.resetDefault': 'Reset to table default',
  'setup.decrease': 'Decrease {label}',
  'setup.increase': 'Increase {label}',
  'setup.playSolo': 'Play solo',
  'setup.createFriendRoom': 'Create friend room',
  'setup.joinWithCode': 'Join with a code',
  'setup.dealMeIn': 'Deal me in',
  'setup.createRoom': 'Create Room',
  'setup.joinRoom': 'Join Room',
  'setup.startSoloMatch': 'Start solo match',
  'setup.playMode': 'Play {mode}',
  'setup.playTodayHole': "Play today's hole",
  'setup.playTodayDeal': "Play today's deal",
  'setup.eyebrow.pickMode': 'pick your mode',
  'setup.eyebrow.pickTable': 'pick your table',
  'setup.eyebrow.callSuit': 'call the suit',
  'setup.eyebrow.playOntoHole': 'play onto the hole',
  'setup.eyebrow.clearTable': 'clear the table',
  'setup.eyebrow.pickPile': 'pick your pile',
  'setup.eyebrow.handsOnPile': 'hands on the pile',
  'setup.eyebrow.claimCrown': 'claim the crown',
  'setup.eyebrow.dodgeEverything': 'dodge everything',
  'setup.eyebrow.chooseBoard': 'choose your board',
  'setup.modes.golfHole': 'Golf hole',
  'setup.modes.klondikeDeal': 'Klondike deal',
  'setup.modes.cribbageFormat': 'Cribbage format',
  'setup.busy.settingTable': 'Setting the table…',
  'setup.busy.shuffling': 'Shuffling up…',
  'setup.busy.shufflingPack': 'Shuffling the pack…',
  'setup.busy.stackingPiles': 'Stacking the piles…',
  'setup.busy.layingTable': 'Laying out the table…',
  'setup.busy.cuttingDeal': 'Cutting for the deal…',
  'setup.busy.shufflingPile': 'Shuffling the pile…',
  'setup.busy.shufflingStacks': 'Shuffling the stacks…',
  'setup.busy.cuttingDeck': 'Cutting the deck…',
  'setup.busy.settingPegs': 'Setting the pegs…',
  'setup.busy.findingWinnable': 'Finding a winnable deal…',
  'setup.busy.layingCards': 'Laying out the cards…',
  'setup.youPlusBots_one': 'you + {count} bot',
  'setup.youPlusBots_other': 'you + {count} bots',
  'setup.youPlusBotsReflexes_one': 'you + {count} bot with real reflexes',
  'setup.youPlusBotsReflexes_other': 'you + {count} bots with real reflexes',
  'setup.youPlusOthersHand_one': 'you plus {count} other — the hand size changes every round',
  'setup.youPlusOthersHand_other': 'you plus {count} others — the hand size changes every round',
  'setup.youPlusOpponents_one': 'you plus {count} opponent — last stack standing wins',
  'setup.youPlusOpponents_other': 'you plus {count} opponents — last stack standing wins',
  'setup.youPlusSpite': 'you plus {count} — first to empty their payoff pile wins',
  'setup.youPlusPresident': 'you + {count} rivals — the full ladder, crowns included',
  'setup.scopaAlwaysFour': 'Scopone is always four, in partnerships',
  'setup.scopaOthers': 'you plus {count} others — four and six play as partnerships',
  'setup.partnershipsValue': '4 players · two partnerships',
  'setup.partnershipsHint':
    'you + a bot partner across from you, two bot opponents flanking — or bring three friends',
  'setup.heartsSeats': '4 players',
  'setup.heartsHint': 'you + 3 bots in solo · every chair filled for friend rooms',
  'setup.ginSeats': '2 — head to head',
  'setup.ginHint': 'you + one bot',
  'setup.cribbageSeats': 'Two seats · you deal first',
  'setup.cribbageHint': 'dealer alternates every hand',
  'setup.note.friendRooms':
    'Friend rooms use the same four-character codes, live replay sync, and reconnect flow as every parlour table.',
  'setup.note.friendRoomsGin':
    'Friend rooms use the same four-character codes and live replay sync as every parlour table.',
  'setup.note.friendRoomsBlitz':
    'Friend rooms use the same four-character codes, live replay sync, and reconnect flow as Blitz.',
  'setup.note.friendRoomsEight':
    'Friend rooms use the same four-character codes, live replay sync, and reconnect flow as every parlour table — with room for up to eight chairs.',
  'setup.note.blitzRooms':
    'Rooms play with friends over a share code — solo deals you in with the bots above.',
  'setup.note.hearts': 'Lowest score wins — dodge the hearts, fear the queen.',
  'setup.note.poker': 'Chips are scorekeeping — there is nothing to buy and nothing to cash out.',
  'setup.note.ratscrew':
    'Slaps race in real time — first palm on the pile takes it. Mis-slaps burn your top card.',
  'setup.note.ohhell': 'Bid exactly what you will take. Friend rooms for Oh Hell are not open yet.',
  'setup.note.scopa': 'Clear the table to score a scopa. Friend rooms for Scopa are not open yet.',
  'setup.note.spite':
    'Build the centre up from ace to queen. Friend rooms for Spite are not open yet.',
  'setup.note.cribbage':
    'Friend rooms share the same host-authoritative replay log and reconnect flow as the rest of Parlour.',
  'setup.note.cribbageMatch':
    'Match Play is available solo; friend rooms play one complete 121-point game.',
  'setup.cribbageRoomsLocked': 'Friend rooms currently play one complete race to 121',
  'setup.todayDate': 'Today · {date}',
  'setup.dayStreak_one': '{count} day streak',
  'setup.dayStreak_other': '{count} day streak',
  'setup.golf.posted': 'Daily hole posted',
  'setup.golf.waiting': 'Your daily hole is waiting',
  'setup.golf.best': 'Best: {score} left · {time}',
  'setup.golf.waitingHint':
    'A deterministic Classic hole shared by every player. Lower leftover wins.',
  'setup.golf.holes': 'Holes',
  'setup.golf.clears': 'Clears',
  'setup.golf.bestScore': 'Best score',
  'setup.golf.bestClear': 'Best clear',
  'setup.golf.note':
    'Solo and offline. Undo and hints stay on your device; no account or room code needed.',
  'setup.klondike.cleared': 'Daily table cleared',
  'setup.klondike.waiting': 'Your daily table is waiting',
  'setup.klondike.best': 'Best: {moves} moves · {time}',
  'setup.klondike.waitingWinnable':
    'A deterministic Draw Three deal shared by every player, checked all the way through before it reaches you.',
  'setup.klondike.waitingShuffle':
    'A deterministic Draw Three deal shared by every player, straight off the shuffle — roughly one table in five cannot be cleared.',
  'setup.klondike.deals': 'Deals',
  'setup.klondike.bestMoves': 'Best moves',
  'setup.klondike.bestTime': 'Best time',
  'setup.klondike.winnableOnly': 'Winnable deals only',
  'setup.klondike.winnableOn':
    'Every table is solved end to end before it is dealt, so a loss is always yours to take back.',
  'setup.klondike.winnableOff':
    'Straight shuffles, dead tables and all — the way Klondike has always dealt.',
  'setup.klondike.note':
    'Solo and offline. Undo, hints, and safe auto-finish stay on your device; no account or room code needed.',

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
