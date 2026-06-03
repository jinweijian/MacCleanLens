# MacClean Lens

MacClean Lens is a lightweight macOS disk cleanup assistant installed with npm.

```bash
npm install -g mac-clean-lens
mac-clean-lens
```

Before it is published to npm, install this local build with:

```bash
npm install -g /Users/kz/website/mac-clean-lens
mac-clean-lens
```

Build and install the native macOS app into an Applications folder so it appears in Launchpad:

```bash
npm run install:mac
```

The installer builds `dist/MacClean Lens.app`, generates the app icon, signs the bundle with an ad-hoc local signature, and copies it to `/Applications` when writable. If `/Applications` is not writable, it installs to `~/Applications`.

The MVP starts a local visual UI, scans common cache/log/dependency locations, groups findings by risk, and moves selected low-risk items to Trash only after confirmation.

## Safety

- Cleanable items are allowlisted cache, log, or dependency paths.
- Manual items such as Docker data, chat app containers, and Android SDK images are shown as recommendations but are not deleted by the one-click cleaner.
- Cleanup moves selected paths into `~/.Trash/MacCleanLens-<timestamp>/`. Empty Trash manually to actually release disk space.

## CLI

```bash
mac-clean-lens              # open visual UI
mac-clean-lens --port 3900  # open UI on a fixed port
mac-clean-lens --no-open    # start server without opening a browser
mac-clean-lens scan --json  # print scan report JSON
npm run build:mac           # build dist/MacClean Lens.app
npm run install:mac         # install the app for Launchpad
```

## Development

```bash
npm test
npm run scan
npm start
```
