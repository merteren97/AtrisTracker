# Linux packaging

AtrisTracker ships Linux builds as AppImage and Debian packages.

The source application logo is stored as `assets/logo.jpg` for the renderer. Electron Builder's Linux icon pipeline expects PNG/SVG input, so CI prepares a standard freedesktop PNG icon set under `build/icons/` before packaging.

On Ubuntu/Debian, local packaging requires ImageMagick:

```bash
sudo apt-get install imagemagick
npm install
npm run prepare:linux-icons
npm run build
npx electron-builder --linux --publish never
```

Expected x64 release artifacts use Electron Builder's target-specific architecture labels:

- `AtrisTracker-<version>-x86_64.AppImage`
- `AtrisTracker-<version>-amd64.deb`

The Debian target also requires maintainer metadata; AtrisTracker sets it explicitly in the Linux build configuration.

The PR CI runs the same icon preparation and real Electron Builder packaging path used by the release workflow, then verifies that both files exist and are non-empty.
