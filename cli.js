#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const HELP = `
STAX // Bulk QR Code Generator CLI (batch prep)
Reads newline-delimited payloads and validates the batch list.
PNG/ZIP rendering remains in the browser build (offline canvas + JSZip).

Usage: node cli.js <lines.txt> [-o report.txt]
`;

function run() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('-h') || args.includes('--help')) {
    console.log(HELP);
    process.exit(args.length ? 0 : 1);
  }
  const input = path.resolve(args[0]);
  const lines = fs.readFileSync(input, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const report = [
    `Bulk QR batch validation`,
    `Source: ${input}`,
    `Valid lines: ${lines.length}`,
    '',
    ...lines.map((l, i) => `${i + 1}. ${l.slice(0, 120)}${l.length > 120 ? '…' : ''}`),
    '',
    'Open templates/bulk-qr-code-generator/dist/BulkQRGenerator.html to render QR images.',
  ].join('\n');
  const outFlag = args.indexOf('-o');
  if (outFlag !== -1 && args[outFlag + 1]) {
    fs.writeFileSync(path.resolve(args[outFlag + 1]), report, 'utf8');
    console.log(`[OK] Wrote ${args[outFlag + 1]}`);
  } else {
    console.log(report);
  }
}

run();
