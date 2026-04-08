#!/usr/bin/env node
/**
 * Sync register definitions from registers.js to index.html
 * Run this after modifying registers.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { CONFIG_REGISTERS } from './registers.js';

const htmlPath = './public/index.html';
let html = readFileSync(htmlPath, 'utf-8');

// Convert CONFIG_REGISTERS to a formatted string
const registersStr = JSON.stringify(CONFIG_REGISTERS, null, 6)
  .replace(/"([^"]+)":/g, '$1:')  // Remove quotes from keys
  .replace(/: "([^"]+)"/g, ": '$1'");  // Use single quotes for strings

// Find and replace the CONFIG_REGISTERS definition
const regex = /const CONFIG_REGISTERS = \{[\s\S]*?\};/;
const replacement = `const CONFIG_REGISTERS = ${registersStr};`;

if (!regex.test(html)) {
  console.error('❌ Could not find CONFIG_REGISTERS in index.html');
  process.exit(1);
}

html = html.replace(regex, replacement);
writeFileSync(htmlPath, html, 'utf-8');

console.log('✅ Successfully synced register definitions to index.html');
console.log('   Don\'t forget to commit the updated index.html!');
