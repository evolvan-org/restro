#!/usr/bin/env node

import { constants } from 'node:fs';
import { access, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createConnection, isIPv4 } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const usbPattern = /^\/dev\/usb\/lp\d+$/;
const maxPrintBytes = 256 * 1024;
const settingsDir = join(homedir(), '.config', 'restro');
const settingsPath = join(settingsDir, 'print-connector.json');

function apiUrl(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Use the Restro HTTPS API URL (HTTP is supported for localhost development).');
  }
  return url.href.replace(/\/+$/, '');
}

async function readSettings(forcePair, value) {
  if (!forcePair) {
    try {
      const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
      if (!tokenPattern.test(settings.token))
        throw new Error('Invalid saved pairing code. Run with --pair.');
      return { url: apiUrl(settings.url), token: settings.token };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!value || !process.stdin.isTTY) {
    throw new Error(
      'Pair interactively with: node restro-print-connector.mjs --pair <Restro API URL>',
    );
  }
  const url = apiUrl(value);
  const silent = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const terminal = createInterface({ input: process.stdin, output: silent, terminal: true });
  let token;
  process.stdout.write('Paste the restaurant pairing code and press Enter: ');
  try {
    token = (await terminal.question('')).trim();
  } finally {
    terminal.close();
    process.stdout.write('\n');
  }
  if (!tokenPattern.test(token)) throw new Error('Invalid pairing code.');
  return { url, token };
}

async function saveSettings(settings) {
  await mkdir(settingsDir, { recursive: true, mode: 0o700 });
  const temp = settingsPath + '.' + randomUUID();
  await writeFile(temp, JSON.stringify(settings), { mode: 0o600, flag: 'wx' });
  try {
    await rename(temp, settingsPath);
  } finally {
    await unlink(temp).catch(() => {});
  }
}

function isPrivateIPv4(host) {
  if (typeof host !== 'string' || !isIPv4(host)) return false;
  const [first, second] = host.split('.').map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

async function printToUsb(device, data) {
  if (typeof device !== 'string' || !usbPattern.test(device) || device.length > 32) {
    throw new Error('Invalid USB printer path');
  }
  const printer = await open(
    device,
    constants.O_WRONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
  );
  try {
    if (!(await printer.stat()).isCharacterDevice())
      throw new Error('USB path is not a character device');
    if (data) await printer.writeFile(data);
    else await access(device, constants.W_OK);
  } finally {
    await printer.close();
  }
}

function printToNetwork(network, data) {
  const { host, port } = network ?? {};
  if (!isPrivateIPv4(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid LAN printer endpoint');
  }
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(4500);
    socket.once('timeout', () => socket.destroy(new Error('Printer timed out')));
    socket.once('error', reject);
    socket.once('connect', () => {
      if (!data) {
        socket.destroy();
        resolve();
        return;
      }
      socket.end(data, () => {
        socket.destroy();
        resolve();
      });
    });
  });
}

async function execute(job) {
  if (!Number.isSafeInteger(job?.expiresAt) || Date.now() > job.expiresAt) {
    throw new Error('Expired print request');
  }
  let data;
  if (job.data !== undefined) {
    if (typeof job.data !== 'string' || job.data.length > Math.ceil(maxPrintBytes / 3) * 4) {
      throw new Error('Invalid print payload');
    }
    data = Buffer.from(job.data, 'base64');
    if (data.length === 0 || data.length > maxPrintBytes || data.toString('base64') !== job.data) {
      throw new Error('Invalid print payload');
    }
  }
  if (job.target?.transport === 'usb') await printToUsb(job.target.device, data);
  else if (job.target?.transport === 'network') await printToNetwork(job.target.network, data);
  else throw new Error('Unknown printer transport');
}

async function run(settings) {
  const endpoint = settings.url + '/thermal-print-connector';
  const headers = { Authorization: 'Bearer ' + settings.token };
  let saved = false;
  for (;;) {
    const connection = new AbortController();
    const idle = setTimeout(() => connection.abort(), 60_000);
    try {
      const response = await fetch(endpoint + '/connect', {
        headers,
        redirect: 'error',
        signal: connection.signal,
      });
      if (response.status === 401)
        throw new Error('Pairing was rejected. Generate a new code in Restro and run with --pair.');
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        if (response.status === 409)
          throw new Error('This restaurant already has an online connector.');
        throw new Error('Unable to connect to the Restro API');
      }
      if (!saved) {
        await saveSettings(settings);
        saved = true;
      }
      console.log('Connected to Restro. Leave this process running to print.');
      const decoder = new TextDecoder();
      let buffered = '';
      for await (const chunk of response.body) {
        idle.refresh();
        buffered += decoder.decode(chunk, { stream: true });
        let newline = buffered.indexOf('\n');
        while (newline !== -1) {
          const line = buffered.slice(0, newline);
          buffered = buffered.slice(newline + 1);
          newline = buffered.indexOf('\n');
          if (!line) continue;
          const job = JSON.parse(line);
          let ok = true;
          try {
            await execute(job);
          } catch (error) {
            ok = false;
            console.error('Printer request failed:', error.message);
          }
          const reply = await fetch(endpoint + '/reply', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: job.id, ok }),
            redirect: 'error',
            signal: AbortSignal.timeout(4000),
          });
          await reply.body?.cancel();
          if (!reply.ok) throw new Error('Restro did not accept the printer response');
        }
        if (buffered.length > maxPrintBytes * 2) throw new Error('Invalid connector stream');
      }
    } catch (error) {
      if (
        error.message.startsWith('Pairing was rejected') ||
        error.message.includes('already has an online connector')
      ) {
        throw error;
      }
      console.error('Connection interrupted. Reconnecting in 3 seconds.');
    } finally {
      clearTimeout(idle);
      connection.abort();
    }
    await delay(3000);
  }
}

try {
  const args = process.argv.slice(2);
  const forcePair = args[0] === '--pair';
  const settings = await readSettings(forcePair, args[forcePair ? 1 : 0]);
  await run(settings);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
