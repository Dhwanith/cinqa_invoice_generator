import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const rootDir = path.resolve(currentDir, '..');
const parentDir = path.dirname(rootDir);

dotenv.config({ path: path.join(rootDir, '.env'), quiet: true });
dotenv.config({ path: path.join(parentDir, '.env'), override: false, quiet: true });

import { getSupabaseClient } from '../src/lib/supabase.js';
import { processInvoicePdfJob } from '../src/services/pdf-background.js';

const POLL_INTERVAL_MS = Number(process.env.PDF_WORKER_POLL_MS || '10000');
const MAX_ATTEMPTS = Number(process.env.PDF_WORKER_MAX_ATTEMPTS || '3');

let _activePoll = false;
let _shutdown = false;

async function claimAndProcessJob() {
  const supabase = getSupabaseClient();

  const { data: job } = await supabase
    .from('pdf_generation_jobs')
    .select('id, invoice_id, organization_id, attempts, status')
    .or(`status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS})`)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!job) return false;

  // Claim atomically — safe to run multiple worker instances concurrently
  const { data: claimed } = await supabase
    .from('pdf_generation_jobs')
    .update({ status: 'processing', attempts: (job.attempts || 0) + 1 })
    .eq('id', job.id)
    .in('status', ['pending', 'failed'])
    .select('id')
    .maybeSingle();

  if (!claimed) return false;

  console.log(`[PDF Worker] Processing job ${job.id} for invoice ${job.invoice_id} (attempt ${(job.attempts || 0) + 1})`);

  try {
    const storagePath = await processInvoicePdfJob(job.invoice_id, job.organization_id);

    await supabase
      .from('pdf_generation_jobs')
      .update({ status: 'completed', last_error: null, completed_at: new Date().toISOString() })
      .eq('id', job.id);

    console.log(`[PDF Worker] Completed job ${job.id} → ${storagePath}`);
    return true;

  } catch (error) {
    console.error(`[PDF Worker] Failed job ${job.id}:`, error.message);

    // Best-effort — Supabase v2 query builders are PromiseLike, not Promises; no .catch()
    await supabase
      .from('pdf_generation_jobs')
      .update({ status: 'failed', last_error: error.message })
      .eq('id', job.id);

    return false;
  }
}

async function poll() {
  if (_activePoll) return;
  _activePoll = true;

  try {
    while (!_shutdown && await claimAndProcessJob()) { /* drain queue */ }
  } catch (error) {
    console.error('[PDF Worker] Poll error:', error.message);
  } finally {
    _activePoll = false;
    if (_shutdown) {
      console.log('[PDF Worker] Shutdown complete.');
      process.exit(0);
    }
  }
}

// ── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`[${signal}] PDF worker shutting down — will exit after current job completes.`);
  _shutdown = true;
  if (!_activePoll) {
    console.log('[PDF Worker] Shutdown complete.');
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start ────────────────────────────────────────────────────────────────────

console.log(`[PDF Worker] Starting. Poll: ${POLL_INTERVAL_MS}ms, max attempts: ${MAX_ATTEMPTS}`);

poll();
setInterval(() => { if (!_shutdown) poll(); }, POLL_INTERVAL_MS);
