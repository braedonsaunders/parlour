import type { GameCopy } from '../types';

/** Simplified Chinese copy for ratscrew. Untranslated fields fall back to the pack's English. */
export const ratscrewZh: GameCopy = {
  name: '拍七',
  subtitle: '拍牌游戏',
  tagline: '抢先拍下牌堆',
  description:
    '轮流向公共牌堆翻牌，抢在所有人之前拍下对子、三明治和更多牌型。实时反应、花牌挑战、拍错烧牌。',
  facts: ['2–4名玩家', '实时抢拍', '单人或好友'],
  howToPlay: {
    summary: '轮流向公共牌堆翻牌，靠抢拍赢走桌上的每一张牌。',
    objective:
      '赢走全部52张牌。靠抢先拍下牌型，或靠打出对手接不住的花牌来壮大自己的牌叠。等其他人都没牌了——或被人一拍拍回局里——你就赢下整局。',
    sections: [
      {
        heading: '翻牌',
        body: [
          '从你开始，玩家轮流把自己面朝下牌叠顶上的牌放到中央牌堆上，翻牌时朝外翻，谁都别想偷看。',
          '牌叠见底就不用再翻了——但开着“拍回局里”时，一记幸运抢拍就能让你立刻重返牌局。',
        ],
      },
      {
        heading: '花牌与挑战',
        body: ['打出花牌会向下一位玩家发起挑战：'],
        bullets: [
          { label: 'J', text: '对方有1次机会翻出新的花牌' },
          { label: 'Q', text: '2次机会' },
          { label: 'K', text: '3次机会' },
          { label: 'A', text: '4次机会' },
        ],
      },
      {
        heading: '挑战结算',
        body: [
          '被挑战者每翻出一张非花牌，就烧掉一次机会。',
          '翻出了新花牌？挑战带着全新的机会传给下一位玩家。',
          '机会用光了？打出花牌的玩家把整个中央牌堆收进自己牌叠底下，并翻出下一张。',
        ],
      },
      {
        heading: '抢拍',
        body: [
          '可拍牌型一落上牌堆，所有人立刻抢着去拍。第一个有效拍击赢走整个中央牌堆，并翻出下一张。',
          '牌型生效时会开一个短暂的抢拍窗口——在窗口关闭前猛砸SLAP按钮！',
        ],
        bullets: [
          { label: '对子', text: '两张同点数的牌紧挨着（7♦ 7♣）' },
          { label: '三明治', text: '同点数中间隔一张牌（7♦ Q♠ 7♥）' },
          { label: '联姻', text: 'K和Q紧挨着，顺序不限（K♦ Q♠）——房间规则开关' },
          { label: '凑十', text: '两张相邻数字牌相加为十（3♦ 7♠）——房间规则开关' },
          { label: '首尾相应', text: '顶牌与牌堆最底下那张同点数——房间规则开关' },
          { label: '顺子', text: '连续三个点数递增或递减（4-5-6或9-8-7）——房间规则开关' },
        ],
      },
      {
        heading: '拍错',
        body: [
          '没有牌型生效时乱拍要付出代价：开着“拍错烧牌”时，你的顶牌会被塞到牌堆底下作为惩罚。手抖是要花钱的——盯紧牌，别管观众。',
        ],
      },
      {
        heading: '房间规则',
        body: ['开局前在房间设置里调好混乱程度：'],
        bullets: [
          { label: '对子/三明治', text: '经典抢拍牌型，默认都开启' },
          { label: '联姻/凑十/首尾/顺子', text: '额外牌型，经典牌桌默认全关' },
          { label: '拍错烧一张牌', text: '默认开启；关掉后只有生效的牌型才能拍' },
          { label: '出局可拍回', text: '空手玩家仍可拍下生效牌型，赢走牌堆重返牌局' },
          { label: '抢拍窗口', text: '竞速保持开放的时长——越短越凶残' },
        ],
      },
      {
        heading: '牌桌礼仪',
        body: [
          '赢下牌堆的玩家把它不洗牌直接塞到自己牌叠底下，并翻出下一张。最后握有全部牌的玩家赢下整局。',
          '一小段宽限时间让远程抢拍保持公平：牌桌会等窗口过后一拍，才宣布关闭。',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: '经典抢拍',
      tagline: '对子与三明治',
      description: '酒馆标准：快速翻牌，盯紧对子和三明治，在窗口关闭前拍下。',
      facts: ['拍窗1.2秒', '拍错烧牌', '约8分钟'],
    },
    'quick-reflex': {
      name: '极速反应',
      tagline: '凶残窗口',
      description: '同样的经典牌型，扳机更敏感——抢拍窗口0.7秒就砰然关闭。',
      facts: ['拍窗0.7秒', '眼尖者进', '约6分钟'],
    },
    slaphappy: {
      name: '拍牌狂欢',
      tagline: '牌型全开',
      description: '联姻、凑十、首尾相应和顺子，全部叠加在经典之上。混乱，暖光，震耳欲聋。',
      facts: ['全部牌型', '拍窗0.8秒', '约5分钟'],
    },
  },
  fields: {
    doubles: { label: '对子' },
    sandwiches: { label: '三明治' },
    marriage: { label: '联姻（K+Q）' },
    tens: { label: '凑十' },
    topBottom: { label: '首尾相应' },
    runs: { label: '顺子' },
    misSlapBurn: { label: '拍错烧一张牌' },
    slapBackIn: { label: '出局可拍回' },
    slapWindowMs: { label: '抢拍窗口' },
  },
  presets: {
    classic: '经典抢拍',
    'quick-reflex': '极速反应',
    slaphappy: '拍牌狂欢',
  },
};
