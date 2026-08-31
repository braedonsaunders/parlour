import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API_URL = 'https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192';
const MUSIC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'music');
const DURATION_MS = 65_733;
// AAC can add roughly 2 dB of inter-sample overshoot on dense material.
const MASTER_TRUE_PEAK_DB = -3.5;

const sharedNegativeStyles = [
  'vocals',
  'lyrics',
  'spoken word',
  'choir',
  'ambient drift',
  'slow intro',
  'downtempo',
  'sad',
  'horror',
  'dissonant noise',
  'cinematic trailer boom',
  'generic corporate music',
  'fade out',
];

const candidates = [
  {
    id: 'clockwork-combo',
    label: 'Clockwork Combo',
    chunks: [
      chunk('The clock starts', 14_000, [
        'instrumental premium tabletop game soundtrack',
        'frantic but playful',
        'catchy nimble melody introduced immediately',
        'tactile marimba and pizzicato strings',
        'tight hand percussion and ticking woodblocks',
        'warm pulsing synth bass',
        '150 BPM',
        'D minor with bright modal color',
        'polished game music mix',
      ]),
      chunk('Pressure rises', 16_000, [
        'same memorable melody with an energetic variation',
        'more active pizzicato counterpoint',
        'faster ticking percussion and crisp snare',
        'rising harmonic sequence',
        '160 BPM feeling',
        'urgent and fun, never grim',
      ]),
      chunk('Combo chain', 17_000, [
        'melodic hook becomes bolder and more exhilarating',
        'rapid marimba arpeggios',
        'driving strings and syncopated bass',
        'small arcade sparkle accents',
        '170 BPM feeling',
        'dense but clean game soundtrack arrangement',
      ]),
      chunk('Final seconds', 18_733, [
        'maximum urgency and forward motion',
        'catchy main melody at its most triumphant',
        'relentless ticking rhythm',
        'rapid ascending sequences and layered countermelody',
        '180 BPM feeling',
        'keep intensifying through the final beat',
        'strong energetic ending with no slowdown and no fade',
      ]),
    ],
  },
  {
    id: 'neon-countdown',
    label: 'Neon Countdown',
    chunks: [
      chunk('Ready set rush', 14_000, [
        'instrumental polished casual game soundtrack',
        'colorful melodic electro arcade',
        'joyful tension and immediate forward motion',
        'infectious bright synth lead hook',
        'bouncy analog bass and punchy acoustic-electronic drums',
        'tiny chiptune ornamentation, not retro pastiche',
        '152 BPM',
        'E minor with hopeful major accents',
      ]),
      chunk('Timer flashing', 16_000, [
        'same synth hook develops into a faster melodic answer',
        'sixteenth-note arpeggiator joins',
        'sharper percussion and rising bass movement',
        '162 BPM feeling',
        'exciting and pleasurable, not aggressive',
      ]),
      chunk('One move left', 17_000, [
        'heroic variation of the main melody',
        'layered arpeggios and sparkling game accents',
        'driving tom fills and syncopated bass',
        '174 BPM feeling',
        'high energy with a clear singable instrumental hook',
      ]),
      chunk('Countdown overload', 18_733, [
        'breathless final-stage arcade intensity',
        'main hook soaring over rapid countermelody',
        'accelerating drum fills and ascending chord inversions',
        '186 BPM feeling',
        'bright satisfying musical payoff',
        'increase urgency continuously to the last beat',
        'no breakdown, no resolution slowdown, no fade',
      ]),
    ],
  },
  {
    id: 'last-call-heist',
    label: 'Last Call Heist',
    chunks: [
      chunk('Cards on the table', 14_000, [
        'instrumental stylish tabletop game soundtrack',
        'playful casino heist energy',
        'memorable sly melody from the first bar',
        'vibraphone, muted brass, plucked upright bass, and tight drums',
        'subtle pizzicato strings and finger snaps',
        '146 BPM',
        'A minor with jazzy colorful harmony',
        'warm polished modern production',
      ]),
      chunk('The tell', 16_000, [
        'same sly melody becomes more urgent',
        'busier vibraphone runs and brass replies',
        'walking bass turns into a driving ostinato',
        '156 BPM feeling',
        'mischievous rather than dark',
      ]),
      chunk('All in', 17_000, [
        'bold melodic statement with exhilarating harmonic climb',
        'rapid pizzicato string pattern',
        'punchy brass syncopation and energetic drum fills',
        '168 BPM feeling',
        'layered, tuneful, and game-like',
      ]),
      chunk('Beat the clock', 18_733, [
        'frantic joyful casino finale',
        'main melody pushed higher with fast vibraphone countermelody',
        'relentless bass ostinato and increasingly rapid percussion',
        '180 BPM feeling',
        'build excitement continuously through the last beat',
        'continuous full-volume melody and percussion through the entire section',
        'decisive bright final hit exactly at the end of the section',
        'do not finish early, no silence, no slowdown, and no fade',
      ]),
    ],
  },
  {
    id: 'campfire-ember-rush',
    label: 'Campfire — Ember Rush',
    outputPath: 'music-tense-campfire.m4a',
    chunks: [
      chunk('Sparks catch', 14_000, [
        'instrumental premium tabletop game soundtrack for a warm campfire setting',
        'immediate memorable folk-adventure melody',
        'bright mandolin, close acoustic guitar, and plucked cello',
        'tactile frame drum and wooden percussion',
        'nimble, playful, and urgent without becoming ominous',
        '148 BPM',
        'B Dorian with warm open-string harmony',
        'polished modern game music mix',
      ]),
      chunk('Flames climb', 16_000, [
        'same catchy folk melody in a more urgent variation',
        'fiddle ostinato joins the mandolin',
        'busier frame drum and rising cello pattern',
        '158 BPM feeling',
        'outdoor warmth with mounting game pressure',
      ]),
      chunk('Hands move faster', 17_000, [
        'bold melodic hook passed between fiddle and mandolin',
        'rapid acoustic picking and driving low strings',
        'layered hand percussion and wooden ticks',
        '170 BPM feeling',
        'frantic, tuneful, exhilarating, and clean',
      ]),
      chunk('Final ember', 18_733, [
        'maximum joyful folk-game urgency',
        'main melody pushed higher over rapid fiddle countermelody',
        'relentless double-time frame drum and ascending acoustic patterns',
        '182 BPM feeling',
        'continuous full-energy playing through the whole section',
        'bright decisive final hit exactly at the end',
        'no silence, no slowdown, no fade',
      ]),
    ],
  },
  {
    id: 'casino-house-edge',
    label: 'Casino — House Edge',
    outputPath: 'music-tense-casino.m4a',
    chunks: [
      chunk('Place your bets', 14_000, [
        'instrumental premium tabletop game soundtrack for a velvet casino setting',
        'stylish melodic jazz-funk tension from the first bar',
        'vibraphone hook, muted trumpet replies, electric piano, and upright bass',
        'tight brushed snare becoming a crisp beat',
        'slick, playful, sophisticated, and game-like',
        '144 BPM',
        'C minor with colorful major-sixth harmony',
        'polished modern production, not background lounge music',
      ]),
      chunk('The house watches', 16_000, [
        'same memorable vibraphone melody with rising trumpet answers',
        'walking bass becomes a driving syncopated ostinato',
        'sharper drums and subtle shaker subdivision',
        '154 BPM feeling',
        'mischievous pressure, never gloomy',
      ]),
      chunk('Double down', 17_000, [
        'bold tuneful variation of the main casino hook',
        'rapid vibraphone runs and punchy muted brass stabs',
        'energetic upright bass and escalating drum fills',
        '166 BPM feeling',
        'dense, precise, exciting game soundtrack arrangement',
      ]),
      chunk('Last wager', 15_733, [
        'breathless glamorous casino finale',
        'main hook soaring with fast vibraphone countermelody',
        'relentless bass ostinato, brass syncopation, and rapid snare fills',
        '178 BPM feeling',
        'increase melodic and rhythmic urgency to the final beat',
        'continuous full-energy playing through the whole section',
        'no silence, no slowdown, no fade',
      ]),
      chunk('Final three-second sprint', 3_000, [
        'continue the exact same casino groove without a reset',
        'maximum-density vibraphone run, urgent brass stabs, and rapid snare roll',
        'hard bright ensemble hit on the final frame only',
        'music fills all three seconds with no silence and no reverb tail',
      ]),
    ],
  },
  {
    id: 'snug-last-orders',
    label: 'Snug — Last Orders',
    outputPath: 'music-tense-snug.m4a',
    // Generate past the delivery boundary so the cue ends during the final sprint.
    generationTailMs: 3_000,
    chunks: [
      chunk('The clock is noticed', 14_000, [
        'instrumental premium tabletop game soundtrack for a cozy wood-panelled pub snug',
        'infectious warm pub-session melody introduced immediately',
        'upright piano, fiddle, button accordion, acoustic guitar, and soft bodhran',
        'friendly competitive energy with a strong melodic hook',
        '146 BPM',
        'E minor with bright Celtic modal turns',
        'intimate polished game music, no crowd ambience',
      ]),
      chunk('Last orders called', 16_000, [
        'same pub-session melody with faster piano and accordion answers',
        'fiddle adds an urgent countermelody',
        'bodhran pulse and guitar strumming become more insistent',
        '156 BPM feeling',
        'warm, playful, and increasingly competitive',
      ]),
      chunk('One final hand', 17_000, [
        'main hook becomes bolder and more exhilarating',
        'rapid fiddle pattern, bright pub piano, and driving acoustic guitar',
        'layered bodhran and crisp wooden percussion',
        '168 BPM feeling',
        'frantic but musical and welcoming',
      ]),
      chunk('Beat closing time', 15_733, [
        'joyful full-speed pub-game finale',
        'main melody lifted higher over rapid fiddle and accordion countermelodies',
        'relentless piano rhythm, double-time bodhran, and ascending chord turns',
        '180 BPM feeling',
        'keep intensifying through the entire final section',
        'decisive bright ensemble hit exactly at the end',
        'no silence, no slowdown, no fade',
      ]),
      chunk('Final six-second sprint', 6_000, [
        'continue the exact same pub-session groove without a reset',
        'maximum-speed fiddle run, accordion chord punches, piano, and bodhran roll',
        'keep playing at full intensity without a cadence or ending gesture',
        'music fills all six seconds with no silence, no slowdown, and no fade',
      ]),
    ],
  },
  {
    id: 'wild-palm-court-shuffle',
    label: 'Wild — Palm Court Shuffle',
    outputPath: 'music-beach-1.m4a',
    chunks: [
      chunk('Doors open on the beach bar', 14_000, [
        'instrumental premium tropical house game soundtrack',
        'sunny steel drum melody introduced immediately',
        'warm four-on-the-floor kick and soft shaker groove',
        'marimba answers and airy synth pads like sea breeze',
        'deep round sub bass',
        '106 BPM',
        'C major with breezy add9 color',
        'polished modern tropical house mix',
      ]),
      chunk('First hands dealt', 16_000, [
        'same steel drum hook with a plucky house synth countermelody',
        'congas and rimshot join the groove',
        'gently rising chord movement',
        'social and sunny, relaxed forward motion',
      ]),
      chunk('The table warms up', 17_000, [
        'main melody passed between steel drums and marimba',
        'brighter synth pluck stabs and syncopated bass',
        'crisp percussion fills',
        'joyful beach-party momentum, never aggressive',
      ]),
      chunk('Golden hour groove', 18_733, [
        'full warm tropical house arrangement of the main hook',
        'layered steel drums, marimba, and shimmering pads',
        'confident groove held to the end',
        'clean decisive ending on the final beat, no fade',
      ]),
    ],
  },
  {
    id: 'wild-cabana-stack',
    label: 'Wild — Cabana Stack',
    outputPath: 'music-beach-2.m4a',
    chunks: [
      chunk('Mischief brewing', 14_000, [
        'instrumental playful tropical house game soundtrack',
        'cheeky syncopated pluck synth riff from the first bar',
        'kalimba and marimba trading short phrases',
        'bouncy four-on-the-floor kick with clicky percussion',
        'warm sub bass slides',
        '110 BPM',
        'A minor with bright cheeky accents',
        'polished modern production',
      ]),
      chunk('Draw twos stacking', 16_000, [
        'same pluck riff answered by steel drum jabs',
        'congas and woodblock subdivision get busier',
        'playful call-and-response between synth and marimba',
        'grinning party-game mischief',
      ]),
      chunk('Colors changing fast', 17_000, [
        'main riff bolder with a wordless vocal-chop texture',
        'rapid marimba runs and punchy bass syncopation',
        'sparkling percussion accents',
        'dense, tuneful, and fun',
      ]),
      chunk('Cabana payoff', 18_733, [
        'full-energy playful tropical house celebration of the main riff',
        'layered plucks, kalimba, and steel drums over a driving groove',
        'keep the bounce all the way through',
        'bright clean ending hit on the final beat, no fade',
      ]),
    ],
  },
  {
    id: 'wild-reverse-into-sunset',
    label: 'Wild — Reverse Into Sunset',
    outputPath: 'music-beach-3.m4a',
    chunks: [
      chunk('Waves roll in', 14_000, [
        'instrumental mellow tropical deep house game soundtrack',
        'soft felt-piano chords over a slow warm house kick',
        'distant steel pan long notes',
        'rounded deep bass line and gentle shaker',
        '100 BPM',
        'F major with nostalgic seventh chords',
        'golden-hour glow, intimate polished mix',
      ]),
      chunk('Cruising the middle game', 16_000, [
        'steel pan melody comes forward over the felt piano',
        'subtle conga groove and warm pad swells',
        'unhurried and warm forward motion',
      ]),
      chunk('Sun touches the water', 17_000, [
        'main melody blooms with marimba harmony',
        'richer chord extensions and a singing synth line far away',
        'relaxed but clearly moving groove',
        'beautiful and easy, never sleepy',
      ]),
      chunk('Last light', 18_733, [
        'full warm arrangement of the sunset melody',
        'steel pan, felt piano, and soft plucks over the deep house groove',
        'gentle build into a contented final chord',
        'clean unhurried ending on the last beat, no fade',
      ]),
    ],
  },
  {
    id: 'wild-last-card-tide',
    label: 'Wild — Last Card Tide',
    outputPath: 'music-tense-beach.m4a',
    chunks: [
      chunk('The clock is running', 14_000, [
        'instrumental urgent tropical house game soundtrack',
        'tight four-on-the-floor kick and pulsing sixteenth-note pluck ostinato',
        'sparse steel drum stabs and rising filtered pads',
        'driving round sub bass',
        '116 BPM',
        'D minor with bright modal color',
        'countdown urgency kept playful, polished game mix',
      ]),
      chunk('One card left somewhere', 16_000, [
        'same pluck ostinato with an urgent steel drum countermelody',
        'busier percussion and ascending bass movement',
        '124 BPM feeling',
        'coiled and exciting, never grim',
      ]),
      chunk('Everyone leans in', 17_000, [
        'main hook pushed higher over rapid marimba runs',
        'rolling snare builds that resolve back into the groove',
        'punchy syncopated bass and sparkling accents',
        '132 BPM feeling',
        'breathless tropical pressure, dense but clean',
      ]),
      chunk('Beat the tide', 18_733, [
        'maximum urgency tropical house finale',
        'pluck ostinato and steel drums at full intensity',
        'relentless kick, rapid fills, and ascending sequences',
        '140 BPM feeling',
        'keep intensifying through the final beat',
        'decisive bright final hit exactly at the end, no fade',
      ]),
    ],
  },
];

function chunk(sectionName, durationMs, positiveStyles) {
  return {
    text: `[Instrumental: ${sectionName}]`,
    duration_ms: durationMs,
    positive_styles: positiveStyles,
    negative_styles: sharedNegativeStyles,
    context_adherence: 'high',
  };
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const only = option('only')?.split(',').filter(Boolean) ?? null;
const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const masterOnly = process.argv.includes('--master-only');
const selected = only
  ? candidates.filter((candidate) => only.includes(candidate.id))
  : candidates.filter((candidate) => candidate.outputPath);

if (only && selected.length !== only.length) {
  const known = new Set(candidates.map((candidate) => candidate.id));
  const unknown = only.filter((id) => !known.has(id));
  throw new Error(`Unknown music candidate(s): ${unknown.join(', ')}`);
}

for (const candidate of selected) {
  const duration = candidate.chunks.reduce((sum, section) => sum + section.duration_ms, 0);
  const expectedDuration = DURATION_MS + (candidate.generationTailMs ?? 0);
  if (duration !== expectedDuration) {
    throw new Error(`${candidate.id} is ${duration}ms; expected ${expectedDuration}ms`);
  }
}

if (dryRun) {
  for (const candidate of selected) {
    console.log(`${candidate.id}: ${candidate.label}, ${(DURATION_MS / 1_000).toFixed(3)}s`);
  }
  process.exit(0);
}

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!masterOnly && !apiKey) throw new Error('ELEVENLABS_API_KEY is required');

for (const candidate of selected) {
  const output = join(
    MUSIC_ROOT,
    candidate.outputPath ?? join('candidates', `music-tense-${candidate.id}.m4a`),
  );
  mkdirSync(dirname(output), { recursive: true });
  if (masterOnly) {
    if (!existsSync(output)) throw new Error(`Cannot master missing candidate: ${candidate.id}`);
    const mastered = `${output}.master.m4a`;
    try {
      console.log(`master ${candidate.id}`);
      master(output, mastered);
      renameSync(mastered, output);
    } finally {
      rmSync(mastered, { force: true });
    }
    continue;
  }
  if (!force && existsSync(output)) {
    console.log(`skip ${candidate.id} (already exists)`);
    continue;
  }

  console.log(`generate ${candidate.id}`);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      composition_plan: { chunks: candidate.chunks },
      model_id: 'music_v2',
      respect_sections_durations: true,
      store_for_inpainting: false,
      sign_with_c2pa: false,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1_000);
    throw new Error(`ElevenLabs ${response.status} for ${candidate.id}: ${detail}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 10_000) {
    throw new Error(`ElevenLabs returned truncated audio for ${candidate.id}`);
  }

  const source = `${output}.source.mp3`;
  try {
    writeFileSync(source, audio);
    master(source, output);
  } finally {
    rmSync(source, { force: true });
  }
  console.log(`wrote ${output}`);
}

function master(input, output) {
  const analysis = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'info',
      '-i',
      input,
      '-af',
      `apad,atrim=duration=${DURATION_MS / 1_000},loudnorm=I=-14:TP=${MASTER_TRUE_PEAK_DB}:LRA=8:print_format=json`,
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  );
  if (analysis.status !== 0) {
    throw new Error(`ffmpeg analysis failed for ${output}: ${analysis.stderr.trim()}`);
  }

  const json = analysis.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
  if (!json) throw new Error(`ffmpeg returned no loudness analysis for ${output}`);
  const measured = JSON.parse(json);
  const normalize = [
    `loudnorm=I=-14:TP=${MASTER_TRUE_PEAK_DB}:LRA=8`,
    `measured_I=${measured.input_i}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_TP=${measured.input_tp}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    'linear=true',
  ].join(':');

  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      input,
      '-af',
      `apad,atrim=duration=${DURATION_MS / 1_000},${normalize}`,
      '-ar',
      '48000',
      '-ac',
      '2',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-movflags',
      '+faststart',
      output,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${output}: ${result.stderr.trim()}`);
  }
}
