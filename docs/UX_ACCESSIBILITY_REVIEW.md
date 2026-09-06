# BCS ONE UX, Brand Alignment and EU Accessibility Review

## Purpose

This document records the design rationale and accessibility baseline for the BCS ONE Console. It is a product/engineering review, not a legal compliance certificate.

The revamp has two goals:

1. Make the pilot feel visually related to the current BCS HR Software proposition without copying proprietary website code, illustrations or logo artwork.
2. Make accessibility a built-in quality characteristic using WCAG 2.2 AA-oriented interaction patterns and relevant EN 301 549 considerations.

## Public BCS HR Software review

Reviewed public sources:

- https://bcs-hr.com/
- https://bcs-hr.com/en/
- https://bcs-hr.com/en/solutions
- https://bcs-hr.com/en/solutions/hr-software
- https://bcs-hr.com/en/about-us

The public BCS experience repeatedly communicates the following themes:

### Employee journey first

The main proposition is organised around the complete employee journey rather than around technical product APIs. Recruitment, onboarding, HR operations, payroll, learning/development, benefits, engagement and adjacent lifecycle capabilities are presented as one coherent journey.

**BCS ONE response:** the Platform Overview now carries an employee-journey ribbon before operational detail, while Scenario Lab and Product Landscape remain available for deeper proof.

### Specialist products, integrated experience

BCS explicitly positions specialised solutions as powerful individually and stronger when integrated. It also describes the business problem of a fragmented HR application landscape.

**BCS ONE response:** visual hierarchy and copy present MCP federation as the integration mechanism behind one governed business experience. Product systems remain systems of record.

### Multi-product brand identity

BCS states that its refreshed logo combines the base house-style colours of its products. The public site therefore has a recognisable multi-product visual character rather than a single monochrome enterprise palette.

**BCS ONE response:** the Console uses a restrained blue-led palette with violet, magenta, orange, teal and cyan journey accents. These are original CSS treatments; no BCS logo asset or public-site stylesheet is copied.

### People-first, spacious communication

The public site uses large statements, generous whitespace, simple benefit blocks and plain-language descriptions such as user-friendly, intuitive and available across devices.

**BCS ONE response:** headings are larger, cards are less dense, navigation is lighter, technical evidence is visually secondary to business outcomes, and mobile/tablet layouts use the same information hierarchy.

## Design system decisions

### Palette

BCS ONE uses dark blue as the primary information colour, white/light neutral surfaces for the workspace, and multiple accent colours only where they communicate journey/product diversity.

Accessibility rules:

- body text uses dark ink on white/light surfaces;
- muted text remains dark enough for normal reading rather than decorative light grey;
- status meaning is always communicated by text plus border/background, not colour alone;
- keyboard focus uses a high-contrast blue ring independent of component colour.

### Typography

The Console uses the operating-system UI font stack to avoid loading an unnecessary remote font dependency. Headings use strong weight and compact letter spacing; long-form explanatory text uses a larger line height.

### Interaction targets

Primary interactive controls use a 44px minimum target height. This exceeds the WCAG 2.2 AA minimum target-size criterion and gives a more reliable touch experience on tablets and mobile devices.

### Progressive disclosure

Executive/business views show outcomes first. Raw graphs, structured JSON and correlated traces remain available, but do not dominate the first screen.

The CTO and Product Owner/BA experiences use sub-navigation so users can focus on one decision area at a time.

## EU accessibility context

### European Accessibility Act

Directive (EU) 2019/882 — the European Accessibility Act (EAA) — entered into application on 28 June 2025 for specified products and services in the EU.

The BCS ONE pilot is an enterprise HR platform concept. Whether a particular production deployment falls within the legal scope of the EAA depends on the product/service, customer and delivery context. This document therefore does **not** claim EAA legal conformity.

Accessibility is nevertheless treated as a product-quality baseline because the platform is intended for broad workplace use and may be procured by organisations with their own accessibility obligations.

Reference:

- https://digital-strategy.ec.europa.eu/en/news/eu-becomes-more-accessible-all

### EN 301 549

EN 301 549 is the European ICT accessibility standard used in European public-sector web accessibility contexts. The currently harmonised web/mobile framework referenced by the European Commission is based on WCAG 2.1 AA, while European standardisation work continues to evolve for the EAA.

BCS ONE uses the relevant web interaction requirements as an engineering baseline but does not claim an independently audited EN 301 549 conformity result.

References:

- https://digital-strategy.ec.europa.eu/en/policies/web-accessibility-directive-standards-and-harmonisation
- https://commission.europa.eu/accessibility-statement_en

### WCAG 2.2

W3C recommends WCAG 2.2 as the newer conformance target. BCS ONE therefore targets WCAG 2.2 AA design/interaction patterns where practical even when formal European references still mention WCAG 2.1.

Reference:

- https://www.w3.org/TR/WCAG22/

## Implemented accessibility patterns

### Keyboard and focus

- Skip-to-main-content link.
- Visible, high-contrast `:focus-visible` treatment.
- Sticky UI uses scroll margins to reduce obscured focus.
- CTO/BA sub-navigation supports Left/Right/Home/End keyboard operation.
- Modal dialogs trap keyboard focus and restore focus when closed.
- Clickable CTO detail rows can also be activated from the keyboard.

### Semantics

- Explicit main, banner and primary navigation landmarks.
- Active application navigation exposes `aria-current="page"`.
- Runtime status uses a polite live region.
- Workflow failures use an assertive alert region.
- Toasts receive `status` or `alert` semantics according to severity.
- Modal dialog content is associated with title/description semantics.

### Visual accessibility

- Stronger normal-text contrast than the previous light-grey presentation.
- Status labels do not rely on colour alone.
- `prefers-contrast: more` receives stronger borders and text contrast.
- Windows forced-colours mode is explicitly supported.
- `prefers-reduced-motion: reduce` disables non-essential animation/transition effects.
- CSS is responsive down to mobile layouts and avoids locking the application to a fixed desktop canvas.

### Cognitive usability

- Consistent top-level navigation groups.
- Consistent Help action across primary views.
- Business answer before raw technical evidence.
- Scenario search plus Single-MCP/Multi-MCP filters.
- Employee-journey framing provides an understandable business mental model before platform terminology.

## CI regression guard

`scripts/check-console-accessibility.mjs` checks that several architecture-level accessibility decisions remain present, including:

- document language/viewport;
- accessible skip navigation;
- main landmark;
- navigation `aria-current`;
- alert/live semantics;
- modal focus trap;
- keyboard sub-navigation;
- visible focus CSS;
- reduced-motion, increased-contrast and forced-colour support;
- 44px interactive target baseline.

This script is a regression smoke test only. It is deliberately not named or represented as an automated WCAG conformance test.

## Manual review required before a production accessibility claim

Before claiming WCAG/EN/EAA conformity for a production release, complete at minimum:

1. Keyboard-only navigation across every view and scenario state.
2. Screen-reader review with NVDA + Firefox/Chrome on Windows and VoiceOver + Safari on macOS/iOS.
3. 200% browser zoom and narrow reflow testing without loss of content/functionality.
4. Colour contrast measurement for all rendered states, including charts and disabled/hover/focus states.
5. Form validation/error association review.
6. Modal, toast, dynamic SSE status and loading-state announcement review.
7. Accessible authentication review for the selected Entra policies and sign-in methods.
8. Automated browser audit (for example axe) plus manual verification of every finding.
9. Public-sector/procurement-specific EN 301 549 review if required by the customer.
10. Legal review of EAA applicability for the specific commercial service offered in each EU member state.

## Outcome

The Console is now designed as an accessible, brand-aligned enterprise product experience rather than a developer console with a visual skin. Technical proof remains fully available, but the first impression is the employee journey, business value, live trust boundary and measurable platform outcome.
