import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const rootDir = path.resolve(currentDir, '..');
const parentDir = path.dirname(rootDir);

dotenv.config({ path: path.join(rootDir, '.env'), quiet: true });
dotenv.config({ path: path.join(parentDir, '.env'), override: false, quiet: true });

// Imports happen after dotenv so module-level env reads (if any) see .env values.
// Our modules read process.env lazily at call time, so this order is safe.
import { getSupabaseClient } from '../src/lib/supabase.js';
import { processInvoicePdfJob } from '../src/services/pdf-background.js';

const POLL_INTERVAL_MS = Number(process.env.PDF_WORKER_POLL_MS || '10000');
const MAX_ATTEMPTS = Number(process.env.PDF_WORKER_MAX_ATTEMPTS || '3');

async function claimAndProcessJob() {
  const supabase = getSupabaseClient();

  // Find oldest pending job, or a failed job that hasn't hit max attempts
  const { data: job } = await supabase
    .from('pdf_generation_jobs')
    .select('id, invoice_id, organization_id, attempts, status')
    .or(`status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS})`)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!job) return false;

  // Claim atomically — another worker instance might race us
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

    await supabase
      .from('pdf_generation_jobs')
      .update({ status: 'failed', last_error: error.message })
      .eq('id', job.id)
      .catch(() => {});

    return false;
  }
}

async function poll() {
  try {
    // Process all available jobs in this poll cycle before waiting
    // eslint-disable-next-line no-await-in-loop
    while (await claimAndProcessJob()) { /* drain the queue */ }
  } catch (error) {
    console.error('[PDF Worker] Poll error:', error.message);
  }
}

console.log(`[PDF Worker] Starting. Poll: ${POLL_INTERVAL_MS}ms, max attempts: ${MAX_ATTEMPTS}`);

// Process immediately on start (catches any jobs that piled up while the worker was down)
poll();
setInterval(poll, POLL_INTERVAL_MS);
