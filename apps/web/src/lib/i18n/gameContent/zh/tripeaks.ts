import type { GameCopy } from '../types';

/** Chinese copy for tripeaks. Untranslated fields fall back to the pack's English. */
export const tripeaksZh: GameCopy = {
  name: 'TriPeaks',
  subtitle: '清空三座牌峰',
  tagline: '打出与坑位相差一点的牌',
  description:
    '十八张牌组成三座牌峰，全部正面朝上。清空压着的牌来解锁它，把牌连打进坑位，清空整座牌峰。',
  facts: ['1 人游戏', '每日定局牌峰', '离线'],
  howToPlay: {
    summary: '单人纸牌游戏：三座共十八张牌的牌峰，全部正面朝上，还有一叠翻到唯一坑位上的余牌。',
    objective: '清空牌峰上所有的牌。剩下的牌就是你的分数——越少越好。',
    sections: [
      {
        heading: '发牌',
        body: [
          '三座牌峰共十八张牌，正面朝上分四层摆放。九张牌的底层永远是空的，可以直接打出。剩下的三十四张牌是余牌堆，第一张会翻开成为坑位。',
        ],
      },
      {
        heading: '空闲的牌',
        body: [
          '一张牌只要压在它上面的两张牌都被清走，就会变成空闲的牌。只有空闲的牌能移动——还被压着的牌要等它下面的牌先清空。',
        ],
      },
      {
        heading: '打到坑位上',
        body: [
          '当一张空闲的牌与坑位只差一点数时就能打出——8 可以接 7 或 9。花色和颜色都无所谓。能连打多少就连打多少。',
        ],
      },
      {
        heading: '翻余牌堆',
        body: [
          '如果牌峰上没有能打的牌，就翻开余牌堆的下一张盖到坑位上。原来坑位上的牌会被压在下面。',
        ],
      },
      {
        heading: 'A、K 和余牌堆',
        body: [
          '经典三峰把 A 和 K 当成死路，余牌堆用完就不会回来。轻松模式让 A 和 K 可以互相衔接，余牌堆用完后还能把坑位洗回余牌堆一次。',
        ],
      },
      {
        heading: '计分',
        body: [
          '当牌峰清空，或者没有牌能打且余牌堆无法再补充时，牌局结束。留在牌峰上的牌就是你的分数，零分代表清空。',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: '每日',
      tagline: '所有人打同一局',
      description: '按日期定局的经典牌局，每个人都一样。可以重打、分享，或者明天再来挑战新的一局。',
      facts: ['不可衔接', '每天同一局', '剩得越少越好'],
    },
    classic: {
      name: '经典',
      tagline: 'A 和 K 是死路',
      description: '每局随机发牌。A 和 K 是死路，余牌堆用完就不会回来。',
      facts: ['不可衔接', '每局随机', '不能回收'],
    },
    relaxed: {
      name: '轻松',
      tagline: 'A 可以衔接 K',
      description: '同样是三座牌峰，但 A 和 K 可以互相打出，坑位用完的余牌堆还能回收一次。',
      facts: ['A–K 可衔接', '每局随机', '可回收一次'],
    },
  },
  fields: {
    wrap: {
      label: 'A 可以衔接 K',
      group: '坑位',
      help: '经典三峰在 A 和 K 处断开。轻松模式让 A 和 K 可以互相打出。',
    },
    recycle: {
      label: '回收坑位',
      group: '余牌堆',
      help: '余牌堆用完后，把坑位（除最上面那张）洗回余牌堆一次。',
    },
  },
  presets: {
    classic: '经典',
    relaxed: '轻松',
  },
};
