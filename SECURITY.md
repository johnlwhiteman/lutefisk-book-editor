# Security

Lutefisk Book Editor is an experimental, unsupported project (see the [Disclaimer](README.md#disclaimer)). Security reports are welcome, but there is no guaranteed response time and no promise of a fix.

## Supported versions

Only the latest version on the default branch gets fixes. Older versions are not supported.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately through this repository's **Security** tab › **Report a vulnerability** (GitHub private vulnerability reporting).

Please include:

- what the problem is and what an attacker could do with it;
- the steps to reproduce it, ideally with a small example book or file;
- the Lutefisk Book Editor version or commit, and your operating system.

Once a fix is ready, it will be described in the [changelog](CHANGELOG.md).

## Security model

Lutefisk Book Editor is a desktop app that works on files on your own computer. It has no server, no accounts and no cloud storage.

**Network**

- The app makes no network requests on its own. Every Electron session cancels all `http`, `https`, `ws`, `wss` and `ftp` requests, and the window's Content Security Policy allows only the app's own files (`default-src 'none'`, `connect-src 'self'`).
- The one exception is **Analyze** in a bibliography source. When the user presses it, the main process sends a plain `GET` for the link the user pasted (or asks `doi.org` about a DOI), with no cookies, no referrer and no request body, a 12-second timeout and a 3 MB limit. Nothing from the book is sent.
- There are no automatic updates, telemetry, crash reports or web fonts.
- `npm test` includes a privacy test that traps every Node.js network API while it opens, saves and exports a test book. It fails if any request is made, if the source gains a network API, if the Content Security Policy loosens, or if any code other than Analyze could reach the network.

**The window**

- The renderer is sandboxed and context-isolated, with no Node.js integration. It talks to the main process only through a narrow preload API.
- Navigation, new windows and permission requests (camera, microphone, location and so on) are all denied.
- Markdown is rendered with raw HTML disabled. Links are limited to `http`, `https` and `mailto`, and pictures to the book's own `assets` and `research` folders.
- Links open in the user's own browser, only when clicked.

**Files**

- The main process validates every file path it receives. Paths must stay inside the open book's folder, and asset names are restricted to a safe character set.
- A folder is treated as a book only if it contains a `lutefisk.yaml` file.
- Deleted books go to the system Trash, after the user confirms by typing the title.

**Packaged builds**

- Electron fuses are set: no `RunAsNode`, no `NODE_OPTIONS`, no `--inspect` arguments, ASAR integrity validation on, the app loaded only from its ASAR archive, cookie encryption on, and no extra privileges for `file://`.
- The packaged app refuses remote-debugging and inspect switches.
- Builds are not code-signed. Sign them yourself before distributing them widely.

**Dependencies**

- `npm audit` should report no known vulnerabilities, and `npm run check:deprecated` finds deprecated packages.
- `npm run sbom` writes a software bill of materials (CycloneDX 1.5 and SPDX 2.3) to `sbom/`.

## Out of scope

- Problems that need someone who already controls your computer or user account.
- Opening a book or file from a source you don't trust: treat it as you would any other document.
- Warnings from Windows SmartScreen or macOS Gatekeeper about unsigned builds.
