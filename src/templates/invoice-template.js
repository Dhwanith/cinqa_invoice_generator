import { formatCurrency } from '../services/gst.js';
import { bundledFontFaceCss } from './font-face-css.js';
import { cinqaLogoDataUri, cinqaSignatureDataUri } from './asset-data-uri.js';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderAddressLines(lines, className = '') {
  return lines.map((line) => `<div class="${className}">${escapeHtml(line)}</div>`).join('');
}

function renderLabeledInline(label, value, labelClass = 'label-text', valueClass = 'value-text') {
  return `<span class="${labelClass}">${escapeHtml(label)}</span>&nbsp;<span class="${valueClass}">${escapeHtml(value)}</span>`;
}

function renderLabeledStack(label, value, labelClass = 'label-text', valueClass = 'value-text') {
  return `<span class="${labelClass}">${escapeHtml(label)}</span><br /><span class="${valueClass}">${escapeHtml(value)}</span>`;
}

function getPriceColumnLabel(invoice) {
  return invoice.showQuantity ? 'Unit Price (₹)' : 'Price (₹)';
}

function renderTaxColumns(invoice, lineItem) {
  if (invoice.invoiceType === 'proforma') {
    return `<td class="numeric">${formatCurrency(lineItem.amount)}</td>`;
  }

  if (invoice.gstType === 'IGST') {
    return `
      <td class="numeric">${formatCurrency(lineItem.igst)}</td>
      <td class="numeric">${formatCurrency(lineItem.total)}</td>
    `;
  }

  return `
    <td class="numeric">${formatCurrency(lineItem.cgst)}</td>
    <td class="numeric">${formatCurrency(lineItem.sgst)}</td>
    <td class="numeric">${formatCurrency(lineItem.total)}</td>
  `;
}

function renderTableHeader(invoice) {
  if (invoice.invoiceType === 'proforma') {
    return `
      <tr>
        <th style="width: 7%;">S.<br />No</th>
        <th style="width: ${invoice.showQuantity ? '32%' : '50%'};">Description</th>
        <th style="width: 13%;">SAC</th>
        ${invoice.showQuantity ? `<th class="numeric" style="width: 12%;">Qty</th>` : ''}
        ${invoice.showQuantity ? `<th class="numeric" style="width: 18%;">${getPriceColumnLabel(invoice)}</th>` : ''}
        <th class="numeric" style="width: ${invoice.showQuantity ? '18%' : '30%'};">Amount (₹)</th>
      </tr>
    `;
  }

  if (invoice.gstType === 'IGST') {
    return `
      <tr>
        <th style="width: 5%;">S.<br />No</th>
        <th style="width: ${invoice.showQuantity ? '28%' : '37%'};">Description</th>
        <th style="width: 8%;">SAC</th>
        ${invoice.showQuantity ? `<th class="numeric" style="width: 8%;">Qty</th>` : ''}
        <th class="numeric" style="width: 13%;">${getPriceColumnLabel(invoice)}</th>
        <th class="numeric" style="width: 13%;">Taxable Value (₹)</th>
        <th class="numeric" style="width: 10%;">IGST (₹)<span class="sub-label">18%</span></th>
        <th class="numeric" style="width: ${invoice.showQuantity ? '15%' : '14%'};">Amount (₹)</th>
      </tr>
    `;
  }

  return `
    <tr>
      <th style="width: 5%;">S.<br />No</th>
      <th style="width: ${invoice.showQuantity ? '25%' : '33%'};">Description</th>
      <th style="width: 8%;">SAC</th>
      ${invoice.showQuantity ? `<th class="numeric" style="width: 8%;">Qty</th>` : ''}
      <th class="numeric" style="width: 12%;">${getPriceColumnLabel(invoice)}</th>
      <th class="numeric" style="width: 13%;">Taxable Value (₹)</th>
      <th class="numeric" style="width: 9%;">CGST (₹)<span class="sub-label">9%</span></th>
      <th class="numeric" style="width: 9%;">SGST (₹)<span class="sub-label">9%</span></th>
      <th class="numeric" style="width: ${invoice.showQuantity ? '11%' : '11%'};">Amount (₹)</th>
    </tr>
  `;
}

function renderLogoBlock() {
  return `
    <div class="logo-stack">
      <div class="logo-box">
        <img class="logo-image" src="${cinqaLogoDataUri}" alt="Cinqa logo" />
      </div>
      <div class="logo-wordmark">CINQA</div>
    </div>
  `;
}

export function renderInvoiceHtml(invoice) {
  const rows = invoice.lineItems
    .map(
      (lineItem) => `
        <tr>
          <td class="line-number-cell">${lineItem.lineNumber}</td>
          <td class="description-cell">${escapeHtml(lineItem.description)}</td>
          <td>${escapeHtml(lineItem.sac || '')}</td>
          ${invoice.showQuantity ? `<td class="numeric">${escapeHtml(String(lineItem.quantity ?? ''))}</td>` : ''}
          ${invoice.invoiceType === 'proforma' && !invoice.showQuantity ? '' : `<td class="numeric">${formatCurrency(invoice.showQuantity ? lineItem.unitPrice ?? lineItem.price : lineItem.price)}</td>`}
          ${invoice.invoiceType === 'proforma' ? '' : `<td class="numeric">${formatCurrency(lineItem.taxableValue)}</td>`}
          ${renderTaxColumns(invoice, lineItem)}
        </tr>
      `
    )
    .join('');

  const summaryTaxCells =
    invoice.invoiceType === 'proforma'
      ? `
        <td colspan="${invoice.showQuantity ? '5' : '3'}"></td>
        <td class="numeric">${formatCurrency(invoice.total)}</td>
      `
      : invoice.gstType === 'IGST'
      ? `
        <td colspan="${invoice.showQuantity ? '6' : '5'}"></td>
        <td class="numeric">${formatCurrency(invoice.igst)}</td>
        <td class="numeric">${formatCurrency(invoice.total)}</td>
      `
      : `
        <td colspan="${invoice.showQuantity ? '6' : '5'}"></td>
        <td class="numeric">${formatCurrency(invoice.cgst)}</td>
        <td class="numeric">${formatCurrency(invoice.sgst)}</td>
        <td class="numeric">${formatCurrency(invoice.total)}</td>
      `;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(invoice.invoiceNo)}</title>
    <style>
      ${bundledFontFaceCss}

      @page {
        size: A4;
        margin: 0;
      }

      * { box-sizing: border-box; }
      html, body {
        width: 210mm;
        height: 297mm;
      }
      body {
        margin: 0;
        font-family: 'Poppins', Arial, sans-serif;
        color: #101010;
        background: #ffffff;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.36;
      }
      .invoice {
        width: 210mm;
        height: 297mm;
        padding: 15mm 12mm 0;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
      }
      .content {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
      }
      .top-row,
      .contact-row,
      .meta-cards,
      .bottom-bar {
        display: flex;
        justify-content: space-between;
        gap: 14px;
      }
      .top-row {
        align-items: flex-start;
        margin-bottom: 18px;
      }
      .invoice-title {
        font-size: 40px;
        font-weight: 500;
        line-height: 1;
        margin: 0 0 18px;
      }
      .company-block {
        max-width: 420px;
      }
      .company-name {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 6px;
      }
      .company-line {
        font-size: 12px;
        margin-bottom: 3px;
      }
      .company-meta {
        font-size: 12px;
        font-weight: 600;
        margin-top: 3px;
      }
      .logo-stack {
        width: 130px;
        text-align: center;
        margin-top: 2px;
      }
      .logo-box {
        width: 104px;
        height: 104px;
        border-radius: 14px;
        margin: 0 auto 8px;
        overflow: hidden;
        background: #030316;
      }
      .logo-image {
        width: 104px;
        height: 104px;
        display: block;
        object-fit: cover;
      }
      .logo-wordmark {
        font-family: 'Syne', 'Poppins', Arial, sans-serif;
        font-size: 16px;
        font-weight: 800;
        letter-spacing: 0.08em;
      }
      .contact-row {
        align-items: stretch;
        margin: 0 0 22px;
      }
      .bill-card,
      .meta-card,
      .meta-box,
      .total-grid,
      .footer-strip {
        background: #e9e9e9;
        border-radius: 4px;
      }
      .bill-card {
        flex: 1 1 52%;
        min-height: 168px;
        padding: 14px 16px;
      }
      .card-title {
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 14px;
      }
      .bill-name {
        font-size: 12px;
        font-weight: 500;
        margin-bottom: 8px;
      }
      .bill-line {
        font-size: 12px;
        font-weight: 400;
        line-height: 1.35;
      }
      .bill-gstin {
        font-size: 12px;
        margin-top: 24px;
      }
      .label-text {
        font-weight: 600;
      }
      .value-text {
        font-weight: 500;
      }
      .meta-panel {
        flex: 1 1 48%;
      }
      .meta-card {
        padding: 10px 14px;
        margin-bottom: 10px;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
      }
      .meta-cards {
        align-items: stretch;
      }
      .meta-box {
        flex: 1;
        min-height: 78px;
        padding: 14px 10px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .meta-box-title {
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 6px;
      }
      .meta-box-value {
        font-size: 12px;
        font-weight: 600;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      th, td {
        border: 1px solid #b8b8b8;
        padding: 8px 5px;
        vertical-align: top;
        word-wrap: break-word;
        overflow-wrap: anywhere;
      }
      th {
        background: #e2e2e2;
        font-size: 12px;
        text-align: center;
        font-weight: 600;
        vertical-align: middle;
        white-space: normal;
        word-break: keep-all;
      }
      tbody td {
        font-size: 10px;
        font-weight: 600;
        text-align: center;
        vertical-align: middle;
      }
      .numeric {
        text-align: center;
        white-space: nowrap;
      }
      th.numeric {
        text-align: center;
        white-space: normal;
      }
      .sub-label {
        display: block;
        font-size: 10px;
        font-weight: 500;
        color: #5e5e5e;
        margin-top: 1px;
      }
      .line-number-cell {
        text-align: center;
      }
      .description-cell {
        line-height: 1.15;
        text-align: left;
      }
      .details-section {
        display: grid;
        grid-template-columns: 1.2fr 0.82fr;
        gap: 22px;
        margin-top: 118px;
        padding-top: 16px;
        border-top: 1px solid #d1d1d1;
        align-items: start;
      }
      .payment-panel {
        padding: 0 6px 0;
      }
      .muted-heading,
      .terms-title {
        color: #a2a2a2;
        font-size: 12px;
        font-weight: 500;
        margin-bottom: 12px;
      }
      .payment-row {
        font-size: 12px;
        margin-bottom: 9px;
      }
      .payment-row strong {
        font-weight: 600;
      }
      .payment-row .value-text {
        font-weight: 500;
      }
      .total-card {
        padding-top: 12px;
      }
      .total-grid {
        display: grid;
        grid-template-columns: 56px 1fr;
        overflow: hidden;
        border: 1px solid #b8b8b8;
      }
      .total-label {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        border-right: 1px solid #b8b8b8;
      }
      .total-values {
        display: grid;
        grid-template-rows: 40px minmax(36px, auto);
      }
      .total-amount,
      .total-words {
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 0 10px;
      }
      .total-amount {
        font-size: 12px;
        font-weight: 600;
        border-bottom: 1px solid #b8b8b8;
      }
      .total-words {
        background: #f3f3f3;
        font-size: 12px;
        line-height: 1.2;
      }
      .total-rule {
        width: 170px;
        margin: 22px auto 0;
        border-top: 1px solid #d1d1d1;
      }
      .terms-signatory {
        display: grid;
        grid-template-columns: 1fr 260px;
        gap: 24px;
        margin-top: auto;
        padding-top: 46px;
        padding-bottom: 5px;
        align-items: end;
      }
      .terms-card ol {
        margin: 0 0 0 18px;
        padding: 0;
        color: #a2a2a2;
        font-size: 11px;
        line-height: 1.3;
      }
      .signatory-card {
        text-align: right;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        min-height: 150px;
        align-items: flex-end;
      }
      .signatory-company {
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 10px;
      }
      .signature-slot {
        height: 56px;
        width: 238px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding-right: 36px;
      }
      .signature-image {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        object-position: right center;
        display: block;
      }
      .signatory-name {
        font-size: 12px;
        font-weight: 600;
      }
      .signatory-card {
        padding-bottom: 5px;
      }
      .footer-strip {
        margin: auto -12mm 0;
        padding: 10px 12mm 11px;
      }
      .bottom-bar {
        color: #8f8f8f;
        font-family: 'Syne', 'Poppins', Arial, sans-serif;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.02em;
      }
      .bottom-bar-right {
        text-align: right;
      }
    </style>
  </head>
  <body>
    <div class="invoice">
      <div class="content">
      <div class="top-row">
        <div class="company-block">
          <div class="invoice-title">${escapeHtml(invoice.title || 'TAX INVOICE')}</div>
          <div class="company-name">${escapeHtml(invoice.company.name)}</div>
          ${renderAddressLines(invoice.company.addressLines, 'company-line')}
          <div class="company-line">${escapeHtml(invoice.company.email)}</div>
          <div class="company-meta">${renderLabeledInline('GSTIN: ', invoice.company.gstin)}</div>
          <div class="company-meta">${renderLabeledInline('PAN: ', invoice.company.pan)}&nbsp;&nbsp;${renderLabeledInline('TAN: ', invoice.company.tan)}</div>
        </div>
        ${renderLogoBlock()}
      </div>

      <div class="contact-row">
        <div class="bill-card">
          <div class="card-title">Bill to:</div>
          <div class="bill-name">${escapeHtml(invoice.client.name)}</div>
          ${renderAddressLines(invoice.client.addressLines, 'bill-line')}
          <div class="bill-gstin">${renderLabeledInline('GSTIN: ', invoice.client.gstin)}</div>
        </div>
        <div class="meta-panel">
          <div class="meta-card">${renderLabeledInline('Invoice No: ', invoice.invoiceNo)}</div>
          <div class="meta-card">${renderLabeledInline(invoice.invoiceType === 'proforma' ? 'Invoice Type: ' : 'Place of Supply: ', invoice.invoiceType === 'proforma' ? 'Proforma Invoice' : invoice.placeOfSupply)}</div>
          <div class="meta-cards">
            <div class="meta-box">
              <div class="meta-box-title">${renderLabeledStack(invoice.invoiceType === 'proforma' ? 'Issue Date: ' : 'Invoice Date: ', invoice.invoiceDateDisplay)}</div>
            </div>
            ${invoice.includeDueDate === false ? '' : `
            <div class="meta-box">
              <div class="meta-box-title">${renderLabeledStack('Due Date: ', invoice.dueDateDisplay)}</div>
            </div>
            `}
          </div>
        </div>
      </div>

      <table>
        <thead>
          ${renderTableHeader(invoice)}
        </thead>
        <tbody>
          ${rows}
          <tr>
            ${summaryTaxCells}
          </tr>
        </tbody>
      </table>

      <div class="details-section">
        <div class="payment-panel">
          <div class="muted-heading">Payment Details:</div>
          <div class="payment-row">${renderLabeledInline('Name: ', invoice.company.bankAccountName)}</div>
          <div class="payment-row">${renderLabeledInline('Bank Name: ', invoice.company.bankName)}</div>
          <div class="payment-row">${renderLabeledInline('Account Number: ', invoice.company.bankAccountNumber)}</div>
          <div class="payment-row">${renderLabeledInline('Branch Name: ', invoice.company.bankBranchName)}</div>
          <div class="payment-row">${renderLabeledInline('IFSC: ', invoice.company.bankIfsc)}</div>
        </div>
        <div class="total-card">
          <div class="total-grid">
            <div class="total-label">Total</div>
            <div class="total-values">
              <div class="total-amount">₹ ${formatCurrency(invoice.total)}</div>
              <div class="total-words">${escapeHtml(invoice.totalInWords)}</div>
            </div>
          </div>
          <div class="total-rule"></div>
        </div>
      </div>

      <div class="terms-signatory">
        <div class="terms-card">
          <div class="terms-title">Terms & Conditions:</div>
          ${
            invoice.invoiceType === 'proforma'
              ? `
          <ol>
            <li>Proforma Invoice for approval only (not a tax invoice).</li>
            <li>Prices are exclusive of GST.</li>
            <li>Applicable taxes will be added in the final invoice.</li>
          </ol>`
              : `
          <ol>
            <li>Check the invoice amount and confirm.</li>
            <li>Payment should be made to the mentioned account only.</li>
            ${invoice.includeDueDate === false ? '' : `<li>Payment Terms: ${escapeHtml(invoice.paymentTermsLabel)} from invoice date.</li>`}
          </ol>`
          }
        </div>
        <div class="signatory-card">
          <div class="signatory-company">For ${escapeHtml(invoice.company.name)}</div>
          <div class="signature-slot">
            ${cinqaSignatureDataUri ? `<img class="signature-image" src="${cinqaSignatureDataUri}" alt="Authorized signature" />` : ''}
          </div>
          <div class="signatory-name">${escapeHtml(invoice.company.authorizedSignatory)}</div>
        </div>
      </div>
      </div>

      <div class="footer-strip">
        <div class="bottom-bar">
          <div>CINQA</div>
          <div class="bottom-bar-right">${escapeHtml(invoice.company.website)}</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}