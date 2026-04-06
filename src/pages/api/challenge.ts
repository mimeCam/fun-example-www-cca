// src/pages/api/challenge.ts
// Lightweight endpoint to issue fresh PoW challenges.
// Called when a stale-challenge rejection is received by the client.

import type { APIRoute } from 'astro';
import { generateChallenge } from '../../lib/proofOfWork';

export const prerender = false;

export const GET: APIRoute = async () => {
  const challenge = generateChallenge();
  const headers = { 'Content-Type': 'application/json' };
  const body = JSON.stringify({ challenge });
  return new Response(body, { status: 200, headers });
};
