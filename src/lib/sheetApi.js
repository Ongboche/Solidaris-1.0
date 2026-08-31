const DEFAULT_SHEET_API_URL = import.meta.env.VITE_SHEET_API_URL || "https://script.google.com/macros/s/AKfycbx514VvonoizSv8HjP-pQekMRzCaWpU4PTcoPehGUkOyzegg1i7FefqZiiqzfXa85Q/exec";

export const SHEET_API_URL = DEFAULT_SHEET_API_URL;

export function normalizeProject(project) {
  if (!project) return null;

  const assessment = (() => {
    try {
      return typeof project.assessment === 'string' ? JSON.parse(project.assessment) : (project.assessment || { domains: {}, integrity: {} });
    } catch (error) {
      return { domains: {}, integrity: {} };
    }
  })();

  const integrity = (() => {
    try {
      return typeof project.integrity === 'string' ? JSON.parse(project.integrity) : (project.integrity || { washingRisk: 'Medium', powerRisk: 'Medium' });
    } catch (error) {
      return { washingRisk: 'Medium', powerRisk: 'Medium' };
    }
  })();

  return {
    ...project,
    assessment: {
      domains: assessment.domains || {},
      integrity: {
        alignmentContradiction: integrity.alignmentContradiction || '',
        burdenBearer: integrity.burdenBearer || '',
        voiceReality: integrity.voiceReality || '',
        washingRisk: integrity.washingRisk || 'Medium',
        powerRisk: integrity.powerRisk || 'Medium',
      },
    },
    reviewerIds: Array.isArray(project.reviewerIds)
      ? project.reviewerIds
      : String(project.reviewerIds || '').split(',').filter(Boolean),
    comments: project.comments || [],
  };
}

export async function sheetApi(action, payload = {}) {
  if (!SHEET_API_URL) {
    throw new Error('Missing VITE_SHEET_API_URL. Set it in .env or your environment before using the Google Sheet API.');
  }

  const params = new URLSearchParams({ action, ...payload });
  const response = await fetch(`${SHEET_API_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Sheet API request failed: ${response.status}`);
  }

  return response.json();
}

export async function signInWithSheet(username, password) {
  const result = await sheetApi('signin', { username, password });
  if (!result.ok) throw new Error(result.error || 'Invalid username or password');
  return result.user;
}

export async function createUserWithSheet(userData) {
  const result = await sheetApi('createUser', userData);
  if (!result.ok) throw new Error(result.error || 'User could not be created');
  return result.user;
}

export async function loadAllUsers() {
  const result = await sheetApi('getUsers');
  return result.users || [];
}

export async function loadAllProjects() {
  const result = await sheetApi('getProjects');
  return (result.projects || []).map(normalizeProject);
}

export async function saveProjectToSheet(project) {
  const payload = {
    projectId: project.id,
    name: project.name || '',
    funder: project.funder || '',
    country: project.country || '',
    sector: project.sector || '',
    assessorName: project.assessorName || '',
    assessmentJson: JSON.stringify(project.assessment || { domains: {}, integrity: {} }),
    integrityJson: JSON.stringify(project.assessment?.integrity || { washingRisk: 'Medium', powerRisk: 'Medium' }),
    commentsJson: JSON.stringify(project.comments || []),
  };

  const result = await sheetApi('saveProject', payload);
  if (!result.ok) throw new Error(result.error || 'Project could not be saved');
  return result;
}

export async function createProjectInSheet(projectInput) {
  const result = await sheetApi('createProject', projectInput);
  if (!result.ok) throw new Error(result.error || 'Project could not be created');
  return result.projectId;
}

export async function assignReviewerToSheet(projectId, reviewerId) {
  const result = await sheetApi('assignReviewer', { projectId, reviewerId });
  if (!result.ok) throw new Error(result.error || 'Reviewer could not be assigned');
  return result.reviewerIds || [];
}
