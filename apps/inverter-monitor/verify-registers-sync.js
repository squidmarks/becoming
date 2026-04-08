#!/usr/bin/env node
/**
 * Verify that register definitions in registers.js match those in index.html
 * Run this before committing changes to either file.
 */

import { readFileSync } from 'fs';
import { CONFIG_REGISTERS } from './registers.js';

// Read HTML file
const html = readFileSync('./public/index.html', 'utf-8');

// Extract CONFIG_REGISTERS from HTML
const match = html.match(/const CONFIG_REGISTERS = ({[\s\S]*?});/);
if (!match) {
  console.error('❌ Could not find CONFIG_REGISTERS in index.html');
  process.exit(1);
}

let htmlRegisters;
try {
  // Evaluate the JS object
  htmlRegisters = eval('(' + match[1] + ')');
} catch (e) {
  console.error('❌ Could not parse CONFIG_REGISTERS from HTML:', e.message);
  process.exit(1);
}

// Compare
let hasErrors = false;

for (const category in CONFIG_REGISTERS) {
  if (!htmlRegisters[category]) {
    console.error(`❌ Category ${category} missing from HTML`);
    hasErrors = true;
    continue;
  }
  
  const jsRegs = CONFIG_REGISTERS[category];
  const htmlRegs = htmlRegisters[category];
  
  if (jsRegs.length !== htmlRegs.length) {
    console.error(`❌ ${category}: Different number of registers (JS: ${jsRegs.length}, HTML: ${htmlRegs.length})`);
    hasErrors = true;
  }
  
  for (let i = 0; i < jsRegs.length; i++) {
    const jsReg = jsRegs[i];
    const htmlReg = htmlRegs[i];
    
    if (!htmlReg) continue;
    
    if (jsReg.address !== htmlReg.address) {
      console.error(`❌ ${category}[${i}]: Address mismatch (${jsReg.name})`);
      hasErrors = true;
    }
    
    // Check options if they exist
    if (jsReg.options && htmlReg.options) {
      if (jsReg.options.length !== htmlReg.options.length) {
        console.error(`❌ ${category}[${i}] (${jsReg.name}): Different number of options`);
        console.error(`   JS: ${jsReg.options.map(o => o.value + ':' + o.label).join(', ')}`);
        console.error(`   HTML: ${htmlReg.options.map(o => o.value + ':' + o.label).join(', ')}`);
        hasErrors = true;
      } else {
        for (let j = 0; j < jsReg.options.length; j++) {
          if (jsReg.options[j].value !== htmlReg.options[j].value ||
              jsReg.options[j].label !== htmlReg.options[j].label) {
            console.error(`❌ ${category}[${i}] (${jsReg.name}): Option ${j} mismatch`);
            console.error(`   JS: ${jsReg.options[j].value}: ${jsReg.options[j].label}`);
            console.error(`   HTML: ${htmlReg.options[j].value}: ${htmlReg.options[j].label}`);
            hasErrors = true;
          }
        }
      }
    }
  }
}

if (hasErrors) {
  console.error('\n❌ Register definitions are OUT OF SYNC!');
  console.error('   Please update index.html to match registers.js');
  process.exit(1);
} else {
  console.log('✅ Register definitions are in sync');
  process.exit(0);
}
