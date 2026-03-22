# IQBandit Style Guide

This document codifies the existing design system. All new code must follow these rules.

---

## Rules

1. **Use `components/ui/index.ts`** for all base UI elements — never write raw `<button>`, `<input>`, etc.
2. **Use `@layer components` classes** from `globals.css` — `btn-primary`, `card`, `input`, etc.
3. **Never use raw hex values** — use Tailwind color classes or CSS variables.
4. **Match theme to context** — light theme for marketing/nav pages, dark theme for dashboard.
5. **No visual changes** — codify what exists, don't invent new styles.

---

## Color Palette

### Light Theme (marketing, login, marketplace, nav)

| Role          | Tailwind Class   | Hex       |
|---------------|-----------------|-----------|
| Page bg       | `bg-gray-50`    | #F9FAFB   |
| Surface       | `bg-white`      | #FFFFFF   |
| Border        | `border-gray-200` | #E5E7EB |
| Text primary  | `text-gray-900` | #111827   |
| Text secondary| `text-gray-500` | #6B7280   |
| Text muted    | `text-gray-400` | #9CA3AF   |
| Brand         | `text-violet-600` / `bg-violet-600` | #7C3AED |
| Brand hover   | `hover:bg-violet-700` | #6D28D9 |

### Dark Theme (dashboard, connections, agents)

| Role           | Tailwind Class          | Hex / Notes        |
|----------------|-------------------------|--------------------|
| Page bg        | `bg-[#0A0A0A]`          | #0A0A0A            |
| Card surface   | `bg-zinc-900/40`        | rgba(24,24,27,0.4) |
| Border         | `border-zinc-800`       | #27272A            |
| Border hover   | `border-zinc-700`       | #3F3F46            |
| Text primary   | `text-zinc-100`         | #F4F4F5            |
| Text secondary | `text-zinc-400`         | #A1A1AA            |
| Text muted     | `text-zinc-500`/`600`   | #71717A / #52525B  |
| CTA blue       | `bg-blue-600`           | #2563EB            |
| CTA hover      | `hover:bg-blue-500`     | #3B82F6            |
| Success        | `text-emerald-400` / `bg-emerald-500` | #34D399 / #10B981 |
| Warning        | `text-amber-400` / `bg-amber-500`     | #FBBF24 / #F59E0B |
| Danger         | `text-red-400` / `bg-red-500`         | #F87171 / #EF4444 |

### CSS Variables (globals.css)

```css
--background: #F7F7F4   /* warm off-white page bg */
--foreground: #1A1A17   /* near-black body text */
--card: #FFFFFF
--border: #E8E8E4
--muted: #F0F0EC
--muted-fg: #6B6B60
```

---

## Typography

| Context          | Classes                                      |
|------------------|----------------------------------------------|
| Page title (dark)| `text-xl font-semibold text-zinc-100 tracking-tight` → `.section-title` |
| Page title (light)| `text-2xl font-semibold text-gray-900 tracking-tight` → `.section-title-light` |
| Section header   | `text-sm font-semibold text-zinc-200`        |
| Body text        | `text-sm text-zinc-400`                      |
| Small labels     | `text-xs text-zinc-500`                      |
| Micro labels     | `text-[10px] text-zinc-600 uppercase tracking-widest` |
| Code / mono      | `font-mono text-zinc-200`                    |

**Font:** Inter (loaded via `next/font/google`), with CSS feature settings for premium rendering.

---

## Border Radius

| Use case        | Class          | Size  |
|-----------------|----------------|-------|
| Cards           | `rounded-2xl`  | 16px  |
| Buttons, inputs | `rounded-xl`   | 12px  |
| Small elements  | `rounded-lg`   | 8px   |
| Pills / badges  | `rounded-full` | —     |

---

## Spacing

Primary gap scale used throughout: `gap-1.5`, `gap-2`, `gap-4`, `gap-5`, `gap-6`, `gap-8`

Standard card padding: `p-6`
Standard button padding: `px-4 py-2.5`
Standard input padding: `px-3 py-2` (dark) / `px-3.5 py-2.5` (light)

---

## Components (`components/ui/`)

### Button

```tsx
import { Button } from "@/components/ui";

<Button variant="primary">Connect</Button>
<Button variant="primary-light">Sign in</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost">Update keys</Button>
<Button variant="danger">Disconnect</Button>
<Button variant="primary" loading>Saving…</Button>
<Button variant="primary" size="sm">Small</Button>
```

### Card

```tsx
import { Card } from "@/components/ui";

<Card className="p-6">...</Card>           {/* dark card */}
<Card light className="p-6">...</Card>     {/* light card */}
<Card hover className="p-6">...</Card>     {/* dark card with hover border */}
<Card onClick={() => {}}>...</Card>        {/* renders as button */}
```

### Input

```tsx
import { Input } from "@/components/ui";

<Input label="API Key" type="password" showToggle theme="dark" />
<Input label="Email" type="email" theme="light" error="Invalid email" />
```

### Badge

```tsx
import { Badge } from "@/components/ui";

<Badge variant="success">Connected</Badge>
<Badge variant="warning">Partial</Badge>
<Badge variant="error">Failed</Badge>
<Badge variant="muted">Pro</Badge>
<Badge variant="brand">Popular</Badge>
```

### Skeleton

```tsx
import { Skeleton } from "@/components/ui";

<Skeleton className="h-3 w-24" />    {/* text skeleton */}
<Skeleton className="h-1.5 w-full" /> {/* bar skeleton */}
```

### Modal

```tsx
import { Modal } from "@/components/ui";

<Modal open={isOpen} onClose={() => setOpen(false)} title="Confirm">
  <p>Are you sure?</p>
</Modal>
```

### Toast

```tsx
import { Toast } from "@/components/ui";

<Toast message="Saved!" variant="success" onDismiss={() => setToast(false)} />
```

### Separator

```tsx
import { Separator } from "@/components/ui";

<Separator />             {/* dark divider */}
<Separator light />       {/* light divider */}
```

### Avatar

```tsx
import { Avatar } from "@/components/ui";

<Avatar name="Jane Doe" size="md" />
<Avatar src="/avatar.jpg" name="Jane Doe" size="lg" />
```

---

## `@layer components` Classes

These are available as plain CSS classes anywhere in JSX:

| Class              | Use                                      |
|--------------------|------------------------------------------|
| `btn-primary`      | Dark-theme primary CTA (blue)            |
| `btn-primary-light`| Light-theme primary CTA (gray-900)       |
| `btn-secondary`    | Dark secondary button (zinc-800)         |
| `btn-ghost`        | Subtle ghost button                      |
| `btn-danger`       | Danger/destructive button                |
| `card`             | Dark card container                      |
| `card-light`       | Light card container                     |
| `card-hover`       | Dark card with hover border transition   |
| `input`            | Dark theme text input                    |
| `input-light`      | Light theme text input                   |
| `badge-success`    | Green badge                              |
| `badge-warning`    | Amber badge                              |
| `badge-error`      | Red badge                                |
| `badge-muted`      | Gray badge                               |
| `badge-brand`      | Violet badge                             |
| `section-title`    | Dark page title                          |
| `section-title-light` | Light page title                      |
| `divider`          | Dark horizontal rule                     |
| `divider-light`    | Light horizontal rule                    |

---

## What Not To Do

- ❌ `<button className="bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-xl text-sm font-medium text-white">` — use `<Button>`
- ❌ `<div className="rounded-2xl border border-zinc-800 bg-zinc-900/40">` — use `<Card>`
- ❌ `color: #2563eb` in inline styles — use `text-blue-600` or `bg-blue-600`
- ❌ Mixing dark/light theme classes in the same component without intent
- ❌ Creating one-off skeleton divs — use `<Skeleton>`
