const fs = require('fs');
const path = require('path');
const os = require('os');

const MARKER = 'AtrisTracker statusline telemetry bridge';

class AntigravityIntegration {
  constructor() {
    this.home = os.homedir();
    this.baseDir = path.join(this.home, '.gemini', 'antigravity-cli');
    this.settingsPath = path.join(this.baseDir, 'settings.json');
    this.cachePath = path.join(this.baseDir, 'atris-statusline-state.json');
    this.backupPath = path.join(this.baseDir, 'atris-statusline-backup.json');
    this.scriptPath = path.join(
      this.baseDir,
      process.platform === 'win32' ? 'atris-statusline-bridge.ps1' : 'atris-statusline-bridge.sh'
    );
  }

  ensureBaseDir() {
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  readJson(filePath, fallback = null) {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return fallback;
    }
  }

  writeJsonAtomic(filePath, value) {
    this.ensureBaseDir();
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  getBridgeCommand() {
    if (process.platform === 'win32') {
      return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${this.scriptPath}"`;
    }
    return `"${this.scriptPath}"`;
  }

  isOurCommand(command) {
    if (typeof command !== 'string') return false;
    return command.includes(path.basename(this.scriptPath));
  }

  getStatus() {
    const settings = this.readJson(this.settingsPath, {});
    const command = settings?.statusLine?.command || '';
    let lastTelemetryAt = null;
    try {
      if (fs.existsSync(this.cachePath)) {
        lastTelemetryAt = fs.statSync(this.cachePath).mtime.toISOString();
      }
    } catch {
      lastTelemetryAt = null;
    }

    return {
      enabled: this.isOurCommand(command),
      settings_found: fs.existsSync(this.settingsPath),
      last_telemetry_at: lastTelemetryAt,
    };
  }

  enable() {
    this.ensureBaseDir();
    const settings = this.readJson(this.settingsPath, {});
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('Antigravity settings.json geçerli bir JSON nesnesi değil.');
    }

    const currentStatusLine = settings.statusLine || null;
    const currentCommand = currentStatusLine?.command || '';
    if (this.isOurCommand(currentCommand)) return this.getStatus();

    this.writeJsonAtomic(this.backupPath, {
      marker: MARKER,
      saved_at: new Date().toISOString(),
      had_status_line: Object.prototype.hasOwnProperty.call(settings, 'statusLine'),
      status_line: currentStatusLine,
    });

    this.writeBridgeScript(currentCommand);
    settings.statusLine = {
      type: 'command',
      command: this.getBridgeCommand(),
    };
    this.writeJsonAtomic(this.settingsPath, settings);
    return this.getStatus();
  }

  disable() {
    const settings = this.readJson(this.settingsPath, {});
    const backup = this.readJson(this.backupPath, null);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('Antigravity settings.json geçerli bir JSON nesnesi değil.');
    }

    if (this.isOurCommand(settings?.statusLine?.command || '')) {
      if (backup?.marker === MARKER && backup.had_status_line) {
        settings.statusLine = backup.status_line;
      } else {
        delete settings.statusLine;
      }
      this.writeJsonAtomic(this.settingsPath, settings);
    }

    try {
      if (fs.existsSync(this.backupPath)) fs.unlinkSync(this.backupPath);
    } catch {
      // The settings restoration is the important part; stale backup cleanup is non-fatal.
    }
    return this.getStatus();
  }

  writeBridgeScript(previousCommand) {
    if (process.platform === 'win32') {
      const escapedCache = this.cachePath.replace(/'/g, "''");
      const escapedPrevious = String(previousCommand || '').replace(/'/g, "''");
      const script = `# ${MARKER}\n$ErrorActionPreference = 'SilentlyContinue'\n$payload = [Console]::In.ReadToEnd()\n$cachePath = '${escapedCache}'\n$tempPath = $cachePath + '.tmp-' + $PID\n[System.IO.File]::WriteAllText($tempPath, $payload, [System.Text.UTF8Encoding]::new($false))\nMove-Item -Force $tempPath $cachePath\n$previous = '${escapedPrevious}'\nif ($previous) {\n  $payload | & cmd.exe /d /s /c $previous\n} else {\n  Write-Output 'AtrisTracker telemetry aktif'\n}\n`;
      fs.writeFileSync(this.scriptPath, script, 'utf8');
      return;
    }

    const shellQuote = (value) => `'${String(value).replace(/'/g, `'"'"'`)}'`;
    const script = `#!/bin/sh\n# ${MARKER}\nCACHE=${shellQuote(this.cachePath)}\nPREVIOUS=${shellQuote(previousCommand || '')}\nTMP="$CACHE.tmp-$$"\ncat > "$TMP"\nmv "$TMP" "$CACHE"\nif [ -n "$PREVIOUS" ]; then\n  cat "$CACHE" | sh -c "$PREVIOUS"\nelse\n  printf '%s\\n' 'AtrisTracker telemetry aktif'\nfi\n`;
    fs.writeFileSync(this.scriptPath, script, { encoding: 'utf8', mode: 0o755 });
    try {
      fs.chmodSync(this.scriptPath, 0o755);
    } catch {
      // chmod can be unavailable on some mounted filesystems.
    }
  }
}

module.exports = AntigravityIntegration;
