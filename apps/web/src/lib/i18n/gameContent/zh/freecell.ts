import type { GameCopy } from '../types';

/** Simplified Chinese copy for freecell. Untranslated fields fall back to the pack's English. */
export const freecellZh: GameCopy = {
  name: '空当接龙',
  subtitle: '明牌单人纸牌',
  tagline: '清空每日牌桌',
  description:
    '八列牌全部翻开。把多出来的牌停在空当里，再把四种花色从A到K送回家。同一天，人人面对同一副每日牌局。',
  facts: ['1人', '每日固定牌局', '离线可玩'],
  howToPlay: {
    summary: '经典的明牌单人纸牌，以固定种子发牌——可以是全新牌局，也可以是每日牌局。',
    objective: '把四个花色的收牌堆都从A叠到K，每堆一个花色。',
    sections: [
      {
        heading: '发牌',
        body: ['八列牌全部翻开。前四列各七张，后四列各六张。'],
      },
      {
        heading: '空当',
        body: [
          '每个空当只能停一张牌。经典模式四个空当；轻松模式六个。空当里的牌可以回到牌列或送进收牌堆。',
        ],
      },
      {
        heading: '叠放牌列',
        body: [
          '按点数递减、红黑相间地放牌。一串连牌可以整体移动，但要受空当超级移动上限限制。任意牌——不只是K——都能进入空列。',
        ],
      },
      {
        heading: '收牌堆',
        body: ['每个花色从A开始，一路叠到K。如果需要解开一条线，收牌堆里的牌也可以拿回牌列。'],
      },
      {
        heading: '清空牌桌',
        body: ['把每张牌都送回家。集齐四个收牌堆即获胜。'],
      },
    ],
  },
  modes: {
    daily: {
      name: '每日',
      tagline: '人人同一局',
      description: '按日期生成种子的经典牌局。重打它、分享它，或者明天再来一张新牌桌。',
      facts: ['四个空当', '每日同一局', '空列可放任意牌'],
    },
    classic: {
      name: '经典',
      tagline: '四个空当',
      description: '全新种子牌局，带四个单牌空当。',
      facts: ['四个空当', '全新牌局', '空列可放任意牌'],
    },
    relaxed: {
      name: '轻松',
      tagline: '六个空当',
      description: '更温和的全新牌局：多两个空当，长串更好挪。',
      facts: ['六个空当', '全新牌局', '空列可放任意牌'],
    },
  },
  fields: {
    freeCells: {
      label: '空当数量',
      group: '发牌',
      options: {
        '4': '四个空当——经典',
        '6': '六个空当——轻松',
      },
      help: '每个空当停一张牌。轻松模式再加两个空当。',
    },
  },
  presets: {
    classic: '经典',
    relaxed: '轻松',
  },
};
