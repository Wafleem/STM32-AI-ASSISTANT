// Stress test for STM32 AI Agent — run with: node stress-test.mjs
// Requires backend running at localhost:8787

const API = process.env.API_URL || 'http://localhost:8787';

async function chat(message, sessionId = null) {
  const body = { message };
  if (sessionId) body.sessionId = sessionId;
  const res = await fetch(`${API}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    console.log(`  HTTP ${res.status}: ${await res.text()}`);
    return null;
  }
  return await res.json();
}

function showAllocations(data) {
  const allocs = data?.allocations || {};
  const keys = Object.keys(allocs);
  if (keys.length === 0) {
    console.log('  Allocations: (none)');
  } else {
    for (const [pin, info] of Object.entries(allocs)) {
      console.log(`  ${pin}: ${info.device || '?'} (${info.function})${info.notes ? ' — ' + info.notes.substring(0, 60) : ''}`);
    }
  }
}

function showResponse(data, maxLen = 300) {
  const resp = data?.response || '';
  console.log(`  Response: ${resp.substring(0, maxLen)}${resp.length > maxLen ? '...' : ''}`);
}

let passed = 0;
let issues = [];

async function scenario(name, steps) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SCENARIO: ${name}`);
  console.log('='.repeat(60));

  let sid = null;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`\n  Step ${i + 1}: "${step.msg}"`);
    const data = await chat(step.msg, sid);
    if (!data) {
      issues.push(`${name} step ${i+1}: API returned no data`);
      return;
    }
    if (!sid) sid = data.sessionId;

    showAllocations(data);
    if (step.showResponse) showResponse(data);

    // Run assertions
    if (step.check) {
      const result = step.check(data);
      if (result !== true) {
        console.log(`  *** ISSUE: ${result}`);
        issues.push(`${name} step ${i+1}: ${result}`);
      } else {
        console.log(`  ✓ Check passed`);
        passed++;
      }
    }
  }
}

async function main() {
  console.log('STM32 AI Agent Stress Test');
  console.log(`Backend: ${API}`);

  // Verify backend is up
  try {
    const health = await fetch(`${API}/api/health`);
    const h = await health.json();
    console.log(`Health: ${h.status}, DB: ${h.db}`);
  } catch (e) {
    console.log('ERROR: Backend not reachable. Start with: npx wrangler dev --remote');
    process.exit(1);
  }

  // ============================================================
  // SCENARIO 1: I2C Address Conflict (MPU6050 0x68 + DS3231 0x68)
  // ============================================================
  await scenario('I2C Address Conflict (MPU6050 + DS3231, both 0x68)', [
    {
      msg: 'Connect a GY-521 MPU6050 module to I2C',
      check: (d) => {
        const allocs = d.allocations || {};
        return Object.keys(allocs).length >= 2 ? true : 'Expected MPU6050 allocation on 2 pins';
      }
    },
    {
      msg: 'Now add a DS3231 RTC module on I2C for timestamps',
      showResponse: true,
      check: (d) => {
        const resp = (d.response || '').toLowerCase();
        // Should either warn about address conflict or handle it
        const allocs = d.allocations || {};
        const hasDS3231 = Object.values(allocs).some(v => (v.device || '').includes('DS3231'));
        return hasDS3231 ? true : 'DS3231 not allocated — check if address conflict was mentioned';
      }
    }
  ]);

  // ============================================================
  // SCENARIO 2: Informational then connection in same session
  // ============================================================
  await scenario('Informational question then actual connection', [
    {
      msg: 'What pins can I use for SPI?',
      check: (d) => {
        return Object.keys(d.allocations || {}).length === 0 ? true : 'Informational question created allocations!';
      }
    },
    {
      msg: 'Which pins are 5V tolerant?',
      check: (d) => {
        return Object.keys(d.allocations || {}).length === 0 ? true : 'Informational question created allocations!';
      }
    },
    {
      msg: 'OK, now connect an NRF24L01 radio module on SPI1',
      check: (d) => {
        const allocs = d.allocations || {};
        return Object.keys(allocs).length >= 3 ? true : `Expected SPI allocation, got ${Object.keys(allocs).length} pins`;
      }
    }
  ]);

  // ============================================================
  // SCENARIO 3: Large multi-device project (5+ devices)
  // ============================================================
  await scenario('Complex project: 5 devices across I2C, SPI, GPIO, UART', [
    {
      msg: 'Connect a GY-BMP280 module for temperature sensing',
      check: (d) => {
        const n = Object.keys(d.allocations || {}).length;
        return n === 2 ? true : `Expected 2 I2C pins, got ${n}`;
      }
    },
    {
      msg: 'Add an SSD1306 OLED display module on the same I2C bus',
      check: (d) => {
        const allocs = d.allocations || {};
        const pb6 = allocs['PB6'];
        if (!pb6) return 'PB6 not allocated';
        return (pb6.device || '').includes('SSD1306') ? true : `PB6 device is "${pb6.device}", expected to include SSD1306`;
      }
    },
    {
      msg: 'Wire up a status LED',
      check: (d) => {
        const allocs = d.allocations || {};
        const hasLED = Object.values(allocs).some(v => (v.device || '').toUpperCase().includes('LED'));
        return hasLED ? true : 'LED not in allocations';
      }
    },
    {
      msg: 'Connect an HC-05 Bluetooth module on UART for wireless data',
      showResponse: true,
      check: (d) => {
        const allocs = d.allocations || {};
        const hasUART = Object.values(allocs).some(v =>
          ['TX', 'RX', 'USART'].some(fn => (v.function || '').toUpperCase().includes(fn))
        );
        return hasUART ? true : 'No UART pins allocated for Bluetooth module';
      }
    },
    {
      msg: 'Finally, add a push button for user input',
      showResponse: true,
      check: (d) => {
        const allocs = d.allocations || {};
        const total = Object.keys(allocs).length;
        return total >= 6 ? true : `Expected 6+ total pins allocated, got ${total}`;
      }
    }
  ]);

  // ============================================================
  // SCENARIO 4: SPI bus sharing (SD card + NRF24L01 on same SPI)
  // ============================================================
  await scenario('SPI bus sharing: SD card + NRF24L01 on SPI1', [
    {
      msg: 'Connect an SD card module on SPI1 for data logging',
      check: (d) => {
        const allocs = d.allocations || {};
        return Object.keys(allocs).length >= 3 ? true : 'Expected SPI pins allocated';
      }
    },
    {
      msg: 'Add an NRF24L01 radio module sharing the same SPI bus with a different CS pin',
      showResponse: true,
      check: (d) => {
        const allocs = d.allocations || {};
        // Should have shared SCK/MOSI/MISO + separate CS pins
        return Object.keys(allocs).length >= 5 ? true : `Expected 5+ pins (shared bus + 2 CS), got ${Object.keys(allocs).length}`;
      }
    }
  ]);

  // ============================================================
  // SCENARIO 5: Reassignment - move a device to different pins
  // ============================================================
  await scenario('Reassignment: move device to different pins', [
    {
      msg: 'Connect an LED to PA5',
      check: (d) => {
        return (d.allocations || {})['PA5'] ? true : 'PA5 not allocated';
      }
    },
    {
      msg: 'Actually, move the LED to PA1 instead',
      showResponse: true,
      check: (d) => {
        const allocs = d.allocations || {};
        const hasPA1 = !!allocs['PA1'];
        const hasPA5 = !!allocs['PA5'];
        if (hasPA1 && !hasPA5) return true;
        if (hasPA1 && hasPA5) return 'PA5 not freed — LED on both PA1 and PA5';
        return 'PA1 not allocated for LED';
      }
    }
  ]);

  // ============================================================
  // SCENARIO 6: Invalid/edge case requests
  // ============================================================
  await scenario('Edge cases: non-STM32 questions and vague requests', [
    {
      msg: 'How do I connect a Raspberry Pi to WiFi?',
      check: (d) => {
        const resp = (d.response || '').toLowerCase();
        const onTopic = resp.includes('stm32') || resp.includes('designed to help') || resp.includes('specifically');
        return onTopic ? true : 'Did not redirect off-topic question';
      }
    },
    {
      msg: 'Connect a sensor',
      showResponse: true,
      check: (d) => {
        // Should ask which sensor, not blindly allocate
        const allocs = d.allocations || {};
        return Object.keys(allocs).length === 0 ? true : 'Allocated pins for vague "connect a sensor" request';
      }
    }
  ]);

  // ============================================================
  // SCENARIO 7: Mixed I2C + analog in same project
  // ============================================================
  await scenario('Mixed protocols: I2C sensor + analog sensor + PWM output', [
    {
      msg: 'Connect a GY-521 MPU6050 on I2C for motion detection',
      check: (d) => {
        const n = Object.keys(d.allocations || {}).length;
        return n >= 2 ? true : `Expected 2 pins, got ${n}`;
      }
    },
    {
      msg: 'Add a potentiometer on an ADC pin for sensitivity adjustment',
      showResponse: true,
      check: (d) => {
        const allocs = d.allocations || {};
        const hasADC = Object.values(allocs).some(v =>
          (v.function || '').toUpperCase().includes('ADC') || (v.function || '').toUpperCase().includes('ANALOG')
        );
        // GPIO is also acceptable for ADC pins
        const hasGPIO = Object.values(allocs).some(v =>
          (v.device || '').toLowerCase().includes('potentiometer') || (v.device || '').toLowerCase().includes('pot')
        );
        return (hasADC || hasGPIO) ? true : 'No ADC/analog pin allocated for potentiometer';
      }
    },
    {
      msg: 'Connect a servo motor using PWM',
      showResponse: true,
      check: (d) => {
        const allocs = d.allocations || {};
        const hasServo = Object.values(allocs).some(v =>
          (v.device || '').toLowerCase().includes('servo')
        );
        return hasServo ? true : 'No servo allocation found';
      }
    }
  ]);

  // ============================================================
  // RESULTS
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`Checks passed: ${passed}`);
  console.log(`Issues found: ${issues.length}`);
  if (issues.length > 0) {
    console.log('\nIssues:');
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }
  console.log();
}

main().catch(console.error);
