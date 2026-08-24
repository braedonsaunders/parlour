import type { Messages } from './en';

/**
 * Português (Brasil) — completo.
 *
 * `Messages` é derivado do catálogo em inglês, então este objeto vira um erro
 * de tipo no momento em que o inglês ganha uma chave que falte aqui. Nada aqui
 * é placeholder: um idioma vai ao ar inteiro ou não vai.
 *
 * Registro escolhido para combinar com o inglês: acolhedor, simples, segunda
 * pessoa (`você`), como deve soar um jogo jogado ao redor da mesa da cozinha.
 * Vocabulário brasileiro em tudo — "mesa" para a mesa de cartas, "sala" para
 * a sala do código.
 */
export const pt: Messages = {
  // --- shared chrome --------------------------------------------------------
  'common.back': 'Voltar',
  'common.backArrow': '← Voltar',
  'common.leaveArrow': '← Sair',
  'common.close': 'Fechar',
  'common.cancel': 'Cancelar',
  'common.quit': 'Sair',
  'common.you': 'Você',
  'common.loading': 'Carregando…',

  // --- home -----------------------------------------------------------------
  'home.eyebrow': 'puxe uma cadeira',
  'home.tagline':
    'Um motor de jogos de cartas aconchegante, para rodadas rápidas e vitórias barulhentas.',
  'home.play': 'Jogar',
  'home.joinPrompt': 'Tem um código de sala? Entre numa mesa →',
  'home.shelfNote': 'uma estante de jogos de cartas que só cresce',
  'home.profileLabel': 'Abrir seu perfil',
  'home.profileFallback': 'Perfil',

  // --- sound ----------------------------------------------------------------
  'sound.mute': 'Silenciar o som',
  'sound.unmute': 'Ativar o som',
  'sound.on': 'Som ativado',
  'sound.off': 'Som desativado',
  'sound.heading': 'Som',
  'sound.playing': 'tocando na mesa',
  'sound.waiting': 'começa no seu primeiro toque',

  // --- language -------------------------------------------------------------
  'language.label': 'Idioma',
  'language.change': 'Mudar idioma',
  'language.heading': 'Idioma',
  'language.hint': 'Aplica em tudo, na hora. Sua escolha fica salva neste aparelho.',
  'language.current': 'Idioma atual: {language}',

  // --- game shelf -----------------------------------------------------------
  'shelf.heading': 'A estante de jogos',
  'shelf.search': 'Buscar jogos…',
  'shelf.clearSearch': 'Limpar busca de jogos',
  'shelf.gamesLabel': 'Jogos',
  'shelf.noMatch': 'Tente um estilo como vazas, descarte, rummy ou tapa.',
  'shelf.moreSoon': 'Mais jogos chegam à estante em breve.',
  'shelf.soon': 'Em breve',
  'shelf.resultsFound_one': '{count} jogo encontrado',
  'shelf.resultsFound_other': '{count} jogos encontrados',
  'shelf.readyToPlay': '{count} jogos prontos para jogar',
  'shelf.oneEngine': 'Um motor, muitas mesas.',

  // --- join -----------------------------------------------------------------
  'join.heading': 'Entrar numa mesa',
  'join.hint': 'Digite os quatro caracteres que seu amigo compartilhou.',
  'join.codeLabel': 'Código da sala, {entered} de {total} digitados',
  'join.knocking': 'Batendo…',
  'join.submit': 'Puxar uma cadeira',
  'join.connecting': 'Conectando com segurança…',
  'join.unreachable': 'Não foi possível alcançar a mesa {code}. Confira o código e sua conexão.',
  'join.unreachableGeneric': 'Não foi possível alcançar essa mesa.',
  'join.seated': 'Você tem um lugar. A mesa abre quando o anfitrião der as cartas.',

  // --- room lobby -----------------------------------------------------------
  'room.codeLabel': 'Código da sala',
  'room.connected': 'A mesa está conectada',
  'room.reconnecting': 'Reconectando — seu lugar está guardado',
  'room.finding': 'Procurando a mesa…',
  'room.copyLink': 'Copiar link',
  'room.copied': 'Copiado!',
  'room.shareTitle': 'Entre no meu parlour',
  'room.seatsLabel': 'Lugares da mesa',
  'room.ready': 'Pronto',
  'room.rejoining': 'Voltando…',
  'room.openChair': 'Cadeira livre',
  'room.start': 'Começar partida',
  'room.sendFailed': 'A jogada não pôde ser enviada.',
  'room.waitingFor_one': 'Esperando mais {count}',
  'room.waitingFor_other': 'Esperando mais {count}',
  'room.shareText': 'Sala {code}',

  // --- table ----------------------------------------------------------------
  'table.menu': 'Menu da mesa',
  'table.dealing': 'Distribuindo…',

  // --- match end ------------------------------------------------------------
  'matchEnd.playAgain': 'Jogar de novo',
  'matchEnd.complete': 'Partida encerrada',
  'matchEnd.none': 'Nenhuma partida registrada',
  'matchEnd.noneHint': 'Termine um jogo na mesa e o pódio aparece aqui.',
  'matchEnd.playSolo': 'Jogar sozinho',

  // --- profile --------------------------------------------------------------
  'profile.heading': 'Perfil',
  'profile.identity': 'Identidade',
  'profile.yourName': 'Seu nome',
  'profile.namePlaceholder': 'Freguês anônimo',
  'profile.pickAvatar': 'Escolha um avatar',
  'profile.character': 'Personagem',
  'profile.lifetime': 'Toda a vida na mesa',
  'profile.lifetimeLabel': 'Estatísticas gerais',
  'profile.resetStats': 'Zerar estatísticas',
  'profile.confirmReset': 'Toque de novo para confirmar',
  'profile.regulars': 'Seus fregueses',
  'profile.regularsHint': 'Confrontos só locais, ligados ao perfil Parlour de cada amigo.',
  'profile.regularsLabel': 'Histórico de confrontos',
  'profile.clearHistory': 'Limpar histórico',
  'profile.confirmForget': 'Toque de novo para esquecer',
  'profile.noRegulars': 'Termine uma partida com um amigo e sua rivalidade aparece aqui.',
  'profile.comfort': 'Conforto',
  'profile.comfortLabel': 'Acessibilidade',
  'profile.reduceMotion': 'Reduzir movimento',
  'profile.reduceMotionHint': 'Acalma as comemorações e o movimento de fundo em todo lugar.',

  // --- stats ----------------------------------------------------------------
  'stats.games': 'Jogos',
  'stats.wins': 'Vitórias',
  'stats.winRate': 'Taxa de vitórias',
  'stats.blitzes': 'Total de blitzes',
  'stats.knockSuccess': 'Batidas certeiras',
  'stats.bestStreak': 'Melhor sequência',

  // --- setup ----------------------------------------------------------------
  'setup.botSkill': 'Nível dos bots',
  'setup.easy': 'Fácil',
  'setup.medium': 'Médio',
  'setup.hard': 'Difícil',
  'setup.seats': 'Lugares',
  'setup.seatCount_one': '{count} lugar',
  'setup.seatCount_other': '{count} lugares',

  // --- install --------------------------------------------------------------
  'install.add': 'Adicionar',
  'install.install': 'Instalar',
  'install.installApp': 'Instalar app',
  'install.addToHome': 'Adicionar à Tela de Início',
  'install.either': 'Instalar app ou Adicionar à Tela de Início',
  'install.closeInstructions': 'Fechar instruções de instalação',
  'install.shareStep': 'Toque em Compartilhar na barra do navegador.',
  'install.menuStep': 'Abra o menu do navegador.',
  'install.tapEither': 'Toque em {add} ou {install}.',

  // --- scene ----------------------------------------------------------------
  'scene.label': 'Cena de fundo',
  'scene.campfire': 'Fogueira',
  'scene.casino': 'Cassino',
  'scene.snug': 'Aconchego',
};
