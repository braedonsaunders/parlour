import type { GameCopy } from '../types';

/** Simplified Chinese copy for gin. Untranslated fields fall back to the pack's English. */
export const ginZh: GameCopy = {
  name: '金拉米',
  subtitle: '拉米经典',
  tagline: '组牌、敲桌、赢下今晚',
  description: '十张牌，两把椅子。凑出刻子和顺子，甩掉你的死牌，抢在对手之前拍桌收局。',
  facts: ['2人', '敲·金·大金', '单人或好友'],
  howToPlay: {
    summary: '经典双人牌戏——摸牌、弃牌、组牌，凑出一手值得敲桌的好牌。',
    objective:
      '把手里十张牌凑成刻子和顺子，几乎不留死牌，然后抢在对手之前敲桌。先越过局分目标的座位获胜。',
    sections: [
      {
        heading: '组牌与死牌',
        body: [
          '组牌要么是三到四张同点数的刻子，要么是同花色三张以上的顺子。A只能算小（A-2-3，不能Q-K-A）。',
          '没进组牌的牌都是死牌，按牌面计点：花牌算十，A算一。越少越好。',
        ],
      },
      {
        heading: '你的回合',
        body: ['每个回合两步：'],
        bullets: [
          { label: '摸牌', text: '从牌堆顶摸一张，或拿走弃牌堆顶那张' },
          {
            label: '弃牌',
            text: '把一张牌面朝上放到弃牌堆上——本回合刚摸的那张不能弃，无论从哪堆摸的',
          },
        ],
      },
      {
        heading: '开局的明牌',
        body: [
          '发完牌后有一张牌面朝上放着。非发牌者可以把它收进手牌，或跳过；然后发牌者也有同样的选择。如果两人都跳过，非发牌者从牌堆摸牌，对局开始。',
        ],
      },
      {
        heading: '敲桌',
        body: [
          '死牌不高于敲桌上限（默认10）时，你可以敲桌代替弃牌。这一手立即结束——不再弃牌。先摸第十一张牌，如果全部成组，就开启了大金路线。',
        ],
      },
      {
        heading: '金与补牌',
        body: [
          '死牌为零就是金——防守方不能补牌，按全部死牌赔付，外加金奖励。',
          '普通敲桌时防守方先补牌：手里能把敲桌者的刻子补成四张、或把顺子往两头接长的剩余牌，都先从账上划掉再比较。',
          '如果防守方补完牌后死牌不高于你，就是反切——改由他们拿走差额加奖励。',
        ],
      },
      {
        heading: '计分与一局',
        body: ['一手接一手，直到有人越过局分目标（默认100），发牌者每手轮换。'],
        bullets: [
          { label: '敲桌', text: '双方死牌之差' },
          { label: '反切', text: '差额+25归防守方' },
          { label: '金', text: '防守方全部死牌+25' },
          { label: '大金', text: '十一张牌全部成组——防守方死牌+31（可开关）' },
          { label: '局盒奖励', text: '可选：每赢一手+25，结算时并入总分（可开关）' },
        ],
      },
      {
        heading: '房间规则',
        body: ['每张牌桌都可以在房间设置里调整：'],
        bullets: [
          { label: '敲桌上限', text: '死牌多低才能敲——上限越紧，一手拖得越久' },
          { label: '局分目标', text: '50快节奏，100经典，更高适合磨局' },
          { label: '大金／奖励／局盒奖励', text: '赔付旋钮' },
        ],
      },
      {
        heading: '死局',
        body: ['牌堆只剩两张时，这一手作废——不计分，发牌者重新发牌。要敲就趁早。'],
      },
    ],
  },
  modes: {
    classic: {
      name: '经典',
      tagline: '直奔100',
      description: '酒馆标准——死牌10以内可敲，金赔25，大金赔31。先过100者胜。',
      facts: ['敲桌上限10', '打到100', '约15分钟'],
    },
    quick: {
      name: '快速',
      tagline: '冲向50',
      description: '规则不变，梯子更短。烧水间隙就能来一局的快双人局。',
      facts: ['打到50', '约8分钟'],
    },
    purist: {
      name: '纯粹',
      tagline: '没有花活',
      description: '大金关闭，局盒奖励也不带。纯粹的敲桌、纯粹的死牌，没有安全网。',
      facts: ['无大金', '无局盒奖励'],
    },
  },
  fields: {
    knockCap: {
      label: '敲桌上限',
      help: '敲桌时允许的最高死牌点数',
      group: '牌桌',
    },
    matchTarget: {
      label: '局分目标',
      help: '先越过这个分数的座位赢得整局',
      group: '牌桌',
    },
    ginBonus: {
      label: '金奖励',
      group: '奖励',
    },
    bigGin: {
      label: '大金',
      help: '摸第十一张牌并全部成组',
      group: '奖励',
    },
    bigGinBonus: {
      label: '大金奖励',
      group: '奖励',
    },
    boxBonus: {
      label: '局盒奖励',
      help: '每赢一手+25，并入最终总分',
      group: '奖励',
    },
  },
  presets: {
    classic: '经典',
    quick: '快速局',
    purist: '纯粹',
  },
};
