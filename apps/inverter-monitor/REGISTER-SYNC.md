# Register Definition Sync

## Problem
The register definitions exist in two places:
- `registers.js` (backend source of truth)
- `public/index.html` (frontend copy for UI rendering)

Having definitions in two places causes sync issues and bugs.

## Solution
Use the provided sync script to keep them in sync.

## Workflow

### When you modify register definitions:

1. **Edit `registers.js`** with your changes
2. **Run the sync script**:
   ```bash
   node sync-registers.js
   ```
3. **Verify they're in sync**:
   ```bash
   node verify-registers-sync.js
   ```
4. **Commit both files**:
   ```bash
   git add registers.js public/index.html
   git commit -m "Update register definitions"
   ```

### Before committing:
Always run `node verify-registers-sync.js` to ensure the files are in sync.

## Future Improvement
Eventually, the frontend should fetch register definitions from an API endpoint (`/api/registers/:category`) instead of having them hardcoded. This would eliminate the need for manual syncing.
