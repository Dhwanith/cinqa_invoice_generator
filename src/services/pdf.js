import fs from 'node:fs/promises';
import path from 'node:path';

import puppeteer from 'puppeteer';

import { renderInvoiceHtml } from '../templates/invoice-template.js';

export async function renderPdfBufferFromHtml(html, options = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(options.launchOptions || {})
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0'
      },
      ...(options.pdfOptions || {})
    });
  } finally {
    await browser.close();
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