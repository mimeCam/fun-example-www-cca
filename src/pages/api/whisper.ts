// src/pages/api/whisper.ts
// SSR endpoint — receives visitor whispers via HTML form POST.
// Writes to wall-pending.json (moderation queue). Never touches wall.json.
// Zero client-side JS: plain HTML form action.
//
// TODO: add rate limiting via IP tracking (v2)
// TODO: add honeypot field for basic spam filtering (v2)

import type { APIRoute } from 'astro';
import type { PendingWhisper } from '../../lib/wallSubmit';
import { validateText, validateMood } from '../../lib/wallSubmit';
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
  const form = await request.formData();
  const text = form.get('text');
  const mood = form.get('mood') || 'default';

  const textErr = validateText(text);
  if (textErr) return wallRedirect('invalid');

  const moodErr = validateMood(mood);
  if (moodErr) return wallRedirect('invalid');

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
};
