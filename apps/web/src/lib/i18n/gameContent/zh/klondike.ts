import type { GameCopy } from '../types';

/** Simplified Chinese copy for klondike. Untranslated fields fall back to the pack's English. */
export const klondikeZh: GameCopy = {
  name: '空当接龙式纸牌（Klondike 单人纸牌）',
  subtitle: '经典单人纸牌',
  tagline: '清空每日牌桌',
  description:
    '七列牌按红黑相间从大到小叠放，翻动牌堆，把四种花色从A到K送回家。同一天，人人面对同一副每日牌局。',
  facts: ['1人', '每日固定牌局', '离线可玩'],
  howToPlay: {
    summary: '经典的七列单人纸牌，以固定种子发牌——可以是全新牌局，也可以是每日牌局。',
    objective: '把四个花色的收牌堆都从A叠到K，每堆一个花色。',
    sections: [
      {
        heading: '发牌',
        body: ['七列牌列分别放一到七张牌。每列只有顶牌翻开；其余二十四张组成摸牌堆。'],
      },
      {
        heading: '叠放牌列',
        body: [
          '按点数递减、红黑相间地放牌。一串翻开的连牌可以整体移动。只有K——单独一张或领着一串——才能进入空列。',
        ],
      },
      {
        heading: '翻牌与回收',
        body: [
          '经典模式每次从摸牌堆翻三张；轻松模式每次翻一张。只有废牌堆的顶牌可以移动。摸牌堆空了，就把废牌堆原样翻回去，不洗牌。翻牌次数不限。',
        ],
      },
      {
        heading: '收牌堆',
        body: ['每个花色从A开始，一路叠到K。如果需要解开一条线，收牌堆里的牌也可以拿回牌列。'],
      },
      {
        heading: '清空牌桌',
        body: ['移走一列的最后一张翻开的牌，新露出的牌会自动翻开。集齐四个收牌堆即获胜。'],
      },
    ],
  },
  modes: {
    daily: {
      name: '每日',
      tagline: '人人同一局',
      description: '按日期生成种子的翻三张牌局。重打它、分享它，或者明天再来一张新牌桌。',
      facts: ['翻三张', '每日同一局', '翻牌不限次'],
    },
    classic: {
      name: '经典',
      tagline: '每次翻三张',
      description: '全新种子牌局，每次从摸牌堆翻三张。',
      facts: ['翻三张', '全新牌局', '翻牌不限次'],
    },
    relaxed: {
      name: '轻松',
      tagline: '每次翻一张',
      description: '更温和的全新牌局：摸牌堆每次只来一张。',
      facts: ['翻一张', '全新牌局', '翻牌不限次'],
    },
  },
  fields: {
    drawCount: {
      label: '摸牌方式',
      group: '发牌',
      options: {
        '3': '翻三张——经典',
        '1': '翻一张——轻松',
      },
      help: '每次翻一张或三张。废牌堆可以回收，翻牌次数不限。',
    },
  },
  presets: {
    classic: '经典',
    relaxed: '轻松',
  },
};
