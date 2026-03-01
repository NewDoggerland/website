# WEBROOT scripts

FTP is the live source of truth. WEBROOT should reflect only its contents.

## Workflow (report before fixing)

1. **Report what sync would do (no changes)**  
   See what would be downloaded and what would be removed. No files are changed.

   ```bash
   npm run ftp-sync -- --dry-run
   ```

2. **Sync from FTP (one-way)**  
   Makes WEBROOT match FTP exactly. FTP is never modified; local files not on FTP are removed.

   ```bash
   npm run ftp-sync
   ```

3. **Report content discrepancies**  
   After syncing, scan all text documents and write a report of conflicting numbers or statements. Review the report before fixing.

   ```bash
   npm run doc-discrepancy-check
   ```
   Report is written to `discrepancy-report.md` in WEBROOT. Review it, then fix any real conflicts by hand.

## Other

- **ftp-compare**  
  Compare file list and sizes only (no download): `npm run ftp-compare`

## Setup

Copy `.env.example` to `.env` and set `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD` (and optionally `FTP_REMOTE_PATH`). Run `npm install` from WEBROOT once.
