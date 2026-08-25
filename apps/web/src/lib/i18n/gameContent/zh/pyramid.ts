import type { GameCopy } from '../types';

/** Simplified Chinese copy for pyramid. Untranslated fields fall back to the pack's English. */
export const pyramidZh: GameCopy = {
  name: '金字塔',
  subtitle: '凑成十三',
  tagline: '清空每日金字塔',
  description: '二十八张牌排成三角。把点数相加为 13 的自由牌配对，翻开牌库，剩下越少越好。',
  facts: ['1 人', '每日固定金字塔', '可离线'],
  howToPlay: {
    summary: '单人耐心牌：二十八张牌排成金字塔，牌库翻到单独的废牌堆上。',
    objective: '把自由牌凑成十三并清空桌面。剩下的牌就是你的分数——越低越好。',
    sections: [
      {
        heading: '发牌',
        body: [
          '七行组成二十八张正面朝上的金字塔。一张牌在盖住它的两张都拿走后才自由——最底行一开始就自由。剩下二十四张是牌库。废牌堆开始是空的。',
        ],
      },
      {
        heading: '凑成十三',
        body: [
          'A 算 1，K 算 13。任意两张自由牌点数相加为 13 就可以配对——Q 配 A、J 配 2，以此类推。K 本身就是 13，可以单独拿走。花色无所谓。',
        ],
      },
      {
        heading: '废牌堆',
        body: [
          '每次从牌库翻一张到废牌堆。只有废牌堆顶牌有效：可以和金字塔上的自由牌配对，如果是 K 也可以单独拿走。被压住的废牌不能互相配对。',
        ],
      },
      {
        heading: '回收',
        body: [
          '牌库用完后，把废牌堆原样翻回去，不洗牌。经典模式可以回收两次——一共三轮。轻松模式没有次数限制。',
        ],
      },
      {
        heading: '计分',
        body: [
          '牌局在全部清空时结束，或者再也配不成对、牌库也无法回来时结束。金字塔、牌库和废牌堆里剩下的每张都计分。零分就是清台。',
        ],
      },
    ],
  },
  modes: {
    daily: {
      name: '每日',
      tagline: '同一座金字塔',
      description: '按日期定死的经典金字塔。可以重打、分享，或者明天再来一局新的。',
      facts: ['两次回收', '同一每日牌局', '剩下越少越好'],
    },
    classic: {
      name: '经典',
      tagline: '三轮机会',
      description: '一局新的定死金字塔。废牌堆可以回收两次——牌库一共走三轮。',
      facts: ['两次回收', '新牌局', '三轮'],
    },
    relaxed: {
      name: '轻松',
      tagline: '不限轮数',
      description: '同样的配对规则，但废牌堆可以随便翻回去。',
      facts: ['无限回收', '新牌局', '没有轮数限制'],
    },
  },
  fields: {
    recyclesLimit: {
      label: '废牌回收',
      group: '牌库',
      options: {
        '2': '两次回收 — 经典',
        '-1': '不限次数 — 轻松',
      },
      help: '经典模式可以回收两次，牌库走三轮。轻松模式永远不会用完。',
    },
  },
  presets: {
    classic: '经典',
    relaxed: '轻松',
  },
};
