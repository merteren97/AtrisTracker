const fs = require('fs');
const path = require('path');
const os = require('os');
const { isDeepStrictEqual } = require('util');

const MARKER = 'AtrisTracker statusline telemetry bridge';

class AntigravityIntegration {
  constructor(options = {}) {
    this.home = options.home || os.homedir();
    this.platform = options.platform || process.platform;
    this.baseDir = path.join(this.home, '.gemini', 'antigravity-cli');
    this.settingsPath = path.join(this.baseDir, 'settings.json');
    this.cachePath = path.join(this.baseDir, 'atris-statusline-state.json');
    this.backupPath = path.join(this.baseDir, 'atris-statusline-backup.json');
    this.scriptPath = path.join(
      this.baseDir,
      this.platform === 'win32' ? 'atris-statusline-bridge.ps1' : 'atris-statusline-bridge.sh'
    );
  }

  ensureBaseDir() {
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  readJson(filePath, fallback = null) {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      return fallback;
    }
  }

  stripJsonComments(input) {
    let output = '';
    let inString = false;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      const next = input[index + 1];

      if (lineComment) {
        if (char === '\n' || char === '\r') {
          lineComment = false;
          output += char;
        } else {
          output += ' ';
        }
        continue;
      }

      if (blockComment) {
        if (char === '*' && next === '/') {
          output += '  ';
          blockComment = false;
          index += 1;
        } else if (char === '\n' || char === '\r') {
          output += char;
        } else {
          output += ' ';
        }
        continue;
      }

      if (inString) {
        output += char;
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        output += char;
        continue;
      }

      if (char === '/' && next === '/') {
        lineComment = true;
        output += '  ';
        index += 1;
        continue;
      }

      if (char === '/' && next === '*') {
        blockComment = true;
        output += '  ';
        index += 1;
        continue;
      }

      output += char;
    }

    return output;
  }

  parseSettingsContent(raw) {
    const withoutBom = String(raw || '').replace(/^\uFEFF/, '');
    return JSON.parse(this.stripJsonComments(withoutBom));
  }

  readSettingsDocument() {
    if (!fs.existsSync(this.settingsPath)) {
      return { exists: false, raw: null, settings: {} };
    }

    const raw = fs.readFileSync(this.settingsPath, 'utf8');
    let settings;
    try {
      settings = this.parseSettingsContent(raw);
    } catch (error) {
      throw new Error(`Antigravity settings.json okunamadı: ${error.message}`);
    }

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('Antigravity settings.json geçerli bir JSON nesnesi değil.');
    }

    return { exists: true, raw, settings };
  }

  readSettingsStrict() {
    return this.readSettingsDocument().settings;
  }

  writeTextAtomic(filePath, content) {
    this.ensureBaseDir();
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
  }

  writeJsonAtomic(filePath, value) {
    this.writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  getBridgeCommand() {
    if (this.platform === 'win32') {
      // Antigravity tokenizes statusLine.command itself. Passing a quoted path to
      // PowerShell -File makes those quote characters survive into -File on
      // Windows, producing "Illegal characters in path". -EncodedCommand avoids
      // shell/path quoting entirely while still invoking the local bridge script.
      const escapedScript = this.scriptPath.replace(/'/g, "''");
      const launcher = `$ErrorActionPreference = 'Stop'; & '${escapedScript}'`;
      const encoded = Buffer.from(launcher, 'utf16le').toString('base64');
      return `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
    }
    return `"${this.scriptPath}"`;
  }

  isLegacyWindowsBridgeCommand(command) {
    if (this.platform !== 'win32' || typeof command !== 'string') return false;
    return (
      command.includes(path.basename(this.scriptPath)) &&
      /(?:^|\s)-File(?:\s|$)/i.test(command)
    );
  }

  isOurCommand(command) {
    if (typeof command !== 'string') return false;
    return command === this.getBridgeCommand() || command.includes(path.basename(this.scriptPath));
  }

  getStatus() {
    let settings = {};
    let settingsError = null;
    try {
      settings = this.readSettingsStrict();
    } catch (error) {
      settingsError = error.message;
    }
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
      needs_repair: this.isLegacyWindowsBridgeCommand(command),
      settings_found: fs.existsSync(this.settingsPath),
      settings_error: settingsError,
      settings_path: this.settingsPath,
      last_telemetry_at: lastTelemetryAt,
    };
  }

  originalStatusLineFromBackup() {
    const backup = this.readJson(this.backupPath, null);
    if (backup?.marker !== MARKER || !backup.had_status_line) return null;
    return backup.status_line || null;
  }

  repairIfNeeded() {
    const document = this.readSettingsDocument();
    const settings = document.settings;
    const currentStatusLine = settings.statusLine || null;
    const currentCommand = currentStatusLine?.command || '';
    if (!this.isOurCommand(currentCommand)) return this.getStatus();

    const desiredCommand = this.getBridgeCommand();
    const bridgeMissing = !fs.existsSync(this.scriptPath);
    if (currentCommand === desiredCommand && !bridgeMissing) return this.getStatus();

    const originalStatusLine = this.originalStatusLineFromBackup();
    this.writeBridgeScript(originalStatusLine?.command || '');

    settings.statusLine = {
      ...(currentStatusLine || {}),
      type: 'command',
      command: desiredCommand,
      enabled: true,
    };

    // If AtrisTracker originally created the status line, keep Antigravity's
    // built-in status line visible and use our custom command only as a silent
    // telemetry tap.
    const backup = this.readJson(this.backupPath, null);
    if (backup?.marker === MARKER && backup.had_status_line === false) {
      settings.statusLine.stack_with_default = true;
    }

    this.writeJsonAtomic(this.settingsPath, settings);
    return this.getStatus();
  }

  enable() {
    this.ensureBaseDir();
    const document = this.readSettingsDocument();
    const settings = document.settings;
    const currentStatusLine = settings.statusLine || null;
    const currentCommand = currentStatusLine?.command || '';
    if (this.isOurCommand(currentCommand)) return this.repairIfNeeded();

    this.writeJsonAtomic(this.backupPath, {
      marker: MARKER,
      saved_at: new Date().toISOString(),
      had_settings_file: document.exists,
      raw_settings: document.raw,
      original_settings: settings,
      had_status_line: Object.prototype.hasOwnProperty.call(settings, 'statusLine'),
      status_line: currentStatusLine,
    });

    this.writeBridgeScript(currentCommand);
    settings.statusLine = {
      ...(currentStatusLine || {}),
      type: 'command',
      command: this.getBridgeCommand(),
      enabled: true,
    };
    if (!currentStatusLine) {
      settings.statusLine.stack_with_default = true;
    }
    this.writeJsonAtomic(this.settingsPath, settings);
    return this.getStatus();
  }

  disable() {
    const document = this.readSettingsDocument();
    const settings = document.settings;
    const backup = this.readJson(this.backupPath, null);

    if (this.isOurCommand(settings?.statusLine?.command || '')) {
      const originalSettings = backup?.original_settings;
      const canRestoreRaw =
        backup?.marker === MARKER &&
        typeof backup.raw_settings === 'string' &&
        originalSettings &&
        typeof originalSettings === 'object';

      if (canRestoreRaw) {
        const currentWithoutBridge = { ...settings };
        const originalWithoutStatusLine = { ...originalSettings };
        delete currentWithoutBridge.statusLine;
        delete originalWithoutStatusLine.statusLine;

        if (isDeepStrictEqual(currentWithoutBridge, originalWithoutStatusLine)) {
          this.writeTextAtomic(this.settingsPath, backup.raw_settings);
        } else {
          this.restoreStatusLineSemantically(settings, backup);
        }
      } else {
        this.restoreStatusLineSemantically(settings, backup);
      }
    }

    try {
      if (fs.existsSync(this.backupPath)) fs.unlinkSync(this.backupPath);
    } catch {
      // The settings restoration is the important part; stale backup cleanup is non-fatal.
    }
    return this.getStatus();
  }

  restoreStatusLineSemantically(settings, backup) {
    if (backup?.marker === MARKER && backup.had_status_line) {
      settings.statusLine = backup.status_line;
    } else {
      delete settings.statusLine;
    }

    const hasOtherSettings = Object.keys(settings).length > 0;
    if (backup?.marker === MARKER && backup.had_settings_file === false && !hasOtherSettings) {
      try {
        if (fs.existsSync(this.settingsPath)) fs.unlinkSync(this.settingsPath);
      } catch {
        this.writeJsonAtomic(this.settingsPath, settings);
      }
      return;
    }

    this.writeJsonAtomic(this.settingsPath, settings);
  }

  writeBridgeScript(previousCommand) {
    if (this.platform === 'win32') {
      const escapedCache = this.cachePath.replace(/'/g, "''");
      const escapedPrevious = String(previousCommand || '').replace(/'/g, "''");
      const script = `# ${MARKER}\n$ErrorActionPreference = 'SilentlyContinue'\n$payload = [Console]::In.ReadToEnd()\n$cachePath = '${escapedCache}'\n$tempPath = $cachePath + '.tmp-' + $PID\n[System.IO.File]::WriteAllText($tempPath, $payload, [System.Text.UTF8Encoding]::new($false))\nMove-Item -Force $tempPath $cachePath\n$previous = '${escapedPrevious}'\nif ($previous) {\n  $payload | & cmd.exe /d /s /c $previous\n}\nexit 0\n`;
      fs.writeFileSync(this.scriptPath, script, 'utf8');
      return;
    }

    const shellQuote = (value) => `'${String(value).replace(/'/g, `'"'"'`)}'`;
    const script = `#!/bin/sh\n# ${MARKER}\nCACHE=${shellQuote(this.cachePath)}\nPREVIOUS=${shellQuote(previousCommand || '')}\nTMP="$CACHE.tmp-$$"\ncat > "$TMP"\nmv "$TMP" "$CACHE"\nif [ -n "$PREVIOUS" ]; then\n  cat "$CACHE" | sh -c "$PREVIOUS"\nfi\n`;
    fs.writeFileSync(this.scriptPath, script, { encoding: 'utf8', mode: 0o755 });
    try {
      fs.chmodSync(this.scriptPath, 0o755);
    } catch {
      // chmod can be unavailable on some mounted filesystems.
    }
  }
}

module.exports = AntigravityIntegration;
