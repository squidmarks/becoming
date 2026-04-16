// App state
let trips = [];
let selectedTags = [];
let currentTrip = null;
let editingTripId = null;

// DOM elements
const tripListEl = document.getElementById('tripList');
const emptyState = document.getElementById('emptyState');
const tripView = document.getElementById('tripView');
const viewMode = document.getElementById('viewMode');
const editMode = document.getElementById('editMode');
const tripForm = document.getElementById('tripForm');
const loadingIndicator = document.getElementById('loadingIndicator');

// Dialog elements
const dialogOverlay = document.getElementById('dialogOverlay');
const dialogTitle = document.getElementById('dialogTitle');
const dialogMessage = document.getElementById('dialogMessage');
const dialogIcon = document.getElementById('dialogIcon');
const dialogConfirm = document.getElementById('dialogConfirm');
const dialogCancel = document.getElementById('dialogCancel');

// Toast container
const toastContainer = document.getElementById('toastContainer');

// Mobile elements
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const menuToggle = document.getElementById('menuToggle');
const newTripBtnMobile = document.getElementById('newTripBtnMobile');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  loadTrips();
  setupEventListeners();
  setupMobileMenu();
});

// Event listeners
function setupEventListeners() {
  document.getElementById('newTripBtn').addEventListener('click', () => showEditMode(null));
  if (newTripBtnMobile) {
    newTripBtnMobile.addEventListener('click', () => showEditMode(null));
  }
  document.getElementById('editBtn').addEventListener('click', () => showEditMode(currentTrip));
  document.getElementById('deleteBtn').addEventListener('click', handleDelete);
  document.getElementById('cancelBtn').addEventListener('click', cancelEdit);
  document.getElementById('saveBtn').addEventListener('click', handleSave);
  
  // Capture conditions buttons
  document.getElementById('captureStartBtn').addEventListener('click', () => captureConditions('start'));
  document.getElementById('captureEndBtn').addEventListener('click', () => captureConditions('end'));
  
  // Tag management
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleTag(btn.dataset.tag, btn));
  });
  document.getElementById('addCustomTagBtn').addEventListener('click', addCustomTag);
  document.getElementById('customTag').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomTag();
    }
  });
  
  // Dialog close on overlay click
  dialogOverlay.addEventListener('click', (e) => {
    if (e.target === dialogOverlay) {
      closeDialog();
    }
  });
}

// Mobile menu setup
function setupMobileMenu() {
  if (!menuToggle) return; // Not on mobile
  
  menuToggle.addEventListener('click', toggleSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);
  
  // Close sidebar when selecting a trip
  tripListEl.addEventListener('click', (e) => {
    if (e.target.closest('.trip-card')) {
      closeSidebar();
    }
  });
}

function toggleSidebar() {
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('active');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
}

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('active');
}

// Dialog functions
function showDialog(options) {
  return new Promise((resolve) => {
    const {
      title = 'Notification',
      message = '',
      type = 'info', // info, success, warning, error
      confirmText = 'OK',
      cancelText = 'Cancel',
      showCancel = false
    } = options;
    
    dialogTitle.textContent = title;
    dialogMessage.textContent = message;
    
    // Set icon
    dialogIcon.className = `dialog-icon ${type}`;
    const icons = {
      info: 'ℹ️',
      success: '✓',
      warning: '⚠️',
      error: '✕'
    };
    dialogIcon.textContent = icons[type] || icons.info;
    
    // Configure buttons
    dialogConfirm.textContent = confirmText;
    dialogCancel.textContent = cancelText;
    dialogCancel.style.display = showCancel ? 'block' : 'none';
    
    // Show dialog
    dialogOverlay.classList.add('active');
    
    // Handle confirm
    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };
    
    // Handle cancel
    const handleCancel = () => {
      cleanup();
      resolve(false);
    };
    
    // Cleanup function
    const cleanup = () => {
      dialogConfirm.removeEventListener('click', handleConfirm);
      dialogCancel.removeEventListener('click', handleCancel);
      dialogOverlay.classList.remove('active');
    };
    
    // Attach listeners
    dialogConfirm.addEventListener('click', handleConfirm);
    dialogCancel.addEventListener('click', handleCancel);
    
    // Focus confirm button
    setTimeout(() => dialogConfirm.focus(), 100);
  });
}

function closeDialog() {
  dialogOverlay.classList.remove('active');
}

// Toast notification functions
function showToast(message, type = 'info', title = '', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ️',
    warning: '⚠️'
  };
  
  const titles = {
    success: title || 'Success',
    error: title || 'Error',
    info: title || 'Info',
    warning: title || 'Warning'
  };
  
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${titles[type]}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  
  toastContainer.appendChild(toast);
  
  // Auto-remove after duration
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => {
      toast.remove();
    }, 300); // Match animation duration
  }, duration);
}

function showSuccess(message, title = '') {
  showToast(message, 'success', title);
}

function showError(message, title = '') {
  showToast(message, 'error', title);
}

function showInfo(message, title = '') {
  showToast(message, 'info', title);
}

function showWarning(message, title = '') {
  showToast(message, 'warning', title);
}

// Confirm dialog (still needs user interaction)
async function showConfirm(message, title = 'Confirm') {
  return showDialog({
    title,
    message,
    type: 'warning',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    showCancel: true
  });
}

// Load all trips
async function loadTrips() {
  try {
    const response = await fetch('api/trips');
    if (!response.ok) throw new Error('Failed to load trips');
    
    trips = await response.json();
    renderTripList();
    
    // If there was a selected trip, reselect it
    if (currentTrip) {
      const updatedTrip = trips.find(t => (t.id || t._id) === (currentTrip.id || currentTrip._id));
      if (updatedTrip) {
        selectTrip(updatedTrip);
      } else {
        showEmptyState();
      }
    }
  } catch (err) {
    console.error('Error loading trips:', err);
    showError(`Failed to load trips: ${err.message}`);
  }
}

// Render trip list in sidebar
function renderTripList() {
  if (trips.length === 0) {
    tripListEl.innerHTML = '<div class="empty-trip-list">No trips yet<br>Click ➕ to create one</div>';
    return;
  }
  
  tripListEl.innerHTML = trips.map(trip => {
    const id = trip.id || trip._id;
    const startTime = trip.start?.time || trip.startTime;
    const endTime = trip.end?.time || trip.endTime;
    const fromLocation = trip.start?.locationName || trip.from || 'Unknown';
    const toLocation = trip.end?.locationName || trip.to || 'Unknown';
    const duration = trip.calculated?.duration?.formatted || trip.analysis?.duration?.formatted || 'N/A';
    const distance = trip.calculated?.distance?.nauticalMiles || trip.analysis?.distance?.nauticalMiles || null;
    const isActive = currentTrip && (currentTrip.id || currentTrip._id) === id;
    
    return `
      <div class="trip-card ${isActive ? 'active' : ''}" data-id="${id}">
        <div class="trip-card-header">${fromLocation} → ${toLocation}</div>
        <div class="trip-card-date">${formatDate(startTime)}</div>
        <div class="trip-card-info">
          <span>⏱️ ${duration}</span>
          ${distance ? `<span>📍 ${distance} NM</span>` : ''}
        </div>
        ${trip.tags && trip.tags.length > 0 ? `
          <div class="trip-card-tags">
            ${trip.tags.map(tag => `<span class="trip-card-tag">${tag}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
  
  // Add click listeners
  tripListEl.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const trip = trips.find(t => (t.id || t._id) === id);
      if (trip) selectTrip(trip);
    });
  });
}

// Select a trip
function selectTrip(trip) {
  currentTrip = trip;
  renderTripList(); // Refresh to show active state
  showViewMode();
  renderTripDetail();
}

// Show empty state
function showEmptyState() {
  currentTrip = null;
  emptyState.style.display = 'flex';
  tripView.style.display = 'none';
}

// Show view mode
function showViewMode() {
  emptyState.style.display = 'none';
  tripView.style.display = 'flex';
  viewMode.style.display = 'block';
  editMode.style.display = 'none';
}

// Show edit mode
function showEditMode(trip) {
  editingTripId = trip ? (trip.id || trip._id) : null;
  
  emptyState.style.display = 'none';
  tripView.style.display = 'flex';
  viewMode.style.display = 'none';
  editMode.style.display = 'block';
  
  if (trip) {
    document.getElementById('editTitle').textContent = 'Edit Trip Log';
    populateForm(trip);
  } else {
    document.getElementById('editTitle').textContent = 'New Trip Log';
    tripForm.reset();
    selectedTags = [];
    renderSelectedTags();
  }
  
  // Close sidebar on mobile
  closeSidebar();
}

// Cancel edit
function cancelEdit() {
  if (currentTrip) {
    showViewMode();
  } else {
    showEmptyState();
  }
}

// Handle save
async function handleSave(e) {
  e.preventDefault();
  
  const tripData = collectFormData();
  
  try {
    if (editingTripId) {
      // Update existing trip
      const response = await fetch(`api/trips/${editingTripId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tripData)
      });
      
      if (!response.ok) throw new Error('Failed to update trip');
      const updated = await response.json();
      currentTrip = updated;
    } else {
      // Create new trip
      const response = await fetch('api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tripData)
      });
      
      if (!response.ok) throw new Error('Failed to create trip');
      const created = await response.json();
      currentTrip = created;
    }
    
    await loadTrips();
    showViewMode();
    renderTripDetail();
    showSuccess('Trip saved successfully');
  } catch (err) {
    console.error('Error saving trip:', err);
    showError(`Failed to save trip: ${err.message}`);
  }
}

// Handle delete
async function handleDelete() {
  if (!currentTrip) return;
  
  const fromLocation = currentTrip.start?.locationName || currentTrip.from || 'Unknown';
  const toLocation = currentTrip.end?.locationName || currentTrip.to || 'Unknown';
  
  const confirmed = await showConfirm(
    `Are you sure you want to delete this trip?\n\n${fromLocation} → ${toLocation}`,
    'Delete Trip'
  );
  
  if (!confirmed) return;
  
  try {
    const id = currentTrip.id || currentTrip._id;
    const response = await fetch(`api/trips/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) throw new Error('Failed to delete trip');
    
    await loadTrips();
    showEmptyState();
    showSuccess('Trip deleted');
  } catch (err) {
    console.error('Error deleting trip:', err);
    showError(`Failed to delete trip: ${err.message}`);
  }
}

// Collect form data
function collectFormData() {
  return {
    start: {
      time: document.getElementById('startTime').value,
      locationName: document.getElementById('startLocationName').value || null,
      position: {
        latitude: parseFloat(document.getElementById('startLat').value) || null,
        longitude: parseFloat(document.getElementById('startLon').value) || null
      },
      engineHours: {
        port: parseFloat(document.getElementById('startEnginePort').value) || null,
        starboard: parseFloat(document.getElementById('startEngineStbd').value) || null
      },
      fuelLevel: parseInt(document.getElementById('startFuel').value) / 100 || null
    },
    end: {
      time: document.getElementById('endTime').value,
      locationName: document.getElementById('endLocationName').value || null,
      position: {
        latitude: parseFloat(document.getElementById('endLat').value) || null,
        longitude: parseFloat(document.getElementById('endLon').value) || null
      },
      engineHours: {
        port: parseFloat(document.getElementById('endEnginePort').value) || null,
        starboard: parseFloat(document.getElementById('endEngineStbd').value) || null
      },
      fuelLevel: parseInt(document.getElementById('endFuel').value) / 100 || null
    },
    tags: selectedTags,
    crew: document.getElementById('crew').value.split(',').map(c => c.trim()).filter(c => c),
    notes: document.getElementById('notes').value || ''
  };
}

// Populate form with trip data
function populateForm(trip) {
  // Start data
  if (trip.start) {
    document.getElementById('startTime').value = formatDateTimeLocal(trip.start.time);
    document.getElementById('startLocationName').value = trip.start.locationName || '';
    if (trip.start.position) {
      document.getElementById('startLat').value = trip.start.position.latitude || '';
      document.getElementById('startLon').value = trip.start.position.longitude || '';
    }
    if (trip.start.engineHours) {
      document.getElementById('startEnginePort').value = trip.start.engineHours.port || '';
      document.getElementById('startEngineStbd').value = trip.start.engineHours.starboard || '';
    }
    if (trip.start.fuelLevel != null) {
      document.getElementById('startFuel').value = Math.round(trip.start.fuelLevel * 100) || '';
    }
  } else if (trip.startTime) {
    // Old format
    document.getElementById('startTime').value = formatDateTimeLocal(trip.startTime);
    document.getElementById('startLocationName').value = trip.from || '';
  }
  
  // End data
  if (trip.end) {
    document.getElementById('endTime').value = formatDateTimeLocal(trip.end.time);
    document.getElementById('endLocationName').value = trip.end.locationName || '';
    if (trip.end.position) {
      document.getElementById('endLat').value = trip.end.position.latitude || '';
      document.getElementById('endLon').value = trip.end.position.longitude || '';
    }
    if (trip.end.engineHours) {
      document.getElementById('endEnginePort').value = trip.end.engineHours.port || '';
      document.getElementById('endEngineStbd').value = trip.end.engineHours.starboard || '';
    }
    if (trip.end.fuelLevel != null) {
      document.getElementById('endFuel').value = Math.round(trip.end.fuelLevel * 100) || '';
    }
  } else if (trip.endTime) {
    // Old format
    document.getElementById('endTime').value = formatDateTimeLocal(trip.endTime);
    document.getElementById('endLocationName').value = trip.to || '';
  }
  
  // Tags
  selectedTags = trip.tags || [];
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.classList.toggle('active', selectedTags.includes(btn.dataset.tag));
  });
  renderSelectedTags();
  
  // Crew and notes
  document.getElementById('crew').value = trip.crew ? trip.crew.join(', ') : '';
  document.getElementById('notes').value = trip.notes || '';
}

// Render trip detail
function renderTripDetail() {
  if (!currentTrip) return;
  
  const trip = currentTrip;
  const startTime = trip.start?.time || trip.startTime;
  const endTime = trip.end?.time || trip.endTime;
  const fromLocation = trip.start?.locationName || trip.from || 'Unknown';
  const toLocation = trip.end?.locationName || trip.to || 'Unknown';
  
  document.getElementById('viewTitle').textContent = `${fromLocation} → ${toLocation}`;
  
  const detailEl = document.getElementById('tripDetail');
  
  let html = `
    <div class="detail-section">
      <h3>📅 ${formatDate(startTime)} → ${formatDate(endTime)}</h3>
      ${trip.crew && trip.crew.length > 0 ? `<p><strong>Crew:</strong> ${trip.crew.join(', ')}</p>` : ''}
      ${trip.notes ? `<p style="margin-top: 1rem;">${trip.notes}</p>` : ''}
      ${trip.tags && trip.tags.length > 0 ? `
        <div class="detail-tags">
          ${trip.tags.map(tag => `<span class="detail-tag">${tag}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
  
  if (trip.calculated) {
    html += `
      <div class="detail-section">
        <h3>📊 Trip Summary</h3>
        <div class="detail-grid">
          ${trip.calculated.duration ? `
            <div class="detail-item">
              <span class="detail-label">Duration</span>
              <span class="detail-value">${trip.calculated.duration.formatted || 'N/A'}</span>
            </div>
          ` : ''}
          
          ${trip.calculated.distance ? `
            <div class="detail-item">
              <span class="detail-label">Distance</span>
              <span class="detail-value">${trip.calculated.distance.nauticalMiles} <span style="font-size: 1rem;">NM</span></span>
            </div>
          ` : ''}
          
          ${trip.calculated.averageSpeed ? `
            <div class="detail-item">
              <span class="detail-label">Avg Speed</span>
              <span class="detail-value">${trip.calculated.averageSpeed} <span style="font-size: 1rem;">kts</span></span>
            </div>
          ` : ''}
          
          ${trip.calculated.engineHoursAdded ? `
            <div class="detail-item">
              <span class="detail-label">Engine Hours (Port)</span>
              <span class="detail-value">${trip.calculated.engineHoursAdded.port || 0} <span style="font-size: 1rem;">hrs</span></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Engine Hours (Stbd)</span>
              <span class="detail-value">${trip.calculated.engineHoursAdded.starboard || 0} <span style="font-size: 1rem;">hrs</span></span>
            </div>
          ` : ''}
          
          ${trip.calculated.fuelUsed != null ? `
            <div class="detail-item">
              <span class="detail-label">Fuel Used</span>
              <span class="detail-value">${(trip.calculated.fuelUsed * 100).toFixed(0)}%</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  detailEl.innerHTML = html;
}

// Capture current conditions
async function captureConditions(type) {
  try {
    const response = await fetch('api/trips/current-conditions');
    if (!response.ok) throw new Error('Failed to fetch conditions');
    
    const data = await response.json();
    
    const prefix = type === 'start' ? 'start' : 'end';
    
    // Time - use timestamp from SignalK or current local time
    const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
    document.getElementById(`${prefix}Time`).value = formatDateTimeLocal(timestamp.toISOString());
    
    // Position
    if (data.position) {
      document.getElementById(`${prefix}Lat`).value = data.position.latitude || '';
      document.getElementById(`${prefix}Lon`).value = data.position.longitude || '';
    }
    
    // Engine hours
    if (data.engineHours) {
      document.getElementById(`${prefix}EnginePort`).value = data.engineHours.port || '';
      document.getElementById(`${prefix}EngineStbd`).value = data.engineHours.starboard || '';
    }
    
    // Fuel level
    // Note: Need to check what format SignalK provides
    
    showSuccess(
      `Conditions captured for ${type === 'start' ? 'departure' : 'arrival'}`
    );
  } catch (err) {
    console.error('Error capturing conditions:', err);
    showError(`Failed to capture conditions: ${err.message}`);
  }
}

// Tag management
function toggleTag(tag, btn) {
  const index = selectedTags.indexOf(tag);
  if (index > -1) {
    selectedTags.splice(index, 1);
    btn.classList.remove('active');
  } else {
    selectedTags.push(tag);
    btn.classList.add('active');
  }
  renderSelectedTags();
}

function addCustomTag() {
  const input = document.getElementById('customTag');
  const tag = input.value.trim();
  
  if (tag && !selectedTags.includes(tag)) {
    selectedTags.push(tag);
    input.value = '';
    renderSelectedTags();
  }
}

function removeTag(tag) {
  selectedTags = selectedTags.filter(t => t !== tag);
  
  // Update predefined tag buttons
  document.querySelectorAll('.tag-btn').forEach(btn => {
    if (btn.dataset.tag === tag) {
      btn.classList.remove('active');
    }
  });
  
  renderSelectedTags();
}

function renderSelectedTags() {
  const container = document.getElementById('selectedTags');
  container.innerHTML = selectedTags.map(tag => `
    <span class="selected-tag">
      ${tag}
      <span class="tag-remove" onclick="removeTag('${tag}')">×</span>
    </span>
  `).join('');
}

// Utility functions
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateTimeLocal(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

// Make removeTag globally accessible
window.removeTag = removeTag;
