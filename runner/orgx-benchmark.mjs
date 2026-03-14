#!/usr/bin/env node
import { execFile } from 'node:child_process';
import readline from 'node:readline/promises';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const baseUrl = process.env.ORGX_BENCHMARK_BASE_URL ?? 'https://useorgx.com';

function resolveUrl(pathname) {
  return new URL(pathname, baseUrl).toString();
}

function buildSignUpRunUrl(preset) {
  const redirectTarget = `/benchmark/runs?autorun=1&preset=${preset}&source=public_repo`;
  const url = new URL('/sign-up', baseUrl);
  url.searchParams.set('redirect_url', redirectTarget);
  return url.toString();
}

function buildLabRunUrl(preset) {
  const url = new URL('/benchmark/runs', baseUrl);
  url.searchParams.set('autorun', '1');
  url.searchParams.set('preset', preset);
  url.searchParams.set('source', 'public_repo');
  return url.toString();
}

async function openUrl(url) {
  if (process.platform === 'darwin') {
    await execFileAsync('open', [url]);
    return;
  }
  if (process.platform === 'win32') {
    await execFileAsync('cmd', ['/c', 'start', '', url]);
    return;
  }
  await execFileAsync('xdg-open', [url]);
}

function printHelp() {
  console.log(`OrgX benchmark launcher

Usage:
  node runner/orgx-benchmark.mjs
  node runner/orgx-benchmark.mjs open
  node runner/orgx-benchmark.mjs start starter
  node runner/orgx-benchmark.mjs start full
  node runner/orgx-benchmark.mjs lab
  node runner/orgx-benchmark.mjs benchmarks
  node runner/orgx-benchmark.mjs methodology

Environment:
  ORGX_BENCHMARK_BASE_URL   Override the OrgX base URL (default: https://useorgx.com)
`);
}

async function runInteractiveMenu() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('OrgX benchmark launcher');
    console.log('1. Start starter benchmark');
    console.log('2. Start full benchmark');
    console.log('3. Open Benchmark Lab');
    console.log('4. Open benchmark hub');
    console.log('5. Open methodology');
    console.log('6. Open sign-up');
    const choice = (await rl.question('Choose an option [1-6]: ')).trim();

    switch (choice) {
      case '1':
        await openUrl(buildSignUpRunUrl('starter'));
        console.log('Opened the starter benchmark signup flow in your browser.');
        return;
      case '2':
        await openUrl(buildSignUpRunUrl('full'));
        console.log('Opened the full benchmark signup flow in your browser.');
        return;
      case '3':
        await openUrl(resolveUrl('/benchmark/runs'));
        console.log('Opened Benchmark Lab in your browser.');
        return;
      case '4':
        await openUrl(resolveUrl('/benchmarks'));
        console.log('Opened the public benchmark hub in your browser.');
        return;
      case '5':
        await openUrl(resolveUrl('/blog/orgx-autonomous-initiative-benchmark-methodology'));
        console.log('Opened the benchmark methodology in your browser.');
        return;
      case '6':
        await openUrl(resolveUrl('/sign-up?redirect_url=/benchmark/runs'));
        console.log('Opened OrgX signup in your browser.');
        return;
      default:
        console.error('Unknown choice.');
        process.exitCode = 1;
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const [command, arg] = process.argv.slice(2);

  if (!command) {
    await runInteractiveMenu();
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'open') {
    await openUrl(resolveUrl('/benchmark'));
    console.log('Opened the Benchmark Lab landing page in your browser.');
    return;
  }

  if (command === 'lab') {
    await openUrl(resolveUrl('/benchmark/runs'));
    console.log('Opened Benchmark Lab in your browser.');
    return;
  }

  if (command === 'benchmarks') {
    await openUrl(resolveUrl('/benchmarks'));
    console.log('Opened the public benchmark hub in your browser.');
    return;
  }

  if (command === 'methodology') {
    await openUrl(resolveUrl('/blog/orgx-autonomous-initiative-benchmark-methodology'));
    console.log('Opened the benchmark methodology in your browser.');
    return;
  }

  if (command === 'start') {
    const preset = arg === 'full' ? 'full' : arg === 'starter' ? 'starter' : null;
    if (!preset) {
      console.error('Usage: node runner/orgx-benchmark.mjs start <starter|full>');
      process.exit(1);
    }
    await openUrl(buildSignUpRunUrl(preset));
    console.log(
      `Opened the ${preset} benchmark flow. After sign-in, Benchmark Lab will auto-queue the run.`
    );
    console.log(`If you are already signed in, you can also open: ${buildLabRunUrl(preset)}`);
    return;
  }

  printHelp();
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
