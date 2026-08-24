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
  'shelf.search': 'Buscar juegos…',
  'shelf.clearSearch': 'Borrar la búsqueda',
  'shelf.gamesLabel': 'Juegos',
  'shelf.noMatch': 'Prueba con un estilo: bazas, descarte, rummy o palmadas.',
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

  // --- room lobby -----------------------------------------------------------
  'room.codeLabel': 'Código de sala',
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

  // --- setup ----------------------------------------------------------------
  'setup.botSkill': 'Nivel de los bots',
  'setup.easy': 'Fácil',
  'setup.medium': 'Medio',
  'setup.hard': 'Difícil',
  'setup.seats': 'Sillas',
  'setup.seatCount_one': '{count} silla',
  'setup.seatCount_other': '{count} sillas',

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
