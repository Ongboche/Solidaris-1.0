# Google Sheets + Apps Script setup for Solidaris

This project is ready to connect to a shared Google Sheet-backed data layer using a lightweight Apps Script web API.

## 1) Create the Google Sheet

Use the sheet here:

https://docs.google.com/spreadsheets/d/1hiI3Op6DiaZu_LXS6PDoxzmMyKWAT_FOG8pDIzgDOiw/edit?usp=sharing

Create the following tabs:

### users
Headers:

id,username,fullName,email,password,role,createdAt,consent_dataProtection,consent_dataHandling,consent_emailNotifications

### projects
Headers:

id,name,funder,country,sector,assessorName,createdAt,ownerId,reviewerIds,assessmentJson,integrityJson,aiSummary,aiGeneratedAt,status,commentsJson

### notifications
Headers:

id,type,title,message,origin,recipientUserId,projectId,createdAt

### invites
Headers:

id,projectId,email,status

## 2) Apps Script deployment

Open Google Apps Script from the Google Sheet and paste the following code:

```javascript
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = (params.action || '').toString();

  try {
    switch (action) {
      case 'signin':
        return jsonResponse({ ok: true, user: signIn(params.username, params.password) });
      case 'getUsers':
        return jsonResponse({ ok: true, users: readSheetAsObjects('users') });
      case 'getProjects':
        return jsonResponse({ ok: true, projects: readSheetAsObjects('projects') });
      case 'createUser':
        return jsonResponse(createUserFromParams(params));
      case 'createProject':
        return jsonResponse(createProjectFromParams(params));
      case 'saveProject':
        return jsonResponse(saveProjectFromParams(params));
      case 'assignReviewer':
        return jsonResponse(assignReviewer(params.projectId, params.reviewerId));
      default:
        return jsonResponse({ ok: false, error: 'Unknown action' });
    }
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function readSheetAsObjects(name) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];

  const headers = values[0];
  return values.slice(1)
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
}

function ensureHeaders(sheet, headers) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    sheet.appendRow(headers);
    return;
  }

  const firstRow = values[0];
  const missing = headers.filter((header) => !firstRow.includes(header));
  if (missing.length) {
    const nextColumn = firstRow.length + 1;
    sheet.getRange(1, nextColumn, 1, missing.length).setValues([missing]);
  }
}

function signIn(username, password) {
  const users = readSheetAsObjects('users');
  const match = users.find((user) => {
    return String(user.username || '').trim().toLowerCase() === String(username || '').trim().toLowerCase() && String(user.password || '') === String(password || '');
  });

  if (!match) throw new Error('Invalid username or password');
  return match;
}

function createUserFromParams(params) {
  const username = String(params.username || '').trim();
  const password = String(params.password || '').trim();
  const fullName = String(params.fullName || '').trim();
  const email = String(params.email || '').trim();
  const role = String(params.role || 'reviewer');

  if (!username || !password || !fullName || !email) {
    return { ok: false, error: 'Missing required user fields' };
  }

  const users = readSheetAsObjects('users');
  const duplicate = users.find((user) => user.username.toLowerCase() === username.toLowerCase() || user.email.toLowerCase() === email.toLowerCase());
  if (duplicate) {
    return { ok: false, error: 'Username or email already exists' };
  }

  const sheet = getSheet('users');
  ensureHeaders(sheet, ['id','username','fullName','email','password','role','createdAt','consent_dataProtection','consent_dataHandling','consent_emailNotifications']);

  const row = [
    'user_' + Date.now(),
    username,
    fullName,
    email,
    password,
    role,
    new Date().toISOString(),
    'TRUE',
    'TRUE',
    'TRUE'
  ];

  sheet.appendRow(row);
  return { ok: true, user: { id: row[0], username, fullName, email, role } };
}

function createProjectFromParams(params) {
  const name = String(params.name || '').trim();
  const funder = String(params.funder || '').trim();
  const country = String(params.country || '').trim();
  const sector = String(params.sector || '').trim();
  const assessorName = String(params.assessorName || '').trim();
  const ownerId = String(params.ownerId || '').trim();

  if (!name || !ownerId) {
    return { ok: false, error: 'Project name and owner are required' };
  }

  const projectId = 'proj_' + Date.now();
  const assessment = { domains: {}, integrity: { washingRisk: 'Medium', powerRisk: 'Medium' } };
  ['d1','d2','d3','d4','d5','d6','d7','d8','d9'].forEach((domainId) => {
    assessment.domains[domainId] = {
      rating: 0,
      responses: ['', '', ''],
      evidenceType: '',
      evidenceSummary: '',
      confidence: ''
    };
  });

  const sheet = getSheet('projects');
  ensureHeaders(sheet, ['id','name','funder','country','sector','assessorName','createdAt','ownerId','reviewerIds','assessmentJson','integrityJson','aiSummary','aiGeneratedAt','status','commentsJson']);

  sheet.appendRow([
    projectId,
    name,
    funder,
    country,
    sector,
    assessorName,
    new Date().toISOString(),
    ownerId,
    '',
    JSON.stringify(assessment),
    JSON.stringify(assessment.integrity),
    '',
    '',
    'active',
    '[]'
  ]);

  return { ok: true, projectId };
}

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

function assignReviewer(projectId, reviewerId) {
  const sheet = getSheet('projects');
  const rows = sheet.getDataRange().getValues();
  if (!rows.length) return { ok: false, error: 'No data available' };

  const target = rows.find((row) => row[0] === projectId);
  if (!target) return { ok: false, error: 'Project not found' };

  const rowIndex = rows.indexOf(target);
  const current = String(target[8] || '').trim();
  const reviewerIds = current ? current.split(',').filter(Boolean) : [];
  if (!reviewerIds.includes(reviewerId)) {
    reviewerIds.push(reviewerId);
  }

  const rowValues = [...target];
  rowValues[8] = reviewerIds.join(',');
  sheet.getRange(rowIndex + 2, 1, 1, rowValues.length).setValues([rowValues]);
  return { ok: true, reviewerIds };
}
```

## 3) Deploy the script

1. In Apps Script, click Deploy > New deployment
2. Select Web app
3. Set access to Anyone
4. Copy the web app URL
5. Put it into `.env` as:

```env
VITE_SHEET_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

## 4) Connect the front-end

Use the helper in [src/lib/sheetApi.js](src/lib/sheetApi.js) and point it at the deployed Apps Script URL.

## 5) Shared-use behavior

This setup enables:

- shared users table
- shared projects table
- review assignments by reviewerIds
- project-specific access filtering
- demo collaboration across multiple browsers/computers

## 6) Notes

This is still a temporary shared-demo setup, not a production database.
If you later want real auth and multi-user secure access, move this to Supabase or Firebase.
