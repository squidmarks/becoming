// RS11 Configuration Utility - Frontend

let ws = null;
let connected = false;
let liveUpdateInterval = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeWebSocket();
  loadPortList();
  setupEventListeners();
  
  log('Application started', 'info');
});

// WebSocket connection for real-time updates
function initializeWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    log('WebSocket connected', 'success');
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };
  
  ws.onerror = (error) => {
    log('WebSocket error', 'error');
  };
  
  ws.onclose = () => {
    log('WebSocket disconnected, reconnecting...', 'warning');
    setTimeout(initializeWebSocket, 3000);
  };
}

function handleWebSocketMessage(data) {
  if (data.type === 'connection') {
    if (data.status === 'connected') {
      setConnectionStatus(true, data.port);
    } else if (data.status === 'disconnected') {
      setConnectionStatus(false);
    }
  }
}

// Set up event listeners
function setupEventListeners() {
  document.getElementById('refresh-ports-btn').addEventListener('click', loadPortList);
  document.getElementById('connect-btn').addEventListener('click', connectToDevice);
  document.getElementById('disconnect-btn').addEventListener('click', disconnectFromDevice);
  
  document.getElementById('apply-engine-btn').addEventListener('click', applyEngineConfig);
  document.getElementById('save-all-channels-btn').addEventListener('click', applyAllAnalogs);
  document.getElementById('query-btn').addEventListener('click', queryConfiguration);
  document.getElementById('stop-btn').addEventListener('click', stopDevice);
  document.getElementById('restart-btn').addEventListener('click', restartDevice);
  document.getElementById('reset-btn').addEventListener('click', factoryReset);
  document.getElementById('save-config-btn').addEventListener('click', saveConfiguration);
  document.getElementById('load-config-btn').addEventListener('click', loadConfiguration);
  document.getElementById('clear-log-btn').addEventListener('click', clearLog);
  
  // Load saved configs list on startup
  loadSavedConfigsList();
}

// Load available serial ports
async function loadPortList() {
  try {
    log('Scanning for serial ports...', 'info');
    const response = await fetch('/api/ports');
    const data = await response.json();
    
    const select = document.getElementById('port-select');
    select.innerHTML = '<option value="">Select COM Port</option>';
    
    if (data.ports.length === 0) {
      log('No serial ports found', 'warning');
      select.innerHTML += '<option value="" disabled>No ports found</option>';
    } else {
      data.ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.path;
        option.textContent = `${port.path}${port.manufacturer ? ' - ' + port.manufacturer : ''}`;
        select.appendChild(option);
      });
      log(`Found ${data.ports.length} serial port(s)`, 'success');
    }
  } catch (error) {
    log(`Error loading ports: ${error.message}`, 'error');
  }
}

// Connect to device
async function connectToDevice() {
  const port = document.getElementById('port-select').value;
  
  if (!port) {
    log('Please select a port', 'warning');
    return;
  }
  
  try {
    log(`Connecting to ${port}...`, 'info');
    
    const response = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port, baudRate: 4800 })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      log(data.message, 'success');
      setConnectionStatus(true, port);
      startLiveUpdates();
      
      // Auto-query configuration after successful connection
      setTimeout(() => {
        queryConfiguration();
      }, 1000);
    } else {
      log(`Connection failed: ${data.error}`, 'error');
    }
  } catch (error) {
    log(`Connection error: ${error.message}`, 'error');
  }
}

// Disconnect from device
async function disconnectFromDevice() {
  try {
    log('Disconnecting...', 'info');
    
    const response = await fetch('/api/disconnect', { method: 'POST' });
    const data = await response.json();
    
    if (response.ok) {
      log('Disconnected', 'success');
      setConnectionStatus(false);
      stopLiveUpdates();
    } else {
      log(`Disconnect failed: ${data.error}`, 'error');
    }
  } catch (error) {
    log(`Disconnect error: ${error.message}`, 'error');
  }
}

// Set connection status UI
function setConnectionStatus(isConnected, port = '') {
  connected = isConnected;
  
  const indicator = document.getElementById('connection-indicator');
  const text = document.getElementById('connection-text');
  const connectBtn = document.getElementById('connect-btn');
  const disconnectBtn = document.getElementById('disconnect-btn');
  
  if (isConnected) {
    indicator.className = 'indicator connected';
    text.textContent = `Connected to ${port}`;
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
  } else {
    indicator.className = 'indicator disconnected';
    text.textContent = 'Disconnected';
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  }
}

// Start live value updates
function startLiveUpdates() {
  if (liveUpdateInterval) return;
  
  // Show live data card
  const liveCard = document.getElementById('live-data-card');
  if (liveCard) {
    liveCard.style.display = 'block';
  }
  
  liveUpdateInterval = setInterval(async () => {
    try {
      const response = await fetch('/api/live');
      const data = await response.json();
      
      // Skip if data was skipped due to command lock
      if (data.skipped) return;
      
      // Update live analog voltage displays
      if (data.analogs && data.analogs.length > 0) {
        data.analogs.forEach(analog => {
          const voltage = analog.value.toFixed(2);
          
          // Update live panel
          const liveEl = document.getElementById(`live-a${analog.port}`);
          if (liveEl) {
            liveEl.textContent = voltage;
          }
          
          // Update gauge volts in channel card
          const gaugeEl = document.getElementById(`a${analog.port}-value`);
          if (gaugeEl) {
            gaugeEl.textContent = `${voltage} V`;
          }
        });
        
        // Trigger ping animation
        const pingEl = document.getElementById('live-ping');
        if (pingEl) {
          pingEl.classList.remove('pulse');
          void pingEl.offsetWidth; // Force reflow
          pingEl.classList.add('pulse');
        }
      }
    } catch (error) {
      // Silently fail - don't spam the log
    }
  }, 2000); // Update every 2 seconds
}

// Stop live updates
function stopLiveUpdates() {
  if (liveUpdateInterval) {
    clearInterval(liveUpdateInterval);
    liveUpdateInterval = null;
  }
  
  // Hide live data card
  const liveCard = document.getElementById('live-data-card');
  if (liveCard) {
    liveCard.style.display = 'none';
  }
}

// Apply engine configuration
async function applyEngineConfig() {
  if (!connected) {
    log('Not connected to device', 'warning');
    return;
  }
  
  // Pause live updates to avoid command interference
  stopLiveUpdates();
  
  // Wait a moment for live updates to fully stop
  await new Promise(resolve => setTimeout(resolve, 500));
  
  try {
    const instance = parseInt(document.getElementById('instance').value);
    const stbdInstance = parseInt(document.getElementById('stbd-instance').value);
    const multiBatt = parseInt(document.getElementById('multi-batt').value);
    const portPPR = parseInt(document.getElementById('port-ppr').value);
    const stbdPPR = parseInt(document.getElementById('stbd-ppr').value);
    const portPPL = parseInt(document.getElementById('port-ppl').value);
    const stbdPPL = parseInt(document.getElementById('stbd-ppl').value);
    const portHours = parseInt(document.getElementById('port-hours').value);
    const stbdHours = parseInt(document.getElementById('stbd-hours').value);
    
    log('Applying engine configuration...', 'info');
    console.log('[FRONTEND] Engine config values:', { instance, multiBatt, portPPR, stbdPPR, portPPL, stbdPPL, portHours, stbdHours });
    
    // Send all engine config in a single batched request (one stop/restart cycle)
    const response = await fetch('/api/config/engine-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        instance,
        stbdInstance,
        multiBatt, 
        portPPR, 
        stbdPPR, 
        portPPL, 
        stbdPPL,
        portHours,
        stbdHours
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      log(`Engine Config Failed: ${error.error}`, 'error');
      showToast('Engine Config Failed', 'error', error.error);
      return;
    }
    
    log('Engine configuration applied', 'success');
    showToast('Engine Configuration Saved', 'success', 'All settings applied and saved to NVRAM');
  } catch (error) {
    log(`Error applying config: ${error.message}`, 'error');
    showToast('Configuration Failed', 'error', error.message);
  } finally {
    // Resume live updates
    startLiveUpdates();
  }
}

// Apply analog input configuration
async function applyAnalog(port) {
  if (!connected) {
    log('Not connected to device', 'warning');
    return;
  }
  
  // Pause live updates to avoid command interference
  stopLiveUpdates();
  
  // Wait a moment for live updates to fully stop
  await new Promise(resolve => setTimeout(resolve, 500));
  
  try {
    const engine = document.querySelector(`input[name="a${port}-engine"]:checked`).value;
    const field = parseInt(document.getElementById(`a${port}-field`).value);
    
    let senderCurrent, smoothing;
    if (port <= 4) {
      senderCurrent = document.getElementById(`a${port}-current`).checked;
      smoothing = document.getElementById(`a${port}-smooth`).checked;
    }
    
    log(`Configuring A${port}...`, 'info');
    
    const response = await fetch(`/api/config/analog/${port}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine,
        field,
        senderCurrent,
        smoothing
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      log(`A${port} configured`, 'success');
      showToast(`A${port} Configured`, 'success');
    } else {
      log(`A${port} config failed: ${data.error}`, 'error');
      showToast(`A${port} Failed`, 'error', data.error);
    }
  } catch (error) {
    log(`Error configuring A${port}: ${error.message}`, 'error');
  } finally {
    // Resume live updates
    startLiveUpdates();
  }
}

// Apply all analog input configurations
async function applyAllAnalogs() {
  if (!connected) {
    log('Not connected to device', 'warning');
    return;
  }
  
  log('Configuring all analog channels...', 'info');
  
  for (let port = 1; port <= 6; port++) {
    await applyAnalog(port);
  }
  
  log('All analog channels configured', 'success');
  showToast('All Channels Configured', 'success', '6 analog inputs saved');
}

// Query configuration
async function queryConfiguration() {
  if (!connected) {
    log('Not connected to device', 'warning');
    return;
  }
  
  try {
    log('Querying device configuration...', 'info');
    
    const response = await fetch('/api/config');
    const data = await response.json();
    
    if (response.ok) {
      log('Configuration received:', 'success');
      log(JSON.stringify(data, null, 2), 'info');
      
      // Update engine config fields
      if (data.instance !== null) {
        document.getElementById('instance').value = data.instance;
      }
      if (data.portPPR !== null) {
        document.getElementById('port-ppr').value = data.portPPR;
      }
      if (data.stbdPPR !== null) {
        document.getElementById('stbd-ppr').value = data.stbdPPR;
      }
      if (data.portPPL !== null) {
        document.getElementById('port-ppl').value = data.portPPL;
      }
      if (data.stbdPPL !== null) {
        document.getElementById('stbd-ppl').value = data.stbdPPL;
      }
      
      // Update analog channel fields
      if (data.analogs && data.analogs.length > 0) {
        data.analogs.forEach(analog => {
          // Update Port/Stbd radio buttons
          const portRadio = document.querySelector(`input[name="a${analog.port}-engine"][value="P"]`);
          const stbdRadio = document.querySelector(`input[name="a${analog.port}-engine"][value="S"]`);
          if (analog.engine === 'P' && portRadio) {
            portRadio.checked = true;
          } else if (analog.engine === 'S' && stbdRadio) {
            stbdRadio.checked = true;
          }
          
          // Update field dropdown
          const fieldSelect = document.getElementById(`a${analog.port}-field`);
          if (fieldSelect && analog.fieldName !== '<Off>') {
            // Map device truncated names to option values
            // Device: "Oil Pres" / "Oil Temp" / "Cool Temp" / "Trans Pres" (note: truncated "Pres")
            // Options: "Trans Oil Press" (0), "Oil Press" (1), "Oil Temp" (2), "Cool Temp" (3), 
            //          "Cool Press" (4), "Fuel Press" (5), "Fuel Level" (6), "Trans Press" (7)
            
            const normalized = analog.fieldName.replace(/Pres$/, 'Press'); // Fix truncation
            
            // Try exact match first, then prefix match
            let matchedOption = Array.from(fieldSelect.options).find(opt => 
              opt.textContent.trim() === normalized
            );
            
            if (!matchedOption) {
              // Try matching by starting words (avoid "Trans Oil Press" matching "Oil Press")
              matchedOption = Array.from(fieldSelect.options).find(opt => {
                const optText = opt.textContent.trim();
                const normalizedWords = normalized.split(' ');
                const optWords = optText.split(' ');
                
                // Must match all words in device name, in order
                return normalizedWords.every((word, i) => optWords[i] === word);
              });
            }
            
            if (matchedOption) {
              fieldSelect.value = matchedOption.value;
            }
          }
          
          // Update sender current checkbox
          const currentCheckbox = document.getElementById(`a${analog.port}-current`);
          if (currentCheckbox && analog.senderCurrent !== null && analog.port <= 4) {
            currentCheckbox.checked = analog.senderCurrent;
          }
        });
      }
    } else {
      log(`Query failed: ${data.error}`, 'error');
    }
  } catch (error) {
    log(`Query error: ${error.message}`, 'error');
  }
}

// Stop device
async function stopDevice() {
  if (!connected) {
    log('Not connected to device', 'warning');
    return;
  }
  
  if (!confirm('Stop the device? This will halt all operations.')) {
    return;
  }
  
  try {
    log('Stopping device...', 'info');
    
    const response = await fetch('/api/device/stop', { method: 'POST' });
    const data = await response.json();
    
    if (response.ok) {
      log('Device stopped', 'success');
      showToast('Device Stopped', 'success');
    } else {
      log(`Stop failed: ${data.error}`, 'error');
      showToast('Stop Failed', 'error', data.error);
    }
  } catch (error) {
    log(`Stop error: ${error.message}`, 'error');
  }
}

// Restart device
async function restartDevice() {
  if (!connected) {
    log('Not connected to device', 'warning');
    return;
  }
  
  if (!confirm('Restart the device?')) {
    return;
  }
  
  try {
    log('Restarting device...', 'info');
    
    const response = await fetch('/api/device/restart', { method: 'POST' });
    const data = await response.json();
    
    if (response.ok) {
      log('Device restarted', 'success');
      showToast('Device Restarted', 'success', 'Configuration saved to NVRAM');
    } else {
      log(`Restart failed: ${data.error}`, 'error');
      showToast('Restart Failed', 'error', data.error);
    }
  } catch (error) {
    log(`Restart error: ${error.message}`, 'error');
  }
}

// Factory reset
async function factoryReset() {
  if (!connected) {
    log('Not connected to device', 'warning');
    return;
  }
  
  if (!confirm('⚠️ FACTORY RESET will erase all configuration! Are you sure?')) {
    return;
  }
  
  if (!confirm('This action cannot be undone. Continue?')) {
    return;
  }
  
  try {
    log('⚠️ Performing factory reset...', 'warning');
    
    const response = await fetch('/api/device/reset', { method: 'POST' });
    const data = await response.json();
    
    if (response.ok) {
      log('✓ Factory reset complete', 'success');
    } else {
      log(`Reset failed: ${data.error}`, 'error');
    }
  } catch (error) {
    log(`Reset error: ${error.message}`, 'error');
  }
}

// Load list of saved configurations
async function loadSavedConfigsList() {
  try {
    const response = await fetch('/api/config/saved');
    const configs = await response.json();
    
    const select = document.getElementById('saved-configs-select');
    select.innerHTML = '<option value="">-- Select Config --</option>';
    
    for (const name in configs) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    }
  } catch (error) {
    console.error('Failed to load saved configs:', error);
  }
}

// Save configuration
async function saveConfiguration() {
  const name = prompt('Enter a name for this configuration:');
  
  if (!name) return;
  
  try {
    // Gather current configuration from UI
    const config = {
      instance: parseInt(document.getElementById('instance').value),
      stbdInstance: parseInt(document.getElementById('stbd-instance').value),
      portPPR: parseInt(document.getElementById('port-ppr').value),
      stbdPPR: parseInt(document.getElementById('stbd-ppr').value),
      portPPL: parseInt(document.getElementById('port-ppl').value),
      stbdPPL: parseInt(document.getElementById('stbd-ppl').value),
      portHours: parseInt(document.getElementById('port-hours').value),
      stbdHours: parseInt(document.getElementById('stbd-hours').value),
      analogs: []
    };
    
    // Collect analog configurations
    for (let i = 1; i <= 6; i++) {
      const analogConfig = {
        port: i,
        engine: document.querySelector(`input[name="a${i}-engine"]:checked`).value,
        field: parseInt(document.getElementById(`a${i}-field`).value),
        senderCurrent: i <= 4 ? document.getElementById(`a${i}-current`).checked : false,
        smoothing: i <= 4 ? document.getElementById(`a${i}-smooth`).checked : false
      };
      
      // Save calibration data if present
      const lowVolts = document.getElementById(`a${i}-low-volts`).value;
      const lowValue = document.getElementById(`a${i}-low-value`).value;
      const highVolts = document.getElementById(`a${i}-high-volts`).value;
      const highValue = document.getElementById(`a${i}-high-value`).value;
      
      if (lowVolts) analogConfig.lowVolts = parseFloat(lowVolts);
      if (lowValue) analogConfig.lowValue = parseFloat(lowValue);
      if (highVolts) analogConfig.highVolts = parseFloat(highVolts);
      if (highValue) analogConfig.highValue = parseFloat(highValue);
      
      config.analogs.push(analogConfig);
    }
    
    const response = await fetch('/api/config/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      log(`Configuration "${name}" saved`, 'success');
      showToast(`Configuration "${name}" saved`, 'success');
      await loadSavedConfigsList(); // Refresh the dropdown
    } else {
      log(`Save failed: ${data.error}`, 'error');
      showToast(`Save failed: ${data.error}`, 'error');
    }
  } catch (error) {
    log(`Save error: ${error.message}`, 'error');
    showToast(`Save error: ${error.message}`, 'error');
  }
}

// Load configuration
async function loadConfiguration() {
  const select = document.getElementById('saved-configs-select');
  const name = select.value;
  
  if (!name) {
    showToast('Please select a configuration to load', 'warning');
    return;
  }
  
  try {
    const response = await fetch('/api/config/saved');
    const configs = await response.json();
    const config = configs[name];
    
    if (!config) {
      showToast(`Configuration "${name}" not found`, 'error');
      return;
    }
    
    // Apply configuration to UI
    document.getElementById('instance').value = config.instance || 0;
    document.getElementById('stbd-instance').value = config.stbdInstance || 1;
    document.getElementById('port-ppr').value = config.portPPR || 0;
    document.getElementById('stbd-ppr').value = config.stbdPPR || 0;
    document.getElementById('port-ppl').value = config.portPPL || 99999;
    document.getElementById('stbd-ppl').value = config.stbdPPL || 99999;
    document.getElementById('port-hours').value = config.portHours || 0;
    document.getElementById('stbd-hours').value = config.stbdHours || 0;
    
    // Apply analog configurations
    if (config.analogs) {
      config.analogs.forEach(analog => {
        const port = analog.port;
        
        // Set engine (Port/Stbd)
        const engineRadio = document.querySelector(`input[name="a${port}-engine"][value="${analog.engine}"]`);
        if (engineRadio) engineRadio.checked = true;
        
        // Set field
        document.getElementById(`a${port}-field`).value = analog.field || 0;
        
        // Set sender current and smoothing (only for A1-A4)
        if (port <= 4) {
          document.getElementById(`a${port}-current`).checked = analog.senderCurrent || false;
          document.getElementById(`a${port}-smooth`).checked = analog.smoothing || false;
        }
        
        // Load calibration data if present
        if (analog.lowVolts !== undefined) {
          document.getElementById(`a${port}-low-volts`).value = analog.lowVolts;
        }
        if (analog.lowValue !== undefined) {
          document.getElementById(`a${port}-low-value`).value = analog.lowValue;
        }
        if (analog.highVolts !== undefined) {
          document.getElementById(`a${port}-high-volts`).value = analog.highVolts;
        }
        if (analog.highValue !== undefined) {
          document.getElementById(`a${port}-high-value`).value = analog.highValue;
        }
      });
    }
    
    log(`Configuration "${name}" loaded`, 'success');
    showToast(`Configuration "${name}" loaded into UI. Click "Apply Engine Config" and "Save All Channels" to apply to device.`, 'success');
  } catch (error) {
    log(`Load error: ${error.message}`, 'error');
    showToast(`Load error: ${error.message}`, 'error');
  }
}

// Logging functions
function log(message, type = 'info') {
  const logDiv = document.getElementById('log');
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  
  const timestamp = new Date().toLocaleTimeString();
  entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span>${message}`;
  
  logDiv.appendChild(entry);
  logDiv.scrollTop = logDiv.scrollHeight;
  
  // Keep only last 100 entries
  while (logDiv.children.length > 100) {
    logDiv.removeChild(logDiv.firstChild);
  }
}

function clearLog() {
  document.getElementById('log').innerHTML = '';
  log('Log cleared', 'info');
}

// Calibration function
async function calibrateAnalog(port) {
  if (!connected) {
    log('Not connected to device', 'warning');
    return;
  }
  
  try {
    // Get calibration points
    const lowVolts = parseFloat(document.getElementById(`a${port}-low-volts`).value);
    const lowValue = parseFloat(document.getElementById(`a${port}-low-value`).value);
    const highVolts = parseFloat(document.getElementById(`a${port}-high-volts`).value);
    const highValue = parseFloat(document.getElementById(`a${port}-high-value`).value);
    
    // Get field type to determine units (for PSI/°F to SI conversion)
    const fieldSelect = document.getElementById(`a${port}-field`);
    const fieldText = fieldSelect.options[fieldSelect.selectedIndex]?.text || '';
    
    if (isNaN(lowVolts) || isNaN(lowValue) || isNaN(highVolts) || isNaN(highValue)) {
      log(`A${port}: Please enter all calibration values`, 'warning');
      return;
    }
    
    if (lowVolts >= highVolts) {
      log(`A${port}: Low voltage must be less than high voltage`, 'warning');
      return;
    }
    
    log(`A${port}: Calculating calibration (${fieldText})...`, 'info');
    
    const response = await fetch(`/api/config/analog/${port}/calibrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lowVolts,
        lowValue,
        highVolts,
        highValue,
        fieldType: fieldText
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      log(`A${port}: Calibration applied (X=${data.xValue}, Y=${data.yValue})`, 'success');
    } else {
      log(`A${port}: Calibration failed: ${data.error}`, 'error');
    }
  } catch (error) {
    log(`A${port}: Calibration error: ${error.message}`, 'error');
  }
}

// Show toast notification
function showToast(message, type = 'success', detail = null) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ'
  };
  
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-message">${message}</div>
      ${detail ? `<div class="toast-detail">${detail}</div>` : ''}
    </div>
  `;
  
  container.appendChild(toast);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Make functions available globally
window.applyAnalog = applyAnalog;
window.calibrateAnalog = calibrateAnalog;
