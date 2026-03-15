$ErrorActionPreference = "Continue"
$base = "http://localhost:8787"

function Chat($message, $sessionId) {
    $body = @{ message = $message }
    if ($sessionId) { $body.sessionId = $sessionId }
    $json = $body | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri "$base/api/chat" -Method POST -Body $json -ContentType "application/json" -TimeoutSec 30
        return $r
    } catch {
        Write-Host "  ERROR: $_" -ForegroundColor Red
        return $null
    }
}

function ShowAllocs($data) {
    $a = $data.allocations
    if (-not $a -or ($a.PSObject.Properties | Measure-Object).Count -eq 0) {
        Write-Host "  Allocations: (none)"
        return
    }
    foreach ($p in $a.PSObject.Properties) {
        $v = $p.Value
        $notes = if ($v.notes) { " -- $($v.notes.Substring(0, [Math]::Min(60, $v.notes.Length)))" } else { "" }
        Write-Host "  $($p.Name): $($v.device) ($($v.function))$notes"
    }
}

function AllocCount($data) {
    if (-not $data.allocations) { return 0 }
    return ($data.allocations.PSObject.Properties | Measure-Object).Count
}

function HasDevice($data, $name) {
    if (-not $data.allocations) { return $false }
    foreach ($p in $data.allocations.PSObject.Properties) {
        if ($p.Value.device -and $p.Value.device -like "*$name*") { return $true }
    }
    return $false
}

function HasFunction($data, $fn) {
    if (-not $data.allocations) { return $false }
    foreach ($p in $data.allocations.PSObject.Properties) {
        if ($p.Value.function -and $p.Value.function -like "*$fn*") { return $true }
    }
    return $false
}

$passed = 0
$failed = 0
$issues = @()

function Check($name, $ok, $msg) {
    if ($ok) {
        Write-Host "  PASS: $name" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "  FAIL: $name -- $msg" -ForegroundColor Red
        $script:failed++
        $script:issues += "$name -- $msg"
    }
}

# Health check
Write-Host "`nSTM32 AI Agent Stress Test" -ForegroundColor Cyan
Write-Host "Backend: $base"
try {
    $h = Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 5
    Write-Host "Health: $($h.status), DB: $($h.db)`n"
} catch {
    Write-Host "ERROR: Backend not reachable at $base" -ForegroundColor Red
    Write-Host "Start it with: npx wrangler dev --remote"
    exit 1
}

# ==============================================================
Write-Host "`n============================================================"
Write-Host "SCENARIO 1: Informational questions must NOT allocate pins"
Write-Host "============================================================"

$r = Chat "What pins can I use for I2C?"
ShowAllocs $r
Check "I2C info no allocs" (AllocCount($r) -eq 0) "Informational question created allocations"

$r = Chat "Which pins are 5V tolerant?"
ShowAllocs $r
Check "5V info no allocs" (AllocCount($r) -eq 0) "Informational question created allocations"

$r = Chat "Does this chip have UART?"
ShowAllocs $r
Check "UART info no allocs" (AllocCount($r) -eq 0) "Informational question created allocations"

# ==============================================================
Write-Host "`n============================================================"
Write-Host "SCENARIO 2: I2C bus sharing (BMP280 + OLED on same bus)"
Write-Host "============================================================"

$r1 = Chat "Connect a GY-BMP280 module for temperature sensing"
$sid = $r1.sessionId
Write-Host "`n  Step 1: BMP280"
ShowAllocs $r1
Check "BMP280 allocated" (AllocCount($r1) -ge 2) "Expected 2 I2C pins"

$r2 = Chat "Add an SSD1306 OLED display module on the same I2C bus" $sid
Write-Host "`n  Step 2: + OLED on same bus"
ShowAllocs $r2
$pb6 = $r2.allocations.PB6
$shared = $pb6 -and $pb6.device -like "*SSD1306*"
Check "OLED shares I2C bus" $shared "SSD1306 not on PB6 or not sharing bus"

# ==============================================================
Write-Host "`n============================================================"
Write-Host "SCENARIO 3: Complex 5-device project"
Write-Host "============================================================"

$r1 = Chat "Connect a GY-BMP280 module for temperature sensing"
$sid = $r1.sessionId
Write-Host "`n  Step 1: BMP280"
ShowAllocs $r1

$r2 = Chat "Add an SSD1306 OLED display module on the same I2C bus" $sid
Write-Host "`n  Step 2: + OLED"
ShowAllocs $r2

$r3 = Chat "Wire up a status LED" $sid
Write-Host "`n  Step 3: + LED"
ShowAllocs $r3
Check "LED allocated" (HasDevice $r3 "LED") "LED not in allocations"

$r4 = Chat "Connect an HC-05 Bluetooth module on UART for wireless data" $sid
Write-Host "`n  Step 4: + HC-05 Bluetooth"
ShowAllocs $r4
Write-Host "  Response: $($r4.response.Substring(0, [Math]::Min(200, $r4.response.Length)))..."
$hasUART = (HasFunction $r4 "TX") -or (HasFunction $r4 "RX") -or (HasDevice $r4 "HC-05")
Check "Bluetooth UART allocated" $hasUART "No UART pins for HC-05"

$r5 = Chat "Finally, add a push button for user input" $sid
Write-Host "`n  Step 5: + Button"
ShowAllocs $r5
Check "5+ devices total" (AllocCount($r5) -ge 6) "Expected 6+ pins, got $(AllocCount($r5))"

# ==============================================================
Write-Host "`n============================================================"
Write-Host "SCENARIO 4: I2C address conflict (MPU6050 + DS3231 both 0x68)"
Write-Host "============================================================"

$r1 = Chat "Connect a GY-521 MPU6050 module to I2C"
$sid = $r1.sessionId
Write-Host "`n  Step 1: MPU6050"
ShowAllocs $r1
Check "MPU6050 allocated" (AllocCount($r1) -ge 2) "Expected 2 pins"

$r2 = Chat "Now add a DS3231 RTC module on I2C for timestamps" $sid
Write-Host "`n  Step 2: + DS3231 (address conflict!)"
ShowAllocs $r2
Write-Host "  Response: $($r2.response.Substring(0, [Math]::Min(300, $r2.response.Length)))..."
# Either warns about conflict OR puts it on I2C2 OR shares bus with note
$hasDS3231 = HasDevice $r2 "DS3231"
$mentionsConflict = $r2.response -like "*0x68*" -or $r2.response -like "*conflict*" -or $r2.response -like "*same address*"
Check "DS3231 handled" ($hasDS3231 -or $mentionsConflict) "DS3231 not allocated and no address conflict warning"

# ==============================================================
Write-Host "`n============================================================"
Write-Host "SCENARIO 5: Mixed protocols (I2C + ADC + PWM)"
Write-Host "============================================================"

$r1 = Chat "Connect a GY-521 MPU6050 on I2C for motion detection"
$sid = $r1.sessionId
Write-Host "`n  Step 1: MPU6050 (I2C)"
ShowAllocs $r1

$r2 = Chat "Add a potentiometer on an ADC pin for sensitivity adjustment" $sid
Write-Host "`n  Step 2: + Potentiometer (ADC)"
ShowAllocs $r2
Write-Host "  Response: $($r2.response.Substring(0, [Math]::Min(200, $r2.response.Length)))..."
$hasPot = HasDevice $r2 "potentiometer" -or HasDevice $r2 "Pot"
Check "Potentiometer allocated" $hasPot "No potentiometer in allocations"

$r3 = Chat "Connect a servo motor using PWM" $sid
Write-Host "`n  Step 3: + Servo (PWM)"
ShowAllocs $r3
Write-Host "  Response: $($r3.response.Substring(0, [Math]::Min(200, $r3.response.Length)))..."
Check "Servo allocated" (HasDevice $r3 "servo") "No servo in allocations"

# ==============================================================
Write-Host "`n============================================================"
Write-Host "SCENARIO 6: SPI bus sharing (SD card + NRF24L01)"
Write-Host "============================================================"

$r1 = Chat "Connect an SD card module on SPI1 for data logging"
$sid = $r1.sessionId
Write-Host "`n  Step 1: SD card (SPI)"
ShowAllocs $r1
Check "SD card SPI allocated" (AllocCount($r1) -ge 3) "Expected 3+ SPI pins"

$r2 = Chat "Add an NRF24L01 radio module sharing the same SPI bus with a different CS pin" $sid
Write-Host "`n  Step 2: + NRF24L01 (shared SPI)"
ShowAllocs $r2
Write-Host "  Response: $($r2.response.Substring(0, [Math]::Min(250, $r2.response.Length)))..."
Check "SPI shared 5+ pins" (AllocCount($r2) -ge 5) "Expected 5+ pins (shared bus + 2 CS), got $(AllocCount($r2))"

# ==============================================================
Write-Host "`n============================================================"
Write-Host "SCENARIO 7: Edge cases"
Write-Host "============================================================"

$r = Chat "How do I connect a Raspberry Pi to WiFi?"
Write-Host "`n  Off-topic question:"
Write-Host "  Response: $($r.response.Substring(0, [Math]::Min(200, $r.response.Length)))..."
$onTopic = $r.response -like "*STM32*" -or $r.response -like "*designed*" -or $r.response -like "*specifically*"
Check "Off-topic redirected" $onTopic "Did not redirect off-topic question"

$r = Chat "Connect a sensor"
Write-Host "`n  Vague request:"
Write-Host "  Response: $($r.response.Substring(0, [Math]::Min(200, $r.response.Length)))..."
Check "Vague no allocs" (AllocCount($r) -eq 0) "Allocated pins for vague request"

# ==============================================================
# RESULTS
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "RESULTS" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
if ($issues.Count -gt 0) {
    Write-Host "`nIssues:"
    foreach ($i in $issues) {
        Write-Host "  - $i" -ForegroundColor Yellow
    }
}
Write-Host ""
