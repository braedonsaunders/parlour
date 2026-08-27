import type { GameCopy } from '../types';

/** Simplified Chinese copy for durak. Untranslated fields fall back to the pack's English. */
export const durakZh: GameCopy = {
  name: '笨蛋',
  subtitle: '谁都不想当的笨蛋',
  tagline: '永远别做最后拿着牌的人',
  description:
    '一副短牌、一个将牌花色，还有一张全是攻防的桌子。挡下扔向你的每一张牌，或者把整桌牌收入囊中——最后手里还有牌的那个人就要戴上笨蛋的帽子。',
  facts: ['2–6人', '36张牌', '单人或好友'],
  howToPlay: {
    summary: '一副短牌，一个将牌花色，只有一个任务：别做最后手里还有牌的人。',
    objective: '出光你的牌，永远脱身。一旦牌堆抽空，手里还有牌的最后一人就是笨蛋。',
    sections: [
      {
        heading: '发牌',
        body: [
          '每人从36张牌中拿到六张牌：六到A，四种花色，没有2到5。',
          '牌堆翻开的下一张牌决定整局的将牌花色，并一直亮面朝上，直到牌堆抽空。',
          '手持最小将牌的人先攻。没人有将牌？由一号座位开局。',
        ],
      },
      {
        heading: '进攻与防守',
        body: [
          '进攻方出一张牌。防守方必须挡下它：同花色更大的牌，或者，如果进攻的不是将牌，任意一张将牌。',
          '只要牌面已经出现在桌上，其他座位就可以继续跟牌——不管挡没挡下，这张牌面在本回合结束前都算数。',
          '挡下所有的牌，整桌牌都会清出局，永久离场——接下来轮到你进攻。',
          '挡不下？把整桌牌收进手里。轮到你下家进攻。',
        ],
        bullets: [
          { label: '进攻上限', text: '防守方看到的牌数永远不会超过本回合开始时手里的牌数' },
          {
            label: '补牌',
            text: '每回合结束后，所有人补牌到六张——先补进攻方，再补其他人，最后补防守方',
          },
        ],
      },
      {
        heading: 'Perevodnoy（转移）',
        body: [
          '开启这条房规后，还没挡下任何牌的防守方可以选择转移：出一张同点数的牌，把整个进攻转给下家。',
        ],
      },
      {
        heading: '终局',
        body: [
          '一旦牌堆抽空，出光手牌就能永久离场——按发生的先后顺序。',
          '最后手里还有牌的人就是笨蛋。其他人则按离场的早晚排名。',
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: '经典',
      tagline: 'Podkidnoy——传统跟牌玩法',
      description: '进攻、防守，跟出任何点数已经在桌上的牌。没有转移——要么挡下，要么收牌。',
      facts: ['可以跟牌', '没有转移', '六张手牌'],
    },
    transfer: {
      name: 'Perevodnoy',
      tagline: '把整个进攻转移出去',
      description:
        '经典模式的一切规则，再加一条退路：还没挡下任何牌的防守方可以把同点数的牌直接转给下家。',
      facts: ['可以转移', '可以跟牌', '六张手牌'],
    },
    'heads-up': {
      name: '单挑',
      tagline: '一对一，快速分胜负',
      description: '专为两人设计。谁先出光手牌谁就当场获胜，不管牌堆还剩不剩牌——不必等牌堆抽空。',
      facts: ['2人', '秒胜', '节奏快'],
    },
  },
  fields: {
    transfer: {
      label: '转移（Perevodnoy）',
      help: '持有同点数牌的防守方可以把整个进攻转给下家，而不是挡下它。',
      group: '本回合',
    },
    throwIns: {
      label: '跟牌（Podkidnoy）',
      help: '任何进攻方座位都可以跟出点数已经在桌上的牌。',
      group: '本回合',
    },
    maxAttacks: {
      label: '进攻上限',
      help: '防守方在一个回合里最多会看到的进攻牌数。',
      group: '本回合',
    },
    refillTo: {
      label: '手牌数量',
      help: '开局发的牌数，也是每回合结束后补牌的目标数量。',
      group: '发牌',
    },
    instantWin: {
      label: '秒胜',
      help: '谁先出光手牌就当场获胜，即使牌堆里还有牌。',
      group: '房规',
    },
  },
  presets: {
    classic: '经典笨蛋',
    transfer: 'Perevodnoy',
    'heads-up': '单挑',
  },
};
