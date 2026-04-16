// App state
let trips = [];

// DOM elements
const tripListEl = document.getElementById('tripList');
const tripModal = document.getElementById('tripModal');
const tripDetailModal = document.getElementById('tripDetailModal');
const tripForm = document.getElementById('tripForm');
const newTripBtn = document.getElementById('newTripBtn');
const cancelBtn = document.getElementById('cancelBtn');
const formLoading = document.getElementById('formLoading');

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
          <div class="trip-card-date">${formatDate(trip.startTime)}</div>
        </div>
      </div>
      
      ${trip.analysis && trip.analysis.distance ? `
        <div class="trip-card-stats">
          <div class="stat">
            <span class="stat-label">Distance</span>
            <span class="stat-value">${trip.analysis.distance.nauticalMiles} NM</span>
          </div>
          <div class="stat">
            <span class="stat-label">Duration</span>
            <span class="stat-value">${trip.analysis.duration.formatted}</span>
          </div>
          ${trip.analysis.speed ? `
            <div class="stat">
              <span class="stat-label">Avg Speed</span>
              <span class="stat-value">${trip.analysis.speed.average} kts</span>
            </div>
          ` : ''}
          ${trip.analysis.engineHours ? `
            <div class="stat">
              <span class="stat-label">Engine Hours</span>
              <span class="stat-value">${trip.analysis.engineHours.port} hrs</span>
            </div>
          ` : ''}
        </div>
      ` : '<div class="trip-card-notes">No analysis data available</div>'}
      
      ${trip.notes ? `<div class="trip-card-notes">${trip.notes}</div>` : ''}
    </div>
  `).join('');
}

// Open trip creation modal
function openTripModal() {
  tripForm.reset();
  
  // Set default times (now and 1 hour ago)
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  document.getElementById('endTime').value = formatDateTimeLocal(now);
  document.getElementById('startTime').value = formatDateTimeLocal(oneHourAgo);
  
  tripModal.classList.add('active');
}

// Close trip modal
function closeTripModal() {
  tripModal.classList.remove('active');
}

// Handle trip form submission
async function handleTripSubmit(e) {
  e.preventDefault();
  
  const formData = {
    startTime: new Date(document.getElementById('startTime').value).toISOString(),
    endTime: new Date(document.getElementById('endTime').value).toISOString(),
    from: document.getElementById('from').value || null,
    to: document.getElementById('to').value || null,
    crew: document.getElementById('crew').value.split(',').map(c => c.trim()).filter(c => c),
    notes: document.getElementById('notes').value || ''
  };
  
  // Show loading state
  tripForm.style.display = 'none';
  formLoading.style.display = 'block';
  
  try {
    const response = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create trip');
    }
    
    const trip = await response.json();
    
    // Close modal and reload trips
    closeTripModal();
    await loadTrips();
    
    // Open detail view of new trip
    viewTrip(trip.id);
    
  } catch (err) {
    alert(`Error creating trip: ${err.message}`);
  } finally {
    tripForm.style.display = 'block';
    formLoading.style.display = 'none';
  }
}

// View trip details
async function viewTrip(tripId) {
  try {
    const response = await fetch(`/api/trips/${tripId}`);
    if (!response.ok) throw new Error('Failed to load trip');
    
    const trip = await response.json();
    renderTripDetail(trip);
    tripDetailModal.classList.add('active');
  } catch (err) {
    alert(`Error loading trip: ${err.message}`);
  }
}

// Render trip detail view
function renderTripDetail(trip) {
  const detailEl = document.getElementById('tripDetail');
  
  detailEl.innerHTML = `
    <div class="detail-section">
      <h3>${formatRoute(trip)}</h3>
      <p>${formatDate(trip.startTime)} • ${trip.analysis?.duration?.formatted || 'Duration unknown'}</p>
      ${trip.crew && trip.crew.length > 0 ? `<p><strong>Crew:</strong> ${trip.crew.join(', ')}</p>` : ''}
      ${trip.notes ? `<p style="margin-top: 1rem; color: var(--text-light);">${trip.notes}</p>` : ''}
    </div>
    
    ${trip.analysis && trip.analysis.distance ? `
      <div class="detail-section">
        <h3>Trip Statistics</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Distance</span>
            <span class="detail-value">${trip.analysis.distance.nauticalMiles} <span style="font-size: 1rem;">NM</span></span>
          </div>
          
          ${trip.analysis.speed ? `
            <div class="detail-item">
              <span class="detail-label">Avg Speed</span>
              <span class="detail-value">${trip.analysis.speed.average} <span style="font-size: 1rem;">kts</span></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Max Speed</span>
              <span class="detail-value">${trip.analysis.speed.max} <span style="font-size: 1rem;">kts</span></span>
            </div>
          ` : ''}
          
          ${trip.analysis.engineHours ? `
            <div class="detail-item">
              <span class="detail-label">Engine Hours (Port)</span>
              <span class="detail-value">${trip.analysis.engineHours.port} <span style="font-size: 1rem;">hrs</span></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Engine Hours (Starboard)</span>
              <span class="detail-value">${trip.analysis.engineHours.starboard} <span style="font-size: 1rem;">hrs</span></span>
            </div>
          ` : ''}
          
          ${trip.analysis.engineRPM ? `
            <div class="detail-item">
              <span class="detail-label">Avg RPM (Port)</span>
              <span class="detail-value">${trip.analysis.engineRPM.port.average}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Avg RPM (Starboard)</span>
              <span class="detail-value">${trip.analysis.engineRPM.starboard.average}</span>
            </div>
          ` : ''}
          
          ${trip.analysis.depth ? `
            <div class="detail-item">
              <span class="detail-label">Avg Depth</span>
              <span class="detail-value">${trip.analysis.depth.average} <span style="font-size: 1rem;">ft</span></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Max Depth</span>
              <span class="detail-value">${trip.analysis.depth.max} <span style="font-size: 1rem;">ft</span></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Min Depth</span>
              <span class="detail-value">${trip.analysis.depth.min} <span style="font-size: 1rem;">ft</span></span>
            </div>
          ` : ''}
        </div>
      </div>
      
      ${trip.analysis.startPosition && trip.analysis.endPosition ? `
        <div class="detail-section">
          <h3>Positions</h3>
          <p><strong>Start:</strong> ${trip.analysis.startPosition.lat.toFixed(6)}, ${trip.analysis.startPosition.lon.toFixed(6)}</p>
          <p><strong>End:</strong> ${trip.analysis.endPosition.lat.toFixed(6)}, ${trip.analysis.endPosition.lon.toFixed(6)}</p>
        </div>
      ` : ''}
      
      <div class="detail-section">
        <p style="color: var(--text-light); font-size: 0.875rem;">
          <strong>Data Points:</strong> 
          ${trip.analysis.dataPoints.positions} positions, 
          ${trip.analysis.dataPoints.speeds} speed samples, 
          ${trip.analysis.dataPoints.depths} depth readings
        </p>
      </div>
    ` : `
      <div class="detail-section">
        <p style="color: var(--text-light);">No analysis data available for this trip.</p>
      </div>
    `}
  `;
}

// Utility functions
function formatRoute(trip) {
  if (trip.from && trip.to) {
    return `${trip.from} → ${trip.to}`;
  }
  return `Trip on ${new Date(trip.startTime).toLocaleDateString()}`;
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
