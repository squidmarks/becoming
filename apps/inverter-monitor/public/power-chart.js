/**
 * Lightweight Power Chart - Custom canvas-based bar chart
 * ~3KB minified - much lighter than Chart.js (200KB)
 */

class PowerChart {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.options = {
      padding: { top: 40, right: 20, bottom: 60, left: 60 },
      barGap: 0.3, // Gap between bars as fraction of bar width
      colors: {
        dcPower: '#3c7dce',
        acPower: '#22c55e',
        grid: 'rgba(255, 255, 255, 0.1)',
        text: 'var(--text-secondary)',
        axis: 'var(--text-muted)'
      },
      ...options
    };
    
    this.data = [];
    this.hoveredBar = null;
    
    // Handle retina displays
    this.setupCanvas();
    
    // Mouse events for tooltips
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseout', this.handleMouseOut.bind(this));
    
    // Resize handling
    window.addEventListener('resize', () => this.draw());
  }

  setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }

  setData(samples) {
    this.data = samples.map(s => ({
      timestamp: new Date(s.timestamp),
      dcPower: Math.abs(s.dcPower), // Show absolute value
      acPower: s.acTotalPower,
      label: this.formatTimestamp(s.timestamp)
    }));
    this.draw();
  }

  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      // Just show time for today
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    } else {
      // Show date + time for other days
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit'
      });
    }
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);
    
    if (this.data.length === 0) {
      this.drawEmptyState(width, height);
      return;
    }
    
    // Calculate drawing area
    const { top, right, bottom, left } = this.options.padding;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    
    // Find max value for scaling
    const maxValue = Math.max(
      ...this.data.map(d => Math.max(d.dcPower, d.acPower)),
      100 // Minimum scale
    );
    const yScale = chartHeight / maxValue;
    
    // Draw grid and axes
    this.drawGrid(left, top, chartWidth, chartHeight, maxValue);
    
    // Calculate bar dimensions
    const barGroupWidth = chartWidth / this.data.length;
    const barWidth = (barGroupWidth / 2) * (1 - this.options.barGap);
    
    // Draw bars
    this.data.forEach((item, i) => {
      const x = left + (i * barGroupWidth);
      
      // DC Power bar (left)
      const dcHeight = item.dcPower * yScale;
      this.drawBar(
        x,
        top + chartHeight - dcHeight,
        barWidth,
        dcHeight,
        this.options.colors.dcPower,
        i === this.hoveredBar
      );
      
      // AC Power bar (right)
      const acHeight = item.acPower * yScale;
      this.drawBar(
        x + barWidth,
        top + chartHeight - acHeight,
        barWidth,
        acHeight,
        this.options.colors.acPower,
        i === this.hoveredBar
      );
      
      // X-axis labels (show every Nth label to avoid crowding)
      const labelInterval = Math.ceil(this.data.length / 8);
      if (i % labelInterval === 0 || i === this.data.length - 1) {
        this.drawLabel(
          x + barGroupWidth / 2,
          top + chartHeight + 20,
          item.label,
          'center'
        );
      }
    });
    
    // Draw legend
    this.drawLegend(left, top - 25);
    
    // Draw tooltip if hovering
    if (this.hoveredBar !== null) {
      this.drawTooltip(this.hoveredBar);
    }
  }

  drawBar(x, y, width, height, color, highlighted) {
    this.ctx.fillStyle = highlighted 
      ? color 
      : color + (this.isDarkMode() ? '99' : 'CC');
    this.ctx.fillRect(x, y, width, height);
    
    if (highlighted) {
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);
    }
  }

  drawGrid(x, y, width, height, maxValue) {
    this.ctx.strokeStyle = this.options.colors.grid;
    this.ctx.lineWidth = 1;
    this.ctx.font = '12px -apple-system, sans-serif';
    this.ctx.fillStyle = getComputedStyle(document.body)
      .getPropertyValue('--text-muted');
    
    // Horizontal grid lines
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const yPos = y + (height / steps) * i;
      const value = maxValue * (1 - i / steps);
      
      // Grid line
      this.ctx.beginPath();
      this.ctx.moveTo(x, yPos);
      this.ctx.lineTo(x + width, yPos);
      this.ctx.stroke();
      
      // Y-axis label
      this.ctx.textAlign = 'right';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(Math.round(value) + 'W', x - 10, yPos);
    }
    
    // Axes
    this.ctx.strokeStyle = getComputedStyle(document.body)
      .getPropertyValue('--text-muted');
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x, y + height);
    this.ctx.lineTo(x + width, y + height);
    this.ctx.stroke();
  }

  drawLegend(x, y) {
    this.ctx.font = '13px -apple-system, sans-serif';
    this.ctx.textBaseline = 'middle';
    
    // DC Power
    this.ctx.fillStyle = this.options.colors.dcPower;
    this.ctx.fillRect(x, y, 20, 12);
    this.ctx.fillStyle = getComputedStyle(document.body)
      .getPropertyValue('--text-secondary');
    this.ctx.textAlign = 'left';
    this.ctx.fillText('DC Power', x + 25, y + 6);
    
    // AC Power
    this.ctx.fillStyle = this.options.colors.acPower;
    this.ctx.fillRect(x + 120, y, 20, 12);
    this.ctx.fillStyle = getComputedStyle(document.body)
      .getPropertyValue('--text-secondary');
    this.ctx.fillText('AC Power', x + 145, y + 6);
  }

  drawLabel(x, y, text, align = 'center') {
    this.ctx.font = '11px -apple-system, sans-serif';
    this.ctx.fillStyle = getComputedStyle(document.body)
      .getPropertyValue('--text-muted');
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(text, x, y);
  }

  drawTooltip(index) {
    const item = this.data[index];
    const rect = this.canvas.getBoundingClientRect();
    const { top, left } = this.options.padding;
    
    // Position tooltip
    const barGroupWidth = (rect.width - left - this.options.padding.right) / this.data.length;
    const x = left + (index * barGroupWidth) + barGroupWidth / 2;
    const y = top + 10;
    
    // Tooltip content
    const lines = [
      item.label,
      `DC: ${Math.round(item.dcPower)}W`,
      `AC: ${Math.round(item.acPower)}W`,
      `Δ: ${Math.round(item.dcPower - item.acPower)}W`
    ];
    
    // Measure text
    this.ctx.font = '12px -apple-system, sans-serif';
    const maxWidth = Math.max(...lines.map(l => this.ctx.measureText(l).width));
    const padding = 8;
    const lineHeight = 16;
    const tooltipWidth = maxWidth + padding * 2;
    const tooltipHeight = lines.length * lineHeight + padding * 2;
    
    // Adjust position if would go off screen
    let tooltipX = x - tooltipWidth / 2;
    if (tooltipX < 10) tooltipX = 10;
    if (tooltipX + tooltipWidth > rect.width - 10) {
      tooltipX = rect.width - tooltipWidth - 10;
    }
    
    // Draw tooltip background
    this.ctx.fillStyle = this.isDarkMode() 
      ? 'rgba(80, 80, 80, 0.95)' 
      : 'rgba(255, 255, 255, 0.95)';
    this.ctx.strokeStyle = this.isDarkMode()
      ? 'rgba(255, 255, 255, 0.2)'
      : 'rgba(0, 0, 0, 0.2)';
    this.ctx.lineWidth = 1;
    this.roundRect(tooltipX, y, tooltipWidth, tooltipHeight, 4);
    this.ctx.fill();
    this.ctx.stroke();
    
    // Draw text
    this.ctx.fillStyle = getComputedStyle(document.body)
      .getPropertyValue('--text-primary');
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      this.ctx.fillText(line, tooltipX + padding, y + padding + i * lineHeight);
    });
  }

  drawEmptyState(width, height) {
    this.ctx.font = '14px -apple-system, sans-serif';
    this.ctx.fillStyle = getComputedStyle(document.body)
      .getPropertyValue('--text-muted');
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('No power data available yet', width / 2, height / 2);
    this.ctx.fillText('Data will appear after first 5-minute interval', width / 2, height / 2 + 20);
  }

  roundRect(x, y, width, height, radius) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const { top, left, right } = this.options.padding;
    const chartWidth = rect.width - left - right;
    const barGroupWidth = chartWidth / this.data.length;
    
    // Check which bar is hovered
    if (x >= left && x <= left + chartWidth) {
      const index = Math.floor((x - left) / barGroupWidth);
      if (index !== this.hoveredBar) {
        this.hoveredBar = index;
        this.draw();
      }
      this.canvas.style.cursor = 'pointer';
    } else if (this.hoveredBar !== null) {
      this.hoveredBar = null;
      this.draw();
      this.canvas.style.cursor = 'default';
    }
  }

  handleMouseOut() {
    if (this.hoveredBar !== null) {
      this.hoveredBar = null;
      this.draw();
    }
    this.canvas.style.cursor = 'default';
  }

  isDarkMode() {
    return !document.body.classList.contains('light-mode');
  }

  destroy() {
    window.removeEventListener('resize', () => this.draw());
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseout', this.handleMouseOut);
  }
}
