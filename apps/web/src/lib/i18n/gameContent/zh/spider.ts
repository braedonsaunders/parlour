import type { GameCopy } from '../types';

/** Simplified Chinese copy for spider. Untranslated fields fall back to the pack's English. */
export const spiderZh: GameCopy = {
  name: '蜘蛛纸牌',
  subtitle: '双副单人纸牌',
  tagline: '清掉八条同花顺',
  description:
    '十列按点数递减接龙，只有同花色的连续牌组可以一起移动，把每条从 K 到 A 的同花顺收走。每天同一副双花色牌局等着所有人。',
  facts: ['1 人', '每日固定牌局', '可离线'],
  howToPlay: {
    summary: '微软风格的双副蜘蛛：十列、五排库存，要清掉八条同花顺。',
    objective: '把八条同花色的 K 到 A 收进基础堆。',
    sections: [
      {
        heading: '发牌',
        body: [
          '发出十列：前四列各六张，其余各五张。每列只有最上面一张正面朝上。剩下五十张是库存，分成五排，每排十张。',
        ],
      },
      {
        heading: '接龙',
        body: [
          '按点数递减放置，花色不限。只有同花色的连续递减牌组可以整组移动。空列可以接受任意一张或一组牌。',
        ],
      },
      {
        heading: '发一排',
        body: ['点击牌库，给每一列发一张正面朝上的牌。任何一列为空，或库存不足十张时，不能发牌。'],
      },
      {
        heading: '清掉一条花色',
        body: [
          '当一列上凑齐同花色的 K 到 A 时，这一整组会在同一步里收进基础堆。新露出来的背面牌会自动翻开。',
        ],
      },
      {
        heading: '花色',
        body: [
          '轻松模式把 104 张都画成黑桃。经典（每日）用黑桃和红心。困难用全部花色，同花连续组更少。',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: '每日',
      tagline: '大家同一桌',
      description: '按日期播种的双花色牌局。可以重打、分享，或明天再来一局新桌。',
      facts: ['两种花色', '每日同一局', '五排库存'],
    },
    relaxed: {
      name: '轻松',
      tagline: '全是黑桃',
      description: '更温和的新牌局：每张都是黑桃，连续组很容易凑齐。',
      facts: ['一种花色', '新牌局', '五排库存'],
    },
    classic: {
      name: '经典',
      tagline: '两种花色',
      description: '一局新的固定种子，画成黑桃和红心——微软的默认规则。',
      facts: ['两种花色', '新牌局', '五排库存'],
    },
    hard: {
      name: '困难',
      tagline: '四种花色',
      description: '完整的双副牌。同花连续组很少，每一次收走都得自己挣。',
      facts: ['四种花色', '新牌局', '五排库存'],
    },
  },
  fields: {
    suitCount: {
      label: '花色',
      group: '发牌',
      options: {
        '1': '一种花色 — 轻松',
        '2': '两种花色 — 经典',
        '4': '四种花色 — 困难',
      },
      help: '单花色全是黑桃。经典用黑桃和红心。困难用全部花色。',
    },
  },
  presets: {
    relaxed: '轻松',
    classic: '经典',
    hard: '困难',
  },
};
