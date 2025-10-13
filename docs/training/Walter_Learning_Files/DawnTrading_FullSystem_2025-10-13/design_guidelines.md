# Crypto Day Trading Platform Design Guidelines

## Design Approach
**Reference-Based: Modern Trading Platforms** (Robinhood + Coinbase + TradingView fusion)
- Robinhood's accessible minimalism
- Coinbase's trust-building professionalism  
- TradingView's data-dense clarity
- Linear's crisp typography and spacing

**Core Principle**: Information density without visual clutter. Every pixel serves the trader's decision-making speed.

---

## Color System (Light Theme)

### Foundation
- **Background**: White (bg-white)
- **Text Primary**: Gray-800 (text-gray-800)
- **Text Secondary**: Gray-600 (text-gray-600)
- **Borders**: Gray-200 (border-gray-200) - subtle, professional
- **Dividers**: Gray-100 (border-gray-100) - lighter for section separation

### Action Colors (HSL Space-Separated Format)
- **Execute Button**: 142 71% 45% (vibrant green, confidence-inspiring)
- **Chat AI Button**: 221 83% 53% (professional blue, intelligence)
- **Watchlist Button**: 45 93% 47% (attention-grabbing yellow/gold)
- **Dismiss Button**: 220 9% 46% (neutral gray, non-destructive)

### Data Visualization
- **Positive/Gain**: 142 71% 45% (matches Execute green for consistency)
- **Negative/Loss**: 0 84% 60% (clear red for losses)
- **Neutral/Pending**: 220 9% 46% (gray)
- **Chart Lines**: 221 83% 53% (blue for primary data)
- **Background Cards**: Gray-50 (bg-gray-50) for elevated surfaces

---

## Typography

**Font Stack**: 
- Primary: 'Inter' (Google Fonts) - exceptional readability for financial data
- Monospace: 'JetBrains Mono' (Google Fonts) - for price displays and numerical data

**Hierarchy**:
- **Dashboard Title**: text-2xl font-semibold (32px, 600 weight)
- **Section Headers**: text-lg font-semibold (18px, 600 weight)
- **Card Titles**: text-base font-medium (16px, 500 weight)
- **Body Text**: text-sm (14px, 400 weight)
- **Price Data**: text-lg font-mono font-semibold (18px monospace)
- **Micro Labels**: text-xs text-gray-600 uppercase tracking-wide (12px, uppercase)

---

## Layout System

**Spacing Primitives**: Tailwind units of **2, 4, 8, 12, 16** (p-2, p-4, p-8, p-12, p-16)
- Tight spacing: 2-4 units (cards, buttons)
- Component padding: 4-8 units
- Section spacing: 12-16 units

**Grid Structure**:
- Desktop: 12-column grid with 4-unit gaps
- Main dashboard: 3-column layout (Sidebar 2 cols | Main Content 7 cols | AI Panel 3 cols)
- Responsive: Stack to single column on mobile

**Container Max-Width**: max-w-screen-2xl (1536px) for large monitors

---

## Component Library

### Navigation Header
- Fixed top, white background with subtle shadow (shadow-sm)
- Height: h-16
- Logo (left) | Search bar (center, max-w-md) | Quick stats + Profile (right)
- Micro price tickers scrolling horizontally

### Sidebar (Left)
- Width: w-64, bg-gray-50
- Dashboard, Opportunities, Portfolio, Watchlist, Settings
- Active state: bg-white with blue left border (border-l-4 border-blue-500)

### Trading Opportunity Cards
- White background (bg-white), rounded-lg, border border-gray-200
- Padding: p-6
- Structure: Crypto pair + price (top) | AI confidence score with visual indicator | Action buttons row (bottom)
- Button row: 4 buttons horizontal, gap-2 spacing
- Each button: px-4 py-2 rounded-md, font-medium text-sm

### Portfolio Chart Section
- Large card: bg-white rounded-xl border border-gray-200 p-8
- Chart area: min-h-96
- Time range tabs above chart: 1H, 4H, 1D, 1W, 1M (pill-shaped, active state with blue background)
- Stats row below chart: Total Value | 24h Change | Win Rate (3-column grid)

### AI Analysis Panel (Right)
- Fixed width: w-80, bg-gray-50
- Sticky position during scroll
- Chat interface: Messages stacked with bg-white bubbles (AI) vs bg-blue-50 (user)
- Input at bottom: white background, rounded-lg, shadow-md elevation

### Data Tables
- Striped rows: even rows bg-gray-50
- Header: bg-gray-100 text-gray-600 uppercase text-xs font-semibold
- Cell padding: px-4 py-3
- Borders: border-b border-gray-200

### Modal Overlays
- Backdrop: bg-black/50 (semi-transparent black)
- Modal: bg-white rounded-xl shadow-2xl max-w-2xl
- Close button: top-right, text-gray-400 hover:text-gray-600

---

## Images

**Hero Section**: Large banner image showing abstract financial charts/data visualization
- Placement: Top of dashboard, full-width, h-64
- Style: Semi-transparent overlay with text on top
- Content: "AI-Powered Crypto Trading" headline + real-time market summary
- Image description: Modern, abstract visualization of trading data with blue/green gradient overlay, showing candlestick patterns and trend lines in soft focus

**Icon System**: Heroicons (via CDN) - use outline style for navigation, solid for actions

---

## Interaction Patterns

**Button Hover States**: All buttons darken 10% on hover (built-in behavior, no custom specs needed)
**Focus States**: Blue ring (ring-2 ring-blue-500) for keyboard navigation
**Loading States**: Spinner with text-blue-500 color for Execute/Chat actions
**Animations**: Minimal - only fade-in for new opportunity cards (duration-200), no distracting motion

**Card Elevation**: 
- Default: border only
- Hover: shadow-md transition-shadow duration-200
- Active/Selected: shadow-lg border-blue-300

---

## Accessibility & Dark Mode

While light theme is primary, maintain consistent contrast ratios (WCAG AA minimum):
- Text on white: Use gray-800 (confirmed accessible)
- Buttons: Ensure text color contrasts with button background (white text on colored buttons)
- Form inputs: Border-gray-300, focus:border-blue-500 focus:ring-2 ring-blue-200

**Note**: Dark mode NOT implemented per user requirement for light theme