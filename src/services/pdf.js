import fs from 'node:fs/promises';
import path from 'node:path';

import puppeteer from 'puppeteer';

import { renderInvoiceHtml } from '../templates/invoice-template.js';

// ── Persistent browser singleton ────────────────────────────────────────────
// Launching a new Chromium process per render costs 2-4 s of startup overhead.
// Keeping one browser alive and opening/closing pages per render reduces
// subsequent renders to ~200-500 ms.

let _browser = null;
let _launching = null;

async function getBrowser() {
  if (_browser?.connected) return _browser;

  // Coalesce concurrent requests so we only launch once
  if (_launching) return _launching;

  _launching = puppeteer
    .launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // required for Docker shared-memory constraints
        '--disable-gpu',
      ],
    })
    .then((browser) => {
      _browser = browser;
      _launching = null;
      browser.on('disconnected', () => {
        _browser = null;
        _launching = null;
        console.log('[Puppeteer] Browser disconnected — will restart on next render');
      });
      return browser;
    });

  return _launching;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function renderPdfBufferFromHtml(html, options = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      ...(options.pdfOptions || {})
    });
  } finally {
    await page.close();
  }
}

export async function renderInvoicePdfBuffer(invoice, options = {}) {
  const html = renderInvoiceHtml(invoice);
  return renderPdfBufferFromHtml(html, options);
}

export async function writeInvoicePdf(invoice, outputFilePath, options = {}) {
  const buffer = await renderInvoicePdfBuffer(invoice, options);
  await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
  await fs.writeFile(outputFilePath, buffer);
  return outputFilePath;
}
