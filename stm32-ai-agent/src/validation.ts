import { PinAllocation, PinRow } from './types';

interface ValidationResult {
  validAllocations: PinAllocation;
  warnings: string[];
}

interface PinFunction {
  name: string;
  peripheral: string | null;
  remap: boolean;
}

// Notes that should ALWAYS be present for specific pin functions,
// regardless of what the LLM says or what breakout board is used.
// These are board-design-level requirements, not module-level.
const FUNCTION_NOTE_TEMPLATES: Record<string, string> = {
  // I2C lines always need pull-ups
  'I2C1_SCL': 'Requires 4.7k external pull-up to 3.3V',
  'I2C1_SDA': 'Requires 4.7k external pull-up to 3.3V',
  'I2C2_SCL': 'Requires 4.7k external pull-up to 3.3V',
  'I2C2_SDA': 'Requires 4.7k external pull-up to 3.3V',
  // SPI chip select is active low
  'SPI1_NSS': 'Active LOW chip select — pull HIGH with 10k to 3.3V when not in use',
  'SPI2_NSS': 'Active LOW chip select — pull HIGH with 10k to 3.3V when not in use',
  // UART TX/RX crossover
  'USART1_TX': 'Connect to device RX',
  'USART1_RX': 'Connect to device TX. If 5V device, add voltage divider',
  'USART2_TX': 'Connect to device RX',
  'USART2_RX': 'Connect to device TX. If 5V device, add voltage divider',
  'USART3_TX': 'Connect to device RX',
  'USART3_RX': 'Connect to device TX. If 5V device, add voltage divider',
  // CAN bus needs transceiver
  'CANRX': 'Requires CAN transceiver (e.g. SN65HVD230) — do not connect directly to CAN bus',
  'CANTX': 'Requires CAN transceiver (e.g. SN65HVD230) — do not connect directly to CAN bus',
  // USB
  'USBDM': 'USB D-. Blue Pill needs 1.5k pull-up on D+ (PA12) to 3.3V',
  'USBDP': 'USB D+. Blue Pill needs 1.5k pull-up to 3.3V for host detection',
  // ADC channels — not 5V tolerant
  'ADC12_IN0': 'Max input 3.3V — not 5V tolerant',
  'ADC12_IN1': 'Max input 3.3V — not 5V tolerant',
  'ADC12_IN2': 'Max input 3.3V — not 5V tolerant',
  'ADC12_IN3': 'Max input 3.3V — not 5V tolerant',
  'ADC12_IN4': 'Max input 3.3V — not 5V tolerant',
  'ADC12_IN5': 'Max input 3.3V — not 5V tolerant',
  'ADC12_IN6': 'Max input 3.3V — not 5V tolerant',
  'ADC12_IN7': 'Max input 3.3V — not 5V tolerant',
  'ADC12_IN8': 'Max input 3.3V — not 5V tolerant',
  'ADC12_IN9': 'Max input 3.3V — not 5V tolerant',
};

// Broader templates by function category (matched when exact function name isn't in the map above)
const CATEGORY_NOTE_TEMPLATES: Record<string, string> = {
  'SCL': 'Requires 4.7k external pull-up to 3.3V',
  'SDA': 'Requires 4.7k external pull-up to 3.3V',
  'CS': 'Active LOW chip select — pull HIGH with 10k to 3.3V when not in use',
  'NSS': 'Active LOW chip select — pull HIGH with 10k to 3.3V when not in use',
};

// Bus protocols allow multiple devices on the same signal lines:
// - I2C: devices share SCL/SDA, differentiated by address
// - SPI: devices share SCK/MOSI/MISO, differentiated by individual CS pins
function isBusShareableFunction(fn: string): boolean {
  const upper = fn.toUpperCase().replace(/[\s_-]/g, '');
  // I2C bus lines
  if (/^(I2C\d?)?(SCL|SDA)$/.test(upper) || /^I2C\d(SCL|SDA)$/.test(upper)) return true;
  // SPI shared lines (NOT chip select — CS must be unique per device)
  if (/^(SPI\d?)?(SCK|MOSI|MISO)$/.test(upper) || /^SPI\d(SCK|MOSI|MISO)$/.test(upper)) return true;
  return false;
}

// Validate AI-proposed allocations against the real pin database
export async function validateAllocations(
  db: D1Database,
  proposed: PinAllocation,
  current: PinAllocation
): Promise<ValidationResult> {
  const valid: PinAllocation = {};
  const warnings: string[] = [];

  const proposedPins = Object.keys(proposed);
  if (proposedPins.length === 0) return { validAllocations: valid, warnings };

  // Fetch all proposed pins from the database in one query
  const placeholders = proposedPins.map(() => '?').join(',');
  const result = await db.prepare(
    `SELECT * FROM pins WHERE pin IN (${placeholders})`
  ).bind(...proposedPins).all<PinRow>();

  const pinMap = new Map<string, PinRow>();
  for (const row of result.results) {
    pinMap.set(row.pin, row);
  }

  for (const [pin, info] of Object.entries(proposed)) {
    // 1. Does this pin exist?
    const pinData = pinMap.get(pin);
    if (!pinData) {
      warnings.push(`${pin} is not a valid STM32F103C8T6 pin — skipped.`);
      continue;
    }

    // 2. Is this a power/ground pin (not allocatable)?
    if (pinData.type === 'S' || pinData.type === 'I') {
      warnings.push(`${pin} is a ${pinData.type === 'S' ? 'power/ground' : 'input-only'} pin and cannot be allocated to ${info.device || 'a device'}.`);
      continue;
    }

    // 3. Is this pin already allocated to a different device?
    // Exception: I2C bus pins (SCL/SDA) can be shared by multiple devices
    const existing = current[pin];
    if (existing && existing.device !== info.device) {
      const isBusShare = isBusShareableFunction(existing.function) && isBusShareableFunction(info.function);
      if (!isBusShare) {
        warnings.push(`${pin} is already allocated to ${existing.device} (${existing.function}). ${info.device || 'New device'} cannot use it — deallocate first.`);
        continue;
      }
    }

    // 4. Validate that the requested function is available on this pin
    const functions: PinFunction[] = parseJSON(pinData.functions, []);
    const functionValid = isFunctionValidForPin(info.function, functions, pinData);

    if (!functionValid) {
      const availableFns = functions.map(f => f.name).join(', ');
      warnings.push(`${pin} does not support "${info.function}". Available functions: ${availableFns}.`);
      continue;
    }

    // 5. Apply note templates based on the matched function
    const matchedFn = findMatchingFunction(info.function, functions);
    const templateNote = getTemplateNote(info.function, matchedFn);
    if (templateNote) {
      info.notes = templateNote;
    }

    // 6. Check if function requires remap and append it
    if (matchedFn?.remap) {
      const remapNote = 'Requires AFIO remap';
      info.notes = info.notes
        ? `${info.notes}. ${remapNote}`
        : remapNote;
    }

    // 7. Check 5V tolerance
    if (!pinData.five_tolerant) {
      const toleranceNote = 'Not 5V tolerant';
      // Always add this for non-tolerant pins, don't duplicate if template already says it
      if (!info.notes?.toLowerCase().includes('not 5v tolerant')) {
        info.notes = info.notes
          ? `${info.notes}. ${toleranceNote}`
          : toleranceNote;
      }
    }

    valid[pin] = info;
  }

  return { validAllocations: valid, warnings };
}

// Look up a template note for the matched function
function getTemplateNote(requestedFn: string, matchedFn: PinFunction | null): string | null {
  if (matchedFn) {
    // Try exact match on the DB function name (e.g. "I2C1_SCL")
    const template = FUNCTION_NOTE_TEMPLATES[matchedFn.name];
    if (template) return template;
  }

  // Try category match on the user-facing function name (e.g. "SCL", "SDA", "CS")
  const upper = requestedFn.toUpperCase().replace(/[\s_-]/g, '');
  for (const [category, note] of Object.entries(CATEGORY_NOTE_TEMPLATES)) {
    if (upper === category || upper.endsWith(category)) return note;
  }

  return null;
}

function isFunctionValidForPin(requestedFn: string, pinFunctions: PinFunction[], pinData: PinRow): boolean {
  // GPIO is always valid on I/O pins
  if (/^gpio$/i.test(requestedFn) && pinData.type === 'I/O') return true;

  // Check for direct or fuzzy match against pin's available functions
  return findMatchingFunction(requestedFn, pinFunctions) !== null;
}

function findMatchingFunction(requestedFn: string, pinFunctions: PinFunction[]): PinFunction | null {
  const requested = requestedFn.toUpperCase().replace(/[\s_-]/g, '');

  for (const fn of pinFunctions) {
    const available = fn.name.toUpperCase().replace(/[\s_-]/g, '');

    // Exact match
    if (requested === available) return fn;

    // Partial match: "SCL" matches "I2C1_SCL", "TX" matches "USART1_TX"
    if (available.includes(requested) || requested.includes(available)) return fn;

    // Common aliases
    if (matchesAlias(requested, available)) return fn;
  }

  return null;
}

function matchesAlias(requested: string, available: string): boolean {
  const aliases: Record<string, string[]> = {
    'SCL': ['I2C1SCL', 'I2C2SCL'],
    'SDA': ['I2C1SDA', 'I2C2SDA'],
    'TX': ['USART1TX', 'USART2TX', 'USART3TX'],
    'RX': ['USART1RX', 'USART2RX', 'USART3RX'],
    'MOSI': ['SPI1MOSI', 'SPI2MOSI'],
    'MISO': ['SPI1MISO', 'SPI2MISO'],
    'SCK': ['SPI1SCK', 'SPI2SCK'],
    'NSS': ['SPI1NSS', 'SPI2NSS'],
    'CS': ['SPI1NSS', 'SPI2NSS'],
    'CHIPSELECT': ['SPI1NSS', 'SPI2NSS'],
    'PWM': ['TIM1CH1', 'TIM1CH2', 'TIM1CH3', 'TIM1CH4',
            'TIM2CH1ETR', 'TIM2CH2', 'TIM2CH3', 'TIM2CH4',
            'TIM3CH1', 'TIM3CH2', 'TIM3CH3', 'TIM3CH4',
            'TIM4CH1', 'TIM4CH2', 'TIM4CH3', 'TIM4CH4'],
    'ADC': ['ADC12IN0', 'ADC12IN1', 'ADC12IN2', 'ADC12IN3', 'ADC12IN4',
            'ADC12IN5', 'ADC12IN6', 'ADC12IN7', 'ADC12IN8', 'ADC12IN9'],
    'ANALOGINPUT': ['ADC12IN0', 'ADC12IN1', 'ADC12IN2', 'ADC12IN3', 'ADC12IN4',
                    'ADC12IN5', 'ADC12IN6', 'ADC12IN7', 'ADC12IN8', 'ADC12IN9'],
    'CANRX': ['CANRX'],
    'CANTX': ['CANTX'],
    'USBDM': ['USBDM'],
    'USBDP': ['USBDP'],
    'SWDIO': ['JTMS', 'SWDIO'],
    'SWCLK': ['JTCK', 'SWCLK'],
  };

  for (const [alias, targets] of Object.entries(aliases)) {
    if (requested === alias && targets.includes(available)) return true;
  }

  return false;
}

function parseJSON<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
