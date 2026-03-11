# Sunrise Invoicing System (Netlify Frontend + Google Apps Script Backend)

This project rebuilds your billing workflow as a modern responsive web app (HTML/CSS/Vanilla JS) while keeping Google Sheets + Google Drive PDF generation in Apps Script.

## Project structure

## Login

Use the frontend login with:
- User: `admin@sunrise.com`
- Password: `Admin123@`


- `index.html` - main app layout
- `styles.css` - responsive UI theme
- `config.js` - API URL configuration
- `app.js` - frontend business logic (fetch API)
- `Code.gs` - Google Apps Script backend API + PDF generator
- `netlify.toml` - optional Netlify API proxy routes to Apps Script

---

## 1) Deploy backend (Google Apps Script Web App)

1. Open [script.new](https://script.new) and create a project.
2. Replace default file contents with `Code.gs` from this repo.
3. Confirm `SHEET_ID` and `FOLDER_ID` are correct in `Code.gs`.
4. Save project.
5. Deploy → **New deployment** → type **Web app**.
6. Execute as: **Me**.
7. Who has access: **Anyone** (or Anyone with Google account if your frontend users are authenticated accordingly).
8. Deploy and copy the **Web App URL**.

### Backend routes supported

Apps Script uses `action` routing:
- `GET .../exec?action=initial-data`
- `GET .../exec?action=invoice&invoiceNo=SUN-001`
- `POST .../exec?action=save-invoice` with JSON body `{ ...formData }` (or include `"action": "save-invoice"` in body)
- `POST .../exec` with JSON body `{ "action": "save-invoice", ...formData }`

---

## 2) Connect frontend to backend

### Current deployed Apps Script
- Deployment ID: `AKfycbwWmUNijCzjPlejiMZhLz_l53nebJuOhsX0tbxUgZmWU4r3R9FKaM4A8Y4nd4Kmca_gpg`
- Web App URL: `https://script.google.com/macros/s/AKfycbwWmUNijCzjPlejiMZhLz_l53nebJuOhsX0tbxUgZmWU4r3R9FKaM4A8Y4nd4Kmca_gpg/exec`


You have 2 options:

### Option A (recommended): Netlify `/api/*` routes

1. Update `netlify.toml` and replace `YOUR_SCRIPT_DEPLOYMENT_ID`.
2. Keep `config.js` as:
   ```js
   API_BASE_URL: '/api',
   APPS_SCRIPT_WEBAPP_URL: ''
   ```
3. Frontend calls:
   - `GET /api/initial-data`
   - `GET /api/invoice?invoiceNo=...`
   - `POST /api/save-invoice`

### Option B: Direct Apps Script URL

1. In `config.js`, set:
   ```js
   APPS_SCRIPT_WEBAPP_URL: 'https://script.google.com/macros/s/.../exec'
   ```
2. Leave `API_BASE_URL` as-is.
3. Frontend will auto-send `action` parameters internally.

---

## 3) Deploy frontend to Netlify

1. Push this repo to GitHub.
2. In Netlify: **Add new site** → **Import from Git**.
3. Build command: *(empty)*
4. Publish directory: `.`
5. Deploy site.
6. If using Option A, make sure `netlify.toml` is in repo root and updated.

---


## 3A) Deploy frontend to GitHub Pages

1. Ensure your default branch is `main` and push latest code.
2. In GitHub repo settings, open **Pages** and set source to **GitHub Actions**.
3. This repo includes `.github/workflows/deploy-pages.yml` which auto-deploys static files on every push to `main`.
4. After workflow success, open: `https://<your-username>.github.io/<repo-name>/`.
5. On login screen, paste your deployed Apps Script Web App URL in **Apps Script URL (for GitHub Pages)** so dropdown/products/invoices load from Google Sheets.

---

## 4) Test checklist

### Test create invoice
1. Open app dashboard.
2. Click **Create New Invoice**.
3. Fill customer details, add items, taxes, and remark.
4. Click **Save & Generate PDF**.
5. Confirm success toast and new browser tab with PDF link.
6. Confirm row added/updated in `Bill_data` sheet.

### Test edit invoice
1. Dashboard → search invoice in filter/dropdown.
2. Click **Load Invoice**.
3. Verify form is pre-filled (including items from `itemsJson`).
4. Change values and save again.
5. Confirm sheet row updated and a fresh PDF link returned.

### Verify PDF generation in Drive
1. Open configured Drive folder (`FOLDER_ID`).
2. Confirm `Invoice_<invoiceNo>.pdf` is created.
3. Open file and verify invoice format/tax details match legacy output.

---

## 5) Notes for Netlify compatibility

- Apps Script does not support REST path routing directly, so `action`-based routing is used in `Code.gs`.
- Netlify redirect rules map clean `/api/*` frontend routes to Apps Script query-style routes.
- PDF generation remains server-side in Apps Script and stored in Google Drive (unchanged flow).
- Tax calculation and number-to-words logic are preserved from the original implementation.
- Invoice data schema and `itemsJson` structure are preserved.

---

## 6) Security and permissions

- If web app is public (`Anyone`), protect Sheet access by sharing only with script owner account.
- If access is restricted, frontend users must be authenticated with matching Google permissions.
- Consider adding token validation in `doGet/doPost` before production public rollout.
