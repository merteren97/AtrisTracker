const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const path = require('path');
const fs = require('fs');

async function setup() {
  const electronPackage = require('../node_modules/electron/package.json');
  const version = electronPackage.version;
  console.log(`Setting up Electron v${version}...`);

  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: 'win32',
    arch: 'x64',
  });
  console.log('Zip cached at:', zipPath);

  const distPath = path.resolve(__dirname, '../node_modules/electron/dist');
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
  }

  console.log('Extracting to:', distPath);
  await extract(zipPath, { dir: distPath });

  const pathTxt = path.resolve(__dirname, '../node_modules/electron/path.txt');
  fs.writeFileSync(pathTxt, 'electron.exe');
  console.log('SUCCESS: Electron binary extracted & ready!');
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
