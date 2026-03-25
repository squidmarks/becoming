# Development Guidelines

Best practices for building portable, reusable applications in the becoming monorepo.

## Portability First

All applications should be **deployment-agnostic** and work outside the becoming ecosystem. Users should be able to clone a single app and run it independently.

## Configuration Management

### Backend Applications (Node.js)

**Use `.env` files for ALL environment-specific configuration:**

```bash
# .env.example (committed to repo)
HOST=localhost
PORT=3000
MQTT_BROKER=localhost
MQTT_PORT=1883

# .env (not committed, local to deployment)
HOST=becoming-hub
PORT=3000
MQTT_BROKER=becoming-hub
MQTT_PORT=1883
```

**Rules:**
- ✅ DO commit `.env.example` with defaults
- ✅ DO document all variables in README
- ✅ DO use sensible defaults (localhost, standard ports)
- ❌ DON'T hardcode hostnames, IPs, or ports in code
- ❌ DON'T commit actual `.env` files

### Frontend Applications

**For static HTML/JavaScript:**

Use dynamic detection instead of hardcoded values:

```javascript
// ✅ GOOD - Dynamic detection
const hostname = window.location.hostname || 'localhost';
const apiUrl = `http://${hostname}:3000/api`;

// ✅ GOOD - Relative paths (work under any base path)
fetch('/api/data')

// ✅ GOOD - Base path detection for subpath deployment
const basePath = window.location.pathname.startsWith('/myapp') ? '/myapp' : '';
fetch(`${basePath}/api/data`)

// ❌ BAD - Hardcoded hostname
fetch('http://becoming-hub:3000/api/data')

// ❌ BAD - Absolute path without base detection
fetch('/api/data')  // Breaks when app served at /myapp/
```

**For served HTML (Express/etc):**

Inject environment variables at serve time:

```javascript
// server.js
app.get('/', (req, res) => {
  const html = fs.readFileSync('index.html', 'utf8')
    .replace('{{API_URL}}', process.env.API_URL || 'http://localhost:3000');
  res.send(html);
});
```

## Application Structure

### Required Files

Every application should include:

```
app-name/
├── README.md           # Installation, configuration, usage
├── .env.example        # Example environment variables
├── package.json        # Dependencies (with description, repository)
├── .gitignore         # Ignore .env, node_modules, etc.
└── LICENSE            # Open source license (if sharing)
```

### README Template

```markdown
# Application Name

Brief description.

## Features
- Feature list

## Installation
```bash
npm install
cp .env.example .env
# Edit .env with your settings
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| PORT     | Web server port | 3000 |
| HOST     | Hostname | localhost |

## Usage
```bash
npm start
```

## Development

Built for M/Y Becoming but designed to be portable and reusable.

Repository: https://github.com/squidmarks/becoming
```

## Service Integration

### Reverse Proxy Compatibility

Applications should work both:
1. **Direct access** - `http://localhost:3000/`
2. **Subpath proxy** - `http://example.com/myapp/`

**Example (frontend):**
```javascript
// Detect if served under subpath
const basePath = (() => {
  const path = window.location.pathname;
  // Check if path starts with known app name
  if (path.startsWith('/myapp')) return '/myapp';
  return '';
})();

// Use basePath for all API calls
fetch(`${basePath}/api/data`)
const eventSource = new EventSource(`${basePath}/events`);
```

### MQTT/SignalK Integration

**Good:**
```javascript
// Get broker from env
const mqtt = require('mqtt');
const client = mqtt.connect(`mqtt://${process.env.MQTT_HOST}:${process.env.MQTT_PORT}`);
```

**Bad:**
```javascript
// Hardcoded
const client = mqtt.connect('mqtt://becoming-hub:1883');
```

## Testing Portability

Before committing, test that your app works:

1. **With default .env.example** (localhost, standard ports)
2. **On different hostname** (not just becoming-hub)
3. **Under subpath** (if reverse-proxied)
4. **Standalone** (clone just app folder and run)

## Examples

### ✅ Good - Inverter Monitor

- Uses `.env` for all backend config
- Frontend uses dynamic `basePath` detection
- Works standalone or under nginx subpath
- No hardcoded "becoming-hub" references in code

### ⚠️ Needs Improvement - Vessel Hub (before fix)

- Hardcoded `http://becoming-hub:3100` in HTML
- Not portable to other deployments

### ✅ Fixed - Vessel Hub (after)

- Uses `window.location.hostname` for dynamic URLs
- Works on any hostname

## Philosophy

**"Build for Becoming, design for everyone."**

Our applications are built for a specific use case (M/Y Becoming) but should be architected to work anywhere. This makes them:
- More maintainable (env-based config is clearer)
- More testable (easy to run locally)
- More valuable (others can use them)
- Better documented (assumptions are explicit)

---

*Remember: Future you (or someone else) should be able to clone any app from this repo and run it on their own boat with minimal configuration changes.*
