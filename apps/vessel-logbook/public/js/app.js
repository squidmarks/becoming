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

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  loadTrips();
  setupEventListeners();
});

// Event listeners
function setupEventListeners() {
  document.getElementById('newTripBtn').addEventListener('click', () => showEditMode(null));
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
}

// Load all trips
async function loadTrips() {
  try {
    const response = await fetch('/api/trips');
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
    alert(`Error loading trips: ${err.message}`);
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
      const response = await fetch(`/api/trips/${editingTripId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tripData)
      });
      
      if (!response.ok) throw new Error('Failed to update trip');
      const updated = await response.json();
      currentTrip = updated;
    } else {
      // Create new trip
      const response = await fetch('/api/trips', {
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
  } catch (err) {
    console.error('Error saving trip:', err);
    alert(`Error saving trip: ${err.message}`);
  }
}

// Handle delete
async function handleDelete() {
  if (!currentTrip) return;
  
  const fromLocation = currentTrip.start?.locationName || currentTrip.from || 'Unknown';
  const toLocation = currentTrip.end?.locationName || currentTrip.to || 'Unknown';
  
  if (!confirm(`Are you sure you want to delete this trip?\n\n${fromLocation} → ${toLocation}`)) {
    return;
  }
  
  try {
    const id = currentTrip.id || currentTrip._id;
    const response = await fetch(`/api/trips/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) throw new Error('Failed to delete trip');
    
    await loadTrips();
    showEmptyState();
  } catch (err) {
    console.error('Error deleting trip:', err);
    alert(`Error deleting trip: ${err.message}`);
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
      fuelLevel: {
        port: parseInt(document.getElementById('startFuelPort').value) / 100 || null,
        starboard: parseInt(document.getElementById('startFuelStbd').value) / 100 || null
      }
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
      fuelLevel: {
        port: parseInt(document.getElementById('endFuelPort').value) / 100 || null,
        starboard: parseInt(document.getElementById('endFuelStbd').value) / 100 || null
      }
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
    if (trip.start.fuelLevel) {
      document.getElementById('startFuelPort').value = Math.round(trip.start.fuelLevel.port * 100) || '';
      document.getElementById('startFuelStbd').value = Math.round(trip.start.fuelLevel.starboard * 100) || '';
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
    if (trip.end.fuelLevel) {
      document.getElementById('endFuelPort').value = Math.round(trip.end.fuelLevel.port * 100) || '';
      document.getElementById('endFuelStbd').value = Math.round(trip.end.fuelLevel.starboard * 100) || '';
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
          
          ${trip.calculated.fuelUsed ? `
            <div class="detail-item">
              <span class="detail-label">Fuel Used (Port)</span>
              <span class="detail-value">${(trip.calculated.fuelUsed.port * 100).toFixed(0)}%</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Fuel Used (Stbd)</span>
              <span class="detail-value">${(trip.calculated.fuelUsed.starboard * 100).toFixed(0)}%</span>
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
    const response = await fetch('/api/trips/current-conditions');
    if (!response.ok) throw new Error('Failed to fetch conditions');
    
    const data = await response.json();
    
    const prefix = type === 'start' ? 'start' : 'end';
    
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
    
    // Fuel levels (convert from ratio to percentage)
    // Note: API returns fuel as percentages already if tank levels are in ratio
    // This needs to match what SignalK provides
    
    alert(`✓ Current conditions captured for ${type === 'start' ? 'departure' : 'arrival'}`);
  } catch (err) {
    console.error('Error capturing conditions:', err);
    alert(`Error capturing conditions: ${err.message}`);
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
