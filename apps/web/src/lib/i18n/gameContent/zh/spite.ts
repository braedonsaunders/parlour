import type { GameCopy } from '../types';

/** Simplified Chinese copy for spite. Untranslated fields fall back to the pack's English. */
export const spiteZh: GameCopy = {
  name: '怨恨与恶意',
  subtitle: '结算牌堆竞速',
  tagline: '加倍奉还',
  description:
    '把中央的公共牌堆从A叠到Q，清空你的结算牌堆，再用恰到好处的万能牌搅黄别人的计划。游戏名就是规则。',
  facts: ['2–4人', '经典·快速·无情', '单人或好友'],
  howToPlay: {
    summary: '怨恨与恶意——把公共的中央牌堆从A叠到Q，抢在所有人之前打完你的结算牌堆。',
    objective: '成为第一个清空结算牌堆的玩家。你埋进去的每一张牌，都是别人幸灾乐祸的资本。',
    sections: [
      {
        heading: '牌桌',
        body: ['四种牌，四个去处：'],
        bullets: [
          { label: '结算牌堆', text: '你扣着的目标牌堆；最上面一张翻开' },
          { label: '手牌', text: '五张牌，你的回合开始时补回五张' },
          { label: '弃牌堆', text: '四个你自己的牌堆——结束回合就是往其中一个弃牌' },
          { label: '中央牌堆', text: '最多四个公共牌堆，人人都可以往上叠' },
        ],
      },
      {
        heading: '你的回合',
        body: [
          '先摸牌补回五张。然后想怎么出就怎么出，顺序随意：',
          '出到中央牌堆、打出结算牌堆的顶牌，或打出你自己某个弃牌堆的顶牌。',
          '只有当你从手牌里弃一张到自己的弃牌堆时，回合才结束。',
        ],
      },
      {
        heading: '叠牌',
        body: [
          '中央牌堆从A开始，一张一张叠到Q。花色无所谓。',
          '叠满到Q后，整堆被洗回摸牌堆——这个位置重新空出来，等下一张A或万能牌。',
        ],
      },
      {
        heading: '万能牌',
        bullets: [
          { label: 'K', text: '万能牌——当成你需要的任何点数打出，这个点数会被牌堆记住' },
          { label: 'Joker', text: '牌桌发进Joker时，用法和K完全一样' },
          { label: '被记住的点数', text: '一张当6用的万能牌，意味着下一张要出7，不管谁来出' },
        ],
      },
      {
        heading: '结算牌堆',
        body: [
          '打出结算牌堆的顶牌，下一张立刻翻开——如果那就是最后一张，你当场获胜，回合中途也算，不用再弃牌。',
          '卡住了没牌可出？那就带点心机地弃牌：你现在堆起来的牌，是以后能解锁的一步好棋。',
        ],
      },
      {
        heading: '牌堆见底',
        body: [
          '叠满的牌堆直接洗回摸牌堆，所以牌一直在循环。',
          '如果你的回合开始时摸牌堆空了，所有叠了一半的中央牌堆也会被扫回去——需求重置回A，埋着的牌重见天日。',
          '如果牌桌彻底锁死，就由结算牌堆最接近清空的玩家收下这一局，免得大家干耗。',
        ],
      },
      {
        heading: '玩法',
        bullets: [
          { label: '经典', text: '完整的20张结算牌堆竞速——备好零食' },
          { label: '快速', text: '10张结算牌堆，来一局速战速决的恩怨局' },
          {
            label: '无情',
            text: '13张结算牌堆，回合中不补牌：过早打空手牌，就只能缺着牌硬撑',
          },
        ],
      },
    ],
  },
  modes: {
    classic: {
      name: '经典',
      tagline: '全程竞速',
      description: '每个结算牌堆埋满20张，万能牌全数上阵。这游戏本来就是要慢慢熬着玩的。',
      facts: ['20张结算堆', 'K与Joker万能', '约15分钟'],
    },
    quick: {
      name: '快速',
      tagline: '恩怨速战',
      description: '10张结算牌堆，其余原封不动——同样的万能牌，同样的恶意，复仇的等待减半。',
      facts: ['10张结算堆', '万能牌全开', '约5–8分钟'],
    },
    cutthroat: {
      name: '无情',
      tagline: '毫不留情',
      description: '13张的深度，回合中不补牌：时机不对就打空手牌，只能缺着牌看别人赢下这一局。',
      facts: ['13张结算堆', '回合中不补牌', '狠'],
    },
  },
  fields: {
    payoffSize: {
      label: '结算牌堆',
      help: '埋在每个结算牌堆里的牌数。清空你的牌堆即获胜——数字越小，对局越短。',
      group: '发牌',
    },
    handSize: {
      label: '发牌数',
      help: '手牌数量，每个回合开始时补满。',
      group: '发牌',
    },
    discardPiles: {
      label: '弃牌堆',
      help: '每位玩家面前的牌堆数。结束回合就是往其中一个弃牌。',
      group: '发牌',
    },
    kingsWild: {
      label: 'K是万能牌',
      help: 'K可以当成你指定的任何点数。关闭则完全不发K。',
      group: '万能牌',
    },
    jokersWild: {
      label: 'Joker是万能牌',
      help: 'Joker的用法和K完全一样。关闭则不发。',
      group: '万能牌',
    },
    buildPiles: {
      label: '中央牌堆',
      help: '人人都能往上叠的公共牌堆。数量越少，越要干等别人的A。',
      group: '中央',
    },
    refillMidTurn: {
      label: '回合中补牌',
      help: '打空手牌就立刻补回五张，继续操作。关闭就是无情模式。',
      group: '房间规则',
    },
  },
  presets: {
    classic: '经典',
    quick: '快速',
    cutthroat: '无情',
  },
};
