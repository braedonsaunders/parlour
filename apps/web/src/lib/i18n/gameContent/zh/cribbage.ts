import type { GameCopy } from '../types';

/** Simplified Chinese copy for cribbage. Untranslated fields fall back to the pack's English. */
export const cribbageZh: GameCopy = {
  name: '克里比奇',
  subtitle: '计分板竞速',
  tagline: '钉到121分',
  description:
    '经典酒馆竞速——用手牌凑出十五点、顺子和对子，在计分板上钉分冲线，还要祈祷别被人切出一张J偷了分。',
  facts: ['2名玩家', '经典·无情', '单人或好友'],
  howToPlay: {
    summary: '经典酒馆竞速——用手牌凑出得分组合，再把分一路钉到121。',
    objective:
      '率先在计分板上钉满121分。得分有两次机会：往牌桌上出牌时（钉分阶段），以及结算手牌和Crib时。',
    sections: [
      {
        heading: '发牌',
        body: [
          '你拿到六张牌。留下四张，把两张面朝下滑进CRIB——这手奖励牌归本轮发牌者计分。',
          '是自己的Crib就大方地塞，是对方的就防守着丢。',
        ],
      },
      {
        heading: '切牌',
        body: [
          '发牌者切牌堆，亮出起始牌，每手牌都共用这张牌。',
          '切出J就是HIS HEELS——发牌者当场得2分。',
        ],
      },
      {
        heading: '钉分',
        body: [
          '从发牌者左手边开始，玩家轮流出一张牌，累计点数（花牌算10）。任何情况下都不能让累计超过31。',
          '边出边得分：',
        ],
        bullets: [
          { label: '十五点', text: '你出的牌让累计正好到15——2分' },
          { label: '对子/三条/四条', text: '与上一张同点数——2/6/12分' },
          { label: '顺子', text: '三张以上点数连续，无论出牌顺序——每张1分' },
          { label: '三十一点', text: '你出的牌让累计正好到31——2分' },
          {
            label: 'Go与最后一张',
            text: '没人能在31以内出牌时，最后出牌的玩家得1分，累计清零',
          },
        ],
      },
      {
        heading: '结算',
        body: [
          '钉分结束后，大家依次大声计分：先是非发牌者的手牌，再是发牌者的，最后是Crib。起始牌算作第五张牌。',
        ],
        bullets: [
          { label: '十五点', text: '每一种凑成15的牌组合——每种2分' },
          { label: '对子', text: '对子2分，三条6分，四条12分' },
          { label: '顺子', text: '连续序列按张数计分；双顺翻倍（7-7-8-9 = 12）' },
          {
            label: '同花',
            text: '手牌中四张同花色得4分，起始牌也同花色则得5分。CRIB里只有五张全同花才算。',
          },
          { label: 'His nobs', text: '手中有与起始牌同花色的J——1分' },
        ],
      },
      {
        heading: '获胜与横扫',
        body: [
          '先到121分者获胜，哪怕是在计分中途。发牌者每轮轮换。',
          '开启横扫规则时，输家若低于90分就是被SKUNK——值得好好嘲笑一番的惨败。',
        ],
      },
      {
        heading: '房间规则',
        body: ['房间设置承载了酒馆里的那些争论：'],
        bullets: [
          { label: '横扫', text: '点名嘲笑低于90分的输家（默认开启）' },
          {
            label: '抢分',
            text: '你在牌桌上该得的分没喊出来，对手可以抢走（默认关闭）——喊分要趁早！',
          },
        ],
      },
    ],
  },
  modes: {
    'classic-pub': {
      name: '经典酒馆',
      tagline: '原汁原味',
      description:
        '六张牌，两张进Crib，一场钉到121分的长跑。横扫作数——低于90分收场，会被念叨一辈子。',
      facts: ['目标121分', '90分横扫线', '约10–15分钟'],
    },
    cutthroat: {
      name: '无情局',
      tagline: '抢分眼在盯',
      description: '同样的竞速，爪子更利：在牌桌上漏喊的分，对手替你拿走。',
      facts: ['抢分开启', '漏喊即被偷', '毫不留情'],
    },
    'match-play': {
      name: '多局赛制',
      tagline: '三板两胜',
      description: '正经的长夜局：钉到121，钉位归零，再来一遍。先赢下两整局的玩家拿下整场。',
      facts: ['先赢2局', '发牌轮换', '约25–40分钟'],
    },
  },
  fields: {
    skunks: { label: '90分横扫线' },
    muggins: { label: '抢分（偷走漏喊的分）' },
    gamesToWin: { label: '获胜所需局数' },
  },
  presets: {
    'classic-pub': '经典酒馆',
    cutthroat: '无情局',
    'match-play': '多局赛制',
    friendly: '友谊局',
  },
};
