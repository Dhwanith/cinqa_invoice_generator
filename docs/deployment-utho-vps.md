# Utho VPS Deployment

This deployment shape assumes:

- hosted n8n remains at `https://n8n.cinqa.space`
- Utho VPS runs `operator-app` and `pdf-service` as Docker containers
- host Nginx terminates TLS and reverse proxies traffic to the app and PDF endpoint

## 1. Final Topology

- `invoice.cinqa.space` -> Nginx -> `127.0.0.1:8010`
- `pdf-internal.cinqa.space` -> Nginx -> `127.0.0.1:8001`
- `n8n.cinqa.space` -> hosted n8n

The React frontend is already built into `frontend/dist` and served by `scripts/app-server.js`. Nginx should proxy to the app server rather than serving the frontend as a separate static site.

## 2. Environment Split

### VPS `.env`

Keep these values on the VPS because `scripts/app-server.js` talks to Airtable directly and serves the authenticated operator app:

```env
APP_PORT=8010
PDF_SERVICE_PORT=8001
CREATE_INVOICE_WEBHOOK_URL=https://n8n.cinqa.space/webhook/create-invoice

APP_AUTH_USERNAME=replace-me
APP_AUTH_PASSWORD=replace-me
APP_SESSION_SECRET=replace-me
APP_SESSION_TTL_HOURS=12
APP_COOKIE_SECURE=true
APP_TRUST_PROXY=1

AIRTABLE_API_TOKEN=replace-me
AIRTABLE_BASE_ID=replace-me
AIRTABLE_TABLE_CLIENTS=clients
AIRTABLE_TABLE_INVOICES=invoices
AIRTABLE_TABLE_LINE_ITEMS=invoice_line_items
AIRTABLE_FIELD_CLIENT_LINK=Client Record
AIRTABLE_FIELD_PROFORMA_LINK=Proforma Invoice Record

# Optional, only if hosted n8n validation enforces the header.
N8N_WEBHOOK_SECRET=replace-me
```

If the PDF container uses the same `.env`, you can keep the company and bank fields there as well.

### Hosted n8n environment

The workflow and code nodes in `n8n/` read these values via `$env`:

```env
AIRTABLE_API_TOKEN=replace-me
AIRTABLE_BASE_ID=replace-me
AIRTABLE_TABLE_CLIENTS=clients
AIRTABLE_TABLE_INVOICES=invoices
AIRTABLE_TABLE_LINE_ITEMS=invoice_line_items
AIRTABLE_TABLE_SEQUENCES=invoice_sequences
AIRTABLE_FIELD_CLIENT_LINK=Client Record
AIRTABLE_FIELD_INVOICE_LINK=Invoice Record
AIRTABLE_FIELD_PROFORMA_LINK=Proforma Invoice Record
AIRTABLE_INVOICE_STATUS_GENERATED=Generated

PDF_SERVICE_URL=https://pdf-internal.cinqa.space
GOOGLE_DRIVE_INVOICE_FOLDER_ID=replace-me

COMPANY_NAME=Cinqa Tech Solutions LLP
COMPANY_GST=replace-me
COMPANY_PAN=replace-me
COMPANY_TAN=replace-me
COMPANY_STATE=Gujarat
COMPANY_STATE_CODE=24
DEFAULT_SAC=998314
DEFAULT_GST_RATE=0.18
COMPANY_ADDRESS_LINE_1=replace-me
COMPANY_ADDRESS_LINE_2=replace-me
COMPANY_EMAIL=replace-me
COMPANY_WEBSITE=replace-me
BANK_ACCOUNT_NAME=replace-me
BANK_NAME=replace-me
BANK_ACCOUNT_NUMBER=replace-me
BANK_BRANCH_NAME=replace-me
BANK_IFSC=replace-me
AUTHORIZED_SIGNATORY=Authorized Signatory
PAYMENT_TERMS_DAYS=10

# Set this only if the app server is configured with the same value.
N8N_WEBHOOK_SECRET=replace-me
```

Store Google Drive access in hosted n8n credentials, not in the VPS `.env`.

## 3. Required Repo Changes Included

The repo now includes:

- `docker-compose.prod.yml` for the VPS deployment shape
- `deploy/nginx-invoice.conf.example` for the operator app reverse proxy
- `deploy/nginx-pdf-internal.conf.example` for the PDF service reverse proxy
- app-server support for sending `x-webhook-secret` when `N8N_WEBHOOK_SECRET` is configured

The original `docker-compose.yml` is still suitable for self-contained local Docker usage, but not for this production topology.

## 4. Deployment Steps

1. Create DNS records.
   - Point `invoice.cinqa.space` to the Utho VPS public IP.
   - Point `pdf-internal.cinqa.space` to the same IP if hosted n8n must reach the PDF service over HTTPS.

2. Provision the VPS.
   - Install Docker Engine and Docker Compose.
   - Open only ports `80` and `443` in the firewall.
   - Keep raw container ports private. The containers bind only to `127.0.0.1`.

3. Copy the repo to the VPS.
   - Use your SSH key.
   - Clone the repository into a deploy directory such as `/opt/cinqa_invoice_generator`.

4. Create the production `.env` on the VPS.
   - Start from `deploy/.env.vps.example`.
   - Remove old local-n8n values such as `WEBHOOK_URL=https://n8nlocal...`.
   - Set `CREATE_INVOICE_WEBHOOK_URL=https://n8n.cinqa.space/webhook/create-invoice`.
   - Set `APP_COOKIE_SECURE=true` and `APP_TRUST_PROXY=1`.
   - Set Airtable, app auth, optional `N8N_WEBHOOK_SECRET`, and linked-field values such as `AIRTABLE_FIELD_CLIENT_LINK=Client Record`.

5. Configure Nginx for both domains.

   - Copy `deploy/nginx-invoice.conf.example` to `/etc/nginx/sites-available/invoice.cinqa.space`.
   - Copy `deploy/nginx-pdf-internal.conf.example` to `/etc/nginx/sites-available/pdf-internal.cinqa.space`.
   - These example files are the initial HTTP-only server blocks used before Certbot injects the TLS configuration.
   - Create a basic-auth file for the PDF endpoint.

```bash
sudo sh -c "printf 'cinqa:$(openssl passwd -apr1 \"replace-with-strong-password\")\n' > /etc/nginx/.htpasswd-cinqa-pdf"
sudo ln -sf /etc/nginx/sites-available/invoice.cinqa.space /etc/nginx/sites-enabled/invoice.cinqa.space
sudo ln -sf /etc/nginx/sites-available/pdf-internal.cinqa.space /etc/nginx/sites-enabled/pdf-internal.cinqa.space
sudo nginx -t
sudo systemctl reload nginx
```

6. Install Certbot and issue certificates with the Nginx plugin.

   - If Certbot is already installed and managing `cinqa.space`, you can reuse the same installation and just issue certificates for the two subdomains.
   - Make sure both DNS records resolve to the VPS before running these commands.

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d invoice.cinqa.space -d pdf-internal.cinqa.space
sudo systemctl status certbot.timer --no-pager
sudo certbot renew --dry-run
```

   - Certbot will update the Nginx server blocks to add the HTTPS listeners, certificate paths, and HTTP-to-HTTPS redirects.
   - If you prefer issuing one certificate per hostname, run `certbot --nginx` separately for each domain instead.

7. Start the VPS stack.

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

8. Verify local service health on the VPS.

```bash
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs operator-app --tail=100
docker-compose -f docker-compose.prod.yml logs pdf-service --tail=100
curl http://127.0.0.1:8010/api/health
curl http://127.0.0.1:8001/health
```

9. Verify the public endpoints.
   - `https://invoice.cinqa.space/api/health`
   - `https://pdf-internal.cinqa.space/health`

10. Update hosted n8n.
   - Import or refresh `n8n/workflows/create-invoice.workflow.json`.
   - Re-paste the current `n8n/code/*.js` files into the Code nodes.
   - Set the hosted n8n environment variables listed above.
   - Set `PDF_SERVICE_URL=https://pdf-internal.cinqa.space`.
   - If the PDF endpoint is protected by Nginx basic auth, configure the `Render Invoice PDF` HTTP Request node in n8n to send the matching basic auth credentials.
   - Configure Google Drive credentials.
   - Activate the workflow.

11. Run an end-to-end smoke test.
   - Sign into `https://invoice.cinqa.space`.
   - Create a client if needed.
   - Generate one tax invoice.
   - Confirm Airtable records, PDF generation, and Google Drive upload all succeed.

## 5. Pre-Deployment Checklist

- `CREATE_INVOICE_WEBHOOK_URL` points to hosted n8n, not a local container hostname
- `APP_COOKIE_SECURE=true`
- `APP_TRUST_PROXY=1`
- `AIRTABLE_FIELD_CLIENT_LINK` on the VPS matches the linked client field name in Airtable if you use linked records
- `AIRTABLE_FIELD_PROFORMA_LINK` on the VPS and hosted n8n matches the linked proforma field name if you created it
- `PDF_SERVICE_URL` in hosted n8n points to a URL hosted n8n can actually reach
- `N8N_WEBHOOK_SECRET` is either configured in both places or in neither place
- `AIRTABLE_TABLE_SEQUENCES` exists in hosted n8n env
- `AIRTABLE_INVOICE_STATUS_GENERATED` matches the Airtable single-select label if it is title-cased
- `certbot --nginx` completed successfully for `invoice.cinqa.space` and `pdf-internal.cinqa.space`

## 6. Notes

- `docker-compose.prod.yml` intentionally does not run n8n on the VPS.
- If you later put n8n on the same private network or VPN as the VPS, you can stop exposing `pdf-internal.cinqa.space` publicly and proxy it only internally.
- Every frontend change requires a new image build because `Dockerfile.pdf-service` builds `frontend/dist` into the runtime image.
- To inspect the active certificates later, run `sudo certbot certificates`.