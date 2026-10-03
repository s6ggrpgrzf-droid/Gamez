# REEL EMPIRE — Movie Studio Tycoon (working title)

A deep management sim for the Gamez repo. Research-backed design:
`~/workspace/research_notes/tycoon-game-design-research-20261002-0254/report.md`

## Fantasy
Build a movie studio from a 1955 western outfit into a Hollywood legend.

## Pillars (from research)
1. **Production pipeline** — script → greenlight → production (dilemma cards) → release (timing + marketing) → box office (decays to zero) → awards
2. **Talent with careers** — actors/directors: talent, fame, genre fit, salary, stress/boredom, aging, retirement at 70, poaching
3. **Moving market** — deterministic genre taste cycles (visible ▲▼ chips), audience segments, yearly world-event deck, shared release calendar
4. **Living rivals** — 3 AI studios with visible slates, tech race, awards competition, star poaching
5. **Prestige > multipliers** — awards earn ★ prestige currency; prestige shop unlocks mechanics (arthouse division, franchises); no infinite revenue tails; bets failable at every scale

## Time
Weeks. Start Jan 1955. Speeds: pause / 1x / 3x, +1 month button. Offline progress capped.

## Eras & unlocks
- Genres unlock by year (western/drama/comedy/musical/romance 1955 → horror 1960 → thriller 1965 → action 1970 → scifi 1972 → fantasy 1980 → animation 1985 → superhero 2002)
- Tech tree: Color, Widescreen, Method Acting, Auteur Cinema, Blockbuster Formula, CGI, Digital, Streaming. Research race vs rivals; innovator gets temporary edge.

## Film math (tuned)
- Quality = script★ + director/cast talent + budget fit (over/under-spending penalized) + tech + dilemma mods
- Opening = f(budget^0.72, star fame, marketing, genre heat, quality); legs depend on quality (flops die fast, hits run long); studio keeps 50%
- Marketing over-exposure: spend > 80% of budget → buzz penalty
- Critics score with breakdown (script/direction/cast/craft)
- December awards → ★ prestige + next-year box office buffs

## Feature update 2026-10-02 (competitor-inspired)
- **Script development**: every script has a theme (10-pool) + target audience (Family/Teens/Adults/Prestige). Owned scripts can be Developed: polish (+1★, max 5★, 2 passes, $1.5M + 3 wks) and one theme rewrite ($0.8M, instant).
- **Theme × genre synergy**: each theme favors 2-3 genres (+3 quality); discovered per-theme at release, then shown as hints.
- **Audience fit**: genre-norm matches (Family+Animation, Adults+Drama, Teens+Horror/Action, Prestige+Drama) give +8% opening; mismatches (Family+Horror etc.) −10%; Prestige gives +6 critic, −8% opening.
- **Department budgets**: 5 sliders (Cast, Sets & Costumes, Stunts & FX, Sound & Music, Cinematography) totalling 100%; genre-ideal mix defined in data.js; fit grants ±6 quality. Genre's top-3 wants shown as hints in the greenlight modal.
- **Talent traits**: 1-2 per talent from 8 (Perfectionist +4q/stress×1.5, Diva +50% salary/fame draw +jealousy, Workhorse −2q/fast stress decay, Charmer +buzz, Reliable halves dilemma damage, Volatile ×3 scandal/peak bonus, Method Actor +6 drama/−4 comedy, Veteran mentors co-stars). Shown as tooltip chips.
- **Star scandals**: weekly checks on fame≥50 talent, p = 0.4% × fame × (1+stress) × (3 if Volatile). Choice modal: apologize ($0.5M, −5 fame, stress→20), lean in (50-65% win: +15 fame/+10 buzz; lose: −10 fame/−3 film quality), lay low (unavailable 6 wks, stress→0, −3 fame).
- **Visuals**: era art direction on posters (50s painted / 70s gritty / 80s neon / modern minimal), taglines, grain, genre title typography; richer studio-lot SVG (gate, lit windows, backlot set = last genre, CGI lab, blinking marquee); premiere-night red-carpet modal; CSS polish on cards/tabs/buttons.
- Save migrated v1→v2 (themes/audiences/traits/depts/scandals backfilled; never crashes on old saves).

## Win / lose
- Win: $1B studio valuation → Hollywood Legend (sandbox continues)
- Lose: cash < -$5M → bankruptcy, stats, restart

## Files
- index.html, style.css, data.js, game.js → served from Gamez repo root via GitHub Pages
- Save: localStorage `reel-empire-v1`, autosave weekly
