import type { GameCopy } from '../types';

/** Simplified Chinese copy for wild. Untranslated fields fall back to the pack's English. */
export const wildZh: GameCopy = {
  name: 'Wild',
  subtitle: '出光手牌的游戏',
  tagline: '出光每一张牌',
  description:
    '112张牌的狂欢：跳过、反转、+4、整色倾倒、抢打出牌。还是那张温暖的牌桌，只是牌堆吵闹得多。',
  facts: ['2–4人', '限时发牌', '单人或好友'],
  howToPlay: {
    summary: '112张牌的出牌狂欢——跟上弃牌堆顶，甩出功能牌，第一个出光手牌。',
    objective: '成为第一个出光手牌的人。功能牌会拖慢其他人——除非他们奋起反击。',
    sections: [
      {
        heading: '出牌',
        body: [
          '轮到你时，打出一张与弃牌堆顶颜色或牌面相同的牌，或者改为摸牌。',
          '万能牌随时可出，还能指定下一个颜色。',
        ],
      },
      {
        heading: '功能牌',
        bullets: [
          { label: '跳过', text: '下一位玩家失去回合——而且不能抢打回来' },
          { label: '反转', text: '出牌方向调转；两人对局时等于你再出一回合' },
          { label: '+2', text: '下一位玩家摸两张牌并失去回合' },
          {
            label: '整色倾倒',
            text: '把手里同颜色的牌全部垫在它下面丢出；被卷走的功能牌不生效',
          },
          { label: '万能牌', text: '随时可出，指定下一个颜色' },
          { label: '万能+4', text: '指定颜色，还让下一位玩家摸四张牌' },
          { label: '万能换手', text: '指定颜色，然后与任意一人交换手牌（可选牌）' },
          { label: '万能洗牌', text: '把所有人的手牌收拢、洗匀、重新发（可选牌）' },
        ],
      },
      {
        heading: '最后一张',
        body: [
          '只剩两张牌了？出牌前先喊"最后一张！"。只剩一张还没喊，被抓到就罚摸两张。',
          '摸牌会让你重新回到线以上，所以还得再喊一次。',
        ],
      },
      {
        heading: '计时',
        body: [
          '每个回合都有倒计时。时间耗尽时，牌桌会替那位玩家出一手合法牌，让牌局继续滚动。',
          '发牌也有对局时钟。最后一分钟里会实时显示第一到第四名，随手牌变化而更新。',
        ],
        bullets: [
          {
            label: '对局归零时',
            text: '手牌最少者获胜；张数相同则按座位顺序定胜负，每次重放都有唯一结果',
          },
          { label: '高级选项', text: '发牌前可设置每回合秒数和对局总分钟数' },
        ],
      },
      {
        heading: '房间里的混乱',
        body: ['所有牌桌设置都在发牌前的"高级选项"里：'],
        bullets: [
          {
            label: '叠加',
            text: '用同样的牌回应+2/+4，惩罚会一路堆给下一个倒霉蛋',
          },
          {
            label: '抢打',
            text: '手里有和刚打出的牌完全相同的牌？趁所有人没反应过来，抢先拍下',
          },
          { label: '摸到能出为止', text: '一直摸牌，直到摸出能出的牌，而不是只摸一张' },
          { label: '强制出牌', text: '摸到的牌如果能出，就必须出' },
          {
            label: '质疑+4',
            text: '手里没有旧颜色时打+4才算老实——戳穿虚张声势，罚牌归他；质疑错了，你多摸两张',
          },
          {
            label: '7和0',
            text: '打出7，与你指定的人交换手牌；打出0，所有人的手牌顺移一个座位',
          },
          { label: '换牌万能牌', text: '把万能换手和万能洗牌加进牌堆' },
        ],
      },
      {
        heading: '获胜',
        body: ['在对局时钟归零前出光手牌即获胜。否则，归零时手牌最轻者获胜。'],
      },
    ],
  },
  modes: {
    classic: {
      name: '经典',
      tagline: '照章办事',
      description: '跟颜色或跟数字，然后一次倒空整个颜色。不叠加、不抢打——一场彬彬有礼的狂欢。',
      facts: ['一次发牌', '不可叠加', '~5分钟'],
    },
    party: {
      name: '派对',
      tagline: '叠起来，拍下去',
      description: '+2和+4层层堆叠，牌面完全相同还能抢打出牌。混乱，但灯光温暖。',
      facts: ['叠加开启', '抢打开启', '~5分钟'],
    },
    houseRules: {
      name: '房间规则',
      tagline: '全部拉满',
      description: '7换牌、0传牌，换牌万能牌加入牌堆，摸到的牌还必须打出去。',
      facts: ['7·0换牌', '换牌万能牌', '强制出牌'],
    },
  },
  fields: {
    handSize: {
      label: '发牌张数',
      group: '发牌',
      help: '每个座位开局拿到几张牌。',
    },
    turnTimeSeconds: {
      label: '每回合秒数',
      group: '计时',
      help: '时间耗尽时，牌桌会替该座位出一手合法牌。',
    },
    matchTimeMinutes: {
      label: '对局分钟数',
      group: '计时',
      help: '归零时，剩余手牌最轻的玩家获胜。',
    },
    stackDrawTwo: {
      label: '叠加+2',
      group: '罚牌',
      help: '用自己的+2回应+2，把越堆越多的罚牌传下去。',
    },
    stackDrawFour: {
      label: '叠加+4',
      group: '罚牌',
      help: '+4同理。罚牌可能涨得飞快。',
    },
    jumpIn: {
      label: '抢打',
      group: '房间规则',
      help: '手里有刚打出的那张牌的同款？抢先拍下，不用等轮到你。',
    },
    drawToMatch: {
      label: '摸到能出为止',
      group: '房间规则',
      help: '一直摸牌直到摸出能出的牌，而不是只摸一张。',
    },
    forcePlay: {
      label: '强制出牌',
      group: '房间规则',
      help: '摸到的牌如果能出，就必须出。',
    },
    sevenZero: {
      label: '7和0',
      group: '房间规则',
      help: '打出7，与某人交换手牌；打出0，所有人的手牌顺移一个座位。',
    },
    challengeDrawFour: {
      label: '质疑+4',
      group: '房间规则',
      help: '手里没有当前颜色时打+4才算老实。戳穿虚张声势：赢了罚牌归他，输了你多摸两张。',
    },
    swapCards: {
      label: '换牌万能牌',
      group: '牌堆',
      help: '把万能换手和万能洗牌加进牌堆。',
    },
  },
  presets: {
    classic: '经典Wild',
    party: '派对牌堆',
    houseRules: '房间规则',
  },
};
