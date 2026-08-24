import type { GameCopy } from '../types';

/** Simplified Chinese copy for blitz. Untranslated fields fall back to the pack's English. */
export const blitzZh: GameCopy = {
  name: 'Blitz（31点）',
  subtitle: '三十一点游戏',
  tagline: '冲向31点',
  description:
    '摸牌、换牌、敲桌，凑出同花色的31点。三种赛制、精明的机器人，还有一场声势浩大的庆祝。',
  facts: ['2–4人', '经典·快速·限时', '单人或好友'],
  howToPlay: {
    summary: '酒馆经典31点——摸牌、换牌、敲桌，凑出同一花色的31点。',
    objective:
      '一轮结束时，手牌要比其他所有人都大。手牌按点数最高的单一花色计分：A=11，花牌=10，数字牌按面值。同一花色凑满31点就是BLITZ，立刻获胜。',
    sections: [
      {
        heading: '你的回合',
        body: ['你有两个动作：'],
        bullets: [
          { label: '摸牌', text: '摸牌堆顶的那张牌，或者拿走弃牌堆顶的牌' },
          { label: '弃牌', text: '从手牌中滑出一张，正面朝上放到弃牌堆上' },
        ],
      },
      {
        heading: '手牌计分',
        body: [
          '只算你最好的那个花色。三张红心共27点，胜过三张杂花色共30点。',
          '三条是一手特殊牌，计30½分（房间规则开关）。',
        ],
      },
      {
        heading: '敲桌',
        body: [
          '你可以不摸牌，改为敲桌结束这一轮。其他人各再出一次，然后全部亮牌比大小。',
          '点数最低的人失去一条命。如果敲桌的是你自己，却并列或垫底，惩罚由你承担——敲桌要有底气。',
        ],
      },
      {
        heading: 'Blitz！',
        body: [
          '手里同一花色凑满31点，这一轮立刻引爆——其他所有人各失一条命，无需比牌。',
          '发牌直接发到Blitz？也算数。尽管得意吧。',
        ],
      },
      {
        heading: '赛制',
        bullets: [
          { label: '经典', text: '每输一轮失去一条命；最后还有命的人获胜' },
          { label: '快速', text: '单轮定胜负，先赢N局者胜，立即重新发牌' },
          { label: '限时', text: '对局时钟加每回合倒计时，铃响时赢轮最多者胜' },
        ],
      },
      {
        heading: '房间规则',
        body: [
          '每张牌桌都可以在房间设置里调整——命数、敲桌惩罚、平局处理、三条、弃牌锁定和回合倒计时都在那里。',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: '经典',
      tagline: '命悬一线',
      description:
        '输一轮，丢一条命。是早早敲桌，还是追逐完美的31点——最后手里还有筹码的人赢下这一局。',
      facts: ['每人3条命', '活到最后', '~5–10分钟'],
    },
    fast: {
      name: '快速',
      tagline: '一轮一胜负',
      description: '每轮独立计分，立即重新发牌。点数最高者赢下底池——先赢三轮的人拿下这一局。',
      facts: ['先赢3轮', '无人出局', '~2–4分钟'],
    },
    timed: {
      name: '限时',
      tagline: '与时间赛跑',
      description: '三分钟的对局时钟，加上快出牌的回合倒计时。铃响时赢轮最多的人获胜。',
      facts: ['3:00对局时钟', '7秒回合倒计时', '平局加赛'],
    },
  },
  fields: {
    threeOfAKind: {
      label: '三条',
      options: {
        '30.5': '计30.5分',
        '30': '计30分',
        off: '关闭',
      },
    },
    tieLowest: {
      label: '最低分并列',
      options: {
        both: '双双输命',
        nobody: '无人受罚',
        redeal: '并列者重发',
      },
    },
    discardLock: {
      label: '刚摸的弃牌不可再弃',
    },
  },
  presets: {
    'classic-pub': '经典酒馆',
    cutthroat: '狠角色',
    friendly: '友好局',
  },
};
