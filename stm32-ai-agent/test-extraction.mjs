// Quick smoke test for extractPinAllocations edge cases
// Run: node test-extraction.mjs

function normalizePin(raw) {
  const cleaned = raw.toUpperCase().replace(/[\s_-]/g, '');
  const match = cleaned.match(/^(P[A-E])(\d{1,2})$/);
  return match ? `${match[1]}${match[2]}` : null;
}

function extractPinAllocations(aiResponse, userMsg) {
  const allocations = {};

  if (aiResponse.tool_calls && Array.isArray(aiResponse.tool_calls)) {
    for (const toolCall of aiResponse.tool_calls) {
      if (toolCall.name === 'allocate_pins') {
        try {
          const args = typeof toolCall.arguments === 'string'
            ? JSON.parse(toolCall.arguments) : toolCall.arguments;
          let allocationsList = args.allocations;
          if (typeof allocationsList === 'string') allocationsList = JSON.parse(allocationsList);
          if (allocationsList && Array.isArray(allocationsList)) {
            for (const allocation of allocationsList) {
              const pin = normalizePin(allocation.pin);
              if (!pin) continue;
              allocations[pin] = { function: allocation.function, device: allocation.device, notes: allocation.notes };
            }
          }
        } catch (e) { console.error('Failed to parse tool call arguments:', e); }
      }
    }
    if (Object.keys(allocations).length > 0) return allocations;
  }

  const text = aiResponse.response || '';
  const structuredMatch = text.match(
    /---\s*PIN_ALLOCATIONS\s*---\s*[\r\n]+([\s\S]*?)[\r\n]+\s*---\s*END_ALLOCATIONS\s*---/
  );

  if (structuredMatch) {
    const allocationBlock = structuredMatch[1];
    const lines = allocationBlock.split(/\r?\n/).filter(line => line.trim());
    for (const line of lines) {
      const pinMatch = line.match(/PIN:\s*(P\s*[A-E]\s*\d{1,2})/i);
      const functionMatch = line.match(/FUNCTION:\s*([^|,]+)/i);
      const deviceMatch = line.match(/DEVICE:\s*([^|,]+)/i);
      const notesMatch = line.match(/NOTES:\s*(.+)/i);
      if (pinMatch) {
        const pin = normalizePin(pinMatch[1]);
        if (!pin) continue;
        allocations[pin] = {
          function: functionMatch ? functionMatch[1].trim() : 'GPIO',
          device: deviceMatch ? deviceMatch[1].trim() : undefined,
          notes: notesMatch ? notesMatch[1].trim() : undefined
        };
      }
    }
    if (Object.keys(allocations).length > 0) return allocations;
  }

  const informationalPatterns = [
    /which pins|what pins|list.*pins/i, /can i use|could i use/i,
    /are.*5v tolerant|5v.*tolerant/i, /available|options/i
  ];
  if (informationalPatterns.some(p => userMsg.match(p))) return allocations;

  const devicePattern = /\b([A-Z]{2,}[-]?\d{2,}[A-Z]?\d*|LED|Button|Switch|Motor|Relay)\b/gi;
  const devices = userMsg.match(devicePattern);
  if (!devices || devices.length === 0) return allocations;

  const connectionPattern = /(?:connect|wire|hook\s*up|attach|use|assign)\s+(?:the\s+)?([A-Z]{2,}[-]?\d{2,}[A-Z]?\d*|LED|sensor|module)\s+(?:to|on|at)\s+(?:pin\s+)?(P\s*[A-E]\s*\d{1,2})/gi;
  const matches = text.matchAll(connectionPattern);
  for (const match of matches) {
    const device = match[1];
    const pin = normalizePin(match[2]);
    if (!pin) continue;
    if (!allocations[pin]) {
      allocations[pin] = { function: 'GPIO', device, notes: undefined };
    }
  }
  return allocations;
}

// ---- TESTS ----

let passed = 0;
let failed = 0;

function test(name, result, expected) {
  const resultStr = JSON.stringify(result, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);
  if (resultStr === expectedStr) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
    console.log(`    Expected: ${expectedStr}`);
    console.log(`    Got:      ${resultStr}`);
    failed++;
  }
}

console.log('\n=== normalizePin tests ===');
test('standard format', normalizePin('PA0'), 'PA0');
test('lowercase', normalizePin('pa5'), 'PA5');
test('space in pin', normalizePin('PA 0'), 'PA0');
test('space after P', normalizePin('P B 6'), 'PB6');
test('underscore', normalizePin('PA_7'), 'PA7');
test('two digit pin', normalizePin('PB10'), 'PB10');
test('invalid port', normalizePin('PZ0'), null);
test('garbage', normalizePin('hello'), null);
test('just P', normalizePin('P'), null);

console.log('\n=== Structured block: standard format ===');
test('standard pipe-separated', extractPinAllocations({
  response: `Here are the connections:\n---PIN_ALLOCATIONS---\nPIN: PB6 | FUNCTION: SCL | DEVICE: MPU6050 | NOTES: 4.7k pull-up needed\nPIN: PB7 | FUNCTION: SDA | DEVICE: MPU6050 | NOTES: 4.7k pull-up needed\n---END_ALLOCATIONS---`,
  tool_calls: []
}, 'connect MPU6050'), {
  PB6: { function: 'SCL', device: 'MPU6050', notes: '4.7k pull-up needed' },
  PB7: { function: 'SDA', device: 'MPU6050', notes: '4.7k pull-up needed' }
});

console.log('\n=== Structured block: Windows \\r\\n line endings ===');
test('CRLF line endings', extractPinAllocations({
  response: `Here:\r\n---PIN_ALLOCATIONS---\r\nPIN: PB6 | FUNCTION: SCL | DEVICE: BMP280 | NOTES: pull-up\r\nPIN: PB7 | FUNCTION: SDA | DEVICE: BMP280 | NOTES: pull-up\r\n---END_ALLOCATIONS---`,
  tool_calls: []
}, 'connect BMP280'), {
  PB6: { function: 'SCL', device: 'BMP280', notes: 'pull-up' },
  PB7: { function: 'SDA', device: 'BMP280', notes: 'pull-up' }
});

console.log('\n=== Structured block: spaces in pin name ===');
test('space in pin (PA 5)', extractPinAllocations({
  response: `---PIN_ALLOCATIONS---\nPIN: PA 5 | FUNCTION: GPIO | DEVICE: LED | NOTES: 220 ohm\n---END_ALLOCATIONS---`,
  tool_calls: []
}, 'connect LED'), {
  PA5: { function: 'GPIO', device: 'LED', notes: '220 ohm' }
});

console.log('\n=== Structured block: comma-separated fields ===');
test('commas instead of pipes', extractPinAllocations({
  response: `---PIN_ALLOCATIONS---\nPIN: PA5, FUNCTION: GPIO, DEVICE: LED, NOTES: 330 ohm\n---END_ALLOCATIONS---`,
  tool_calls: []
}, 'connect LED'), {
  PA5: { function: 'GPIO', device: 'LED', notes: '330 ohm' }
});

console.log('\n=== Structured block: extra whitespace around delimiters ===');
test('spaces around dashes', extractPinAllocations({
  response: `--- PIN_ALLOCATIONS ---\nPIN: PA1 | FUNCTION: GPIO | DEVICE: Relay\n--- END_ALLOCATIONS ---`,
  tool_calls: []
}, 'connect Relay'), {
  PA1: { function: 'GPIO', device: 'Relay', notes: undefined }
});

console.log('\n=== Structured block: lowercase pin ===');
test('lowercase pin in block', extractPinAllocations({
  response: `---PIN_ALLOCATIONS---\nPIN: pb6 | FUNCTION: SCL | DEVICE: OLED\n---END_ALLOCATIONS---`,
  tool_calls: []
}, 'connect OLED'), {
  PB6: { function: 'SCL', device: 'OLED', notes: undefined }
});

console.log('\n=== Fallback: wire verb ===');
test('"wire X to pin"', extractPinAllocations({
  response: `You should wire MPU6050 to PA9 for the connection.`,
  tool_calls: []
}, 'How do I wire an MPU6050?'), {
  PA9: { function: 'GPIO', device: 'MPU6050', notes: undefined }
});

console.log('\n=== Fallback: attach verb ===');
test('"attach X on pin"', extractPinAllocations({
  response: `You can attach BMP280 on PB6 for I2C.`,
  tool_calls: []
}, 'attach BMP280'), {
  PB6: { function: 'GPIO', device: 'BMP280', notes: undefined }
});

console.log('\n=== Fallback: informational question skipped ===');
test('informational question returns empty', extractPinAllocations({
  response: `You can use PA0-PA7 for ADC.`,
  tool_calls: []
}, 'Which pins can I use for ADC?'), {});

console.log('\n=== Tool calls: space in pin name ===');
test('tool call with "PA 0"', extractPinAllocations({
  response: '',
  tool_calls: [{
    name: 'allocate_pins',
    arguments: JSON.stringify({
      allocations: [{ pin: 'PA 0', function: 'ADC', device: 'Potentiometer', notes: 'analog input' }]
    })
  }]
}, 'connect potentiometer'), {
  PA0: { function: 'ADC', device: 'Potentiometer', notes: 'analog input' }
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
