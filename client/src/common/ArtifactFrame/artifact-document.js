import designTokens from '../../index.css?raw'
import uiPrimitives from '../../styles/ui.css?raw'
import { buildArtifactRuntime } from './artifact-runtime.js'

const CSP =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline' https://fonts.googleapis.com; script-src 'unsafe-inline'; font-src data: https://fonts.gstatic.com; form-action 'none'; base-uri 'none'"

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&family=Shippori+Mincho:wght@400;500;600;700&display=swap'

const FRAME_OVERRIDES = `
html,
body,
#root {
  height: auto;
  width: auto;
}

html {
  overflow-y: hidden;
}

body {
  max-width: 860px;
  margin: 0 auto;
  padding: var(--sp8) var(--sp6);
  background: var(--bg-surface);
  font-size: var(--fs-base);
  line-height: 1.6;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  margin: var(--sp6) 0 var(--sp3);
  font-family: var(--font-heading);
  font-weight: 500;
  line-height: 1.25;
}

h2 {
  margin-top: var(--sp10);
}

h1 {
  margin-top: 0;
  font-size: var(--fs-4xl);
}

h2 {
  padding-bottom: var(--sp2);
  font-size: var(--fs-2xl);
  border-bottom: 1px solid var(--border-default);
}

h1 + h2,
body > header + h2 {
  margin-top: var(--sp6);
}

h3 {
  font-size: var(--fs-xl);
}

h4,
h5,
h6 {
  font-size: var(--fs-lg);
}

p,
ul,
ol,
table,
blockquote,
pre,
.alert,
.note,
[data-chart] {
  margin: 0 0 var(--sp4);
}

table,
figure,
.stats,
.grid-2 {
  margin: 0 0 var(--sp5);
}

figure > :first-child,
.card > :first-child,
.stat > :first-child {
  margin-top: 0;
}

ul,
ol {
  padding-left: var(--sp5);
}

li {
  margin-bottom: var(--sp1);
}

li > ul,
li > ol {
  margin: var(--sp1) 0 0;
}

table {
  width: 100%;
  font-size: var(--fs-md);
  border-collapse: collapse;
}

th,
td {
  padding: var(--sp2) var(--sp3);
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-default);
}

th {
  border-bottom-color: var(--border-strong);
}

blockquote {
  padding: var(--sp2) var(--sp4);
  color: var(--text-secondary);
  border-left: 3px solid var(--green-bright);
}

hr {
  margin: var(--sp6) 0;
  border: 0;
  border-top: 1px solid var(--border-default);
}

code {
  padding: 0 var(--sp1);
  font-family: var(--font-mono);
  font-size: var(--fs-md);
  background: var(--bg-cool);
  border-radius: var(--radius-sm);
}

pre {
  padding: var(--sp3);
  background: var(--bg-cool);
  border-radius: var(--radius-md);
  overflow-x: auto;
}

pre code {
  padding: 0;
  background: none;
}

img,
svg {
  max-width: 100%;
  height: auto;
}

.recharts-responsive-container,
.recharts-wrapper {
  width: 100% !important;
  height: auto !important;
}

.recharts-wrapper > .recharts-surface {
  width: 100%;
  height: auto;
}

.recharts-legend-wrapper {
  width: auto !important;
  max-width: 100%;
}

.recharts-legend-wrapper .recharts-surface {
  width: 14px;
  height: 14px;
}

body > header {
  margin-bottom: var(--sp6);
  padding-bottom: var(--sp5);
  border-bottom: 2px solid var(--green-deep);
}

.eyebrow {
  display: block;
  margin-bottom: var(--sp2);
  color: var(--green-chart);
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lede {
  max-width: 62ch;
  color: var(--text-secondary);
  font-size: var(--fs-lg);
  line-height: 1.6;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--sp3);
}

.stat {
  padding: var(--sp4);
  background: var(--bg-cool);
  border-radius: var(--radius-lg);
}

.stat__value {
  font-family: var(--font-heading);
  font-size: var(--fs-3xl);
  line-height: 1.2;
}

.stat__label {
  margin-top: var(--sp1);
  color: var(--text-muted);
  font-size: var(--fs-sm);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

figure {
  padding: var(--sp4);
  background: var(--bg-cool);
  border-radius: var(--radius-lg);
}

figure > [data-chart],
figure > table {
  margin: 0;
}

figcaption {
  margin-top: var(--sp2);
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--sp4);
}

.card {
  background-color: var(--bg-cool);
  padding: var(--sp4);
}

@media print {
  html {
    overflow-y: visible;
  }

  body {
    padding: 0;
    background: var(--white);
  }

  .card,
  table,
  figure,
  [data-chart] {
    break-inside: avoid;
  }
}
`

const HEAD = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_HREF}">
<style>${designTokens}</style>
<style>${uiPrimitives}</style>
<style>${FRAME_OVERRIDES}</style>
</head>
<body>
`

export function buildArtifactDocument(html, parentOrigin) {
  return `${HEAD}${html}
<script>${buildArtifactRuntime(parentOrigin)}</script>
</body>
</html>`
}
