// App state
let trips = [];
let selectedTags = [];
let editingTripId = null;

// DOM elements
const tripListEl = document.getElementById('tripList');
const tripModal = document.getElementById('tripModal');
const tripDetailModal = document.getElementById('tripDetailModal');
const tripForm = document.getElementById('tripForm');
const newTripBtn = document.getElementById('newTripBtn');
const cancelBtn = document.getElementById('cancelBtn');
const formLoading = document.getElementById('formLoading');
const modalTitle = document.getElementById('modalTitle');
const submitBtn = document.getElementById('submitBtn');
const editTripBtn = document.getElementById('editTripBtn');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  loadTrips();
  setupEventListeners();
});

// Event listeners
function setupEventListeners() {
  newTripBtn.addEventListener('click', openTripModal);
  cancelBtn.addEventListener('click', closeTripModal);
  tripForm.addEventListener('submit', handleTripSubmit);
  editTripBtn.addEventListener('click', handleEditClick);
  
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
  
  // Close modals on backdrop click
  [tripModal, tripDetailModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
    
    modal.querySelector('.modal-close').addEventListener('click', () => {
      modal.classList.remove('active');
    });
  });
}

// Load trips from API
async function loadTrips() {
  try {
    const response = await fetch('/api/trips');
    if (!response.ok) throw new Error('Failed to load trips');
    
    trips = await response.json();
    renderTripList();
  } catch (err) {
    tripListEl.innerHTML = `<div class="error">Error loading trips: ${err.message}</div>`;
  }
}

// Render trip list
function renderTripList() {
  if (trips.length === 0) {
    tripListEl.innerHTML = `
      <div class="empty-state">
        <h2>No trips logged yet</h2>
        <p>Click "New Trip Log" to create your first entry</p>
      </div>
    `;
    return;
  }
  
  tripListEl.innerHTML = trips.map(trip => `
    <div class="trip-card" onclick="viewTrip('${trip.id}')">
      <div class="trip-card-header">
        <div>
          <div class="trip-card-title">${formatRoute(trip)}</div>
          <div class="trip-card-date">${formatDate(trip.start.time)}</div>
        </div>
      </div>
      
      ${trip.calculated ? `
        <div class="trip-card-stats">
          ${trip.calculated.distance ? `
            <div class="stat">
              <span class="stat-label">Distance</span>
              <span class="stat-value">${trip.calculated.distance.nauticalMiles} NM</span>
            </div>
          ` : ''}
          <div class="stat">
            <span class="stat-label">Duration</span>
            <span class="stat-value">${trip.calculated.duration.formatted}</span>
          </div>
          ${trip.calculated.engineHoursAdded ? `
            <div class="stat">
              <span class="stat-label">Engine Hours</span>
              <span class="stat-value">${trip.calculated.engineHoursAdded.port || 0} hrs</span>
            </div>
          ` : ''}
          ${trip.calculated.averageSpeed ? `
            <div class="stat">
              <span class="stat-label">Avg Speed</span>
              <span class="stat-value">${trip.calculated.averageSpeed} kts</span>
            </div>
          ` : ''}
        </div>
      ` : ''}
      
      ${trip.tags && trip.tags.length > 0 ? `
        <div class="trip-tags">
          ${trip.tags.map(tag => `<span class="trip-tag">${formatTagLabel(tag)}</span>`).join('')}
        </div>
      ` : ''}
      
      ${trip.notes ? `<div class="trip-card-notes">${trip.notes}</div>` : ''}
    </div>
  `).join('');
}

// Open trip creation/edit modal
function openTripModal(trip = null) {
  editingTripId = trip?.id || null;
  selectedTags = trip?.tags || [];
  
  if (trip) {
    // Edit mode
    modalTitle.textContent = 'Edit Trip Log';
    submitBtn.textContent = 'Update Trip';
    populateForm(trip);
  } else {
    // New mode
    modalTitle.textContent = 'New Trip Log';
    submitBtn.textContent = 'Create Trip Log';
    tripForm.reset();
    
    // Set default times (now and 1 hour ago)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    document.getElementById('endTime').value = formatDateTimeLocal(now);
    document.getElementById('startTime').value = formatDateTimeLocal(oneHourAgo);
  }
  
  // Reset tag buttons
  document.querySelectorAll('.tag-btn').forEach(btn => btn.classList.remove('active'));
  selectedTags.forEach(tag => {
    const btn = document.querySelector(`[data-tag="${tag}"]`);
    if (btn) btn.classList.add('active');
  });
  renderSelectedTags();
  
  tripModal.classList.add('active');
}

// Populate form with trip data (for editing)
function populateForm(trip) {
  document.getElementById('tripId').value = trip.id;
  
  // Start conditions
  document.getElementById('startTime').value = formatDateTimeLocal(new Date(trip.start.time));
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
    document.getElementById('startFuelPort').value = (trip.start.fuelLevel.port * 100) || '';
    document.getElementById('startFuelStbd').value = (trip.start.fuelLevel.starboard * 100) || '';
  }
  
  // End conditions
  document.getElementById('endTime').value = formatDateTimeLocal(new Date(trip.end.time));
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
    document.getElementById('endFuelPort').value = (trip.end.fuelLevel.port * 100) || '';
    document.getElementById('endFuelStbd').value = (trip.end.fuelLevel.starboard * 100) || '';
  }
  
  // Crew & notes
  document.getElementById('crew').value = trip.crew?.join(', ') || '';
  document.getElementById('notes').value = trip.notes || '';
}

// Capture current conditions from SignalK
async function captureConditions(type) {
  const prefix = type; // 'start' or 'end'
  
  try {
    document.getElementById('formLoading').style.display = 'block';
    document.getElementById('loadingMessage').textContent = 'Fetching current conditions...';
    tripForm.style.display = 'none';
    
    const response = await fetch('/api/trips/current-conditions');
    if (!response.ok) throw new Error('Failed to fetch conditions');
    
    const conditions = await response.json();
    
    // Fill in time
    document.getElementById(`${prefix}Time`).value = formatDateTimeLocal(new Date(conditions.timestamp));
    
    // Fill in position
    if (conditions.position) {
      document.getElementById(`${prefix}Lat`).value = conditions.position.latitude?.toFixed(6) || '';
      document.getElementById(`${prefix}Lon`).value = conditions.position.longitude?.toFixed(6) || '';
    }
    
    // Fill in engine hours
    if (conditions.engineHours) {
      if (conditions.engineHours.port) {
        document.getElementById(`${prefix}EnginePort`).value = conditions.engineHours.port;
      }
      if (conditions.engineHours.starboard) {
        document.getElementById(`${prefix}EngineStbd`).value = conditions.engineHours.starboard;
      }
    }
    
    alert('✅ Current conditions captured successfully!');
    
  } catch (err) {
    alert(`Error capturing conditions: ${err.message}`);
  } finally {
    document.getElementById('formLoading').style.display = 'none';
    tripForm.style.display = 'block';
  }
}

// Close trip modal
function closeTripModal() {
  tripModal.classList.remove('active');
  editingTripId = null;
}

// Handle trip form submission
async function handleTripSubmit(e) {
  e.preventDefault();
  
  // Build trip data object
  const tripData = {
    start: {
      time: new Date(document.getElementById('startTime').value).toISOString(),
      locationName: document.getElementById('startLocationName').value || null,
      position: {},
      engineHours: {},
      fuelLevel: {},
      conditions: {}
    },
    end: {
      time: new Date(document.getElementById('endTime').value).toISOString(),
      locationName: document.getElementById('endLocationName').value || null,
      position: {},
      engineHours: {},
      fuelLevel: {},
      conditions: {}
    },
    tags: selectedTags,
    crew: document.getElementById('crew').value.split(',').map(c => c.trim()).filter(c => c),
    notes: document.getElementById('notes').value || ''
  };
  
  // Add position data
  const startLat = parseFloat(document.getElementById('startLat').value);
  const startLon = parseFloat(document.getElementById('startLon').value);
  if (!isNaN(startLat) && !isNaN(startLon)) {
    tripData.start.position = { latitude: startLat, longitude: startLon };
  } else {
    tripData.start.position = null;
  }
  
  const endLat = parseFloat(document.getElementById('endLat').value);
  const endLon = parseFloat(document.getElementById('endLon').value);
  if (!isNaN(endLat) && !isNaN(endLon)) {
    tripData.end.position = { latitude: endLat, longitude: endLon };
  } else {
    tripData.end.position = null;
  }
  
  // Add engine hours
  const startEnginePort = parseFloat(document.getElementById('startEnginePort').value);
  const startEngineStbd = parseFloat(document.getElementById('startEngineStbd').value);
  if (!isNaN(startEnginePort)) tripData.start.engineHours.port = startEnginePort;
  if (!isNaN(startEngineStbd)) tripData.start.engineHours.starboard = startEngineStbd;
  
  const endEnginePort = parseFloat(document.getElementById('endEnginePort').value);
  const endEngineStbd = parseFloat(document.getElementById('endEngineStbd').value);
  if (!isNaN(endEnginePort)) tripData.end.engineHours.port = endEnginePort;
  if (!isNaN(endEngineStbd)) tripData.end.engineHours.starboard = endEngineStbd;
  
  // Add fuel levels (convert % to ratio)
  const startFuelPort = parseFloat(document.getElementById('startFuelPort').value);
  const startFuelStbd = parseFloat(document.getElementById('startFuelStbd').value);
  if (!isNaN(startFuelPort)) tripData.start.fuelLevel.port = startFuelPort / 100;
  if (!isNaN(startFuelStbd)) tripData.start.fuelLevel.starboard = startFuelStbd / 100;
  
  const endFuelPort = parseFloat(document.getElementById('endFuelPort').value);
  const endFuelStbd = parseFloat(document.getElementById('endFuelStbd').value);
  if (!isNaN(endFuelPort)) tripData.end.fuelLevel.port = endFuelPort / 100;
  if (!isNaN(endFuelStbd)) tripData.end.fuelLevel.starboard = endFuelStbd / 100;
  
  // Show loading state
  tripForm.style.display = 'none';
  document.getElementById('formLoading').style.display = 'block';
  document.getElementById('loadingMessage').textContent = editingTripId ? 'Updating trip...' : 'Creating trip...';
  
  try {
    const method = editingTripId ? 'PUT' : 'POST';
    const url = editingTripId ? `/api/trips/${editingTripId}` : '/api/trips';
    
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tripData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save trip');
    }
    
    const trip = await response.json();
    
    // Close modal and reload trips
    closeTripModal();
    await loadTrips();
    
    // Open detail view of trip
    viewTrip(trip.id);
    
  } catch (err) {
    alert(`Error saving trip: ${err.message}`);
  } finally {
    tripForm.style.display = 'block';
    document.getElementById('formLoading').style.display = 'none';
  }
}

// Tag management
function toggleTag(tag, button) {
  const index = selectedTags.indexOf(tag);
  if (index > -1) {
    selectedTags.splice(index, 1);
    button.classList.remove('active');
  } else {
    selectedTags.push(tag);
    button.classList.add('active');
  }
  renderSelectedTags();
}

function addCustomTag() {
  const input = document.getElementById('customTag');
  const tag = input.value.trim();
  
  if (tag && !selectedTags.includes(tag)) {
    selectedTags.push(tag);
    renderSelectedTags();
    input.value = '';
  }
}

function removeTag(tag) {
  const index = selectedTags.indexOf(tag);
  if (index > -1) {
    selectedTags.splice(index, 1);
    const btn = document.querySelector(`[data-tag="${tag}"]`);
    if (btn) btn.classList.remove('active');
    renderSelectedTags();
  }
}

function renderSelectedTags() {
  const container = document.getElementById('selectedTags');
  container.innerHTML = selectedTags.map(tag => `
    <span class="tag">
      ${formatTagLabel(tag)}
      <button type="button" class="tag-remove" onclick="removeTag('${tag}')">×</button>
    </span>
  `).join('');
}

// View trip details
async function viewTrip(tripId) {
  try {
    const response = await fetch(`/api/trips/${tripId}`);
    if (!response.ok) throw new Error('Failed to load trip');
    
    const trip = await response.json();
    renderTripDetail(trip);
    tripDetailModal.classList.add('active');
    
    // Store current trip for edit button
    window.currentTrip = trip;
  } catch (err) {
    alert(`Error loading trip: ${err.message}`);
  }
}

// Handle edit button click
function handleEditClick() {
  tripDetailModal.classList.remove('active');
  openTripModal(window.currentTrip);
}

// Render trip detail view
function renderTripDetail(trip) {
  const detailEl = document.getElementById('tripDetail');
  
  detailEl.innerHTML = `
    <div class="detail-section">
      <h3>${formatRoute(trip)}</h3>
      <p>${formatDate(trip.start.time)} • ${trip.calculated?.duration?.formatted || 'Duration unknown'}</p>
      ${trip.crew && trip.crew.length > 0 ? `<p><strong>Crew:</strong> ${trip.crew.join(', ')}</p>` : ''}
      ${trip.tags && trip.tags.length > 0 ? `
        <div class="trip-tags" style="margin-top: 1rem;">
          ${trip.tags.map(tag => `<span class="trip-tag">${formatTagLabel(tag)}</span>`).join('')}
        </div>
      ` : ''}
      ${trip.notes ? `<p style="margin-top: 1rem; color: var(--text-light);">${trip.notes}</p>` : ''}
    </div>
    
    ${trip.calculated ? `
      <div class="detail-section">
        <h3>Trip Summary</h3>
        <div class="detail-grid">
          ${trip.calculated.distance ? `
            <div class="detail-item">
              <span class="detail-label">Distance</span>
              <span class="detail-value">${trip.calculated.distance.nauticalMiles} <span style="font-size: 1rem;">NM</span></span>
            </div>
          ` : ''}
          
          <div class="detail-item">
            <span class="detail-label">Duration</span>
            <span class="detail-value">${trip.calculated.duration.formatted}</span>
          </div>
          
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
      
      <div class="detail-section">
        <h3>Locations</h3>
        <p><strong>Start:</strong> ${trip.start.locationName || 'Unknown'} 
          ${trip.start.position ? `(${trip.start.position.latitude.toFixed(6)}, ${trip.start.position.longitude.toFixed(6)})` : ''}</p>
        <p><strong>End:</strong> ${trip.end.locationName || 'Unknown'}
          ${trip.end.position ? `(${trip.end.position.latitude.toFixed(6)}, ${trip.end.position.longitude.toFixed(6)})` : ''}</p>
      </div>
    ` : ''}
  `;
}

// Utility functions
function formatRoute(trip) {
  if (trip.start?.locationName && trip.end?.locationName) {
    return `${trip.start.locationName} → ${trip.end.locationName}`;
  }
  return `Trip on ${new Date(trip.start?.time || trip.startTime).toLocaleDateString()}`;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatTagLabel(tag) {
  const labels = {
    'marina': '🏖️ Marina',
    'anchorage': '⚓ Anchorage',
    'mooring': '🎯 Mooring Ball',
    'fuel': '⛽ Fuel Stop',
    'first_time': '🎉 First Time',
    'dolphins': '🐬 Dolphins',
    'fishing': '🎣 Fishing',
    'rough_seas': '🌊 Rough Seas'
  };
  return labels[tag] || tag;
}
