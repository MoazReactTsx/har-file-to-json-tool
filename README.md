# HAR Inspector

A single-file, client-side tool that converts `.har` (HTTP Archive) files into a clean, simplified JSON — keeping only what matters: **method, URL, status code, request params, and response body.**

No backend. No upload. No tracking. Everything runs in your browser.

![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![100%25 Client--Side](https://img.shields.io/badge/runs-100%25%20in%20browser-4FD1C5)

---

## Features

- **Drag & drop or file picker** — load any `.har` file exported from Chrome/Firefox/Edge DevTools
- **Simplified extraction** — pulls only the essentials from every entry:
  - `method`, `url`, `status`, `statusText`, `mimeType`, `time`
  - `requestParams` (query string + POST body/params)
  - `response` (auto-decodes base64 and parses JSON bodies when possible)
- **Searchable request list** — filter by URL or HTTP method
- **Select & bulk export** — checkboxes per request, "select all," and a dedicated **download selected** button
- **Full JSON export** — one click to download everything as `har-simplified.json`
- **4 built-in themes** — Night, Paper, Phosphor, and Amber, switchable instantly from the header
- **Zero dependencies, zero backend** — the HAR file never leaves the visitor's browser

## Usage

1. Open `har-inspector.html` (or the deployed GitHub Pages link) in any modern browser.
2. Export a HAR file from your browser's DevTools (Network tab → right-click → "Save all as HAR").
3. Drag the file onto the drop zone, or click it to browse.
4. Browse requests, inspect params/response per request, select what you need, and download.

## Deploying on GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Source**, choose the branch (e.g. `main`) and root folder.
4. Save — your tool will be live at `https://<username>.github.io/<repo-name>/`.

No build step, no `npm install`, no server config needed — it's a single static HTML file.

## Privacy

All parsing happens locally in the browser via the File API. No HAR content, request data, or response bodies are ever sent to a server, logged, or stored. This makes it safe to use on HAR files containing auth tokens, cookies, or other sensitive data — though you should still be careful about who you share the *exported* HAR/JSON files with, since HAR files often contain sensitive headers and cookies by nature.

## License

Released under the [MIT License](LICENSE) — free to use, modify, and distribute, including commercially, as long as the original copyright notice is kept.

If you'd rather prevent commercial reuse or require derivatives to stay open source, see the **Choosing a different license** note below.

## Choosing a different license

MIT is the most permissive and the most common choice for small public dev tools — it lets anyone use your code (including in commercial products) as long as they keep your name in the copyright notice. It doesn't stop someone from re-hosting a copy or rebranding it, but it does mean they can't legally claim they wrote it. If you want stronger protection instead:

| Goal | License |
|---|---|
| Max adoption, simplest terms, attribution required | **MIT** (included here) |
| Same as MIT + explicit patent grant | Apache License 2.0 |
| Anyone can use it, but any modified/hosted version must also be open-sourced | AGPL-3.0 |
| Free for personal/non-commercial use only, commercial use needs your permission | CC BY-NC 4.0 (better suited to content than code) |

Note: I'm not a lawyer and this isn't legal advice — for anything commercially sensitive, it's worth a quick read of [choosealicense.com](https://choosealicense.com) or a real legal opinion.

## Contributing

Issues and pull requests are welcome. Since this is a single HTML file by design, please keep contributions dependency-free.
