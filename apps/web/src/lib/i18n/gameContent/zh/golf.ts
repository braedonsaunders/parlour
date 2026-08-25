import type { GameCopy } from '../types';

/** Simplified Chinese copy for golf. Untranslated fields fall back to the pack's English. */
export const golfZh: GameCopy = {
  name: '高尔夫',
  subtitle: '快节奏单人纸牌',
  tagline: '向洞口打出相邻点数',
  description:
    '七列各五张，全部正面朝上。把与洞口相差一点的牌打出去，尽量连打，让草地上剩下的牌越少越好。',
  facts: ['1 人', '每日固定牌局', '可离线'],
  howToPlay: {
    summary: '快节奏单人耐心牌：七列各五张，全部可见，只有一个洞口。',
    objective: '清空草地上的每一张牌。剩下的牌就是你的分数——越低越好。',
    sections: [
      {
        heading: '发牌',
        body: ['七列各放五张正面朝上的牌。剩下十七张组成牌库。牌库最上面一张打开洞口。'],
      },
      {
        heading: '打进洞口',
        body: [
          '每列只能打最下面那张。当它与洞口相差一点时就可以打出去——8 可以接 7 或 9。花色和颜色都不重要。',
        ],
      },
      {
        heading: '翻牌库',
        body: [
          '如果草地上没有能打的牌，就把下一张牌库牌翻到洞口。旧的洞口牌被压住，不能再回来。没有回收。',
        ],
      },
      {
        heading: 'A 与 K',
        body: ['经典高尔夫把 A 和 K 当作死胡同。球道规则允许它们互相衔接，连打可以继续。'],
      },
      {
        heading: '计分',
        body: [
          '草地清空，或牌库用尽且再无合法打法时，这一洞结束。还留在列上的牌就是分数。零分就是清台。',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: '每日',
      tagline: '大家同一洞',
      description: '按日期播种的经典洞。可以重打、分享，或明天再来一局新桌。',
      facts: ['不循环', '每日同一局', '剩余越少越好'],
    },
    classic: {
      name: '经典',
      tagline: 'A 与 K 会卡住',
      description: '一局新的固定种子。A 和 K 是死胡同；牌库不会回收。',
      facts: ['不循环', '新牌局', '无回收'],
    },
    fairway: {
      name: '球道',
      tagline: 'A 可接 K',
      description: '同样快的一洞，但 A 和 K 可以互打，连打会更长。',
      facts: ['A–K 循环', '新牌局', '无回收'],
    },
  },
  fields: {
    wrap: {
      label: 'A 与 K 循环',
      group: '洞口',
      help: '经典高尔夫在 A 和 K 处停下。球道规则允许 A 和 K 互相打出。',
    },
  },
  presets: {
    classic: '经典',
    fairway: '球道',
  },
};
