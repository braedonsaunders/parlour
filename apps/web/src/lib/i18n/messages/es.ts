import type { Messages } from './en';

/**
 * Spanish — complete.
 *
 * `Messages` is derived from the English catalogue, so this object is a type
 * error the moment English gains a key it does not have. Nothing here is a
 * placeholder: a locale ships whole or not at all.
 *
 * Register chosen to match the English: warm, plain, second person singular
 * (`tú`), which is what a game played round a kitchen table should sound like.
 * Neutral Latin-American/peninsular vocabulary throughout — "mesa" rather than
 * a regional word for a card table, "sala" for a room code's room.
 */
export const es: Messages = {
  // --- shared chrome --------------------------------------------------------
  'common.back': 'Atrás',
  'common.backArrow': '← Atrás',
  'common.leaveArrow': '← Salir',
  'common.close': 'Cerrar',
  'common.cancel': 'Cancelar',
  'common.quit': 'Salir',
  'common.you': 'Tú',
  'common.loading': 'Cargando…',

  // --- home -----------------------------------------------------------------
  'home.eyebrow': 'acerca una silla',
  'home.tagline':
    'Un motor de juegos de cartas acogedor, para partidas rápidas y victorias ruidosas.',
  'home.play': 'Jugar',
  'home.joinPrompt': '¿Tienes un código de sala? Únete a una mesa →',
  'home.shelfNote': 'una estantería de juegos que no para de crecer',
  'home.profileLabel': 'Abrir tu perfil',
  'home.profileFallback': 'Perfil',

  // --- sound ----------------------------------------------------------------
  'sound.mute': 'Silenciar el sonido',
  'sound.unmute': 'Activar el sonido',
  'sound.on': 'Sonido activado',
  'sound.off': 'Sonido silenciado',
  'sound.heading': 'Sonido',
  'sound.playing': 'sonando en la mesa',
  'sound.waiting': 'empieza en cuanto toques',

  // --- language -------------------------------------------------------------
  'language.label': 'Idioma',
  'language.change': 'Cambiar de idioma',
  'language.heading': 'Idioma',
  'language.hint':
    'Se aplica en todas partes al instante. Tu elección se guarda en este dispositivo.',
  'language.current': 'Idioma actual: {language}',

  // --- game shelf -----------------------------------------------------------
  'shelf.heading': 'La estantería de juegos',
  'shelf.choose': 'Elige tu juego',
  'shelf.search': 'Buscar juegos…',
  'shelf.searchLabel': 'Buscar juegos',
  'shelf.clearSearch': 'Borrar la búsqueda',
  'shelf.pickTable': 'Elige una mesa',
  'shelf.libraryCopy': 'En solitario, con bots o alrededor de la mesa con amistades.',
  'shelf.gamesLabel': 'Juegos',
  'shelf.noMatch': 'Prueba con un estilo: bazas, descarte, rummy o palmadas.',
  'shelf.noMatchTitle': 'Ningún juego de la estantería coincide con “{query}”',
  'shelf.showEvery': 'Mostrar todos los juegos',
  'shelf.moreSoon': 'Pronto habrá más juegos en la estantería.',
  'shelf.soon': 'Pronto',
  'shelf.resultsFound_one': '{count} juego encontrado',
  'shelf.resultsFound_other': '{count} juegos encontrados',
  'shelf.readyToPlay': '{count} juegos listos para jugar',
  'shelf.oneEngine': 'Un motor, muchas mesas.',

  // --- join -----------------------------------------------------------------
  'join.heading': 'Únete a una mesa',
  'join.hint': 'Escribe los cuatro caracteres que te pasó tu amistad.',
  'join.codeLabel': 'Código de sala, {entered} de {total} escritos',
  'join.knocking': 'Llamando a la puerta…',
  'join.submit': 'Acercar una silla',
  'join.connecting': 'Conectando de forma segura…',
  'join.unreachable': 'No se pudo llegar a la mesa {code}. Revisa el código y tu conexión.',
  'join.unreachableGeneric': 'No se pudo llegar a esa mesa.',
  'join.seated': 'Ya tienes silla. La mesa se abre cuando reparta quien anfitriona.',
  'join.lobbyClosed': 'Quien anfitriona cerró la sala.',

  // --- room lobby -----------------------------------------------------------
  'room.codeLabel': 'Código de sala',
  'room.addBot': 'Añadir bot',
  'room.lobbyClosed': 'Quien anfitriona cerró la sala.',
  'room.connected': 'La mesa está conectada',
  'room.reconnecting': 'Reconectando: tu silla está guardada',
  'room.finding': 'Buscando la mesa…',
  'room.copyLink': 'Copiar enlace',
  'room.copied': '¡Copiado!',
  'room.shareTitle': 'Únete a mi parlour',
  'room.seatsLabel': 'Sillas de la mesa',
  'room.ready': 'Listo',
  'room.rejoining': 'Volviendo a entrar…',
  'room.openChair': 'Silla libre',
  'room.start': 'Empezar la partida',
  'room.sendFailed': 'No se pudo enviar la jugada.',
  'room.waitingFor_one': 'Falta {count} más',
  'room.waitingFor_other': 'Faltan {count} más',
  'room.shareText': 'Sala {code}',

  // --- table ----------------------------------------------------------------
  'table.menu': 'Menú de la mesa',
  'table.dealing': 'Repartiendo…',

  // --- match end ------------------------------------------------------------
  'matchEnd.playAgain': 'Jugar otra vez',
  'matchEnd.complete': 'Partida terminada',
  'matchEnd.none': 'No hay ninguna partida registrada',
  'matchEnd.noneHint': 'Termina una partida en la mesa y el podio aparecerá aquí.',
  'matchEnd.playSolo': 'Jugar en solitario',

  // --- profile --------------------------------------------------------------
  'profile.heading': 'Perfil',
  'profile.identity': 'Identidad',
  'profile.yourName': 'Tu nombre',
  'profile.namePlaceholder': 'Habitual anónimo',
  'profile.pickAvatar': 'Elige un avatar',
  'profile.character': 'Personaje',
  'profile.lifetime': 'Toda tu trayectoria en la mesa',
  'profile.lifetimeLabel': 'Estadísticas de siempre',
  'profile.resetStats': 'Reiniciar estadísticas',
  'profile.confirmReset': 'Toca otra vez para confirmar',
  'profile.regulars': 'Tus habituales',
  'profile.regularsHint':
    'Enfrentamientos guardados solo en este dispositivo, ligados al perfil de Parlour de cada amistad.',
  'profile.regularsLabel': 'Historial cara a cara',
  'profile.clearHistory': 'Borrar el historial',
  'profile.confirmForget': 'Toca otra vez para olvidar',
  'profile.noRegulars': 'Termina una partida con una amistad y vuestra rivalidad aparecerá aquí.',
  'profile.comfort': 'Comodidad',
  'profile.comfortLabel': 'Accesibilidad',
  'profile.reduceMotion': 'Reducir el movimiento',
  'profile.reduceMotionHint': 'Calma las celebraciones y el movimiento de fondo en todas partes.',

  // --- stats ----------------------------------------------------------------
  'stats.games': 'Partidas',
  'stats.wins': 'Victorias',
  'stats.winRate': 'Porcentaje de victorias',
  'stats.blitzes': 'Blitzes',
  'stats.knockSuccess': 'Golpes acertados',
  'stats.bestStreak': 'Mejor racha',

  // --- how to play ----------------------------------------------------------
  'howto.heading': 'Cómo se juega',
  'howto.playTitle': 'Cómo se juega a {title}',
  'howto.close': 'Cerrar cómo se juega',
  'howto.objective': 'Cómo se gana',

  // --- setup ----------------------------------------------------------------
  'setup.botSkill': 'Nivel de los bots',
  'setup.easy': 'Fácil',
  'setup.medium': 'Medio',
  'setup.hard': 'Difícil',
  'setup.seats': 'Sillas',
  'setup.seatCount_one': '{count} silla',
  'setup.seatCount_other': '{count} sillas',
  'setup.backToGames': '← Juegos',
  'setup.tableSetup': 'Preparar la mesa',
  'setup.advancedOptions': 'Opciones avanzadas',
  'setup.houseRules': 'Reglas de casa',
  'setup.matchFormat': 'Formato de partida',
  'setup.matchRules': 'Reglas de la partida',
  'setup.rules': 'Reglas',
  'setup.table': 'Mesa',
  'setup.changed_one': '{count} cambio',
  'setup.changed_other': '{count} cambios',
  'setup.houseRulesNote': 'Reglas de casa: cambian cómo se juega, no solo cuánto dura la partida.',
  'setup.resetDefault': 'Volver al valor de la mesa',
  'setup.decrease': 'Bajar {label}',
  'setup.increase': 'Subir {label}',
  'setup.playSolo': 'Jugar en solitario',
  'setup.createFriendRoom': 'Crear sala de amistades',
  'setup.joinWithCode': 'Unirse con un código',
  'setup.dealMeIn': 'Repárteme',
  'setup.createRoom': 'Crear sala',
  'setup.joinRoom': 'Unirse a una sala',
  'setup.startSoloMatch': 'Empezar partida en solitario',
  'setup.playMode': 'Jugar {mode}',
  'setup.playTodayHole': 'Jugar el hoyo de hoy',
  'setup.playTodayDeal': 'Jugar el reparto de hoy',
  'setup.eyebrow.pickMode': 'elige tu modo',
  'setup.eyebrow.pickTable': 'elige tu mesa',
  'setup.eyebrow.callSuit': 'canta el palo',
  'setup.eyebrow.playOntoHole': 'juega al hoyo',
  'setup.eyebrow.clearTable': 'limpia la mesa',
  'setup.eyebrow.pickPile': 'elige tu pila',
  'setup.eyebrow.handsOnPile': 'manos a la pila',
  'setup.eyebrow.claimCrown': 'reclama la corona',
  'setup.eyebrow.dodgeEverything': 'esquiva de todo',
  'setup.eyebrow.chooseBoard': 'elige tu tablero',
  'setup.modes.golfHole': 'Hoyo de golf',
  'setup.modes.klondikeDeal': 'Reparto de Klondike',
  'setup.modes.cribbageFormat': 'Formato de cribbage',
  'setup.busy.settingTable': 'Preparando la mesa…',
  'setup.busy.shuffling': 'Barajando…',
  'setup.busy.shufflingPack': 'Barajando el mazo…',
  'setup.busy.stackingPiles': 'Apilando los montones…',
  'setup.busy.layingTable': 'Tendiendo la mesa…',
  'setup.busy.cuttingDeal': 'Cortando para el reparto…',
  'setup.busy.shufflingPile': 'Barajando la pila…',
  'setup.busy.shufflingStacks': 'Barajando los montones…',
  'setup.busy.cuttingDeck': 'Cortando el mazo…',
  'setup.busy.settingPegs': 'Colocando las fichas…',
  'setup.busy.findingWinnable': 'Buscando un reparto ganable…',
  'setup.busy.layingCards': 'Colocando las cartas…',
  'setup.youPlusBots_one': 'tú + {count} bot',
  'setup.youPlusBots_other': 'tú + {count} bots',
  'setup.youPlusBotsReflexes_one': 'tú + {count} bot con reflejos de verdad',
  'setup.youPlusBotsReflexes_other': 'tú + {count} bots con reflejos de verdad',
  'setup.youPlusOthersHand_one': 'tú más {count} más — el tamaño de la mano cambia cada ronda',
  'setup.youPlusOthersHand_other': 'tú más {count} más — el tamaño de la mano cambia cada ronda',
  'setup.youPlusOpponents_one': 'tú más {count} rival — gana el último montón en pie',
  'setup.youPlusOpponents_other': 'tú más {count} rivales — gana el último montón en pie',
  'setup.youPlusSpite': 'tú más {count} — gana quien vacíe primero su pila de pago',
  'setup.youPlusPresident': 'tú + {count} rivales — la escalera completa, coronas incluidas',
  'setup.scopaAlwaysFour': 'Scopone es siempre de cuatro, en parejas',
  'setup.scopaOthers': 'tú más {count} más — a cuatro y a seis se juega en parejas',
  'setup.partnershipsValue': '4 jugadores · dos parejas',
  'setup.partnershipsHint':
    'tú + un bot de pareja enfrente, dos bots rivales a los lados — o trae a tres amistades',
  'setup.heartsSeats': '4 jugadores',
  'setup.heartsHint': 'tú + 3 bots en solitario · todas las sillas ocupadas en salas de amistades',
  'setup.ginSeats': '2 — cara a cara',
  'setup.ginHint': 'tú + un bot',
  'setup.cribbageSeats': 'Dos sillas · tú repartes primero',
  'setup.cribbageHint': 'el que reparte alterna cada mano',
  'setup.note.friendRooms':
    'Las salas de amistades usan los mismos códigos de cuatro caracteres, la misma sincronización en vivo y el mismo reconexión que cualquier mesa del parlour.',
  'setup.note.friendRoomsGin':
    'Las salas de amistades usan los mismos códigos de cuatro caracteres y la misma sincronización en vivo que cualquier mesa del parlour.',
  'setup.note.friendRoomsBlitz':
    'Las salas de amistades usan los mismos códigos de cuatro caracteres, la misma sincronización en vivo y el mismo reconexión que Blitz.',
  'setup.note.friendRoomsEight':
    'Las salas de amistades usan los mismos códigos de cuatro caracteres, la misma sincronización en vivo y el mismo reconexión que cualquier mesa del parlour — con sitio para hasta ocho sillas.',
  'setup.note.blitzRooms':
    'Las salas se juegan con amistades con un código para compartir — en solitario te sientas con los bots de arriba.',
  'setup.note.hearts': 'Gana la puntuación más baja: esquiva los corazones y teme a la reina.',
  'setup.note.poker':
    'Las fichas solo llevan la cuenta: no hay nada que comprar ni nada que cobrar.',
  'setup.note.ratscrew':
    'Las palmadas se disputan en tiempo real: la primera mano en la pila se la lleva. Una palmada fallida quema tu carta de arriba.',
  'setup.note.ohhell':
    'Canta exactamente las bazas que vas a llevarte. Las salas de amistades usan los mismos códigos de cuatro caracteres, la misma sincronización en vivo y el mismo reconexión que cualquier mesa del parlour.',
  'setup.note.scopa':
    'Limpia la mesa para marcar una scopa. Las salas de amistades usan los mismos códigos de cuatro caracteres, la misma sincronización en vivo y el mismo reconexión que cualquier mesa del parlour.',
  'setup.note.spite':
    'Sube el centro del as a la reina. Las salas de amistades usan los mismos códigos de cuatro caracteres, la misma sincronización en vivo y el mismo reconexión que cualquier mesa del parlour.',
  'setup.note.cribbage':
    'Las salas de amistades comparten el mismo registro de replay del anfitrión y el mismo reconexión que el resto de Parlour.',
  'setup.note.cribbageMatch':
    'El match se puede jugar en solitario; las salas de amistades juegan una carrera completa a 121.',
  'setup.cribbageRoomsLocked':
    'Las salas de amistades ahora mismo juegan una carrera completa a 121',
  'setup.todayDate': 'Hoy · {date}',
  'setup.dayStreak_one': '{count} día de racha',
  'setup.dayStreak_other': '{count} días de racha',
  'setup.golf.posted': 'Hoyo diario anotado',
  'setup.golf.waiting': 'Tu hoyo diario te espera',
  'setup.golf.best': 'Mejor: {score} restantes · {time}',
  'setup.golf.waitingHint':
    'Un hoyo Clásico determinado, el mismo para todo el mundo. Gana quien deje menos cartas.',
  'setup.golf.holes': 'Hoyos',
  'setup.golf.clears': 'Limpiezas',
  'setup.golf.bestScore': 'Mejor puntuación',
  'setup.golf.bestClear': 'Mejor limpieza',
  'setup.golf.note':
    'En solitario y sin conexión. El deshacer y las pistas se quedan en tu dispositivo; no hace falta cuenta ni código de sala.',
  'setup.klondike.cleared': 'Mesa diaria limpia',
  'setup.klondike.waiting': 'Tu mesa diaria te espera',
  'setup.klondike.best': 'Mejor: {moves} movimientos · {time}',
  'setup.klondike.waitingWinnable':
    'Un reparto de robar tres determinado, el mismo para todo el mundo, comprobado de cabo a rabo antes de llegarte.',
  'setup.klondike.waitingShuffle':
    'Un reparto de robar tres determinado, el mismo para todo el mundo, tal cual sale de la baraja: más o menos una mesa de cada cinco no se puede limpiar.',
  'setup.klondike.deals': 'Repartos',
  'setup.klondike.bestMoves': 'Mejores movimientos',
  'setup.klondike.bestTime': 'Mejor tiempo',
  'setup.klondike.winnableOnly': 'Solo repartos ganables',
  'setup.klondike.winnableOn':
    'Cada mesa se resuelve de cabo a rabo antes de repartirse, así que una derrota siempre es tuya para revertir.',
  'setup.klondike.winnableOff':
    'Barajas tal cual, mesas muertas incluidas: así ha repartido siempre el Klondike.',
  'setup.klondike.note':
    'En solitario y sin conexión. El deshacer, las pistas y el autoacabado seguro se quedan en tu dispositivo; no hace falta cuenta ni código de sala.',

  // --- install --------------------------------------------------------------
  'install.add': 'Añadir',
  'install.install': 'Instalar',
  'install.installApp': 'Instalar la app',
  'install.addToHome': 'Añadir a la pantalla de inicio',
  'install.either': 'Instalar la app o añadirla a la pantalla de inicio',
  'install.closeInstructions': 'Cerrar las instrucciones de instalación',
  'install.shareStep': 'Toca Compartir en la barra de tu navegador.',
  'install.menuStep': 'Abre el menú de tu navegador.',
  'install.tapEither': 'Toca {add} o {install}.',

  // --- scene ----------------------------------------------------------------
  'scene.label': 'Escenario de fondo',
  'scene.campfire': 'Hoguera',
  'scene.casino': 'Casino',
  'scene.snug': 'Rincón',
};
