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
  'shelf.choose': 'Escolha seu jogo',
  'shelf.search': 'Buscar jogos…',
  'shelf.searchLabel': 'Buscar jogos',
  'shelf.clearSearch': 'Limpar busca de jogos',
  'shelf.pickTable': 'Escolha uma mesa',
  'shelf.libraryCopy': 'Sozinho, com bots ou ao redor da mesa com amigos.',
  'shelf.gamesLabel': 'Jogos',
  'shelf.noMatch': 'Tente um estilo como vazas, descarte, rummy ou tapa.',
  'shelf.noMatchTitle': 'Nenhum jogo da estante combina com “{query}”',
  'shelf.showEvery': 'Mostrar todos os jogos',
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
  'join.lobbyClosed': 'O anfitrião fechou a sala.',

  // --- room lobby -----------------------------------------------------------
  'room.codeLabel': 'Código da sala',
  'room.addBot': 'Adicionar bot',
  'room.lobbyClosed': 'O anfitrião fechou a sala.',
  'room.connected': 'A mesa está conectada',
  'room.reconnecting': 'Reconectando — seu lugar está guardado',
  'room.finding': 'Procurando a mesa…',
  'room.copyLink': 'Copiar link',
  'room.copied': 'Copiado!',
  'room.share': 'Compartilhar',
  'room.shareFailed':
    'Não foi possível abrir o compartilhamento. Copie este endereço manualmente: {url}',
  'room.bot': 'bot',
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

  // --- table menu -----------------------------------------------------------
  'tableMenu.backToTable': 'Voltar à mesa',
  'tableMenu.quitPrompt': 'Sair desta partida?',
  'tableMenu.quitHint': 'Você deixará sua cadeira e voltará ao menu. A partida não vai esperar.',
  'tableMenu.keepPlaying': 'Continuar jogando',
  'tableMenu.quitMatch': 'Sair da partida',
  'tableMenu.calmMotionOn': 'Movimento suave ativado',
  'tableMenu.calmMotionOff': 'Movimento suave desativado',
  'tableMenu.background': 'Fundo',
  'tableMenu.cardEffects': 'Efeitos das cartas',
  'tableMenu.cardEffectsOff': 'Desligados',
  'tableMenu.cardEffectsSubtle': 'Sutis',
  'tableMenu.cardEffectsFull': 'Completos',
  'tableMenu.music': 'Música',
  'tableMenu.quitToMenu': 'Sair para o menu principal',

  // --- multiplayer security ------------------------------------------------
  'security.fairDeal': 'Distribuição justa',
  'security.veiled': 'Velada',
  'security.verified': 'Verificada',
  'security.disputed': 'Contestada',
  'security.seat': 'Assento {seat}',
  'security.recovered_one':
    '{seats} se desconectou e sua mão foi reaberta para a rodada continuar. Ela não é mais privada.',
  'security.recovered_other':
    '{seats} se desconectaram e suas mãos foram reabertas para a rodada continuar. Elas não são mais privadas.',
  'security.seatDropped': 'O assento {seat} caiu. Aguardando seu retorno…',
  'security.waitingPlayers': 'Aguardando mais jogadores antes de continuar a rodada.',
  'security.disclosure.hidden': 'Ninguém nesta mesa pode ver sua mão, nem mesmo o anfitrião.',
  'security.disclosure.openHands': 'Mesa aberta: um cliente modificado pode ler todas as mãos.',
  'security.disclosure.botOpen':
    'Mesa aberta: os bots da casa não têm chave do Veil, então um cliente modificado pode ler todas as mãos.',
  'security.disclosure.openDropWalkover': 'Com dois assentos, quem cair perde por abandono.',
  'security.disclosure.openDropBot':
    'Se alguém cair depois do início, um bot da casa ocupa o assento até essa pessoa voltar.',
  'security.recovery.none':
    'O Veil não pode recuperar uma desconexão com dois assentos. Dar ao adversário material de chave suficiente para retomar também permitiria que ele lesse sua mão, então a rodada pausa quando alguém cai.',
  'security.recovery.single':
    'Qualquer outro jogador pode restaurar as cartas de um assento desconectado — o que também significa que qualquer um deles poderia abrir uma mão ativa. Escolha uma configuração mais alta para uma mesa competitiva.',
  'security.recovery.threshold':
    '{threshold} dos outros {holders} jogadores precisam concordar em restaurar as cartas de um assento desconectado. Os mesmos {threshold}, se conspirassem, poderiam abrir uma mão ativa.',

  // --- table narration -----------------------------------------------------
  'narration.seat': 'Assento {seat}',
  'narration.card': 'uma carta',
  'narration.turn': 'Vez do {seat}.',
  'narration.drew': '{seat} comprou uma carta.',
  'narration.discarded': '{seat} descartou {card}.',
  'narration.played': '{seat} jogou {card}.',
  'narration.tookTrick': '{seat} levou a vaza.',
  'narration.knocked': '{seat} bateu.',
  'narration.calledBlitz': '{seat} anunciou blitz.',
  'narration.showdown': '{seat} revelou sua mão.',
  'narration.lostLife': '{seat} perdeu uma vida; restam {lives}.',
  'narration.gin': '{seat} anunciou gin.',
  'narration.bigGin': '{seat} anunciou grande gin.',
  'narration.undercut': '{seat} fez undercut.',
  'narration.seatScore': '{seat} agora tem {score} pontos.',
  'narration.teamScore': 'A equipe {team} agora tem {score} pontos.',
  'narration.passed': '{seat} passou.',
  'narration.captured': '{seat} capturou cartas.',
  'narration.folded': '{seat} desistiu.',
  'narration.checked': '{seat} pediu mesa.',
  'narration.called': '{seat} pagou.',
  'narration.bet': '{seat} apostou.',
  'narration.raised': '{seat} aumentou.',
  'narration.allIn': '{seat} foi all-in.',
  'narration.postedBlind': '{seat} colocou uma blind.',
  'narration.postedAnte': '{seat} colocou um ante.',

  // --- solitaire controls and narration -----------------------------------
  'solitaire.undoMoves_one': 'Desfazer · {count} jogada',
  'solitaire.undoMoves_other': 'Desfazer · {count} jogadas',
  'solitaire.narration.moved': '{card} foi movida de {from} para {to}.',
  'solitaire.narration.movedRun': '{count} cartas foram movidas de {from} para {to}.',
  'solitaire.narration.revealed': '{card} foi revelada em {zone}.',
  'solitaire.narration.stockDeal': '{count} cartas foram distribuídas pelo tabuleiro.',
  'solitaire.narration.recycled': 'O descarte voltou ao monte.',
  'solitaire.narration.pairRemoved': '{first} e {second} foram removidas.',
  'solitaire.narration.removed': '{card} foi removida.',
  'solitaire.card': '{rank} de {suit}',
  'solitaire.rank.ace': 'ás',
  'solitaire.rank.jack': 'valete',
  'solitaire.rank.queen': 'dama',
  'solitaire.rank.king': 'rei',
  'solitaire.suit.spades': 'espadas',
  'solitaire.suit.hearts': 'copas',
  'solitaire.suit.diamonds': 'ouros',
  'solitaire.suit.clubs': 'paus',
  'solitaire.zone.stock': 'o monte',
  'solitaire.zone.waste': 'o descarte',
  'solitaire.zone.hole': 'o buraco',
  'solitaire.zone.tableau': 'a coluna {column} do tabuleiro',
  'solitaire.zone.foundation': 'a fundação {foundation}',
  'solitaire.zone.suitFoundation': 'a fundação de {suit}',
  'solitaire.zone.cell': 'a célula livre {cell}',
  'solitaire.zone.pyramid': 'a linha {row}, carta {card}, da pirâmide',
  'solitaire.zone.table': 'a mesa',

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

  // --- how to play ----------------------------------------------------------
  'howto.heading': 'Como jogar',
  'howto.playTitle': 'Como jogar {title}',
  'howto.close': 'Fechar como jogar',
  'howto.objective': 'Como se ganha',

  // --- setup ----------------------------------------------------------------
  'setup.botSkill': 'Nível dos bots',
  'setup.easy': 'Fácil',
  'setup.medium': 'Médio',
  'setup.hard': 'Difícil',
  'setup.seats': 'Lugares',
  'setup.seatCount_one': '{count} lugar',
  'setup.seatCount_other': '{count} lugares',
  'setup.backToGames': '← Jogos',
  'setup.tableSetup': 'Preparar a mesa',
  'setup.advancedOptions': 'Opções avançadas',
  'setup.houseRules': 'Regras da casa',
  'setup.matchFormat': 'Formato da partida',
  'setup.matchRules': 'Regras da partida',
  'setup.rules': 'Regras',
  'setup.table': 'Mesa',
  'setup.changed_one': '{count} alteração',
  'setup.changed_other': '{count} alterações',
  'setup.houseRulesNote':
    'Regras da casa — elas mudam como o jogo se joga, não só quanto tempo dura.',
  'setup.resetDefault': 'Voltar ao padrão da mesa',
  'setup.decrease': 'Diminuir {label}',
  'setup.increase': 'Aumentar {label}',
  'setup.playSolo': 'Jogar sozinho',
  'setup.createFriendRoom': 'Criar sala de amigos',
  'setup.joinWithCode': 'Entrar com um código',
  'setup.dealMeIn': 'Me dá as cartas',
  'setup.createRoom': 'Criar sala',
  'setup.joinRoom': 'Entrar na sala',
  'setup.startSoloMatch': 'Começar partida sozinho',
  'setup.playMode': 'Jogar {mode}',
  'setup.playTodayHole': 'Jogar o buraco de hoje',
  'setup.playTodayDeal': 'Jogar o baralho de hoje',
  'setup.eyebrow.pickMode': 'escolha o modo',
  'setup.eyebrow.pickTable': 'escolha sua mesa',
  'setup.eyebrow.callSuit': 'cante o naipe',
  'setup.eyebrow.playOntoHole': 'jogue no buraco',
  'setup.eyebrow.clearTable': 'limpe a mesa',
  'setup.eyebrow.pickPile': 'escolha sua pilha',
  'setup.eyebrow.handsOnPile': 'mãos na pilha',
  'setup.eyebrow.claimCrown': 'reclame a coroa',
  'setup.eyebrow.dodgeEverything': 'desvie de tudo',
  'setup.eyebrow.chooseBoard': 'escolha o tabuleiro',
  'setup.eyebrow.pairToThirteen': 'emparelhe até treze',
  'setup.modes.golfHole': 'Buraco de golfe',
  'setup.modes.klondikeDeal': 'Baralho de Klondike',
  'setup.modes.freecellDeal': 'Baralho de FreeCell',
  'setup.modes.spiderDeal': 'Baralho de Spider',
  'setup.modes.pyramidDeal': 'Baralho de Pirâmide',
  'setup.modes.cribbageFormat': 'Formato de cribbage',
  'setup.busy.settingTable': 'Preparando a mesa…',
  'setup.busy.shuffling': 'Embaralhando…',
  'setup.busy.shufflingPack': 'Embaralhando o baralho…',
  'setup.busy.stackingPiles': 'Empilhando os montes…',
  'setup.busy.layingTable': 'Montando a mesa…',
  'setup.busy.cuttingDeal': 'Cortando para o baralho…',
  'setup.busy.shufflingPile': 'Embaralhando a pilha…',
  'setup.busy.shufflingStacks': 'Embaralhando os montes…',
  'setup.busy.cuttingDeck': 'Cortando o baralho…',
  'setup.busy.settingPegs': 'Colocando as pecinhas…',
  'setup.busy.findingWinnable': 'Procurando um baralho ganhável…',
  'setup.busy.layingCards': 'Colocando as cartas…',
  'setup.youPlusBots_one': 'você + {count} bot',
  'setup.youPlusBots_other': 'você + {count} bots',
  'setup.youPlusBotsReflexes_one': 'você + {count} bot com reflexos de verdade',
  'setup.youPlusBotsReflexes_other': 'você + {count} bots com reflexos de verdade',
  'setup.youPlusOthersHand_one':
    'você mais {count} outra pessoa — o tamanho da mão muda a cada rodada',
  'setup.youPlusOthersHand_other':
    'você mais {count} outras pessoas — o tamanho da mão muda a cada rodada',
  'setup.youPlusOpponents_one': 'você mais {count} oponente — o último monte de pé ganha',
  'setup.youPlusOpponents_other': 'você mais {count} oponentes — o último monte de pé ganha',
  'setup.youPlusSpite': 'você mais {count} — ganha quem esvaziar primeiro o monte de pagamento',
  'setup.youPlusPresident': 'você + {count} rivais — a escada inteira, coroas inclusas',
  'setup.scopaAlwaysFour': 'Scopone é sempre de quatro, em duplas',
  'setup.scopaOthers': 'você mais {count} outros — em quatro e em seis joga-se em duplas',
  'setup.partnershipsValue': '4 jogadores · duas duplas',
  'setup.partnershipsHint':
    'você + um bot parceiro na frente, dois bots adversários ao lado — ou traga três amigos',
  'setup.heartsSeats': '4 jogadores',
  'setup.heartsHint': 'você + 3 bots no solo · todas as cadeiras ocupadas nas salas de amigos',
  'setup.ginSeats': '2 — cara a cara',
  'setup.ginHint': 'você + um bot',
  'setup.cribbageSeats': 'Dois lugares · você dá as cartas primeiro',
  'setup.cribbageHint': 'quem dá as cartas alterna a cada mão',
  'setup.note.friendRooms':
    'As salas de amigos usam os mesmos códigos de quatro caracteres, a mesma sincronização ao vivo e o mesmo fluxo de reconexão de qualquer mesa do parlour.',
  'setup.note.friendRoomsGin':
    'As salas de amigos usam os mesmos códigos de quatro caracteres e a mesma sincronização ao vivo de qualquer mesa do parlour.',
  'setup.note.friendRoomsBlitz':
    'As salas de amigos usam os mesmos códigos de quatro caracteres, a mesma sincronização ao vivo e o mesmo fluxo de reconexão do Blitz.',
  'setup.note.friendRoomsEight':
    'As salas de amigos usam os mesmos códigos de quatro caracteres, a mesma sincronização ao vivo e o mesmo fluxo de reconexão de qualquer mesa do parlour — com lugar para até oito cadeiras.',
  'setup.note.blitzRooms':
    'As salas se jogam com amigos por um código compartilhado — no solo você senta com os bots acima.',
  'setup.note.hearts': 'Ganha a pontuação mais baixa — desvie dos copas e tema a dama.',
  'setup.note.poker': 'As fichas só marcam o placar — não tem nada para comprar e nada para sacar.',
  'setup.note.ratscrew':
    'Os tapas correm em tempo real — a primeira palma na pilha leva. Um tapa errado queima a carta de cima.',
  'setup.note.ohhell':
    'Cante exatamente o que você vai fazer. As salas de amigos usam os mesmos códigos de quatro caracteres, a mesma sincronização ao vivo e o mesmo fluxo de reconexão de qualquer mesa do parlour.',
  'setup.note.scopa':
    'Limpe a mesa para marcar uma scopa. As salas de amigos usam os mesmos códigos de quatro caracteres, a mesma sincronização ao vivo e o mesmo fluxo de reconexão de qualquer mesa do parlour.',
  'setup.note.spite':
    'Suba o centro do ás à dama. As salas de amigos usam os mesmos códigos de quatro caracteres, a mesma sincronização ao vivo e o mesmo fluxo de reconexão de qualquer mesa do parlour.',
  'setup.note.cribbage':
    'As salas de amigos compartilham o mesmo registro de replay do anfitrião e o mesmo fluxo de reconexão do resto do Parlour.',
  'setup.note.cribbageMatch':
    'O match dá para jogar sozinho; as salas de amigos jogam uma corrida completa até 121.',
  'setup.cribbageRoomsLocked': 'As salas de amigos por enquanto jogam uma corrida completa até 121',
  'setup.todayDate': 'Hoje · {date}',
  'setup.dayStreak_one': '{count} dia de sequência',
  'setup.dayStreak_other': '{count} dias de sequência',
  'setup.golf.posted': 'Buraco diário registrado',
  'setup.golf.waiting': 'Seu buraco diário está esperando',
  'setup.golf.best': 'Melhor: {score} restantes · {time}',
  'setup.golf.waitingHint':
    'Um buraco Clássico determinístico, o mesmo para todo mundo. Ganha quem deixar menos cartas.',
  'setup.golf.holes': 'Buracos',
  'setup.golf.clears': 'Limpezas',
  'setup.golf.bestScore': 'Melhor pontuação',
  'setup.golf.bestClear': 'Melhor limpeza',
  'setup.golf.note':
    'Sozinho e offline. Desfazer e dicas ficam no seu aparelho; sem conta nem código de sala.',
  'setup.klondike.cleared': 'Mesa diária limpa',
  'setup.klondike.waiting': 'Sua mesa diária está esperando',
  'setup.klondike.best': 'Melhor: {moves} jogadas · {time}',
  'setup.klondike.waitingWinnable':
    'Um baralho de comprar três determinístico, o mesmo para todo mundo, conferido do começo ao fim antes de chegar até você.',
  'setup.klondike.waitingShuffle':
    'Um baralho de comprar três determinístico, o mesmo para todo mundo, direto do embaralhamento — mais ou menos uma mesa em cinco não dá para limpar.',
  'setup.klondike.deals': 'Baralhos',
  'setup.klondike.bestMoves': 'Melhores jogadas',
  'setup.klondike.bestTime': 'Melhor tempo',
  'setup.klondike.winnableOnly': 'Só baralhos ganháveis',
  'setup.klondike.winnableOn':
    'Cada mesa é resolvida do começo ao fim antes de ser dada, então uma derrota é sempre sua para desfazer.',
  'setup.klondike.winnableOff':
    'Embaralhamentos puros, mesas mortas e tudo — do jeito que o Klondike sempre deu as cartas.',
  'setup.klondike.note':
    'Sozinho e offline. Desfazer, dicas e o autoacabamento seguro ficam no seu aparelho; sem conta nem código de sala.',
  'setup.freecell.cleared': 'Mesa diária limpa',
  'setup.freecell.waiting': 'Sua mesa diária está esperando',
  'setup.freecell.best': 'Melhor: {moves} jogadas · {time}',
  'setup.freecell.waitingHint':
    'Um baralho de quatro células determinístico, o mesmo para todo mundo. Estacione cartas, desça em cores alternadas e mande cada naipe para casa.',
  'setup.freecell.deals': 'Baralhos',
  'setup.freecell.bestMoves': 'Melhores jogadas',
  'setup.freecell.bestTime': 'Melhor tempo',
  'setup.freecell.note':
    'Sozinho e offline. Desfazer, dicas e o autoacabamento seguro ficam no seu aparelho; sem conta nem código de sala.',
  'setup.spider.cleared': 'Mesa diária limpa',
  'setup.spider.waiting': 'Sua mesa diária está esperando',
  'setup.spider.best': 'Melhor: {moves} jogadas · {time}',
  'setup.spider.waitingHint':
    'Um baralho de dois naipes determinístico, o mesmo para todo mundo. Desça, tire Reis-a-Ás do mesmo naipe e limpe as oito sequências.',
  'setup.spider.deals': 'Baralhos',
  'setup.spider.bestMoves': 'Melhores jogadas',
  'setup.spider.bestTime': 'Melhor tempo',
  'setup.spider.note':
    'Sozinho e offline. Desfazer e dicas ficam no seu aparelho; sem conta nem código de sala.',
  'setup.pyramid.posted': 'Pirâmide diária registrada',
  'setup.pyramid.waiting': 'Sua pirâmide diária está esperando',
  'setup.pyramid.best': 'Melhor: {score} restantes · {time}',
  'setup.pyramid.waitingHint':
    'Uma pirâmide Clássica determinística, a mesma para todo mundo. Emparelhe valores que somam 13. Quanto menos sobrar, melhor.',
  'setup.pyramid.pyramids': 'Pirâmides',
  'setup.pyramid.clears': 'Limpezas',
  'setup.pyramid.bestScore': 'Melhor pontuação',
  'setup.pyramid.bestClear': 'Melhor limpeza',
  'setup.pyramid.note':
    'Sozinho e offline. Desfazer e dicas ficam no seu aparelho; sem conta nem código de sala.',

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

  // --- PWA status -----------------------------------------------------------
  'pwa.offline': 'Jogando offline',
  'pwa.offlineSolo': 'os jogos solo continuam funcionando',
  'pwa.updateReady': 'Uma mesa nova está pronta.',
  'pwa.refreshing': 'Atualizando…',
  'pwa.refresh': 'Atualizar',
  'pwa.dismissUpdate': 'Dispensar atualização',

  // --- scene ----------------------------------------------------------------
  'scene.label': 'Cena de fundo',
  'scene.campfire': 'Fogueira',
  'scene.casino': 'Cassino',
  'scene.snug': 'Aconchego',
};
