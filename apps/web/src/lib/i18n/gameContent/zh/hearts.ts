import type { GameCopy } from '../types';

/** Simplified Chinese copy for hearts. Untranslated fields fall back to the pack's English. */
export const heartsZh: GameCopy = {
  name: '红心大战',
  subtitle: '躲避罚分的游戏',
  tagline: '一张红心都别吃',
  description:
    '躲开每一张红心，避开黑桃皇后，把罚分全塞给别人。轮流传牌、暗中选牌，还有一位锋利无比的皇后。',
  facts: ['4人', '传牌·吃墩·躲避', '单人或好友'],
  howToPlay: {
    summary: '经典躲避游戏——不吃红心，躲开黑桃皇后，把罚分留给别人。',
    objective:
      '一局结束时总分最低者获胜。你每吃到一张红心就计1分，黑桃皇后计13分；当有人越过终局线（默认100分）时，总分最低者获胜。',
    sections: [
      {
        heading: '传牌',
        body: [
          '每手开局前，你挑出三张牌传给一位邻座——所有人暗中选牌，然后四份传牌同时落地。',
          '方向每手轮换：向左、向右、对家，然后是一手不传牌的"留手"局。',
        ],
      },
      {
        heading: '吃墩',
        body: [
          '第一墩由梅花2首攻。能跟花色就必须跟；首攻花色中最大的一张赢下这一墩，赢墩者下一墩首攻。',
        ],
        bullets: [
          { label: '第一墩', text: '第一墩不能丢罚分牌（房间规则开关）' },
          {
            label: '破红心',
            text: '红心不能首攻，直到有人在之前的墩里垫过红心——除非你手里只剩红心',
          },
          {
            label: '断门',
            text: '没有首攻花色？随便丢什么——皇后往往就是这样砸到别人头上的',
          },
        ],
      },
      {
        heading: '一手计分',
        body: ['十三墩打完后，你吃到的每张红心计1分，黑桃皇后计13分。'],
        bullets: [
          { label: '方块J', text: '可选房间规则——吃到它的人计−10分' },
          {
            label: '射月',
            text: '吃齐全部十三张红心外加皇后，你自己计0分，其他所有人各+26分——或者按另一条房间规则，你自己的总分减26分',
          },
        ],
      },
      {
        heading: '整局',
        body: [
          '一手一手累积，直到有人越过终局线（50/75/100分）。总分最低者赢下这一局；平分则共享桂冠。',
        ],
      },
      {
        heading: '房间规则',
        body: [
          '房间设置里什么都能调：传牌方向、留手局、首墩保护、方块J、终局线和射月方式。经典牌桌保持默认即可。',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: '经典',
      tagline: '照章办事',
      description: '传牌按左、右、对家轮换，每四手来一局留手，首墩不吃罚分。打到100分。',
      facts: ['打到100分', '含留手局', '~15分钟'],
    },
    quickcut: {
      name: '快局',
      tagline: '更快见分晓',
      description: '规则不变，门槛更低——谁先过50分就结束。一杯咖啡的时间打完一整局。',
      facts: ['打到50分', '含留手局', '~8分钟'],
    },
    cutthroat: {
      name: '狠角色',
      tagline: '方块J出笼',
      description: '方块J给吃到它的人计−10分，罚分牌从第一墩就能飞。谁都不安全。',
      facts: ['J♦ −10', '首墩可罚分', '打到100分'],
    },
  },
  fields: {
    passDirection: {
      label: '传牌方向',
      options: {
        left: '向左',
        right: '向右',
        across: '对家',
        hold: '留手（不传）',
      },
    },
    holdHand: {
      label: '每四手来一局留手',
    },
    noPointsFirstTrick: {
      label: '第一墩不丢罚分牌',
    },
    jackDiamonds: {
      label: '方块J计−10分',
    },
    gameOver: {
      label: '终局分数',
      options: {
        '50': '50分',
        '75': '75分',
        '100': '100分',
      },
    },
    moonShift: {
      label: '射月',
      options: {
        opponents: '其他人各+26分',
        self: '自己总分−26分',
      },
    },
  },
  presets: {
    classic: '经典红心大战',
    quickcut: '快局',
    cutthroat: '狠角色',
  },
};
