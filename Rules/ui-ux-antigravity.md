# Antigravity Agency UI/UX Design System (`rules/ui-ux-antigravity.md`)

Always enforce these rules when writing, refactoring, or styling any frontend code. Never alter the project's core brand colors, theme polarity (dark/light), or text copy—elevate how those colors, spaces, interactions, and components are structured.

## 1. Typography & Visual Hierarchy
- **Headings:** Use tight letter-spacing (`tracking-tight` or `-0.03em`), tight line-height (`1.1` to `1.2`), and strong weight contrast (`font-semibold` or `font-bold`).
- **Body & Muted Text:** Never use 100% pure white or pure black for body paragraphs. Use 70%–80% opacity of the foreground token (`text-foreground/75`) with relaxed line-height (`leading-relaxed` / `1.6`).
- **Measure (Line Width):** All paragraph and subheadline blocks MUST be constrained to `max-w-2xl` or `max-w-[65ch]`. Never let text span full container width.
- **Eyebrow Labels:** Above major section headings, use structured pill badges or uppercase tracked labels (`text-xs uppercase tracking-[0.15em] opacity-70`).

## 2. Layout & Anti-AI Grid Rules
- **BANNED:** Three identical symmetrical cards in a single row with centered icons, bold titles, and 2 lines of centered text.
- **REQUIRED:** Use asymmetrical Bento grids (e.g., 2/3 width + 1/3 width), sticky split-screen scrolling sections, or clean horizontal feature rows with subtle dividers.
- **Macro vs. Micro Spacing:** Maintain generous vertical padding between sections (`py-24` to `py-32` on desktop, `py-16` on mobile). Inside cards, keep related elements tightly grouped (`gap-1.5` between title and description) and separate distinct groups with `gap-6` or `gap-8`.

## 3. Surfaces, Borders & Depth (Using Current Theme Colors)
- **BANNED:** Heavy colored drop shadows (`shadow-xl`), thick `2px+` solid borders, and harsh multi-stop background gradients.
- **Borders:** Use crisp `1px` hairline borders with low opacity (`border-white/10` in dark themes, `border-black/[0.08]` in light themes).
- **Surface Layering:** Cards and elevated containers must sit slightly above the background using subtle alpha blends (`bg-white/[0.03]` or `bg-black/[0.02]`) paired with `backdrop-blur-md`.
- **Inner Highlights:** Add a subtle top inner border highlight (`shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]`) on cards and primary buttons to create physical depth.

## 4. Cursor-Tracking Spotlight Cards & Background Textures
- **Spotlight Cards:** Bento and feature cards must include a subtle mouse-tracking radial gradient overlay (`radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), ...)` using the existing primary theme color at `6%–10%` opacity) that illuminates the card surface and `1px` border on hover without hurting performance.
- **Atmospheric Textures:** Apply an ultra-subtle SVG noise/grain overlay (`opacity-[0.025] pointer-events-none`) and/or a faded architectural dot/grid background mask (`[mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]`) using current theme border tokens so backgrounds never look flat.

## 5. Framer Motion & Micro-Interactions
- **Easing Curve:** Default to `ease: [0.22, 1, 0.36, 1]` for tween animations or `type: "spring", stiffness: 300, damping: 30` for interactive UI elements.
- **Hover States:** Never use `hover:scale-105` on cards. Transition border opacity, spotlight intensity, or translate child icons (`group-hover:translate-x-0.5`). Use `active:scale-[0.98]` on buttons.
- **Distance Limits:** Entrance animations must use subtle offsets (`y: 16` to `y: 20`). Never use large slide-ins (`x: -100` or `y: 100`).
- **Stagger & Viewport:** Keep `staggerChildren` between `0.05` and `0.08` seconds. Always set `viewport={{ once: true, margin: "-80px" }}` on `whileInView` components.
- **Performance Guardrail:** Only animate GPU-accelerated properties (`transform` and `opacity`, plus subtle `filter: blur()` on Hero load). Always support `useReducedMotion()`.