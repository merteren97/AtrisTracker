const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

class ClaudeCredentialsResolver {
  constructor(options = {}) {
    this.home = options.home || os.homedir();
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.execFileSync = options.execFileSync || execFileSync;
  }

  readOAuthToken() {
    const environmentToken = this.cleanToken(this.env.CLAUDE_CODE_OAUTH_TOKEN);
    if (environmentToken) return environmentToken;

    for (const filePath of this.credentialFiles()) {
      const token = this.extractToken(this.readJson(filePath));
      if (token) return token;
    }

    if (this.platform === 'darwin') {
      const keychain = this.readMacOSKeychainCredential();
      const token = this.extractToken(keychain);
      if (token) return token;
    }

    return null;
  }

  detectEmail() {
    const candidates = [
      path.join(this.home, '.claude.json'),
      ...this.credentialFiles(),
    ];
    for (const filePath of candidates) {
      const email = this.findEmail(this.readJson(filePath));
      if (email) return email;
    }

    if (this.platform === 'darwin') {
      return this.findEmail(this.readMacOSKeychainCredential());
    }
    return null;
  }

  configDirs() {
    const dirs = [];
    if (typeof this.env.CLAUDE_CONFIG_DIR === 'string' && this.env.CLAUDE_CONFIG_DIR.trim()) {
      dirs.push(path.resolve(this.env.CLAUDE_CONFIG_DIR.trim()));
    }
    dirs.push(path.join(this.home, '.claude'));
    return [...new Set(dirs)];
  }

  credentialFiles() {
    const files = [];
    for (const dir of this.configDirs()) {
      files.push(path.join(dir, '.credentials.json'));
      files.push(path.join(dir, 'credentials.json'));
    }
    return [...new Set(files)];
  }

  readJson(filePath) {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      return null;
    }
  }

  readMacOSKeychainCredential() {
    const services = ['Claude Code-credentials', 'Claude Code'];
    for (const service of services) {
      try {
        const output = this.execFileSync(
          '/usr/bin/security',
          ['find-generic-password', '-s', service, '-w'],
          {
            encoding: 'utf8',
            timeout: 3000,
            stdio: ['ignore', 'pipe', 'ignore'],
          }
        );
        const text = String(output || '').trim();
        if (!text) continue;
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      } catch {
        // Try the next known Claude Code keychain service name.
      }
    }
    return null;
  }

  extractToken(value) {
    if (!value) return null;
    if (typeof value === 'string') return this.cleanToken(value);
    if (typeof value !== 'object') return null;

    const directCandidates = [
      value?.claudeAiOauth?.accessToken,
      value?.claudeAiOAuth?.accessToken,
      value?.oauth?.accessToken,
      value?.oauth?.access_token,
      value?.accessToken,
      value?.access_token,
    ];
    for (const candidate of directCandidates) {
      const token = this.cleanToken(candidate);
      if (token) return token;
    }

    const visited = new Set();
    const walk = (node, depth = 0) => {
      if (depth > 6 || !node || typeof node !== 'object' || visited.has(node)) return null;
      visited.add(node);
      for (const [key, child] of Object.entries(node)) {
        if (/access.?token/i.test(key)) {
          const token = this.cleanToken(child);
          if (token) return token;
        }
      }
      for (const child of Object.values(node)) {
        const token = walk(child, depth + 1);
        if (token) return token;
      }
      return null;
    };
    return walk(value);
  }

  cleanToken(value) {
    if (typeof value !== 'string') return null;
    const token = value.trim();
    if (!token || token.length < 20 || /\s/.test(token)) return null;
    return token;
  }

  findEmail(value) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const visited = new Set();
    const walk = (node, depth = 0) => {
      if (depth > 8 || node === null || node === undefined) return null;
      if (typeof node === 'string') {
        const text = node.trim();
        return emailPattern.test(text) ? text : null;
      }
      if (typeof node !== 'object' || visited.has(node)) return null;
      visited.add(node);
      for (const child of Object.values(node)) {
        const email = walk(child, depth + 1);
        if (email) return email;
      }
      return null;
    };
    return walk(value);
  }
}

module.exports = ClaudeCredentialsResolver;
