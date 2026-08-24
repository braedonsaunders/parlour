# parlour audio suite

The game SFX in `audio/sfx/` are generated with ElevenLabs Sound Effects v2 from
the production prompts in `apps/web/scripts/generate-sfx.mjs`. To regenerate the
library, put `ELEVENLABS_API_KEY` in the ignored root `.env.local`, then run
`pnpm --filter @parlour/web generate:sfx`. Existing files are skipped unless the
command is passed `--force`. The script uses ffmpeg to loudness-master every file
at 44.1 kHz with event-specific targets and safe true-peak headroom.

Wild Pile's human action-card callouts live in `audio/sfx/voice/`. They use the
ElevenLabs `eleven_v3` text-to-speech model and the voice pinned in
`apps/web/scripts/generate-voice.mjs` (currently the punchy American male arcade
host selected for Wild Pile). Regenerate them with
`pnpm --filter @parlour/web generate:voice`; use `--force` to replace existing
files or `--only=reverse,skip` to author selected lines. Each line is trimmed and
loudness-mastered for immediate in-game playback.

`parlour-ambience.wav` is an original seeded procedural fallback; regenerate it
with `pnpm --filter @parlour/web generate:ambience`. Music tracks live in
`audio/music/` and are documented in `docs/music/SUNO-PROMPTS.md`.
