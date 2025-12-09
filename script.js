// ============================================
// ROVER CONTROL PANEL v2.0 - MAIN SCRIPT
// WITH COMPLETE LED CONTROL
// ============================================

// MQTT Configuration
let mqttClient = null;
const mqttBroker = 'wss://5fe0dce1f05b48e2a680b77941ce0130.s1.eu.hivemq.cloud:8884/mqtt';
let roverId = 'ROVER_001'; // Default - MUST match ESP32 code!
let lastStatusTime = null;
let ledState = false;
let ledBlinking = false;
let ledBlinkInterval = 500;

// DOM Elements
const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const btnConnect = document.getElementById('btnConnect');
const btnDisconnect = document.getElementById('btnDisconnect');
const btnRestart = document.getElementById('btnRestart');
const roverIdInput = document.getElementById('roverId');
const mqttInfo = document.getElementById('mqttInfo');
const connectionLog = document.getElementById('connectionLog');

// Status Display Elements
const wifiStrength = document.getElementById('wifiStrength');
const roverIP = document.getElementById('roverIP');
const roverUptime = document.getElementById('roverUptime');
const roverMovement = document.getElementById('roverMovement');
const roverSpeed = document.getElementById('roverSpeed');
const ledStateDisplay = document.getElementById('ledState');
const ledBlinkingDisplay = document.getElementById('ledBlinking');
const brokerStatus = document.getElementById('brokerStatus');
const lastUpdate = document.getElementById('lastUpdate');

// Control Buttons
const btnForward = document.getElementById('btnForward');
const btnBackward = document.getElementById('btnBackward');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnStop = document.getElementById('btnStop');
const btnAutoStop = document.getElementById('btnAutoStop');
const btnGetStatus = document.getElementById('btnGetStatus');

// Speed Control
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const btnSetSpeed = document.getElementById('btnSetSpeed');

// LED Control Elements
const ledIndicator = document.querySelector('.led-glow');
const ledStatusText = document.getElementById('ledStatusText');
const ledBlinkStatus = document.getElementById('ledBlinkStatus');

// LED Control Buttons
const btnLedOn = document.getElementById('btnLedOn');
const btnLedOff = document.getElementById('btnLedOff');
const btnLedToggle = document.getElementById('btnLedToggle');
const btnLedBlink = document.getElementById('btnLedBlink');
const btnLedBlinkStop = document.getElementById('btnLedBlinkStop');

// LED Blink Control
const blinkSpeedSlider = document.getElementById('blinkSpeedSlider');
const blinkSpeedValue = document.getElementById('blinkSpeedValue');
const btnSetBlinkSpeed = document.getElementById('btnSetBlinkSpeed');

// Test Buttons
const btnTestConnection = document.getElementById('btnTestConnection');
const btnTestPattern = document.getElementById('btnTestPattern');

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🤖 Rover Control Panel v2.0 Initialized');
    addLog('System initialized. Ready to connect.');
    
    // Load saved rover ID from localStorage
    const savedRoverId = localStorage.getItem('roverId');
    if (savedRoverId) {
        roverId = savedRoverId;
        roverIdInput.value = savedRoverId;
    }
    
    // Update rover ID when input changes
    roverIdInput.addEventListener('change', function() {
        roverId = this.value.trim();
        localStorage.setItem('roverId', roverId);
        updateMqttInfo();
        addLog(`Rover ID changed to: ${roverId}`);
        
        // If connected, disconnect first
        if (mqttClient && mqttClient.connected) {
            disconnectFromBroker();
        }
    });
    
    // Connect button
    btnConnect.addEventListener('click', connectToBroker);
    
    // Disconnect button
    btnDisconnect.addEventListener('click', disconnectFromBroker);
    
    // Restart button
    btnRestart.addEventListener('click', function() {
        if (confirm('Are you sure you want to restart the ESP32?')) {
            sendJSONCommand('restart');
            addLog('Restart command sent to ESP32');
            showNotification('Restart command sent. ESP32 will reboot.', 'warning');
        }
    });
    
    // Control button events
    setupControlButtons();
    
    // Speed control
    speedSlider.addEventListener('input', function() {
        speedValue.textContent = this.value;
    });
    
    btnSetSpeed.addEventListener('click', function() {
        const speed = parseInt(speedSlider.value);
        sendJSONCommand('speed', speed);
        addLog(`Speed set to: ${speed}`);
    });
    
    // LED Control Setup
    setupLEDControls();
    
    // Blink speed control
    blinkSpeedSlider.addEventListener('input', function() {
        blinkSpeedValue.textContent = this.value;
    });
    
    btnSetBlinkSpeed.addEventListener('click', function() {
        const interval = parseInt(blinkSpeedSlider.value);
        sendJSONCommand('led_blink_interval', interval);
        ledBlinkInterval = interval;
        addLog(`LED blink interval set to: ${interval}ms`);
    });
    
    // Test buttons
    btnTestConnection.addEventListener('click', testConnection);
    btnTestPattern.addEventListener('click', testLEDPattern);
    
    // Update MQTT info display
    updateMqttInfo();
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
});

// ============================================
// MQTT FUNCTIONS
// ============================================
function connectToBroker() {
    if (mqttClient && mqttClient.connected) {
        showNotification('Already connected to broker!', 'info');
        addLog('Connection attempt: Already connected');
        return;
    }
    
    showNotification('Connecting to HiveMQ Cloud...', 'info');
    addLog(`Connecting to broker: ${mqttBroker}`);
    updateConnectionStatus('connecting', 'Connecting...');
    
    // Generate unique client ID
    const clientId = 'web-client-' + Math.random().toString(36).substr(2, 9);
    
    // MQTT connection options
    const options = {
        clientId: clientId,
        clean: true,
        reconnectPeriod: 4000,
        connectTimeout: 8000,
        keepalive: 60,
        // Note: Add username/password if required by your HiveMQ Cloud
        // username: 'esp32autonomous',
        // password: 'Test@2025'
    };
    
    try {
        console.log(`🔗 Connecting to: ${mqttBroker}`);
        mqttClient = mqtt.connect(mqttBroker, options);
        
        // ===== MQTT EVENT HANDLERS =====
        
        // On successful connection
        mqttClient.on('connect', () => {
            console.log('✅ Connected to MQTT broker');
            showNotification('Connected to HiveMQ Cloud!', 'success');
            addLog('Connected to MQTT broker');
            updateConnectionStatus('connected', 'Connected to Broker');
            
            // Subscribe to rover topics
            const statusTopic = `rover/status/${roverId}`;
            const ledTopic = `rover/led/${roverId}`;
            
            mqttClient.subscribe(statusTopic, { qos: 0 }, (err) => {
                if (!err) {
                    console.log(`👂 Subscribed to: ${statusTopic}`);
                    addLog(`Subscribed to status: ${statusTopic}`);
                }
            });
            
            mqttClient.subscribe(ledTopic, { qos: 0 }, (err) => {
                if (!err) {
                    console.log(`👂 Subscribed to: ${ledTopic}`);
                    addLog(`Subscribed to LED: ${ledTopic}`);
                }
            });
            
            // Request initial status
            setTimeout(() => {
                sendJSONCommand('status');
                addLog('Requested initial status from rover');
            }, 500);
            
            updateMqttInfo();
            updateButtonStates(true);
            brokerStatus.textContent = 'Connected';
            brokerStatus.style.color = '#28a745';
        });
        
        // When a message is received
        mqttClient.on('message', (topic, message) => {
            const payload = message.toString();
            console.log(`📨 Received on ${topic}: ${payload}`);
            
            try {
                const data = JSON.parse(payload);
                
                if (topic === `rover/status/${roverId}`) {
                    // Update rover telemetry
                    updateStatusDisplay(data);
                    
                    // Update timestamp
                    lastStatusTime = new Date();
                    lastUpdate.textContent = `Last update: ${lastStatusTime.toLocaleTimeString()}`;
                    
                } else if (topic === `rover/led/${roverId}`) {
                    // Update LED status
                    updateLEDStatusDisplay(data);
                }
                
            } catch (e) {
                // If not JSON, display raw message
                console.log('📝 Raw message:', payload);
                if (topic === `rover/status/${roverId}`) {
                    roverMovement.textContent = payload;
                }
            }
        });
        
        // On error
        mqttClient.on('error', (error) => {
            console.error('❌ MQTT Error:', error);
            showNotification(`Connection error: ${error.message}`, 'error');
            addLog(`MQTT error: ${error.message}`);
            updateConnectionStatus('disconnected', 'Connection Error');
        });
        
        // When going offline
        mqttClient.on('offline', () => {
            console.log('🔌 Disconnected from broker');
            showNotification('Disconnected from MQTT broker', 'warning');
            addLog('Disconnected from broker');
            updateConnectionStatus('disconnected', 'Disconnected');
            updateButtonStates(false);
            brokerStatus.textContent = 'Disconnected';
            brokerStatus.style.color = '#dc3545';
            
            // Reset LED display
            updateLEDVisual(false, false);
        });
        
        // On reconnect
        mqttClient.on('reconnect', () => {
            console.log('🔄 Attempting to reconnect...');
            updateConnectionStatus('connecting', 'Reconnecting...');
            addLog('Attempting to reconnect to broker');
        });
        
    } catch (error) {
        console.error('❌ Failed to connect:', error);
        showNotification(`Failed to connect: ${error.message}`, 'error');
        addLog(`Connection failed: ${error.message}`);
        updateConnectionStatus('disconnected', 'Failed to connect');
    }
}

function disconnectFromBroker() {
    if (mqttClient) {
        console.log('🔌 Disconnecting from broker...');
        mqttClient.end();
        mqttClient = null;
    }
    
    updateConnectionStatus('disconnected', 'Disconnected');
    updateButtonStates(false);
    resetStatusDisplay();
    showNotification('Disconnected from rover', 'info');
    addLog('Disconnected from broker');
    brokerStatus.textContent = 'Disconnected';
    brokerStatus.style.color = '#dc3545';
    
    // Reset LED display
    updateLEDVisual(false, false);
}

function sendCommand(command) {
    if (!mqttClient || !mqttClient.connected) {
        showNotification('Not connected to rover. Please connect first.', 'error');
        addLog(`Command failed (not connected): ${command}`);
        return;
    }
    
    const commandTopic = `rover/commands/${roverId}`;
    
    mqttClient.publish(commandTopic, command, { qos: 0, retain: false }, (error) => {
        if (error) {
            console.error('❌ Failed to send command:', error);
            showNotification('Failed to send command', 'error');
            addLog(`Command failed: ${command} - ${error.message}`);
        } else {
            console.log(`✅ Command sent: ${command}`);
            addLog(`Command sent: ${command}`);
        }
    });
}

function sendJSONCommand(command, value = null) {
    if (!mqttClient || !mqttClient.connected) {
        showNotification('Not connected to rover. Please connect first.', 'error');
        return;
    }
    
    const commandTopic = `rover/commands/${roverId}`;
    const payload = {
        command: command,
        timestamp: Date.now()
    };
    
    if (value !== null) {
        payload.value = value;
    }
    
    const jsonPayload = JSON.stringify(payload);
    
    mqttClient.publish(commandTopic, jsonPayload, { qos: 0, retain: false }, (error) => {
        if (error) {
            console.error('❌ Failed to send JSON command:', error);
            showNotification('Failed to send command', 'error');
            addLog(`Command failed: ${command} - ${error.message}`);
        } else {
            console.log(`✅ JSON command sent: ${jsonPayload}`);
            addLog(`JSON command sent: ${command}`);
        }
    });
}

// ============================================
// UI UPDATE FUNCTIONS
// ============================================
function updateConnectionStatus(status, text) {
    connectionStatus.className = 'connection-status ' + status;
    statusText.textContent = text;
    
    // Update status dot color
    const statusDot = document.querySelector('.status-dot');
    if (statusDot) {
        const colors = {
            'connected': '#28a745',
            'connecting': '#ffc107',
            'disconnected': '#dc3545'
        };
        statusDot.style.background = colors[status] || '#dc3545';
    }
}

function updateButtonStates(connected) {
    btnConnect.disabled = connected;
    btnDisconnect.disabled = !connected;
    btnRestart.disabled = !connected;
    
    // Enable/disable control buttons
    const controlButtons = [
        btnForward, btnBackward, btnLeft, btnRight, btnStop, 
        btnAutoStop, btnGetStatus, btnSetSpeed, btnLedOn, 
        btnLedOff, btnLedToggle, btnLedBlink, btnLedBlinkStop,
        btnSetBlinkSpeed, btnTestConnection, btnTestPattern
    ];
    
    controlButtons.forEach(btn => {
        if (btn) btn.disabled = !connected;
    });
    
    // Update sliders
    speedSlider.disabled = !connected;
    blinkSpeedSlider.disabled = !connected;
}

function updateStatusDisplay(data) {
    // Update WiFi strength
    if (data.wifi_rssi) {
        wifiStrength.textContent = data.wifi_rssi;
        
        // Color code based on signal strength
        const rssi = parseInt(data.wifi_rssi);
        if (rssi > -50) wifiStrength.style.color = '#28a745';
        else if (rssi > -70) wifiStrength.style.color = '#ffc107';
        else wifiStrength.style.color = '#dc3545';
    }
    
    // Update IP address
    if (data.ip) {
        roverIP.textContent = data.ip;
        roverIP.style.color = '#40e0d0';
    }
    
    // Update uptime
    if (data.uptime) {
        roverUptime.textContent = data.uptime;
        roverUptime.style.color = '#ff8c00';
    }
    
    // Update movement
    if (data.movement) {
        roverMovement.textContent = data.movement.charAt(0).toUpperCase() + data.movement.slice(1);
        
        // Color code movement
        const movement = data.movement.toLowerCase();
        const colors = {
            'forward': '#28a745',
            'backward': '#dc3545',
            'left': '#17a2b8',
            'right': '#17a2b8',
            'stopped': '#6c757d'
        };
        roverMovement.style.color = colors[movement] || '#6c757d';
    }
    
    // Update speed
    if (data.speed !== undefined) {
        roverSpeed.textContent = data.speed;
        roverSpeed.style.color = '#ff8c00';
        
        // Update slider if different
        if (parseInt(speedSlider.value) !== data.speed) {
            speedSlider.value = data.speed;
            speedValue.textContent = data.speed;
        }
    }
    
    // Update broker status
    if (data.broker) {
        brokerStatus.textContent = data.broker.charAt(0).toUpperCase() + data.broker.slice(1);
        brokerStatus.style.color = data.broker === 'connected' ? '#28a745' : '#dc3545';
    }
}

function updateLEDStatusDisplay(data) {
    // Update LED state
    if (data.led_state) {
        ledState = data.led_state === 'on';
        ledStateDisplay.textContent = data.led_state.toUpperCase();
        ledStateDisplay.style.color = ledState ? '#28a745' : '#dc3545';
        ledStatusText.textContent = data.led_state.toUpperCase();
    }
    
    // Update LED blinking
    if (data.led_blinking) {
        ledBlinking = data.led_blinking === 'yes';
        ledBlinkingDisplay.textContent = data.led_blinking.toUpperCase();
        ledBlinkingDisplay.style.color = ledBlinking ? '#ff9800' : '#6c757d';
        ledBlinkStatus.textContent = data.led_blinking === 'yes' ? 'Yes' : 'No';
    }
    
    // Update blink interval
    if (data.blink_interval) {
        ledBlinkInterval = data.blink_interval;
        if (parseInt(blinkSpeedSlider.value) !== ledBlinkInterval) {
            blinkSpeedSlider.value = ledBlinkInterval;
            blinkSpeedValue.textContent = ledBlinkInterval;
        }
    }
    
    // Update visual LED indicator
    updateLEDVisual(ledState, ledBlinking);
}

function updateLEDVisual(state, blinking) {
    // Reset classes
    ledIndicator.classList.remove('on', 'blinking');
    
    if (blinking) {
        ledIndicator.classList.add('blinking');
        ledIndicator.style.animationDuration = `${ledBlinkInterval}ms`;
    } else if (state) {
        ledIndicator.classList.add('on');
    }
    
    // Update colors
    if (state || blinking) {
        ledIndicator.style.backgroundColor = '#ffeb3b';
        ledIndicator.style.background = 'radial-gradient(circle, #ffeb3b, #ff9800)';
    } else {
        ledIndicator.style.backgroundColor = '#333';
        ledIndicator.style.background = 'radial-gradient(circle, #333, #000)';
    }
}

function resetStatusDisplay() {
    wifiStrength.textContent = '--';
    wifiStrength.style.color = '#aaa';
    roverIP.textContent = '--';
    roverIP.style.color = '#aaa';
    roverUptime.textContent = '--';
    roverUptime.style.color = '#aaa';
    roverMovement.textContent = 'Stopped';
    roverMovement.style.color = '#6c757d';
    roverSpeed.textContent = '--';
    roverSpeed.style.color = '#aaa';
    ledStateDisplay.textContent = '--';
    ledStateDisplay.style.color = '#aaa';
    ledBlinkingDisplay.textContent = '--';
    ledBlinkingDisplay.style.color = '#aaa';
    brokerStatus.textContent = 'Disconnected';
    brokerStatus.style.color = '#dc3545';
    lastUpdate.textContent = 'Last update: --';
    
    // Reset LED display
    ledStatusText.textContent = 'Unknown';
    ledBlinkStatus.textContent = 'No';
    updateLEDVisual(false, false);
}

function updateMqttInfo() {
    mqttInfo.innerHTML = `
        <i class="fas fa-cloud"></i> Broker: ${mqttBroker.split('/')[2]} | 
        <i class="fas fa-robot"></i> Rover ID: ${roverId}
    `;
}

// ============================================
// CONTROL BUTTONS SETUP
// ============================================
function setupControlButtons() {
    // Setup each control button
    const controlButtons = [
        { button: btnForward, command: 'forward', key: 'ArrowUp' },
        { button: btnBackward, command: 'backward', key: 'ArrowDown' },
        { button: btnLeft, command: 'left', key: 'ArrowLeft' },
        { button: btnRight, command: 'right', key: 'ArrowRight' },
        { button: btnStop, command: 'stop', key: ' ' },
        { button: btnAutoStop, command: 'stop' },
        { button: btnGetStatus, command: 'status', key: 'r' }
    ];
    
    controlButtons.forEach(item => {
        if (item.button) {
            // Click event
            item.button.addEventListener('click', () => {
                if (!item.button.disabled) {
                    sendJSONCommand(item.command);
                    
                    // Visual feedback for movement buttons
                    if (['forward', 'backward', 'left', 'right', 'stop'].includes(item.command)) {
                        item.button.classList.add('active');
                        setTimeout(() => item.button.classList.remove('active'), 200);
                    }
                }
            });
            
            // Touch event for mobile
            item.button.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (!item.button.disabled) {
                    sendJSONCommand(item.command);
                }
            });
        }
    });
}

// ============================================
// LED CONTROL FUNCTIONS
// ============================================
function setupLEDControls() {
    // LED On
    btnLedOn.addEventListener('click', () => {
        sendJSONCommand('led_on');
        addLog('LED turned ON');
    });
    
    // LED Off
    btnLedOff.addEventListener('click', () => {
        sendJSONCommand('led_off');
        addLog('LED turned OFF');
    });
    
    // LED Toggle
    btnLedToggle.addEventListener('click', () => {
        sendJSONCommand('led_toggle');
        addLog('LED toggled');
    });
    
    // LED Blink Start
    btnLedBlink.addEventListener('click', () => {
        sendJSONCommand('led_blink');
        addLog('LED blinking started');
    });
    
    // LED Blink Stop
    btnLedBlinkStop.addEventListener('click', () => {
        sendJSONCommand('led_blink_stop');
        addLog('LED blinking stopped');
    });
}

function testConnection() {
    if (!mqttClient || !mqttClient.connected) {
        showNotification('Please connect first', 'error');
        return;
    }
    
    addLog('Starting connection test...');
    showNotification('Running connection test...', 'info');
    
    // Test sequence: ON -> OFF -> Blink -> OFF
    const testSequence = [
        { command: 'led_on', delay: 500 },
        { command: 'led_off', delay: 500 },
        { command: 'led_on', delay: 500 },
        { command: 'led_off', delay: 500 },
        { command: 'led_blink', delay: 1000 },
        { command: 'led_blink_stop', delay: 500 },
        { command: 'status', delay: 0 }
    ];
    
    let delay = 0;
    testSequence.forEach((step, index) => {
        setTimeout(() => {
            sendJSONCommand(step.command);
            addLog(`Test step ${index + 1}: ${step.command}`);
        }, delay);
        delay += step.delay;
    });
    
    setTimeout(() => {
        showNotification('Connection test completed successfully!', 'success');
        addLog('Connection test completed');
    }, delay);
}

function testLEDPattern() {
    if (!mqttClient || !mqttClient.connected) {
        showNotification('Please connect first', 'error');
        return;
    }
    
    addLog('Starting LED pattern test...');
    showNotification('Running LED pattern test...', 'info');
    
    // Create a fun light pattern
    const patterns = [
        { command: 'led_on', delay: 200 },
        { command: 'led_off', delay: 200 },
        { command: 'led_on', delay: 100 },
        { command: 'led_off', delay: 100 },
        { command: 'led_on', delay: 100 },
        { command: 'led_off', delay: 100 },
        { command: 'led_blink', delay: 300 },
        { command: 'led_blink_stop', delay: 500 },
        { command: 'led_on', delay: 1000 },
        { command: 'led_off', delay: 0 }
    ];
    
    let delay = 0;
    patterns.forEach((pattern, index) => {
        setTimeout(() => {
            sendJSONCommand(pattern.command);
            addLog(`Pattern step ${index + 1}: ${pattern.command}`);
        }, delay);
        delay += pattern.delay;
    });
    
    setTimeout(() => {
        showNotification('LED pattern test completed!', 'success');
        addLog('LED pattern test completed');
    }, delay);
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Only handle if not typing in an input
        if (e.target.tagName === 'INPUT') return;
        
        const keyMap = {
            'ArrowUp': 'forward',
            'ArrowDown': 'backward',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
            ' ': 'stop',  // Spacebar
            's': 'stop',
            'r': 'status',  // Refresh status
            'l': 'led_toggle',  // Toggle LED
            '1': 'led_on',  // LED On
            '0': 'led_off'  // LED Off
        };
        
        const command = keyMap[e.key];
        if (command) {
            e.preventDefault();
            sendJSONCommand(command);
            
            // Highlight the corresponding button
            const buttonMap = {
                'forward': btnForward,
                'backward': btnBackward,
                'left': btnLeft,
                'right': btnRight,
                'stop': btnStop,
                'led_toggle': btnLedToggle,
                'led_on': btnLedOn,
                'led_off': btnLedOff
            };
            
            if (buttonMap[command]) {
                const btn = buttonMap[command];
                btn.classList.add('key-press');
                setTimeout(() => btn.classList.remove('key-press'), 200);
            }
        }
        
        // Ctrl/Cmd + C to connect
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            e.preventDefault();
            if (!mqttClient || !mqttClient.connected) {
                connectToBroker();
            }
        }
        
        // Ctrl/Cmd + D to disconnect
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            if (mqttClient && mqttClient.connected) {
                disconnectFromBroker();
            }
        }
        
        // Ctrl/Cmd + R to restart
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            if (mqttClient && mqttClient.connected) {
                sendJSONCommand('restart');
            }
        }
    });
}

// ============================================
// NOTIFICATION SYSTEM
// ============================================
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    // Icons for different notification types
    const icons = {
        'success': 'fa-check-circle',
        'error': 'fa-exclamation-circle',
        'warning': 'fa-exclamation-triangle',
        'info': 'fa-info-circle'
    };
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${icons[type] || 'fa-info-circle'}"></i>
        <span>${message}</span>
        <button class="notification-close">&times;</button>
    `;
    
    document.body.appendChild(notification);
    
    // Add close button event
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.remove();
    });
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }
    }, 4000);
}

// ============================================
// LOGGING SYSTEM
// ============================================
function addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    connectionLog.appendChild(logEntry);
    
    // Scroll to bottom
    connectionLog.scrollTop = connectionLog.scrollHeight;
    
    // Keep only last 20 entries
    const entries = connectionLog.querySelectorAll('.log-entry');
    if (entries.length > 20) {
        entries[0].remove();
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
        return `${hrs}h ${mins}m ${secs}s`;
    } else if (mins > 0) {
        return `${mins}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

// Add CSS for notifications
const notificationCSS = `
    .notification {
        position: fixed;
        top: 25px;
        right: 25px;
        background: rgba(30, 30, 46, 0.95);
        backdrop-filter: blur(15px);
        border: 1px solid rgba(64, 224, 208, 0.3);
        border-radius: 12px;
        padding: 18px 22px;
        display: flex;
        align-items: center;
        gap: 15px;
        transform: translateX(150%) scale(0.9);
        transition: transform 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55);
        z-index: 9999;
        max-width: 350px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        opacity: 0;
    }
    
    .notification.show {
        transform: translateX(0) scale(1);
        opacity: 1;
    }
    
    .notification.success {
        border-left: 5px solid #28a745;
        background: rgba(40, 167, 69, 0.1);
    }
    
    .notification.error {
        border-left: 5px solid #dc3545;
        background: rgba(220, 53, 69, 0.1);
    }
    
    .notification.warning {
        border-left: 5px solid #ffc107;
        background: rgba(255, 193, 7, 0.1);
    }
    
    .notification.info {
        border-left: 5px solid #17a2b8;
        background: rgba(23, 162, 184, 0.1);
    }
    
    .notification i {
        font-size: 1.5rem;
        flex-shrink: 0;
    }
    
    .notification.success i { color: #28a745; }
    .notification.error i { color: #dc3545; }
    .notification.warning i { color: #ffc107; }
    .notification.info i { color: #17a2b8; }
    
    .notification span {
        font-size: 0.95rem;
        flex-grow: 1;
        color: #f8f9fa;
    }
    
    .notification-close {
        background: none;
        border: none;
        color: #aaa;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.2s ease;
        flex-shrink: 0;
    }
    
    .notification-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }
    
    /* Button press animation */
    .control-btn.active {
        transform: scale(0.92) !important;
        filter: brightness(1.2) !important;
    }
    
    .control-btn.key-press {
        box-shadow: 0 0 25px rgba(64, 224, 208, 0.8) !important;
    }
    
    /* LED animations */
    @keyframes ledGlow {
        0%, 100% { box-shadow: 0 0 30px rgba(255, 215, 0, 0.8), 0 0 50px rgba(255, 152, 0, 0.6); }
        50% { box-shadow: 0 0 40px rgba(255, 215, 0, 1), 0 0 70px rgba(255, 152, 0, 0.8); }
    }
    
    @keyframes ledBlink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
    }
`;

// Inject notification CSS
const style = document.createElement('style');
style.textContent = notificationCSS;
document.head.appendChild(style);

// Initialize when page loads
console.log('🚀 Rover Control Panel v2.0 ready with LED control!');