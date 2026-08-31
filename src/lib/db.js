export const STORAGE_KEY = "solidaris:db:v1";

const seededUsers = [
  { id: "owner1", username: "owner1", fullName: "Project Owner", email: "owner@solidaris.ca", password: "owner123", role: "owner", createdAt: "2026-01-10T09:00:00.000Z", consent: { dataProtection: true, dataHandling: true, emailNotifications: true }, preferences: { emailAlerts: true } },
  { id: "reviewer1", username: "reviewer1", fullName: "Reviewer A", email: "reviewer.a@solidaris.ca", password: "review123", role: "reviewer", createdAt: "2026-01-12T10:00:00.000Z", consent: { dataProtection: true, dataHandling: true, emailNotifications: true }, preferences: { emailAlerts: true } },
  { id: "reviewer2", username: "reviewer2", fullName: "Reviewer B", email: "reviewer.b@solidaris.ca", password: "review123", role: "reviewer", createdAt: "2026-01-12T11:00:00.000Z", consent: { dataProtection: true, dataHandling: true, emailNotifications: true }, preferences: { emailAlerts: true } },
];

export function buildEmptyAssessment() {
  const domains = {};
  Object.keys(ALL_DOMAIN_IDS).forEach((id) => {
    domains[id] = { rating: 0, responses: Array(3).fill(""), evidenceType: "", evidenceSummary: "", confidence: "" };
  });
  return {
    domains,
    integrity: {
      alignmentContradiction: "",
      burdenBearer: "",
      voiceReality: "",
      washingRisk: "Medium",
      powerRisk: "Medium",
    },
  };
}

export function makeDemoProject(id, ownerId, name, funder, country, reviewerIds = []) {
  const assessment = buildEmptyAssessment();
  const domainIds = Object.keys(ALL_DOMAIN_IDS);
  domainIds.forEach((domainId, index) => {
    assessment.domains[domainId].rating = [2, 3, 4, 2, 3, 4, 3, 4, 2][index] || 2;
    assessment.domains[domainId].evidenceSummary = `Sample evidence for ${name}: ${domainId}. Observed local participation and implementation indicators remain relevant to a manual validation.`;
    assessment.domains[domainId].confidence = ["Low", "Medium", "High"][index % 3];
    assessment.domains[domainId].evidenceType = ["Interviews", "Documents", "Mixed"][index % 3];
    assessment.domains[domainId].responses = [
      `Context note ${index + 1}`,
      `Implementation note ${index + 1}`,
      `Outcome note ${index + 1}`,
    ];
  });
  return {
    id,
    name,
    funder,
    country,
    sector: "Health",
    assessorName: "Internal review team",
    createdAt: new Date().toISOString(),
    ownerId,
    reviewerIds,
    assessment,
    aiSummary: null,
    aiGeneratedAt: null,
  };
}

export const ALL_DOMAIN_IDS = {
  d1: "Equity & Justice",
  d2: "Common Good Orientation",
  d3: "Mutual Responsibility",
  d4: "Power Transformation",
  d5: "Inclusive Participation",
  d6: "Transparency & Accountability",
  d7: "Sustainability & Sovereignty",
  d8: "Relational Trust",
  d9: "Transformative Impact",
};

export function defaultDb() {
  return {
    users: seededUsers,
    projects: [
      makeDemoProject("proj_owner_demo", "owner1", "Community Health Equity Initiative", "Ministry of Health", "Kenya", ["reviewer1", "reviewer2"]),
      makeDemoProject("proj_reviewer_demo", "reviewer2", "Rural Wellness Continuity Programme", "Local NGO Network", "Uganda", ["reviewer1"]),
    ],
    notifications: [
      {
        id: "note_seed_1",
        type: "welcome",
        title: "Welcome to Solidaris Team",
        message: "Your account has been set up and email notifications are enabled for project communications.",
        origin: "Solidaris Team",
        recipientUserId: "owner1",
        projectId: null,
        createdAt: new Date().toISOString(),
        isRead: false,
      },
    ],
    sessionUserId: null,
  };
}

export function loadDb() {
  const raw = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : defaultDb();
  const db = {
    users: parsed.users || seededUsers,
    projects: parsed.projects || [],
    notifications: parsed.notifications || [],
    sessionUserId: parsed.sessionUserId || null,
  };
  if (typeof window !== "undefined") {
    window.__SOLIDARIS_DB__ = db;
  }
  return db;
}

export function saveDb(db) {
  if (typeof window === "undefined") return db;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  window.__SOLIDARIS_DB__ = db;
  return db;
}

export function getUserById(db, userId) {
  return db.users.find((user) => user.id === userId) || null;
}

export function getUserProjects(db, userId) {
  return (db.projects || []).filter((project) => {
    const ownerMatch = project.ownerId === userId;
    const reviewerMatch = Array.isArray(project.reviewerIds) && project.reviewerIds.includes(userId);
    return ownerMatch || reviewerMatch;
  });
}

export function createNotification(db, notification) {
  const item = {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: notification.type || "project_update",
    title: notification.title || "Solidaris Team update",
    message: notification.message || "A project update has been recorded.",
    origin: notification.origin || "Solidaris Team",
    recipientUserId: notification.recipientUserId || null,
    projectId: notification.projectId || null,
    createdAt: new Date().toISOString(),
    isRead: false,
  };

  return {
    ...db,
    notifications: [item, ...(db.notifications || [])],
  };
}

export function addProjectComment(db, projectId, authorUser, message, type = "comment") {
  const trimmed = String(message || "").trim();
  if (!trimmed) {
    return { ok: false, error: "A review or comment is required." };
  }

  const item = {
    id: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    authorId: authorUser.id,
    authorName: authorUser.fullName || authorUser.username,
    type,
    content: trimmed,
    createdAt: new Date().toISOString(),
  };

  const nextDb = {
    ...db,
    projects: (db.projects || []).map((project) => project.id === projectId
      ? { ...project, comments: [item, ...(project.comments || [])] }
      : project),
  };

  return {
    ok: true,
    db: nextDb,
    comment: item,
  };
}

export function createUser(db, payload) {
  const trimmedUsername = String(payload.username || "").trim();
  const trimmedPassword = String(payload.password || "").trim();
  const trimmedName = String(payload.fullName || payload.username || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const consent = payload.consent || {};

  if (!trimmedUsername || !trimmedPassword || !email) {
    return { ok: false, error: "Username, email, and password are required." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please provide a valid email address." };
  }

  if (consent.dataProtection !== true || consent.dataHandling !== true || consent.emailNotifications !== true) {
    return { ok: false, error: "You must agree to the data protection notice before creating an account." };
  }

  if (db.users.some((user) => user.username.toLowerCase() === trimmedUsername.toLowerCase() || user.email?.toLowerCase() === email)) {
    return { ok: false, error: "This username or email is already in use." };
  }

  const user = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    username: trimmedUsername,
    fullName: trimmedName || trimmedUsername,
    email,
    password: trimmedPassword,
    role: payload.role === "owner" ? "owner" : "reviewer",
    createdAt: new Date().toISOString(),
    consent: {
      dataProtection: true,
      dataHandling: true,
      emailNotifications: true,
    },
    preferences: {
      emailAlerts: true,
    },
  };

  const nextDb = { ...db, users: [...db.users, user] };
  return {
    ok: true,
    user,
    db: {
      ...nextDb,
      notifications: [
        {
          id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: "account_created",
          title: "Account created",
          message: `Welcome to Solidaris Team. An email confirmation has been prepared for ${user.email}.`,
          origin: "Solidaris Team",
          recipientUserId: user.id,
          projectId: null,
          createdAt: new Date().toISOString(),
          isRead: false,
        },
        ...(nextDb.notifications || []),
      ],
    },
  };
}

export function signInUser(db, username, password) {
  const trimmedUsername = String(username || "").trim();
  const trimmedPassword = String(password || "").trim();
  const user = db.users.find(
    (entry) => entry.username.toLowerCase() === trimmedUsername.toLowerCase() && entry.password === trimmedPassword,
  );

  if (!user) {
    return { ok: false, error: "Invalid username or password." };
  }

  return { ok: true, user, db: { ...db, sessionUserId: user.id } };
}

export function createProjectRecord(db, ownerUser, projectName = "Untitled programme") {
  const project = {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: projectName,
    funder: "",
    country: "",
    sector: "",
    assessorName: ownerUser.fullName || ownerUser.username,
    createdAt: new Date().toISOString(),
    ownerId: ownerUser.id,
    reviewerIds: [ownerUser.id],
    assessment: {
      domains: Object.fromEntries(
        Object.keys(ALL_DOMAIN_IDS).map((domainId) => [
          domainId,
          {
            rating: 0,
            responses: Array(3).fill(""),
            evidenceType: "",
            evidenceSummary: "",
            confidence: "",
          },
        ]),
      ),
      integrity: {
        alignmentContradiction: "",
        burdenBearer: "",
        voiceReality: "",
        washingRisk: "Medium",
        powerRisk: "Medium",
      },
    },
    aiSummary: null,
    aiGeneratedAt: null,
  };

  return { ok: true, project, db: { ...db, projects: [project, ...(db.projects || [])] } };
}

export function addReviewerToProject(db, projectId, reviewerId) {
  const nextProjects = (db.projects || []).map((project) => {
    if (project.id !== projectId) return project;
    const reviewerIds = new Set(project.reviewerIds || []);
    reviewerIds.add(reviewerId);
    return { ...project, reviewerIds: [...reviewerIds] };
  });
  return { ...db, projects: nextProjects };
}

export function upsertProject(db, project) {
  const nextProjects = (db.projects || []).map((entry) => (entry.id === project.id ? project : entry));
  return { ...db, projects: nextProjects };
}
