# Deploy to GitHub Pages

Every push to `main` runs `.github/workflows/pages.yml`: it builds `dist/` with `game/tools/deploy/build.mjs` and
publishes it on GitHub Pages. Once per repository: Settings → Pages → Build and deployment → Source: "GitHub Actions".
The workflow can also be started by hand (Actions → Pages → Run workflow).

Build locally:

```
cd game/tools/deploy
npm install
npm run build                 # builds ../../../dist
```

`node verify.mjs <model>` checks that a packed model decodes as the original. Test the build with any static server in
`dist/`. The game uses relative paths only, so it runs under the repository's subpath (`https://<user>.github.io/<repo>/`).

What the build does: copies `game/` without `tools/` and `tests/`, packs the models with meshopt (the pilgrim's and
the boss's skeletons and clips stay byte for byte as they are, so fights replay the same), halves the textures of
figures only the pilgrim wears (and of any boss figure still over 8 MB), and copies `CREDITS.md` and `licenses/`.
