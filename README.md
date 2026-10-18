# 雞友台 ChickTV

Watch streams and chat together.

Website: https://chickchat.github.io/chicktv/

This repository contains public browser files and local preview tooling only. Private admin access settings, credentials, and local server data are excluded.

## Publishing

GitHub Pages uses the manual **Publish ChickTV (manual only)** Actions workflow. Uploading changes does not automatically deploy them. Run the workflow to publish a version.

## Taking the site offline

Open repository Settings → Pages → the menu beside the live-site address → Unpublish site. The separately hosted Cloudflare backend must be disabled separately if needed.

## Backend

Stream lookups and status checks use a separately hosted Cloudflare Worker. GitHub Pages does not execute the local Node server. Channel requests, approved channels, and admin membership are stored privately in Cloudflare. The owner manages Twitch administrators at admin/. Changes take effect without republishing; open watch pages refresh the shared list every 60 seconds.

## Local preview

With Node.js installed, run `node local-preview.mjs` from this folder, then open http://localhost:4173/ . Keep the terminal open while previewing. On localhost or 127.0.0.1, the frontend automatically uses the local Worker at http://localhost:8787. Start the private backend with npm run dev as well. The published site automatically uses the production HTTPS Cloudflare backend.

The publishing workflow includes only browser files, `admin/`, and `assets/`. The local preview server and README are not included in the deployed website.