// src/pages/api/whisper.ts
// SSR endpoint — receives visitor whispers via HTML form POST.
// Writes to wall-pending.json (moderation queue). Never touches wall.json.
// Zero client-side JS: plain HTML form action.
//
// TODO: add rate limiting via IP tracking (v2)
// Honeypot field silently rejects bots — redirect looks normal.

import type { APIRoute } from 'astro';
import type { PendingWhisper } from '../../lib/wallSubmit';
import { validateText, validateMood, isHoneypotTripped, HONEYPOT_FIELD } from '../../lib/wallSubmit';
import { readPending, writePending } from '../../lib/pendingStore';

export const prerender = false;

/** Build a redirect back to /wall with a status query param. */
function wallRedirect(status: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: `/wall?ws=${status}` },
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    return await handleWhisper(request);
  } catch (_) {
    return wallRedirect('error');
  }
};

/** Core whisper handler — separated for clarity and testability. */
async function handleWhisper(request: Request): Promise<Response> {
  const form = await request.formData();
  if (isHoneypotTripped(form.get(HONEYPOT_FIELD))) return wallRedirect('ok');

  const text = form.get('text');
  const mood = form.get('mood') || 'default';

  if (validateText(text)) return wallRedirect('invalid');
  if (validateMood(mood)) return wallRedirect('invalid');

  const entry: PendingWhisper = {
    id: crypto.randomUUID().slice(0, 8),
    text: (text as string).trim(),
    mood: mood as PendingWhisper['mood'],
    submitted: new Date().toISOString().slice(0, 10),
  };

  const pending = readPending();
  pending.unshift(entry);
  writePending(pending);

  return wallRedirect('ok');
}
