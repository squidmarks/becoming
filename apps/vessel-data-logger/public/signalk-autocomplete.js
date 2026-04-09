/**
 * SignalK Path Autocomplete Component
 * Reusable autocomplete for SignalK paths
 */

class SignalKAutocomplete {
  constructor(inputElement, options = {}) {
    this.input = inputElement;
    this.options = {
      placeholder: 'Start typing path...',
      onSelect: null,
      ...options
    };
    
    this.paths = [];
    this.isLoading = false;
    this.listElement = null;
    this.selectedIndex = -1;
    
    this.init();
  }

  async init() {
    // Set placeholder
    if (this.options.placeholder) {
      this.input.placeholder = this.options.placeholder;
    }

    // Create dropdown list element
    this.createListElement();
    
    // Load paths from API
    await this.loadPaths();
    
    // Attach event listeners
    this.attachListeners();
  }

  createListElement() {
    // Create autocomplete list
    this.listElement = document.createElement('div');
    this.listElement.className = 'signalk-autocomplete-list';
    this.listElement.style.display = 'none';
    
    // Insert after input
    this.input.parentNode.style.position = 'relative';
    this.input.parentNode.appendChild(this.listElement);
  }

  async loadPaths() {
    if (this.isLoading) return;
    this.isLoading = true;
    
    try {
      const response = await fetch('api/paths?limit=1000');
      const data = await response.json();
      // Ensure all paths are strings
      this.paths = (data.paths || []).filter(p => typeof p === 'string');
    } catch (error) {
      console.error('Failed to load SignalK paths:', error);
      this.paths = [];
    } finally {
      this.isLoading = false;
    }
  }

  attachListeners() {
    // Input events
    this.input.addEventListener('input', () => this.handleInput());
    this.input.addEventListener('focus', () => this.handleInput());
    this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
    
    // Close on blur (with delay to allow click on list)
    this.input.addEventListener('blur', () => {
      setTimeout(() => this.hide(), 200);
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!this.input.contains(e.target) && !this.listElement.contains(e.target)) {
        this.hide();
      }
    });
  }

  handleInput() {
    const query = this.input.value.toLowerCase().trim();
    
    if (!query) {
      this.hide();
      return;
    }

    // Filter paths (with type safety check)
    const filtered = this.paths
      .filter(path => typeof path === 'string' && path.toLowerCase().includes(query))
      .slice(0, 50); // Limit to 50 results

    if (filtered.length === 0) {
      this.hide();
      return;
    }

    this.render(filtered);
    this.show();
    this.selectedIndex = -1;
  }

  render(paths) {
    const query = this.input.value.toLowerCase();
    
    this.listElement.innerHTML = paths.map((path, index) => {
      // Highlight matching text
      const startIdx = path.toLowerCase().indexOf(query);
      let displayPath = path;
      
      if (startIdx !== -1) {
        const before = path.substring(0, startIdx);
        const match = path.substring(startIdx, startIdx + query.length);
        const after = path.substring(startIdx + query.length);
        displayPath = `${before}<strong>${match}</strong>${after}`;
      }
      
      return `<div class="signalk-autocomplete-item" data-index="${index}" data-path="${path}">${displayPath}</div>`;
    }).join('');

    // Attach click handlers
    this.listElement.querySelectorAll('.signalk-autocomplete-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent blur on input
        this.selectPath(item.dataset.path);
      });
      
      item.addEventListener('mouseenter', () => {
        this.selectedIndex = parseInt(item.dataset.index);
        this.updateSelection();
      });
    });
  }

  handleKeydown(e) {
    if (!this.isVisible()) return;

    const items = this.listElement.querySelectorAll('.signalk-autocomplete-item');
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
        this.updateSelection();
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection();
        break;
        
      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
          this.selectPath(items[this.selectedIndex].dataset.path);
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        this.hide();
        break;
    }
  }

  updateSelection() {
    const items = this.listElement.querySelectorAll('.signalk-autocomplete-item');
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  selectPath(path) {
    this.input.value = path;
    this.hide();
    
    // Trigger change event
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Call callback if provided
    if (this.options.onSelect) {
      this.options.onSelect(path);
    }
  }

  show() {
    this.listElement.style.display = 'block';
  }

  hide() {
    this.listElement.style.display = 'none';
    this.selectedIndex = -1;
  }

  isVisible() {
    return this.listElement.style.display === 'block';
  }

  destroy() {
    if (this.listElement && this.listElement.parentNode) {
      this.listElement.parentNode.removeChild(this.listElement);
    }
  }
}

// Export for use in other scripts
window.SignalKAutocomplete = SignalKAutocomplete;
