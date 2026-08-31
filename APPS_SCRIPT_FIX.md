# 🔧 Google Apps Script Fix

## Problem
You're seeing these errors when testing:
- `"Project not found"` when trying to save projects
- `"Cannot read properties of undefined (reading '6')"`

## Root Cause
There's a bug in the `saveProjectFromParams()` function in the Apps Script. It's using incorrect array indices to access row data.

### The Bug (Line 13-21 in saveProjectFromParams)
```javascript
// ❌ WRONG - uses rowIndex + 1
rows[rowIndex + 1][6] || new Date().toISOString(),
rows[rowIndex + 1][7] || '',
rows[rowIndex + 1][8] || '',
// ...
rows[rowIndex + 1][11] || '',
rows[rowIndex + 1][12] || '',
rows[rowIndex + 1][13] || 'active',
```

### The Fix
```javascript
// ✅ CORRECT - uses rowIndex (no +1)
rows[rowIndex][6] || new Date().toISOString(),
rows[rowIndex][7] || '',
rows[rowIndex][8] || '',
// ...
rows[rowIndex][11] || '',
rows[rowIndex][12] || '',
rows[rowIndex][13] || 'active',
```

Also change the last line from:
```javascript
// ❌ WRONG
sheet.getRange(rowIndex + 2, 1, 1, headers.length).setValues([data]);

// ✅ CORRECT
sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([data]);
```

## How to Apply the Fix

### Step 1: Open Google Apps Script
1. Go to your Google Sheet
2. Click **Tools** → **Script editor**

### Step 2: Find and Replace
1. Use Ctrl+H (or Cmd+H) to open Find and Replace
2. Find: `rows[rowIndex + 1]`
3. Replace with: `rows[rowIndex]`
4. Click **Replace All**

### Step 3: Fix the Last Line
Find: `sheet.getRange(rowIndex + 2,`
Replace with: `sheet.getRange(rowIndex + 1,`

### Step 4: Save and Deploy
1. Click the **Deploy** button (cloud icon with arrow)
2. Select **New deployment**
3. Type: **Web app**
4. Execute as: **Your Google Account**
5. Who has access: **Anyone**
6. Click **Deploy**
7. Copy the new deployment URL

### Step 5: Update Configuration (If URL Changed)
If you got a new deployment URL, update:
- `.env` file: `VITE_SHEET_API_URL=<new-url>`
- `.env.example` file (same URL)
- `solidaris_chrome.html` line with `SHEET_API_URL` (search for it)

### Step 6: Test Again
Go back to [test-sheet-api.html](test-sheet-api.html) and run the **Full Data Flow Test** again.

## Expected Success
After the fix, you should see:
```json
{
  "ok": true,
  "projectId": "proj_1234567890"
}
```

And the data will appear in your Google Sheet's **projects** tab.

---

## Complete Fixed Function (Paste This)

If you prefer to just copy-paste the whole fixed function:

```javascript
function saveProjectFromParams(params) {
  const projectId = String(params.projectId || '').trim();
  const sheet = getSheet('projects');
  const rows = sheet.getDataRange().getValues();
  if (!rows.length) return { ok: false, error: 'No project rows found' };

  const headers = rows[0];
  const rowIndex = rows.findIndex((row) => row[0] === projectId);
  if (rowIndex === -1) return { ok: false, error: 'Project not found' };

  const data = [
    projectId,
    String(params.name || '').trim(),
    String(params.funder || '').trim(),
    String(params.country || '').trim(),
    String(params.sector || '').trim(),
    String(params.assessorName || '').trim(),
    rows[rowIndex][6] || new Date().toISOString(),
    rows[rowIndex][7] || '',
    rows[rowIndex][8] || '',
    params.assessmentJson || '{}',
    params.integrityJson || '{}',
    rows[rowIndex][11] || '',
    rows[rowIndex][12] || '',
    rows[rowIndex][13] || 'active',
    params.commentsJson || '[]'
  ];

  sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([data]);
  return { ok: true, projectId };
}
```

Replace the entire `saveProjectFromParams` function in your Apps Script with this version.
