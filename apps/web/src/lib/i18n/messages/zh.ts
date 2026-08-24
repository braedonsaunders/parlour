import type { Messages } from './en';

/**
 * Simplified Chinese — complete.
 *
 * `Messages` is derived from the English catalogue, so this object is a type
 * error the moment English gains a key it does not have. Nothing here is a
 * placeholder: a locale ships whole or not at all.
 *
 * Register: warm, plain, second person (你) — a cozy kitchen-table game, not a
 * manual. Mainland Simplified conventions; full-width punctuation; no spaces
 * between Chinese words.
 */
export const zh: Messages = {
  // --- shared chrome --------------------------------------------------------
  'common.back': '返回',
  'common.backArrow': '← 返回',
  'common.leaveArrow': '← 离开',
  'common.close': '关闭',
  'common.cancel': '取消',
  'common.quit': '退出',
  'common.you': '你',
  'common.loading': '加载中…',

  // --- home -----------------------------------------------------------------
  'home.eyebrow': '搬把椅子来',
  'home.tagline': '温馨的纸牌游戏引擎，来几局快牌，痛快赢几场。',
  'home.play': '开玩',
  'home.joinPrompt': '有房间码？加入牌桌 →',
  'home.shelfNote': '不断添新的纸牌游戏架',
  'home.profileLabel': '打开你的个人资料',
  'home.profileFallback': '个人资料',

  // --- sound ----------------------------------------------------------------
  'sound.mute': '静音',
  'sound.unmute': '取消静音',
  'sound.on': '声音已开',
  'sound.off': '声音已关',
  'sound.heading': '声音',
  'sound.playing': '牌桌上正在播放',
  'sound.waiting': '你第一次点按后开始',

  // --- language -------------------------------------------------------------
  'language.label': '语言',
  'language.change': '更改语言',
  'language.heading': '语言',
  'language.hint': '即时全局生效。你的选择会保存在这台设备上。',
  'language.current': '当前语言：{language}',

  // --- game shelf -----------------------------------------------------------
  'shelf.heading': '游戏架',
  'shelf.search': '搜索游戏…',
  'shelf.clearSearch': '清除游戏搜索',
  'shelf.gamesLabel': '游戏',
  'shelf.noMatch': '试试搜索吃墩、出完、拉米或拍牌这类玩法。',
  'shelf.moreSoon': '更多游戏即将上架。',
  'shelf.soon': '敬请期待',
  'shelf.resultsFound_one': '找到 {count} 个游戏',
  'shelf.resultsFound_other': '找到 {count} 个游戏',
  'shelf.readyToPlay': '{count} 个游戏随时可玩',
  'shelf.oneEngine': '一个引擎，千张牌桌。',

  // --- join -----------------------------------------------------------------
  'join.heading': '加入牌桌',
  'join.hint': '输入朋友分享给你的四个字符。',
  'join.codeLabel': '房间码，已输入 {entered}/{total}',
  'join.knocking': '正在敲门…',
  'join.submit': '搬把椅子来',
  'join.connecting': '正在安全连接…',
  'join.unreachable': '连不上牌桌 {code}。请检查房间码和网络连接。',
  'join.unreachableGeneric': '连不上那张牌桌。',
  'join.seated': '你已入座。房主发牌后牌桌就会开局。',

  // --- room lobby -----------------------------------------------------------
  'room.codeLabel': '房间码',
  'room.connected': '牌桌已连接',
  'room.reconnecting': '正在重连——你的座位还在',
  'room.finding': '正在寻找牌桌…',
  'room.copyLink': '复制链接',
  'room.copied': '已复制！',
  'room.shareTitle': '来我的客厅玩牌',
  'room.seatsLabel': '牌桌座位',
  'room.ready': '准备好了',
  'room.rejoining': '正在重新加入…',
  'room.openChair': '空座位',
  'room.start': '开始一局',
  'room.sendFailed': '这步操作没能发出去。',
  'room.waitingFor_one': '还差 {count} 人',
  'room.waitingFor_other': '还差 {count} 人',
  'room.shareText': '房间 {code}',

  // --- table ----------------------------------------------------------------
  'table.menu': '牌桌菜单',
  'table.dealing': '发牌中…',

  // --- match end ------------------------------------------------------------
  'matchEnd.playAgain': '再来一局',
  'matchEnd.complete': '本局结束',
  'matchEnd.none': '还没有对局记录',
  'matchEnd.noneHint': '在牌桌上打完一局，领奖台就会出现在这里。',
  'matchEnd.playSolo': '单人玩',

  // --- profile --------------------------------------------------------------
  'profile.heading': '个人资料',
  'profile.identity': '身份',
  'profile.yourName': '你的名字',
  'profile.namePlaceholder': '匿名常客',
  'profile.pickAvatar': '选一个头像',
  'profile.character': '角色',
  'profile.lifetime': '你的牌桌生涯',
  'profile.lifetimeLabel': '生涯统计',
  'profile.resetStats': '重置统计',
  'profile.confirmReset': '再点一次确认',
  'profile.regulars': '你的老对手',
  'profile.regularsHint': '交手记录只存在本机，与每位朋友的 Parlour 资料一一对应。',
  'profile.regularsLabel': '对战历史',
  'profile.clearHistory': '清除历史',
  'profile.confirmForget': '再点一次清除',
  'profile.noRegulars': '和朋友打完一局，你们的交锋记录就会出现在这里。',
  'profile.comfort': '舒适度',
  'profile.comfortLabel': '无障碍',
  'profile.reduceMotion': '减少动态效果',
  'profile.reduceMotionHint': '让各处的庆祝动画和背景动态都安静下来。',

  // --- stats ----------------------------------------------------------------
  'stats.games': '对局数',
  'stats.wins': '胜场',
  'stats.winRate': '胜率',
  'stats.blitzes': 'Blitz 次数',
  'stats.knockSuccess': '敲门成功率',
  'stats.bestStreak': '最长连胜',

  // --- setup ----------------------------------------------------------------
  'setup.botSkill': '机器人水平',
  'setup.easy': '简单',
  'setup.medium': '中等',
  'setup.hard': '困难',
  'setup.seats': '座位',
  'setup.seatCount_one': '{count} 个座位',
  'setup.seatCount_other': '{count} 个座位',

  // --- install --------------------------------------------------------------
  'install.add': '添加',
  'install.install': '安装',
  'install.installApp': '安装应用',
  'install.addToHome': '添加到主屏幕',
  'install.either': '安装应用或添加到主屏幕',
  'install.closeInstructions': '关闭安装说明',
  'install.shareStep': '点按浏览器工具栏中的“分享”。',
  'install.menuStep': '打开浏览器菜单。',
  'install.tapEither': '点按{add}或{install}。',

  // --- scene ----------------------------------------------------------------
  'scene.label': '背景场景',
  'scene.campfire': '篝火',
  'scene.casino': '赌场',
  'scene.snug': '小暖屋',
};
