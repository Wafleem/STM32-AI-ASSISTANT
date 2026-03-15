import { execSync } from 'child_process';

try {
  const out = execSync(
    'powershell -Command "Invoke-RestMethod -Uri http://localhost:8787/api/health | ConvertTo-Json"',
    { timeout: 10000 }
  );
  console.log('Result:', out.toString().trim());
} catch (e) {
  console.log('Failed:', e.stderr?.toString() || e.message);
}
