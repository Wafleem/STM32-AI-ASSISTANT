#!/bin/bash
# STM32 AI Agent Stress Test — run from Git Bash
# Usage: bash stress-test.sh
# Requires backend running at localhost:8787 (npx wrangler dev --remote)

BASE="http://127.0.0.1:8787"
PASSED=0
FAILED=0
ISSUES=()

chat() {
  local msg="$1"
  local sid="$2"
  local body
  if [ -n "$sid" ]; then
    body="{\"message\":\"$msg\",\"sessionId\":\"$sid\"}"
  else
    body="{\"message\":\"$msg\"}"
  fi
  curl -s -X POST "$BASE/api/chat" \
    -H "Content-Type: application/json" \
    -d "$body" \
    --max-time 60
}

alloc_count() {
  echo "$1" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    a = d.get('allocations', {})
    print(len(a) if isinstance(a, dict) else 0)
except: print(0)
" 2>/dev/null || echo "0"
}

get_session_id() {
  echo "$1" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('sessionId', ''))
except: print('')
" 2>/dev/null
}

get_response() {
  echo "$1" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('response', '')[:300])
except: print('')
" 2>/dev/null
}

has_device() {
  local data="$1"
  local device="$2"
  echo "$data" | python3 -c "
import sys, json
d = json.load(sys.stdin)
a = d.get('allocations', {})
found = any('$device'.lower() in (v.get('device','')+'').lower() for v in a.values()) if isinstance(a, dict) else False
print('yes' if found else 'no')
" 2>/dev/null
}

has_function() {
  local data="$1"
  local fn="$2"
  echo "$data" | python3 -c "
import sys, json
d = json.load(sys.stdin)
a = d.get('allocations', {})
found = any('$fn'.upper() in (v.get('function','')+'').upper() for v in a.values()) if isinstance(a, dict) else False
print('yes' if found else 'no')
" 2>/dev/null
}

has_pin() {
  local data="$1"
  local pin="$2"
  echo "$data" | python3 -c "
import sys, json
d = json.load(sys.stdin)
a = d.get('allocations', {})
print('yes' if '$pin' in a else 'no')
" 2>/dev/null
}

show_allocs() {
  echo "$1" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    a = d.get('allocations', {})
    if not a or not isinstance(a, dict) or len(a) == 0:
        print('  Allocations: (none)')
    else:
        for pin, info in a.items():
            dev = info.get('device', '?')
            fn = info.get('function', '?')
            notes = info.get('notes', '')
            n = (' -- ' + notes[:60]) if notes else ''
            print(f'  {pin}: {dev} ({fn}){n}')
except: print('  (parse error)')
" 2>/dev/null
}

check() {
  local name="$1"
  local ok="$2"
  local msg="$3"
  if [ "$ok" = "true" ]; then
    echo -e "  \033[32mPASS: $name\033[0m"
    PASSED=$((PASSED + 1))
  else
    echo -e "  \033[31mFAIL: $name -- $msg\033[0m"
    FAILED=$((FAILED + 1))
    ISSUES+=("$name -- $msg")
  fi
}

# ============================================================
echo ""
echo -e "\033[36mSTM32 AI Agent Stress Test\033[0m"
echo "Backend: $BASE"

HEALTH=$(curl -s "$BASE/api/health" --max-time 5 2>/dev/null)
if [ -z "$HEALTH" ]; then
  echo -e "\033[31mERROR: Backend not reachable at $BASE\033[0m"
  echo "Start it with: npx wrangler dev --remote"
  exit 1
fi
echo "Health: $HEALTH"
echo ""

# ============================================================
echo "============================================================"
echo "SCENARIO 1: Informational questions must NOT allocate pins"
echo "============================================================"

R=$(chat "What pins can I use for I2C?")
show_allocs "$R"
C=$(alloc_count "$R")
[ "$C" -eq 0 ] && check "I2C info no allocs" "true" "" || check "I2C info no allocs" "false" "Informational question created $C allocations"

R=$(chat "Which pins are 5V tolerant?")
show_allocs "$R"
C=$(alloc_count "$R")
[ "$C" -eq 0 ] && check "5V info no allocs" "true" "" || check "5V info no allocs" "false" "Informational question created $C allocations"

R=$(chat "Does this chip have UART?")
show_allocs "$R"
C=$(alloc_count "$R")
[ "$C" -eq 0 ] && check "UART info no allocs" "true" "" || check "UART info no allocs" "false" "Informational question created $C allocations"

# ============================================================
echo ""
echo "============================================================"
echo "SCENARIO 2: I2C bus sharing (BMP280 + OLED on same bus)"
echo "============================================================"

R1=$(chat "Connect a GY-BMP280 module for temperature sensing")
SID=$(get_session_id "$R1")
echo "  Step 1: BMP280 (session: $SID)"
show_allocs "$R1"
C=$(alloc_count "$R1")
[ "$C" -ge 2 ] && check "BMP280 allocated" "true" "" || check "BMP280 allocated" "false" "Expected 2+ I2C pins, got $C"

R2=$(chat "Add an SSD1306 OLED display module on the same I2C bus" "$SID")
echo "  Step 2: + OLED on same bus"
show_allocs "$R2"
SHARED=$(echo "$R2" | python3 -c "
import sys, json
d = json.load(sys.stdin)
a = d.get('allocations', {})
# Check if any pin has both BMP280 and SSD1306 in device name, or SSD1306 exists at all
has_ssd = any('SSD1306' in (v.get('device','')+'') for v in a.values())
print('yes' if has_ssd else 'no')
" 2>/dev/null)
[ "$SHARED" = "yes" ] && check "OLED shares I2C bus" "true" "" || check "OLED shares I2C bus" "false" "SSD1306 not found in allocations"

# ============================================================
echo ""
echo "============================================================"
echo "SCENARIO 3: Complex 5-device project"
echo "============================================================"

R1=$(chat "Connect a GY-BMP280 module for temperature sensing")
SID=$(get_session_id "$R1")
echo "  Step 1: BMP280"
show_allocs "$R1"

R2=$(chat "Add an SSD1306 OLED display module on the same I2C bus" "$SID")
echo "  Step 2: + OLED"
show_allocs "$R2"

R3=$(chat "Wire up a status LED" "$SID")
echo "  Step 3: + LED"
show_allocs "$R3"
HD=$(has_device "$R3" "LED")
[ "$HD" = "yes" ] && check "LED allocated" "true" "" || check "LED allocated" "false" "LED not in allocations"

R4=$(chat "Connect an HC-05 Bluetooth module on UART for wireless data" "$SID")
echo "  Step 4: + HC-05 Bluetooth"
show_allocs "$R4"
echo "  Response: $(get_response "$R4")"
HF1=$(has_function "$R4" "TX")
HF2=$(has_function "$R4" "RX")
HD2=$(has_device "$R4" "HC-05")
( [ "$HF1" = "yes" ] || [ "$HF2" = "yes" ] || [ "$HD2" = "yes" ] ) && check "Bluetooth UART allocated" "true" "" || check "Bluetooth UART allocated" "false" "No UART pins for HC-05"

R5=$(chat "Finally, add a push button for user input" "$SID")
echo "  Step 5: + Button"
show_allocs "$R5"
C=$(alloc_count "$R5")
[ "$C" -ge 6 ] && check "5+ devices total" "true" "" || check "5+ devices total" "false" "Expected 6+ pins, got $C"

# ============================================================
echo ""
echo "============================================================"
echo "SCENARIO 4: I2C address conflict (MPU6050 + DS3231 both 0x68)"
echo "============================================================"

R1=$(chat "Connect a GY-521 MPU6050 module to I2C")
SID=$(get_session_id "$R1")
echo "  Step 1: MPU6050"
show_allocs "$R1"
C=$(alloc_count "$R1")
[ "$C" -ge 2 ] && check "MPU6050 allocated" "true" "" || check "MPU6050 allocated" "false" "Expected 2 pins, got $C"

R2=$(chat "Now add a DS3231 RTC module on I2C for timestamps" "$SID")
echo "  Step 2: + DS3231 (address conflict!)"
show_allocs "$R2"
echo "  Response: $(get_response "$R2")"
HD=$(has_device "$R2" "DS3231")
RESP=$(get_response "$R2")
MENTIONS=$(echo "$RESP" | grep -ci -E "0x68|conflict|same address" || true)
( [ "$HD" = "yes" ] || [ "$MENTIONS" -gt 0 ] ) && check "DS3231 handled" "true" "" || check "DS3231 handled" "false" "DS3231 not allocated and no conflict warning"

# ============================================================
echo ""
echo "============================================================"
echo "SCENARIO 5: Mixed protocols (I2C + ADC + PWM)"
echo "============================================================"

R1=$(chat "Connect a GY-521 MPU6050 on I2C for motion detection")
SID=$(get_session_id "$R1")
echo "  Step 1: MPU6050 (I2C)"
show_allocs "$R1"

R2=$(chat "Add a potentiometer on an ADC pin for sensitivity adjustment" "$SID")
echo "  Step 2: + Potentiometer (ADC)"
show_allocs "$R2"
echo "  Response: $(get_response "$R2")"
HD1=$(has_device "$R2" "potentiometer")
HD2=$(has_device "$R2" "pot")
HF=$(has_function "$R2" "ADC")
( [ "$HD1" = "yes" ] || [ "$HD2" = "yes" ] || [ "$HF" = "yes" ] ) && check "Potentiometer allocated" "true" "" || check "Potentiometer allocated" "false" "No potentiometer/ADC in allocations"

R3=$(chat "Connect a servo motor using PWM" "$SID")
echo "  Step 3: + Servo (PWM)"
show_allocs "$R3"
echo "  Response: $(get_response "$R3")"
HD=$(has_device "$R3" "servo")
[ "$HD" = "yes" ] && check "Servo allocated" "true" "" || check "Servo allocated" "false" "No servo in allocations"

# ============================================================
echo ""
echo "============================================================"
echo "SCENARIO 6: SPI bus sharing (SD card + NRF24L01)"
echo "============================================================"

R1=$(chat "Connect an SD card module on SPI1 for data logging")
SID=$(get_session_id "$R1")
echo "  Step 1: SD card (SPI)"
show_allocs "$R1"
C=$(alloc_count "$R1")
[ "$C" -ge 3 ] && check "SD card SPI allocated" "true" "" || check "SD card SPI allocated" "false" "Expected 3+ SPI pins, got $C"

R2=$(chat "Add an NRF24L01 radio module sharing the same SPI bus with a different CS pin" "$SID")
echo "  Step 2: + NRF24L01 (shared SPI)"
show_allocs "$R2"
echo "  Response: $(get_response "$R2")"
C=$(alloc_count "$R2")
[ "$C" -ge 5 ] && check "SPI shared 5+ pins" "true" "" || check "SPI shared 5+ pins" "false" "Expected 5+ pins (shared bus + 2 CS), got $C"

# ============================================================
echo ""
echo "============================================================"
echo "SCENARIO 7: Edge cases"
echo "============================================================"

R=$(chat "How do I connect a Raspberry Pi to WiFi?")
echo "  Off-topic question:"
echo "  Response: $(get_response "$R")"
RESP=$(get_response "$R")
MENTIONS=$(echo "$RESP" | grep -ci -E "stm32|designed|specifically" || true)
[ "$MENTIONS" -gt 0 ] && check "Off-topic redirected" "true" "" || check "Off-topic redirected" "false" "Did not redirect off-topic question"

R=$(chat "Connect a sensor")
echo "  Vague request:"
echo "  Response: $(get_response "$R")"
C=$(alloc_count "$R")
[ "$C" -eq 0 ] && check "Vague no allocs" "true" "" || check "Vague no allocs" "false" "Allocated $C pins for vague request"

# ============================================================
echo ""
echo -e "\033[36m============================================================\033[0m"
echo -e "\033[36mRESULTS\033[0m"
echo -e "\033[36m============================================================\033[0m"
echo -e "\033[32mPassed: $PASSED\033[0m"
if [ "$FAILED" -gt 0 ]; then
  echo -e "\033[31mFailed: $FAILED\033[0m"
else
  echo -e "\033[32mFailed: $FAILED\033[0m"
fi
if [ ${#ISSUES[@]} -gt 0 ]; then
  echo ""
  echo "Issues:"
  for issue in "${ISSUES[@]}"; do
    echo -e "  \033[33m- $issue\033[0m"
  done
fi
echo ""
