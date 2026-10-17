# 雞友台 ChickTV

Watch streams and chat together.

Website: https://chickchat.github.io/chicktv/

This repository contains public browser files only. Private admin access settings, credentials, and local server data are excluded.

## Publishing

GitHub Pages uses the manual **Publish ChickTV (manual only)** Actions workflow. Uploading changes does not automatically deploy them. Run the workflow to publish a version.

## Taking the site offline

Open repository Settings → Pages → the menu beside the live-site address → Unpublish site. The separately hosted Cloudflare backend must be disabled separately if needed.

## Backend

Stream lookups and status checks use a separately hosted Cloudflare Worker. GitHub Pages does not execute the local Node server. The current hosted Worker does not include the local admin/request persistence service.
