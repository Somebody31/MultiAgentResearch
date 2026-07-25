# Frontend don’ts — Multitrack Research desk

Live iteration notes (2026-07-25). When something “looks AI-generated,” it usually matches one of these patterns. Prefer the console fix in the **Do instead** column.

**Identity lock:** Multitrack research session — graphite panels, amber arm LED, mono meters, flat borders. Operate density. Not SaaS soft-UI, not neon AI chrome, not editorial serif.

---

## Anti-patterns (don’t ship these)

### 1. Soft SaaS pills for instrument chrome

**Don’t:** `border-radius: 999px` / full pills on stage chips, track status, or run-state chrome.

**Why it reads AI:** Default “modern product UI” chips. Looks like every generic dashboard template.

**Do instead:** Console segments — `4–6px` radii, left LED bar or square LED, track/panel fill, 1px border. Pills only for tiny optional chips if anything.

**Caught in live:** stage ruler “Research ×4”, status “Complete” badge.

---

### 2. Soft tinted washes instead of material surfaces

**Don’t:** Semi-transparent colored fills as the main chip surface  
(`color-mix(... play 8% ...)`, pastel green/amber baths on idle/done states).

**Why it reads AI:** Gradient-adjacent “AI product” softness; no solid material.

**Do instead:** Opaque console materials — `--track`, `--panel`, hairline borders. Color lives on the LED, border, or mono meta — not a foggy fill.

**Caught in live:** done-stage soft green wash.

---

### 3. Soft circular LEDs with glow halos

**Don’t:** Perfect circles + multi-ring `box-shadow` glow as default arm/status lights (unless truly “recording live” and rare).

**Why it reads AI:** Generic “AI agent is thinking” orb language.

**Do instead:** Small square/rect LEDs (`1–2px` radius), bar LEDs for armed/done, glow only for the single live/recording moment (amber LED rule).

**Caught in live:** lane arm dots, soft stage/status chrome; accepted direction = bar/square LEDs.

---

### 4. Tiny muted caption type for readable UI copy

**Don’t:** Primary helper/bridge/status reading text at `11–12px` muted gray as the default “label” look.

**Why it reads AI:** Default dense admin/AI-tool caption scale; feels unfinished and hard to read.

**Do instead:** Bridge and body-adjacent copy at **≥14–15px**, `color: var(--fg-2)` (not washed-out meta). Reserve `11–12px` mono for true meters (codes, counts, timestamps).

**Caught in live:** `.arrangement-bridge` (accepted **15px**).

---

### 5. Pill badges for run state

**Don’t:** Uppercase pill chips (`padding + radius-pill + soft border`) as the main “Complete / Running” treatment next to arrangement.

**Why it reads AI:** Template status chips from every SaaS kit.

**Do instead:** Meter plate — track background, square LED + plain mono status word + hint separated by `·`. No pill chrome inside the plate.

**Caught in live:** `.trace-status` (accepted LED meter plate).

---

### 6. Generic “product UI” type hierarchy

**Don’t:** Everything soft system-UI, same weight steps, no meter face — looks like a default AI chat shell with cards.

**Why it reads AI:** No instrument voice; hierarchy only from gray levels.

**Do instead:**
- Sans for names/titles (weight + size).
- Mono only for codes, summaries, timestamps, DEMO meters (Meter Face rule).
- Avoid costume mono on long prose; avoid costume display serif entirely.

---

### 7. LLM tutorial helper prose

**Don’t:** Long soft captions that sound like a model explaining the UI  
(“Pipeline steps above… runs parallel tracks below — expand a track for detail.”)

**Why it reads AI:** Chatbot onboarding tone, not console labeling.

**Do instead:** Short operator copy. Prefer graph language (stages, fan-out, tracks, report). Cut throat-clearing. If it needs a paragraph, raise type size and tighten wording.

---

### 8. Uniform soft-rect “card stack” tracks

**Don’t:** Track headers that feel like generic accordion list rows (soft padding, circular status, title + uppercase meta chip) with no channel geometry.

**Why it reads AI:** Same pattern as AI agent “tools” panels and chat sidebars.

**Do instead:** Multitrack channel strip — arm LED geometry, track code (`T01`), name, mono summary; clear armed/active/complete states from the lane body, not from card decoration.

**Caught in live:** `.lane-head` (user flagged “these also need changes”).

---

### 9. Still banned (from DESIGN / product honesty)

- Cyber-neon purple/cyan glows, gradient text, glassmorphism.
- Prior ink-instrument identity (display serif + teal).
- Fake production telemetry — always **DEMO** on synthetic meters.
- Invented customers, logos, SLAs, benchmarks.

---

## Quick check before shipping UI

Ask of each new control:

1. Would this look at home in a **DAW/console** strip, or only in a **SaaS marketing dashboard**?
2. Is color on an **LED / border / mono meter**, or a **soft wash**?
3. Is radius **≤10px** for chrome (not pill) unless it’s a true tiny chip?
4. Is readable text **≥14px** when it’s meant to be read?
5. Does copy sound like an **operator**, or like a **chatbot tour**?

If three answers fail, redesign before merge.

---

## Source of truth

- Visual system: `DESIGN.md` (Multitrack Research Session)
- Product honesty / DEMO: `PRODUCT.md`
- Desk implementation: `multi-agent-research-tool.html`
- This file: update when live critique finds a new repeated “AI look” pattern
