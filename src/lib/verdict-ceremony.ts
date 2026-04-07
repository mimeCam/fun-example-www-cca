// src/lib/verdict-ceremony.ts
// Client-side SSE listener for verdict:declared events.
// Handles the moment a verdict is sealed: animates ConvictionMeter,
// flashes verdict badge on matching post card, shows ephemeral notification.
//
// Attaches to the existing window.__presenceES EventSource (shared SSE stream).
// No new connections — piggybacks on revival-engine.ts's EventSource.
//
// Credits: Mike (arch §verdict-ceremony), Tanya (UX §3 verdict page)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerdictDeclaredPayload {
  slug: string;
  verdict: 'still-true' | 'evolved' | 'wrong' | 'abandoned';
  newBattingAvg: number | null;
  sealedAt: number;
}

// ---------------------------------------------------------------------------
// DOM helpers — each ≤ 10 lines
// ---------------------------------------------------------------------------

const VERDICT_LABEL: Record<string, string> = {
  'still-true': '✓ still-true',
  'evolved':    '↻ evolved',
  'wrong':      '✗ wrong',
  'abandoned':  '○ abandoned',
};

const VERDICT_COLOR: Record<string, string> = {
  'still-true': 'rgba(100,210,120,0.9)',
  'evolved':    'rgba(245,166,35,0.85)',
  'wrong':      'rgba(230,100,100,0.9)',
  'abandoned':  'rgba(255,255,255,0.45)',
};

function updateConvictionMeter(newAvg: number | null): void {
  const pctEl = document.querySelector<HTMLElement>('[data-conviction-pct]');
  if (!pctEl || newAvg === null) return;
  pctEl.textContent = `${newAvg}%`;
  pctEl.classList.add('cm-flash');
  setTimeout(() => pctEl.classList.remove('cm-flash'), 1200);
}

function flashVerdictBadge(slug: string, verdict: string): void {
  const card = document.querySelector<HTMLElement>(`[data-slug="${slug}"]`);
  if (!card) return;
  const badge = document.createElement('span');
  badge.className = 'verdict-flash-badge';
  badge.textContent = VERDICT_LABEL[verdict] ?? verdict;
  badge.style.color = VERDICT_COLOR[verdict] ?? 'rgba(255,255,255,0.8)';
  card.appendChild(badge);
  setTimeout(() => badge.remove(), 3500);
}

function showNotification(slug: string, verdict: string): void {
  const n = document.createElement('div');
  n.className = 'verdict-notification';
  n.textContent = `"${slug}" — verdict sealed: ${VERDICT_LABEL[verdict] ?? verdict}`;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('verdict-notification--visible'), 50);
  setTimeout(() => { n.classList.remove('verdict-notification--visible'); setTimeout(() => n.remove(), 400); }, 4000);
}

function injectCeremonyStyles(): void {
  if (document.getElementById('verdict-ceremony-styles')) return;
  const style = document.createElement('style');
  style.id = 'verdict-ceremony-styles';
  style.textContent = `
    @keyframes cm-flash { 0%,100%{opacity:1} 50%{opacity:0.4} }
    .cm-flash { animation: cm-flash 600ms ease 2; }
    .verdict-flash-badge {
      position: absolute; top: 0.5rem; right: 0.5rem;
      font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em;
      padding: 0.2rem 0.5rem; border-radius: 100px;
      background: rgba(0,0,0,0.6); pointer-events: none;
      animation: cm-flash 800ms ease 2;
    }
    .verdict-notification {
      position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999;
      background: oklch(18% 0.025 280); border: 1px solid rgba(245,166,35,0.3);
      border-radius: 8px; padding: 0.75rem 1rem;
      font-size: 0.78rem; color: rgba(255,255,255,0.8);
      opacity: 0; transform: translateY(8px);
      transition: opacity 300ms ease, transform 300ms ease;
    }
    .verdict-notification--visible { opacity: 1; transform: translateY(0); }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// SSE handler
// ---------------------------------------------------------------------------

function handleVerdictDeclared(payload: VerdictDeclaredPayload): void {
  updateConvictionMeter(payload.newBattingAvg);
  flashVerdictBadge(payload.slug, payload.verdict);
  showNotification(payload.slug, payload.verdict);
}

function attachToEventSource(es: EventSource): void {
  es.addEventListener('verdict:declared', (e: MessageEvent) => {
    try {
      const payload = JSON.parse(e.data) as VerdictDeclaredPayload;
      handleVerdictDeclared(payload);
    } catch { /* malformed payload — skip silently */ }
  });
}

// ---------------------------------------------------------------------------
// Public init — called once on DOMContentLoaded
// ---------------------------------------------------------------------------

/** Wire verdict:declared listener to the shared SSE EventSource. */
export function initVerdictCeremony(): void {
  injectCeremonyStyles();
  const es = (window as Record<string, unknown>)['__presenceES'] as EventSource | undefined;
  if (es) { attachToEventSource(es); return; }
  // Fallback: poll once for the EventSource if it hasn't been set yet.
  const poll = setInterval(() => {
    const late = (window as Record<string, unknown>)['__presenceES'] as EventSource | undefined;
    if (!late) return;
    clearInterval(poll);
    attachToEventSource(late);
  }, 500);
  setTimeout(() => clearInterval(poll), 8_000); // give up after 8s
}

// ---------------------------------------------------------------------------
// Serialized IIFE — injected into BaseLayout via set:html (same pattern as revivalEngineScript)
// ---------------------------------------------------------------------------

/**
 * Returns the verdict ceremony as a self-contained IIFE string for SSR injection.
 * Attaches to window.__presenceES and listens for 'verdict:declared' events.
 */
export function verdictCeremonyScript(): string {
  return `(function(){
  var LABELS={'still-true':'\\u2713 still-true','evolved':'\\u21bb evolved','wrong':'\\u2717 wrong','abandoned':'\\u25cb abandoned'};
  var COLORS={'still-true':'rgba(100,210,120,0.9)','evolved':'rgba(245,166,35,0.85)','wrong':'rgba(230,100,100,0.9)','abandoned':'rgba(255,255,255,0.45)'};

  function injectStyles(){
    if(document.getElementById('vc-styles'))return;
    var s=document.createElement('style');s.id='vc-styles';
    s.textContent='@keyframes vc-flash{0%,100%{opacity:1}50%{opacity:0.35}}.vc-flash{animation:vc-flash 600ms ease 2}.verdict-flash-badge{position:absolute;top:.5rem;right:.5rem;font-size:.63rem;font-weight:700;letter-spacing:.05em;padding:.2rem .5rem;border-radius:100px;background:rgba(0,0,0,.65);pointer-events:none;animation:vc-flash 800ms ease 2}.verdict-notification{position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;background:oklch(18% .025 280);border:1px solid rgba(245,166,35,.3);border-radius:8px;padding:.75rem 1rem;font-size:.78rem;color:rgba(255,255,255,.8);opacity:0;transform:translateY(8px);transition:opacity 300ms,transform 300ms}.verdict-notification--in{opacity:1;transform:translateY(0)}';
    document.head.appendChild(s);
  }

  function updateMeter(avg){
    var el=document.querySelector('[data-conviction-pct]');
    if(!el||avg===null)return;
    el.textContent=avg+'%';el.classList.add('vc-flash');
    setTimeout(function(){el.classList.remove('vc-flash');},1200);
  }

  function flashBadge(slug,verdict){
    var card=document.querySelector('[data-slug="'+slug+'"]');
    if(!card)return;
    var b=document.createElement('span');b.className='verdict-flash-badge';
    b.textContent=LABELS[verdict]||verdict;b.style.color=COLORS[verdict]||'rgba(255,255,255,.8)';
    card.style.position='relative';card.appendChild(b);
    setTimeout(function(){b.remove();},3500);
  }

  function notify(slug,verdict){
    var n=document.createElement('div');n.className='verdict-notification';
    n.textContent='"'+slug+'" \\u2014 verdict sealed: '+(LABELS[verdict]||verdict);
    document.body.appendChild(n);
    setTimeout(function(){n.classList.add('verdict-notification--in');},50);
    setTimeout(function(){n.classList.remove('verdict-notification--in');setTimeout(function(){n.remove();},400);},4000);
  }

  function handle(e){
    try{var p=JSON.parse(e.data);updateMeter(p.newBattingAvg);flashBadge(p.slug,p.verdict);notify(p.slug,p.verdict);}catch(err){}
  }

  function attach(es){es.addEventListener('verdict:declared',handle);}

  injectStyles();
  var es=window.__presenceES;
  if(es){attach(es);return;}
  var poll=setInterval(function(){var late=window.__presenceES;if(!late)return;clearInterval(poll);attach(late);},500);
  setTimeout(function(){clearInterval(poll);},8000);
})();`;
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testVerdictCeremony(): void {
  console.assert(VERDICT_LABEL['still-true'] === '✓ still-true', 'label ok');
  console.assert(VERDICT_COLOR['wrong'].includes('230'), 'color ok');
  console.log('[verdict-ceremony] utility OK');
}
