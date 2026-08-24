import type { GameCopy } from '../types';

/** Simplified Chinese copy for eights. Untranslated fields fall back to the pack's English. */
export const eightsZh: GameCopy = {
  name: '疯狂八',
  subtitle: '万能牌甩牌游戏',
  tagline: '8点通吃',
  description:
    '一副普通的牌，一个越堆越高的弃牌堆。跟花色或跟点数，打出一张8把牌桌掰到你想要的花色，再让别人为手里剩下的牌买单。',
  facts: ['2–6人', '按分定胜负', '单人或好友'],
  howToPlay: {
    summary: '一副普通的牌，一个弃牌堆，还有百搭的8。打空你的手牌，让全桌为他们还攥着的牌付分。',
    objective:
      '打空手牌结束这一轮，把其他人手里剩下的牌全部收入囊中。最先越过目标分的人赢下这一局。',
    sections: [
      {
        heading: '出牌',
        body: [
          '轮到你时，打出一张与弃牌堆同花色或同点数的牌——♦7可以压任何方块，也可以压任何别的7。',
          '8是万能牌。它什么都能压，而且由你指定下家必须跟的花色。',
          '没牌可出？摸牌。在有人改变花色之前，弃牌堆一直要同一个花色。',
        ],
      },
      {
        heading: '功能牌',
        body: ['每一张都是牌桌设置，所以想玩得多素或多热闹，全看这桌人。'],
        bullets: [
          { label: '8——万能', text: '随时可出；由你指定接下去的花色（始终开启）' },
          { label: '2——罚两张', text: '下家摸两张牌，并跳过回合' },
          { label: 'Q——跳过', text: '出牌顺序直接越过下家' },
          { label: 'A——反转', text: '牌桌调转方向；两人对局时相当于让你再出一轮' },
        ],
      },
      {
        heading: '摸牌',
        body: [
          '按传统规矩，一直摸到能出为止。关掉它，每个回合就只能摸一张。',
          '摸到的牌如果能出，你可以立刻打出，也可以留在手里——除非牌桌强制出牌。',
          '摸牌堆用完后，明牌下面的所有牌洗回成新的摸牌堆。',
        ],
      },
      {
        heading: '一轮计分',
        body: ['有人打空手牌的那一刻，其他人清点手里剩下的牌，全部归甩牌的人。'],
        bullets: [
          { label: '每张8', text: '50分' },
          { label: '每张10、J、Q、K', text: '10分' },
          { label: '每张A', text: '1分' },
          { label: '其余的牌', text: '按牌面点数计' },
          {
            label: '僵持的一轮',
            text: '摸牌堆耗尽且无人能出——手牌最轻的人获胜，收下差额',
          },
        ],
      },
      {
        heading: '赢下一局',
        body: [
          '一轮接一轮地发牌，发牌权每次挪一个座位，直到有人越过目标分。最高分获胜。',
          '榜首平分就再发一轮，绝不共享王座。',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: '原味',
      tagline: '只有8是万能',
      description: '你奶奶发牌时的那种玩法。跟花色或跟点数，出8喊花色，摸到能出为止。先到100分。',
      facts: ['仅8万能', '摸到能出为止', '先到100分'],
    },
    house: {
      name: '家常',
      tagline: '2、Q、A全上场',
      description: '几乎所有人心里的那套规则：2罚摸牌，Q跳下家，A调转牌桌。先到100分。',
      facts: ['2·Q·A生效', '不可叠加', '先到100分'],
    },
    chaos: {
      name: '疯狂',
      tagline: '叠起来罚',
      description:
        '2叠着2往上垒，直到有人一口吞下全部罚牌；摸到的牌必须打出；每回合只许摸一张。局更长，桌更吵。',
      facts: ['可叠加罚牌', '摸到必须出', '先到150分'],
    },
  },
  fields: {
    handSize: {
      label: '发牌数',
      help: '每个座位在一轮开始时的牌数。',
      group: '发牌',
    },
    targetScore: {
      label: '目标分',
      help: '一轮接一轮地打，直到有人越过这个分数。',
      group: '发牌',
    },
    twosDrawTwo: {
      label: '2罚两张',
      help: '下家摸两张牌，并跳过回合。',
      group: '功能牌',
    },
    queensSkip: {
      label: 'Q跳过',
      help: '出牌顺序直接越过下家。',
      group: '功能牌',
    },
    acesReverse: {
      label: 'A反转',
      help: '调转牌桌方向。两人对局时相当于跳过对方。',
      group: '功能牌',
    },
    stackDrawTwo: {
      label: '2可叠加',
      help: '用你自己的2回敬一张2，把累积的罚牌传给下家。',
      group: '房间规则',
    },
    drawUntilPlayable: {
      label: '摸到能出为止',
      help: '传统规则。关掉后每回合只摸一张。',
      group: '房间规则',
    },
    forcePlay: {
      label: '强制出牌',
      help: '摸到的牌如果能出，就必须打出。',
      group: '房间规则',
    },
  },
  presets: {
    classic: '原味疯狂八',
    house: '家常疯狂八',
    chaos: '疯狂八',
  },
};
