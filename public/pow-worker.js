// public/pow-worker.js
// Web Worker: SHA-256 proof-of-work nonce search.
// Uses native WebCrypto (crypto.subtle) — zero dependencies, no TS build step.
// Processes candidates in batches for efficiency; posts progress and final result.
//
// Protocol:
//   IN  { type: 'start', title: string, body: string }
//   OUT { type: 'progress', nonce: number, hash: string, rate: number }
//   OUT { type: 'done',     nonce: number, hash: string }
//   OUT { type: 'error',    message: string }

const DIFFICULTY  = '0000';
const BATCH_SIZE  = 200;   // concurrent hash calls per tick
const REPORT_EVERY = 5000; // post progress every N attempts

const enc = new TextEncoder();

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

async function computeContentHash(title, body) {
  return sha256hex(title + '\n' + body);
}

async function searchBatch(contentHash, startNonce) {
  const promises = Array.from({ length: BATCH_SIZE }, (_, i) =>
    sha256hex(contentHash + ':' + (startNonce + i))
  );
  return Promise.all(promises);
}

function findWinner(hashes, startNonce) {
  for (let i = 0; i < hashes.length; i++) {
    if (hashes[i].startsWith(DIFFICULTY)) return { nonce: startNonce + i, hash: hashes[i] };
  }
  return null;
}

async function runPoW(title, body) {
  const contentHash = await computeContentHash(title, body);
  let nonce = 0;
  const startMs = Date.now();

  while (true) {
    const hashes = await searchBatch(contentHash, nonce);
    const winner = findWinner(hashes, nonce);

    if (winner) {
      self.postMessage({ type: 'done', nonce: winner.nonce, hash: winner.hash });
      return;
    }

    nonce += BATCH_SIZE;

    if (nonce % REPORT_EVERY < BATCH_SIZE) {
      const elapsedS = (Date.now() - startMs) / 1000 || 0.001;
      const rate = Math.round(nonce / elapsedS);
      self.postMessage({ type: 'progress', nonce, hash: hashes[hashes.length - 1], rate });
    }
  }
}

self.onmessage = async ({ data }) => {
  if (data.type !== 'start') return;
  try {
    await runPoW(data.title, data.body);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
