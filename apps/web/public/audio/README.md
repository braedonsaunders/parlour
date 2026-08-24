# parlour audio suite

The game SFX in `audio/sfx/` are generated with ElevenLabs Sound Effects v2 from
the production prompts in `apps/web/scripts/generate-sfx.mjs`. To regenerate the
library, put `ELEVENLABS_API_KEY` in the ignored root `.env.local`, then run
`pnpm --filter @parlour/web generate:sfx`. Existing files are skipped unless the
command is passed `--force`. The script uses ffmpeg to loudness-master every file
at 44.1 kHz with event-specific targets and safe true-peak headroom.

`parlour-ambience.wav` is an original seeded procedural fallback; regenerate it
with `pnpm --filter @parlour/web generate:ambience`. Music tracks live in
`audio/music/` and are documented in `docs/music/SUNO-PROMPTS.md`.
