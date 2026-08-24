import type { Messages } from './en';

/** French — complete. */
export const fr: Messages = {
  // --- shared chrome --------------------------------------------------------
  'common.back': 'Retour',
  'common.backArrow': '← Retour',
  'common.leaveArrow': '← Quitter',
  'common.close': 'Fermer',
  'common.cancel': 'Annuler',
  'common.quit': 'Quitter',
  'common.you': 'Toi',
  'common.loading': 'Chargement…',

  // --- home -----------------------------------------------------------------
  'home.eyebrow': 'prends une chaise',
  'home.tagline':
    'Un moteur de jeux de cartes cosy pour des manches rapides et des victoires bruyantes.',
  'home.play': 'Jouer',
  'home.joinPrompt': 'Tu as un code de salle ? Rejoins une table →',
  'home.shelfNote': 'une étagère de jeux de cartes qui grandit',
  'home.profileLabel': 'Ouvrir ton profil',
  'home.profileFallback': 'Profil',

  // --- sound ----------------------------------------------------------------
  'sound.mute': 'Couper le son',
  'sound.unmute': 'Remettre le son',
  'sound.on': 'Son activé',
  'sound.off': 'Son coupé',
  'sound.heading': 'Son',
  'sound.playing': 'joue à la table',
  'sound.waiting': 'démarre à ton premier toucher',

  // --- language -------------------------------------------------------------
  'language.label': 'Langue',
  'language.change': 'Changer de langue',
  'language.heading': 'Langue',
  'language.hint': "S'applique partout, tout de suite. Ton choix est gardé sur cet appareil.",
  'language.current': 'Langue actuelle : {language}',

  // --- game shelf -----------------------------------------------------------
  'shelf.heading': "L'étagère des jeux",
  'shelf.search': 'Chercher un jeu…',
  'shelf.clearSearch': 'Effacer la recherche',
  'shelf.gamesLabel': 'Jeux',
  'shelf.noMatch': 'Essaie un style comme levées, défausse, rami ou bataille.',
  'shelf.moreSoon': "D'autres jeux arrivent bientôt sur l'étagère.",
  'shelf.soon': 'Bientôt',
  'shelf.resultsFound_one': '{count} jeu trouvé',
  'shelf.resultsFound_other': '{count} jeux trouvés',
  'shelf.readyToPlay': '{count} jeux prêts à jouer',
  'shelf.oneEngine': 'Un moteur, plein de tables.',

  // --- join -----------------------------------------------------------------
  'join.heading': 'Rejoindre une table',
  'join.hint': 'Tape les quatre caractères que ton ami a partagés.',
  'join.codeLabel': 'Code de salle, {entered} sur {total} saisis',
  'join.knocking': 'On frappe…',
  'join.submit': 'Prendre une chaise',
  'join.connecting': 'Connexion sécurisée…',
  'join.unreachable': 'Impossible de joindre la table {code}. Vérifie le code et ta connexion.',
  'join.unreachableGeneric': 'Impossible de joindre cette table.',
  'join.seated': 'Tu as une place. La table ouvre quand l’hôte donne.',

  // --- room lobby -----------------------------------------------------------
  'room.codeLabel': 'Code de salle',
  'room.connected': 'La table est connectée',
  'room.reconnecting': 'Reconnexion — ta place est gardée',
  'room.finding': 'Recherche de la table…',
  'room.copyLink': 'Copier le lien',
  'room.copied': 'Copié !',
  'room.shareTitle': 'Rejoins mon salon',
  'room.seatsLabel': 'Places à la table',
  'room.ready': 'Prêt',
  'room.rejoining': 'Retour à la table…',
  'room.openChair': 'Chaise libre',
  'room.start': 'Lancer la partie',
  'room.sendFailed': "Le coup n'a pas pu être envoyé.",
  'room.waitingFor_one': 'En attente de {count} joueur',
  'room.waitingFor_other': 'En attente de {count} joueurs',
  'room.shareText': 'Salle {code}',

  // --- table ----------------------------------------------------------------
  'table.menu': 'Menu de la table',
  'table.dealing': 'La donne…',

  // --- match end ------------------------------------------------------------
  'matchEnd.playAgain': 'Rejouer',
  'matchEnd.complete': 'Partie terminée',
  'matchEnd.none': 'Aucune partie enregistrée',
  'matchEnd.noneHint': 'Termine un jeu à la table et le podium se remplira ici.',
  'matchEnd.playSolo': 'Jouer en solo',

  // --- profile --------------------------------------------------------------
  'profile.heading': 'Profil',
  'profile.identity': 'Identité',
  'profile.yourName': 'Ton nom',
  'profile.namePlaceholder': 'Habitué anonyme',
  'profile.pickAvatar': 'Choisis un avatar',
  'profile.character': 'Personnage',
  'profile.lifetime': 'Une vie à la table',
  'profile.lifetimeLabel': 'Statistiques de toujours',
  'profile.resetStats': 'Remettre à zéro',
  'profile.confirmReset': 'Touche encore pour confirmer',
  'profile.regulars': 'Tes habitués',
  'profile.regularsHint': 'Duels locaux, liés au profil Parlour de chaque ami.',
  'profile.regularsLabel': 'Historique des duels',
  'profile.clearHistory': "Effacer l'historique",
  'profile.confirmForget': 'Touche encore pour oublier',
  'profile.noRegulars': 'Termine une partie avec un ami et ta rivalité apparaîtra ici.',
  'profile.comfort': 'Confort',
  'profile.comfortLabel': 'Accessibilité',
  'profile.reduceMotion': 'Réduire les animations',
  'profile.reduceMotionHint': 'Calme les célébrations et les mouvements de fond partout.',

  // --- stats ----------------------------------------------------------------
  'stats.games': 'Parties',
  'stats.wins': 'Victoires',
  'stats.winRate': 'Taux de victoire',
  'stats.blitzes': 'Blitz',
  'stats.knockSuccess': 'Knock réussis',
  'stats.bestStreak': 'Meilleure série',

  // --- setup ----------------------------------------------------------------
  'setup.botSkill': 'Niveau des bots',
  'setup.easy': 'Facile',
  'setup.medium': 'Moyen',
  'setup.hard': 'Difficile',
  'setup.seats': 'Places',
  'setup.seatCount_one': '{count} place',
  'setup.seatCount_other': '{count} places',

  // --- install --------------------------------------------------------------
  'install.add': 'Ajouter',
  'install.install': 'Installer',
  'install.installApp': "Installer l'app",
  'install.addToHome': "Ajouter à l'écran d'accueil",
  'install.either': "Installer l'app ou Ajouter à l'écran d'accueil",
  'install.closeInstructions': "Fermer les instructions d'installation",
  'install.shareStep': 'Touche Partager dans la barre de ton navigateur.',
  'install.menuStep': 'Ouvre le menu de ton navigateur.',
  'install.tapEither': 'Touche {add} ou {install}.',

  // --- scene ----------------------------------------------------------------
  'scene.label': 'Décor de fond',
  'scene.campfire': 'Feu de camp',
  'scene.casino': 'Casino',
  'scene.snug': 'Salon cosy',
};
