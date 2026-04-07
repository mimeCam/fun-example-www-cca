#!/usr/bin/env node
// cli/seal-conviction.mjs
// Seal a conviction score for a blog post at publish time.
// Follows the pattern of cli/whisper.mjs — ESM, no extra deps.
//
// Usage:
//   ADMIN_SECRET=secret node cli/seal-conviction.mjs \
//     --slug the-decay-theory \
//     --score 8 \
//     --note "I believe distributed systems will replace monoliths within 5 years."
//
// Errors loudly if already sealed — no silent overwrites, ever.

const BASE_URL      = process.env.BASE_URL ?? 'http://localhost:7100';
const ADMIN_SECRET  = process.env.ADMIN_SECRET ?? '';
const args          = process.argv.slice(2);

// ---------------------------------------------------------------------------
// Arg helpers
// ---------------------------------------------------------------------------

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return (i !== -1 && i + 1 < args.length) ? args[i + 1] : null;
}

function die(msg) { console.error(`\x1b[31m✗ ${msg}\x1b[0m`); process.exit(1); }
function ok(msg)  { console.log(`\x1b[32m✓ ${msg}\x1b[0m`); }
function info(msg){ console.log(`  ${msg}`); }

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateArgs(slug, scoreRaw, note) {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp(); process.exit(0);
  }
  if (!ADMIN_SECRET) die('ADMIN_SECRET env var is not set');
  if (!slug)    die('--slug is required (e.g. --slug the-decay-theory)');
  if (!scoreRaw) die('--score is required (integer 1–10)');
  if (!note)    die('--note is required (author wager statement)');
  const n = parseInt(scoreRaw, 10);
  if (isNaN(n) || n < 1 || n > 10) die(`--score must be integer 1–10 (got: ${scoreRaw})`);
  return n;
}

function printHelp() {
  console.log(`
  Usage: node cli/seal-conviction.mjs --slug <slug> --score <1-10> --note "<statement>"

  Environment:
    ADMIN_SECRET    required — must match the server's ADMIN_SECRET
    BASE_URL        optional — defaults to http://localhost:7100

  Example:
    ADMIN_SECRET=secret node cli/seal-conviction.mjs \\
      --slug the-decay-theory \\
      --score 8 \\
      --note "I believe this will hold for 5 years."
  `.trim());
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function postSeal(slug, score, note) {
  const res = await fetch(`${BASE_URL}/api/conviction-seal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, score, authorNote: note, adminSecret: ADMIN_SECRET }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printSuccess(slug, body) {
  ok(`Conviction sealed for "${slug}"`);
  info(`Score:     ${body.score}/10`);
  info(`Note:      "${body.authorNote}"`);
  info(`Hash:      ${body.hash}`);
  info(`Sealed at: ${new Date(body.sealedAt).toISOString()}`);
}

function printConflict(slug, body) {
  die(`"${slug}" is already sealed.\n  Hash: ${body.entry?.hash ?? '(unknown)'}\n  Use GET /api/conviction-audit?slug=${slug} to inspect.`);
}

function handleResult(status, body, slug) {
  if (status === 200) return printSuccess(slug, body);
  if (status === 409) return printConflict(slug, body);
  if (status === 403) die('Forbidden — check ADMIN_SECRET');
  die(`Server error ${status}: ${JSON.stringify(body)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const slug     = flag('slug');
const scoreRaw = flag('score');
const note     = flag('note');
const score    = validateArgs(slug, scoreRaw, note);

try {
  const { status, body } = await postSeal(slug, score, note);
  handleResult(status, body, slug);
} catch (err) {
  die(`Network error: ${err.message}\n  Is the server running at ${BASE_URL}?`);
}
