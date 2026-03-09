# UI Redesign: Structured Minimal

**Date**: 2026-03-09
**Style**: Clean & minimal, inspired by Uniswap/Aave
**Palette**: Cyan/teal accents on dark navy

## Design Tokens

### Colors
- `--background`: `#0a0e1a` (flat, no gradients)
- `--surface`: `#111827` (cards/panels)
- `--surface-hover`: `#1a2332`
- `--border`: `rgba(255,255,255,0.06)`
- `--border-hover`: `rgba(255,255,255,0.1)`
- `--text-primary`: `#f1f5f9`
- `--text-secondary`: `#94a3b8`
- `--text-muted`: `#64748b`
- `--accent`: `#06b6d4` (cyan-500)
- `--accent-hover`: `#22d3ee` (cyan-400)
- `--accent-muted`: `rgba(6,182,212,0.1)`
- `--success`: `#22c55e`
- `--destructive`: `#ef4444`

### Typography
- Page titles: `text-2xl font-semibold`
- Section titles: `text-lg font-medium`
- Body: `text-sm` (14px)
- Captions: `text-xs text-secondary`
- Addresses/IDs: `font-mono text-sm`

### Spacing
- Cards: `p-6`, gap `gap-6`
- Sections: `gap-8`
- Radius: `rounded-xl` cards, `rounded-lg` inputs/buttons

## Removals
- `.glass-card`, `.glow-ring`, `.bg-page` radial gradients
- Shimmer overlays, pulse animations, `page-enter` animation
- Gradient text on logo

## Components

### NavBar
- `bg-background/80 backdrop-blur-sm border-b border-white/5`
- Logo: "DCA Swap" `font-semibold text-lg` plain white
- User email `text-sm text-secondary`, ghost sign-out button
- `max-w-6xl mx-auto px-6`

### Auth Pages (Login/Signup)
- Centered, `max-w-sm`
- Card: `bg-surface rounded-xl border border-white/6 p-8`
- Text header only (no icon with glow)
- Inputs: `bg-white/[0.03] border border-white/8 rounded-lg h-11`
- Primary button: `bg-accent hover:bg-accent-hover text-white rounded-lg h-11`
- OAuth: `bg-white/[0.04] border border-white/8`

### Account Card
- Empty: accent-muted icon, clean text, solid CTA button
- Filled: status badge, label-value pairs, inline copy buttons
- Card: `bg-surface border border-white/6 rounded-xl p-6`

### Fund Guide
- Same card style, numbered steps, monospace account display
- External link in accent color

## Layout

### Dashboard
- NavBar top, `max-w-6xl mx-auto px-4 sm:px-6 py-8`
- Content: `max-w-2xl` single column

### Auth
- `min-h-screen flex items-center justify-center`
- No navbar, subtle footer branding
