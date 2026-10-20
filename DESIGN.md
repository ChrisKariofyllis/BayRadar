---
name: BayRadar
description: Self-hosted automated eBay deal radar & auction sniper dashboard
colors:
  primary: "#f5b14a"
  primary-gradient-from: "#fcd34d"
  primary-gradient-to: "#f59e0b"
  primary-foreground: "#18181b"
  background: "#09090b"
  card: "#18181b"
  card-elevated: "rgba(255, 255, 255, 0.03)"
  border: "rgba(255, 255, 255, 0.08)"
  foreground: "#f4f4f5"
  muted: "#a1a1aa"
  success: "#10b981"
  danger: "#ef4444"
  warning: "#f59e0b"
  info: "#0ea5e9"
  ai-verified: "#c084fc"
typography:
  display:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.025em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  button-secondary:
    backgroundColor: "{colors.card-elevated}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  input-field:
    backgroundColor: "#0000004d"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "44px"
  card-container:
    backgroundColor: "{colors.card-elevated}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "16px 20px"
  badge-neutral:
    backgroundColor: "rgba(255, 255, 255, 0.05)"
    textColor: "#d4d4d8"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: BayRadar

## Overview

**Creative North Star: "The Tactical Radar Deck"**

BayRadar embodies the precision and calm authority of a modern avionics radar terminal. Built specifically for homelab operators, bargain hunters, and hardware enthusiasts, the interface presents high-density market surveillance data on a backdrop of deep obsidian glass. Every surface feels intentionally calibrated: atmospheric radial glow beacons indicate background scanning health, hairline translucent borders establish structure without visual bulk, and subtle backdrop blurs allow ambient depth to filter through data cards.

The aesthetic deliberately rejects generic "SaaS slop"—there are no pastel purple primary CTAs, no floating bright white cards, no cartoonish illustrations, and no decorative animations that delay user interaction. Visual hierarchy is sharp and unambiguous: active scans and high-conviction deals glow with warm signal amber, verified listings carry concise tactical telemetry tags, and secondary controls remain quiet in low-contrast translucent zinc until engaged.

**Key Characteristics:**
- **Layered Obsidian Glass**: Deep `#09090b` canvas with frosted `backdrop-blur-md` surfaces and subtle `white/[0.08]` hairline borders.
- **Signal-Driven Hierarchy**: Signal Amber serves as an operational beacon, reserved exclusively for action triggers, pulse animations, and verified deals.
- **Information-Dense Telemetry**: Monospace timestamps, countdowns, currency amounts, and margin comparisons designed for rapid scanning.
- **Tactile Utility**: Compact, responsive controls with crisp hover transitions and instant mobile bottom-sheet inspections.

## Colors

The palette is anchored by deep obsidian void tones and elevated with tactical status accents and a warm Signal Amber beacon.

### Primary
- **Signal Amber** (`#f5b14a` / gradient from `#fcd34d` to `#f59e0b`): The core operational accent. Used for the primary execution actions ("New Monitor", "Arm Snipe", "Trigger Scan"), the active radar ring pulse, and deal highlight callouts. Contrast text is dark obsidian (`#18181b`).

### Secondary
- **AI Violet** (`#c084fc` / border `#c084fc59` / background `#3b076466`): Dedicated indicator for AI Title Gatekeeper inspection and verification chips. Distinguishes automated intelligence heuristics from native marketplace data.

### Status & Accents
- **Tactical Emerald** (`#10b981` / background `rgba(16, 185, 129, 0.1)`): Live poller status, profitable margin spreads, and active sniping confirmations.
- **Critical Red** (`#ef4444` / background `rgba(239, 68, 68, 0.1)`): Destructive actions, scan errors, outbid statuses, and scam rejection warnings.
- **Telemetry Sky** (`#0ea5e9` / background `rgba(14, 165, 233, 0.1)`): Informational badges, monitor category tags, and external marketplace links.

### Neutral
- **Obsidian Void** (`#09090b`): Canvas background, presenting deep contrast with zero glare.
- **Frosted Slate** (`#18181b` / `rgba(255, 255, 255, 0.03)`): Primary card, modal, and sheet surfaces, paired with `rgba(255, 255, 255, 0.08)` borders.
- **Radar Foreground** (`#f4f4f5`): High-legibility primary typography and active icons.
- **Telemetry Muted** (`#a1a1aa`): Secondary labels, timestamps, eBay seller ratings, and unselected navigation items.

### Named Rules
**The Beacon Rule.** Signal Amber is reserved strictly for primary execution triggers (`New Monitor`, `Trigger Scan`, `Arm Snipe`) and live radar status pulses. It is never used as a generic background tint, table header wash, or decorative filler. Its rarity is what commands instant attention.

**The Ghost Border Fallback.** Surfaces achieve separation through subtle alpha borders (`rgba(255, 255, 255, 0.08)`) and tonal glass shifts rather than opaque contrasting outlines or drop-shadow halos.

## Typography

**Display Font:** Geist Sans (fallback: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`)
**Body Font:** Geist Sans (fallback: `ui-sans-serif, system-ui, sans-serif`)
**Label/Mono Font:** Geist Mono (fallback: `ui-monospace, SFMono-Regular, Menlo, monospace`)

**Character:** Clean, technical, and geometric. Geist Sans delivers neutral clarity for complex listings, while Geist Mono brings instrument-grade precision to prices, countdown clocks, and version stamps.

### Hierarchy
- **Display** (Bold 700, `1.875rem` / `30px`, line-height `1.2`, tracking `-0.025em`): Page titles (Monitors, Deals Feed, Settings).
- **Headline** (SemiBold 600, `1.5rem` / `24px`, line-height `1.3`, tracking `-0.02em`): Section headings, modal header titles.
- **Title** (SemiBold 600, `1.125rem` / `18px`, line-height `1.4`, tracking `-0.015em`): Deal card listing titles, monitor card query labels.
- **Body** (Regular 400, `0.875rem` / `14px`, line-height `1.5`, tracking `normal`): Descriptions, form input text, modal explanations, filter bar controls.
- **Label** (Medium 500, `0.75rem` / `12px`, line-height `1.4`, tracking `0.025em`, Monospace): Countdown timers, Euro currency figures, margin discount percentages, version chips, and status badges.

### Named Rules
**The Numeric Precision Rule.** All currency amounts, countdown timers, margins, and system version tags must render in `Geist Mono` (`font-mono`) to ensure tabular alignment and immediate numerical legibility.

## Layout

BayRadar utilizes a centered, high-density dashboard container architecture with maximum width constrained to `max-w-7xl` (`80rem` / `1280px`) and responsive horizontal padding (`px-4 sm:px-6`).

- **Grid Systems**:
  - Deals Feed: Responsive multi-column grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`).
  - Monitors List: Structured single or dual column layout (`grid-cols-1 md:grid-cols-2 gap-4`).
  - Settings: Structured vertical stack of grouped cards (`max-w-4xl mx-auto space-y-6`).
- **Responsive Navigation**:
  - Desktop: Floating pill navbar with backdrop blur (`sticky top-0 z-50 backdrop-blur-xl bg-background/70`).
  - Mobile: Sticky header with an integrated horizontal scrolling tab row (`min-h-11` tap targets).
- **Surface Elevation Modals**:
  - Desktop: Centered dialog modal (`sm:max-w-xl sm:rounded-2xl`).
  - Mobile: Bottom-sheet slide-up with swipe-dismiss capability (`rounded-t-2xl max-h-[85vh]`).

## Elevation & Depth

Depth in BayRadar is achieved through translucent material layering, subtle inner rings, and ambient background lighting rather than heavy drop shadows.

- **Ambient Layering**:
  - Fixed full-bleed ambient background with dual radial glow: warm amber (`rgba(245, 158, 11, 0.22)`) at the top center and subtle deep purple (`rgba(147, 51, 234, 0.2)`) at the bottom right.
  - Fine radar dot grid (`24px` grid of `rgba(255, 255, 255, 0.11)` dots masked radially toward edges).
- **Surface Depth Hierarchy**:
  - Level 0 (Canvas): `#09090b`.
  - Level 1 (Cards & Panels): `rgba(255, 255, 255, 0.03)` with `border-white/[0.08]`, `ring-1 ring-white/[0.04]`, and `backdrop-blur-md`.
  - Level 2 (Floating Popovers & Nav): `rgba(24, 24, 27, 0.8)` with `backdrop-blur-xl` and `border-white/[0.1]`.
  - Level 3 (Dialog Modals): `#18181b` solid base with `shadow-2xl` and `ring-1 ring-white/10`.

### Named Rules
**The Hairline Boundary Rule.** All elevated containers must pair a `1px` outer hairline border (`border-white/[0.08]`) with an ultra-subtle inset ring (`ring-1 ring-white/[0.04]`) to define clean glass edges against dark imagery.

## Shapes

BayRadar pairs softly curved outer boundaries with sharp internal content discipline:

- **Containers & Cards**: `rounded-2xl` (`16px`) for primary cards, modal dialogs, and setting panels.
- **Controls & Buttons**: `rounded-xl` (`12px`) for buttons, text inputs, selects, and textareas.
- **Pills & Status Indicators**: `rounded-full` (`9999px`) for badges, navigation pill bars, format tags, and sniper status chips.
- **Inner Imagery**: Deal thumbnails use `aspect-[4/3]` with sharp corners masked by parent card clipping (`overflow-hidden`).

## Components

### Buttons
Tactile, compact, and clearly prioritized by purpose.
- **Primary**: Gradient fill (`from-amber-300 to-amber-500`), dark zinc text (`#18181b`), `ring-1 ring-white/10`, hover brightness shift (`hover:from-amber-200 hover:to-amber-400`). Height `36px` (`h-9`), padding `px-3.5`, font weight `500`.
- **Secondary**: Translucent white fill (`bg-white/[0.06]`), text `#f4f4f5`, `ring-1 ring-white/10`, hover `bg-white/[0.1]`.
- **Outline**: Transparent background, `border border-white/[0.1]`, text `#f4f4f5`, hover `bg-white/[0.05]`.
- **Ghost**: Transparent background, text `#a1a1aa`, hover `bg-white/[0.06] text-zinc-50`.
- **Destructive**: Low-contrast text `#a1a1aa`, hover `bg-red-500/10 text-red-400`.

### Badges & Status Chips
Pill-shaped (`rounded-full`), micro typography (`text-xs font-medium`), with translucent background and colored tint border:
- **Neutral**: `bg-white/5 text-zinc-300 border-white/10` (used for listing format e.g. "Auction", "BIN").
- **AI Verified**: `bg-purple-950/40 text-purple-200 border-purple-400/35 shadow-purple-950/50` with `<Sparkles />` glyph.
- **Arbitrage Margin**: `bg-emerald-500/10 text-emerald-300 border-emerald-400/15` with fire badge.
- **Countdown Clock**: `border-white/15 bg-black/40 text-zinc-100 backdrop-blur-md`.

### Cards
- **Structure**: `rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md ring-1 ring-white/[0.04]`.
- **Deal Cards**: Aspect-ratio thumbnail header (`aspect-[4/3]`), absolute floating pill chips for format and status, dense title and price metadata footer, direct quick-view modal trigger.

### Inputs & Fields
- **Base Style**: `h-11 rounded-xl border border-white/[0.08] bg-black/30 px-3 text-sm text-zinc-100 placeholder:text-zinc-400`.
- **Focus**: `focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/20 focus:outline-none`.

### Signature Component: The Radar Beacon
- **Brand Glyph**: Amber gradient square (`h-8 w-8 rounded-xl`) holding a pulsating radar dish (`.radar-pulse` scale 1 to 1.18) layered above an expanding sonar ring (`.radar-ring` expanding from scale 0.7 to 1.85 with opacity fading to 0 over 2.4s). Respects `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** use `font-mono` for all prices, countdown timers, margins, and timestamps.
- **Do** reserve the Signal Amber gradient strictly for primary execution triggers and radar beacons.
- **Do** maintain translucent glass containers (`bg-white/[0.03] backdrop-blur-md`) with `border-white/[0.08]` hairlines.
- **Do** provide mobile bottom sheets alongside desktop dialog modals for complex inspections.
- **Do** show active status indications with pulsing dot badges (e.g. emerald live indicator).

### Don't:
- **Don't** use generic SaaS purple buttons or bright gradients as primary action triggers.
- **Don't** introduce solid pure-white card backgrounds or heavy opaque drop shadows.
- **Don't** use decorative animations or slow transition delays that obstruct immediate data intake.
- **Don't** mix multiple conflicting accent colors on the same data card; keep metadata badges focused.
- **Don't** omit the dark mode color scheme or create low-contrast gray-on-dark text below accessibility minimums.
