import React, { useMemo, useState, useEffect } from "react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip
} from "recharts";
import {
  Plus, ChevronRight, ChevronLeft, FileText, ShieldAlert,
  Save, ArrowLeft, Sparkles, LogOut, FolderOpen
} from "lucide-react";
import {
  ALL_DOMAIN_IDS,
  addProjectComment,
  createNotification,
  createProjectRecord,
  createUser,
  getUserProjects,
  loadDb,
  saveDb,
  signInUser,
} from "./lib/db";
import { saveProjectToSheet, SHEET_API_URL } from "./lib/sheetApi";

const TRIADS = [
  { key: "what", label: "WHAT", sub: "Orientation", color: "#2F6F5E", domains: [
    { id: "d1", name: "Equity & Justice", prompts: ["Prioritisation of underserved groups", "Need-based allocation", "Root cause inequality analysis"] },
    { id: "d2", name: "Common Good Orientation", prompts: ["Collective outcomes", "Open access to public goods", "Public system strengthening"] },
    { id: "d3", name: "Mutual Responsibility", prompts: ["Shared accountability", "Risk distribution", "Reciprocal obligations"] },
  ] },
  { key: "how", label: "HOW", sub: "Process", color: "#B0782E", domains: [
    { id: "d4", name: "Power Transformation", prompts: ["Decision-making power sharing", "Funding control", "Authority transfer over time"] },
    { id: "d5", name: "Inclusive Participation", prompts: ["Community inclusion", "Marginalised voice", "Accessible participation"] },
    { id: "d6", name: "Transparency & Accountability", prompts: ["Open information", "Community accountability", "Honest reporting"] },
  ] },
  { key: "end", label: "TO WHAT END", sub: "Outcomes", color: "#5B4C8A", domains: [
    { id: "d7", name: "Sustainability & Sovereignty", prompts: ["Local system strengthening", "Transition plan", "Alignment with local priorities"] },
    { id: "d8", name: "Relational Trust", prompts: ["Partnership quality", "Mutual respect", "Trust development"] },
    { id: "d9", name: "Transformative Impact", prompts: ["Systemic change", "Norms and policy shifts", "Challenge to inequity"] },
  ] },
];

const ALL_DOMAINS = TRIADS.flatMap((t) => t.domains.map((d) => ({ ...d, triad: t.key, triadColor: t.color, triadLabel: t.label })));
const CONFIDENCE_LEVELS = ["Low", "Medium", "High"];
const EVIDENCE_TYPES = ["Interviews", "Observations", "Documents", "Financial records", "Mixed"];
const RATING_LABELS = { 0: "Not scored", 1: "Emerging", 2: "Partial", 3: "Developing", 4: "Consistent", 5: "Exemplary" };
const TEAM_EXPORT_NAME = "solidaris-team-report";

function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function exportTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildTeamReport(project) {
  const domainLines = Object.entries(project.assessment.domains).map(([domainId, domain]) => {
    const label = ALL_DOMAIN_IDS[domainId] || domainId;
    return `- ${label}: ${domain.rating}/5 | Confidence: ${domain.confidence || "N/A"} | Evidence: ${domain.evidenceSummary || "Not documented"}`;
  });

  return [
    "SOLIDARIS Team Report",
    `Project: ${project.name || "Untitled"}`,
    `Funder: ${project.funder || "N/A"}`,
    `Country: ${project.country || "N/A"}`,
    `Owner: ${project.assessorName || "N/A"}`,
    "",
    "Domain scores:",
    ...domainLines,
    "",
    `Risk summary: ${project.assessment.integrity.washingRisk} solidarity-washing risk and ${project.assessment.integrity.powerRisk} power-imbalance risk.`,
    "Manual validation required before final sign-off.",
  ].join("\n");
}

function buildAiSummary(project) {
  const domainScores = Object.values(project.assessment.domains).map((d) => Number(d.rating || 0));
  const overall = average(domainScores);
  const highRisk = Object.entries(project.assessment.domains)
    .filter(([id, item]) => Number(item.rating || 0) <= 2)
    .map(([id]) => ALL_DOMAIN_IDS[id] || id)
    .slice(0, 3);
  const evidenceSnippets = Object.values(project.assessment.domains)
    .map((d) => d.evidenceSummary)
    .filter(Boolean)
    .join(" ");

  const themeWords = (evidenceSnippets.toLowerCase().match(/\b(community|participation|power|trust|evidence|transparency|equity|risk|sustainability|accountability)\b/g) || [])
    .reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {});

  const dominantThemes = Object.entries(themeWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word);

  const summary = [
    "Optional AI-assisted synthesis (for owner validation only)",
    `Average domain score: ${overall.toFixed(1)}/5`,
    `Highest-risk areas: ${highRisk.length ? highRisk.join(", ") : "No critical domains flagged"}`,
    `Dominant themes: ${dominantThemes.length ? dominantThemes.join(", ") : "No clear numeric pattern"}`,
    "",
    "Interpretation:",
    `The assessment suggests ${overall >= 3.5 ? "stronger solidarity conditions" : overall >= 2.5 ? "moderate but uneven solidarity conditions" : "significant gaps in solidarity conditions"}.`,
    `The strongest evidence appears to cluster around ${dominantThemes.length ? dominantThemes.join(", ") : "programme implementation and local accountability"}.`,
    `The lower-scoring domains are likely to require targeted validation before interpreting the programme as genuinely solidarity-oriented.`,
    "",
    "Recommendation: review the AI summary side-by-side with the team report and confirm the manual evidence synthesis before final approval.",
  ].join("\n");

  return summary;
}

function calculateIndex(project) {
  const values = Object.values(project.assessment.domains).map((d) => Number(d.rating || 0));
  if (!values.length) return 0;
  return (average(values) / 5) * 100;
}

function emptyProject() {
  return {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    funder: "",
    country: "",
    sector: "",
    assessorName: "",
    createdAt: new Date().toISOString(),
    ownerId: "",
    reviewerIds: [],
    assessment: {
      domains: Object.fromEntries(Object.keys(ALL_DOMAIN_IDS).map((id) => [
        id,
        { rating: 0, responses: ["", "", ""], evidenceType: "", evidenceSummary: "", confidence: "" },
      ])),
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
}

export default function App() {
  const [db, setDb] = useState(loadDb);
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({ username: "", password: "", fullName: "", email: "", role: "reviewer", consent: { dataProtection: false, dataHandling: false, emailNotifications: false } });
  const [authError, setAuthError] = useState("");
  const [view, setView] = useState("auth");
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [domainIndex, setDomainIndex] = useState(0);
  const [reviewDraft, setReviewDraft] = useState("");
  const [saveState, setSaveState] = useState("idle");

  const currentUser = useMemo(
    () => db.users.find((user) => user.id === db.sessionUserId) || null,
    [db],
  );

  const myProjects = useMemo(
    () => currentUser ? getUserProjects(db, currentUser.id) : [],
    [db, currentUser],
  );

  const activeProject = db.projects.find((project) => project.id === activeProjectId) || null;

  const syncProjectToSheet = async (project) => {
    if (!SHEET_API_URL) return; // Skip if no sheet URL configured
    try {
      await saveProjectToSheet(project);
    } catch (error) {
      console.warn("Sheet sync failed (will retry on next save):", error.message);
    }
  };

  const persistDb = (nextDb) => {
    setSaveState("saving");
    const saved = saveDb(nextDb);
    setDb(saved);
    
    // Sync all projects to sheet in background
    if (SHEET_API_URL && saved.projects) {
      saved.projects.forEach((project) => {
        syncProjectToSheet(project).catch(() => {});
      });
    }
    
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 900);
  };

  const updateProject = (projectId, patch) => {
    const nextDb = {
      ...db,
      projects: db.projects.map((project) => (project.id === projectId ? { ...project, ...patch } : project)),
    };
    persistDb(nextDb);
  };

  const updateProjectDomain = (projectId, domainId, patch) => {
    const nextDb = {
      ...db,
      projects: db.projects.map((project) => {
        if (project.id !== projectId) return project;
        const nextAssessment = { ...project.assessment };
        nextAssessment.domains = { ...project.assessment.domains, [domainId]: { ...project.assessment.domains[domainId], ...patch } };
        return { ...project, assessment: nextAssessment };
      }),
    };
    persistDb(nextDb);
  };

  const updateProjectIntegrity = (projectId, patch) => {
    const nextDb = {
      ...db,
      projects: db.projects.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          assessment: {
            ...project.assessment,
            integrity: { ...project.assessment.integrity, ...patch },
          },
        };
      }),
    };
    persistDb(nextDb);
  };

  const handleSignIn = () => {
    const result = signInUser(db, authForm.username, authForm.password);
    if (!result.ok) {
      setAuthError(result.error);
      return;
    }
    const nextDb = { ...db, sessionUserId: result.user.id };
    persistDb(nextDb);
    setAuthError("");
    setView("dashboard");
  };

  const notifyOwnerOfSubmission = (project, reviewerUser, message) => {
    if (!project || !project.ownerId || !reviewerUser) return;

    const notification = {
      type: "review_submission",
      title: "New review submitted",
      message: `${reviewerUser.fullName || reviewerUser.username} submitted a review on ${project.name || "the project"}: ${message}`,
      origin: "Solidaris Team",
      recipientUserId: project.ownerId,
      projectId: project.id,
    };

    const updatedDb = createNotification(db, notification);
    persistDb(updatedDb);
  };

  const handleSubmitReview = () => {
    if (!currentUser || !activeProject) return;
    const text = reviewDraft.trim();
    if (!text) return;

    const added = addProjectComment(db, activeProject.id, currentUser, text, currentUser.role === "owner" ? "owner_update" : "review");
    if (!added.ok) {
      setAuthError(added.error);
      return;
    }

    const updatedDb = {
      ...added.db,
      notifications: [
        {
          id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: "review_submission",
          title: currentUser.role === "owner" ? "Project update logged" : "New review submitted",
          message: currentUser.role === "owner"
            ? `${currentUser.fullName || currentUser.username} added a project update for ${activeProject.name || "the project"}.`
            : `${currentUser.fullName || currentUser.username} submitted a review for ${activeProject.name || "the project"}.`,
          origin: "Solidaris Team",
          recipientUserId: activeProject.ownerId,
          projectId: activeProject.id,
          createdAt: new Date().toISOString(),
          isRead: false,
        },
        ...(added.db.notifications || []),
      ],
    };

    persistDb(updatedDb);
    setReviewDraft("");
    setAuthError("");
  };

  const handleSignUp = () => {
    const result = createUser(db, {
      username: authForm.username,
      password: authForm.password,
      fullName: authForm.fullName,
      email: authForm.email,
      role: authForm.role,
      consent: authForm.consent,
    });
    if (!result.ok) {
      setAuthError(result.error);
      return;
    }
    const nextDb = { ...result.db, sessionUserId: result.user.id };
    persistDb(nextDb);
    setAuthError("");
    setView("dashboard");
  };

  const handleCreateProject = () => {
    if (!currentUser || currentUser.role !== "owner") {
      setAuthError("Only project owners can create new projects.");
      return;
    }

    const result = createProjectRecord(db, currentUser, "New programme");
    persistDb({ ...result.db, sessionUserId: currentUser.id });
    const created = result.project;
    setActiveProjectId(created.id);
    setView("context");
    setDomainIndex(0);
  };

  const handleGenerateAiSummary = () => {
    if (!currentUser || currentUser.role !== "owner" || !activeProject) return;
    const summary = buildAiSummary(activeProject);
    const nextDb = {
      ...db,
      projects: db.projects.map((project) => (project.id === activeProject.id ? { ...project, aiSummary: summary, aiGeneratedAt: new Date().toISOString() } : project)),
    };
    const updateNotification = {
      type: "ai_summary",
      title: "AI synthesis generated",
      message: `The owner AI summary for ${activeProject.name || "the project"} has been generated and is ready for review.`,
      origin: "Solidaris Team",
      recipientUserId: currentUser.id,
      projectId: activeProject.id,
    };
    persistDb({
      ...nextDb,
      notifications: [
        {
          id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ...updateNotification,
          createdAt: new Date().toISOString(),
          isRead: false,
        },
        ...(nextDb.notifications || []),
      ],
    });
  };

  const handleExportTeam = () => {
    if (!activeProject) return;
    exportTextFile(`${(activeProject.name || "solidaris-team-report").replace(/\s+/g, "-")}.txt`, buildTeamReport(activeProject));
  };

  const handleExportAi = () => {
    if (!activeProject || !activeProject.aiSummary) return;
    exportTextFile(`${(activeProject.name || "solidaris-ai-report").replace(/\s+/g, "-")}-ai.txt`, activeProject.aiSummary);
  };

  const signOut = () => {
    persistDb({ ...db, sessionUserId: null });
    setView("auth");
    setAuthForm({ username: "", password: "", fullName: "", email: "", role: "reviewer", consent: { dataProtection: false, dataHandling: false, emailNotifications: false } });
    setAuthError("");
  };

  if (!currentUser && view !== "auth") {
    setView("auth");
  }

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#20261F]" style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui" }}>
      <Header
        currentUser={currentUser}
        saveState={saveState}
        signOut={signOut}
        onBack={() => {
          if (view === "context") {
            setView("dashboard");
          } else if (view === "assess") {
            setView("context");
          } else if (view === "profile" || view === "report") {
            setView("dashboard");
          }
        }}
        showBack={view !== "auth" && view !== "dashboard"}
      />

      <main className="max-w-6xl mx-auto px-6 pb-20 pt-8">
        {view === "auth" && (
          <AuthView
            authMode={authMode}
            setAuthMode={setAuthMode}
            form={authForm}
            setForm={setAuthForm}
            onSubmit={authMode === "signin" ? handleSignIn : handleSignUp}
            error={authError}
          />
        )}

        {view === "dashboard" && currentUser && (
          <DashboardView
            currentUser={currentUser}
            myProjects={myProjects}
            onOpenProject={(projectId) => {
              setActiveProjectId(projectId);
              setView("context");
            }}
            onCreateProject={handleCreateProject}
          />
        )}

        {view === "context" && activeProject && (
          <ContextView
            project={activeProject}
            onChange={(patch) => updateProject(activeProject.id, patch)}
            onNext={() => {
              setDomainIndex(0);
              setView("assess");
            }}
          />
        )}

        {view === "assess" && activeProject && (
          <AssessView
            project={activeProject}
            domainIndex={domainIndex}
            setDomainIndex={setDomainIndex}
            onChangeProject={(patch) => updateProject(activeProject.id, patch)}
            onChangeDomain={(domainId, patch) => updateProjectDomain(activeProject.id, domainId, patch)}
            onChangeIntegrity={(patch) => updateProjectIntegrity(activeProject.id, patch)}
            onFinish={() => setView("profile")}
          />
        )}

        {view === "profile" && activeProject && (
          <ProfileView
            project={activeProject}
            currentUser={currentUser}
            onEdit={() => setView("assess")}
            onOpenReport={() => setView("report")}
            onGenerateAi={handleGenerateAiSummary}
            onExportTeam={handleExportTeam}
            onExportAi={handleExportAi}
          />
        )}

        {view === "report" && activeProject && (
          <ReportView
            project={activeProject}
            currentUser={currentUser}
            onBackToProfile={() => setView("profile")}
            onExportTeam={handleExportTeam}
            onExportAi={handleExportAi}
            onGenerateAi={handleGenerateAiSummary}
            reviewDraft={reviewDraft}
            setReviewDraft={setReviewDraft}
            onSubmitReview={handleSubmitReview}
          />
        )}
      </main>
    </div>
  );
}

function Header({ currentUser, saveState, signOut, showBack, onBack }) {
  return (
    <header className="border-b border-[#DAD4C4] bg-[#F6F4EF]/95 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {showBack && (
            <button onClick={onBack} className="p-1.5 rounded-full hover:bg-[#EAE5D8] transition-colors" aria-label="Back">
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
          )}
          <div>
            <div className="text-[17px] font-semibold tracking-tight">Solidaris 1.0</div>
            <div className="text-[11px] text-[#6B6250] -mt-0.5">Solidarity profiling workspace</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {currentUser && (
            <div className="flex items-center gap-2 text-[12px] text-[#4A4438]">
              <span className="px-2 py-1 rounded-full bg-white border border-[#E4DFD0]">{currentUser.fullName || currentUser.username}</span>
              <span className="text-[#6B6250] uppercase text-[10px] tracking-wide">{currentUser.role}</span>
            </div>
          )}
          {currentUser && (
            <button onClick={signOut} className="inline-flex items-center gap-1 text-[12px] text-[#6B6250] hover:text-[#20261F]">
              <LogOut size={13} /> Sign out
            </button>
          )}
          <SaveIndicator state={saveState} />
        </div>
      </div>
    </header>
  );
}

function SaveIndicator({ state }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[#6B6250]">
      <Save size={13} className={state === "saving" ? "opacity-40" : "opacity-70"} />
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
    </div>
  );
}

function AuthView({ authMode, setAuthMode, form, setForm, onSubmit, error }) {
  return (
    <div className="flex justify-center pt-10">
      <div className="w-full max-w-lg bg-white border border-[#E4DFD0] rounded-2xl p-7 shadow-sm">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setAuthMode("signin")}
            className={`flex-1 rounded-md px-3 py-2 text-[13px] font-medium ${authMode === "signin" ? "bg-[#2F6F5E] text-white" : "bg-[#F5F1EA] text-[#4A4438]"}`}
          >
            Sign in
          </button>
          <button
            onClick={() => setAuthMode("signup")}
            className={`flex-1 rounded-md px-3 py-2 text-[13px] font-medium ${authMode === "signup" ? "bg-[#2F6F5E] text-white" : "bg-[#F5F1EA] text-[#4A4438]"}`}
          >
            Sign up
          </button>
        </div>

        <h1 className="text-[28px] font-semibold mb-2">{authMode === "signin" ? "Welcome back" : "Create account"}</h1>
        <p className="text-[13px] text-[#6B6250] mb-6">
          {authMode === "signin" ? "Access your projects and review history." : "Create a reviewer or owner account to begin evaluating programmes."}
        </p>

        <div className="space-y-4">
          {authMode === "signup" && (
            <>
              <FieldInput label="Full name" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} placeholder="e.g. Amina Kibet" />
              <FieldInput label="Email address" value={form.email} onChange={(value) => setForm({ ...form, email: value })} placeholder="name@organization.ca" />
            </>
          )}
          <FieldInput label="Username" value={form.username} onChange={(value) => setForm({ ...form, username: value })} placeholder="owner1 or reviewer1" />
          <FieldInput label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} placeholder="Enter password" />
          {authMode === "signup" && (
            <>
              <label className="block">
                <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Role</div>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px] outline-none focus:border-[#2F6F5E]"
                >
                  <option value="reviewer">Reviewer</option>
                  <option value="owner">Project owner</option>
                </select>
              </label>

              <div className="rounded-lg border border-[#E4DFD0] bg-[#F9F6F1] p-4">
                <h2 className="text-[12px] font-semibold text-[#2F3B36] mb-2">Data protection and privacy notice (Canada)</h2>
                <p className="text-[11px] leading-5 text-[#4A4438]">
                  Solidaris Team collects personal information such as your name, email, role, project access, review activity, and communication history to manage project coordination, accountability, and secure collaboration. We process this information in accordance with Canadian privacy expectations, including the Personal Information Protection and Electronic Documents Act (PIPEDA) and applicable provincial laws where relevant. Information is stored in a secure project workspace, used only for project administration, review coordination, and compliance related to the programme, and retained only for as long as needed to support the project or legal obligations. If you are a project owner, you may receive notifications about team submissions, comments, and project updates. By checking the boxes below, you confirm that you understand this notice and agree to the processing of your data for these purposes.
                </p>

                <div className="mt-3 space-y-2 text-[11px] text-[#4A4438]">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!form.consent.dataProtection}
                      onChange={(e) => setForm({ ...form, consent: { ...form.consent, dataProtection: e.target.checked } })}
                    />
                    <span>I agree that my personal information may be collected and used for account administration, project coordination, and team communications.</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!form.consent.dataHandling}
                      onChange={(e) => setForm({ ...form, consent: { ...form.consent, dataHandling: e.target.checked } })}
                    />
                    <span>I understand that my information may be stored, accessed, and processed securely for this project and that it will not be used outside the agreed project purpose without notice.</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!form.consent.emailNotifications}
                      onChange={(e) => setForm({ ...form, consent: { ...form.consent, emailNotifications: e.target.checked } })}
                    />
                    <span>I agree to receive project-related email notifications from Solidaris Team, including registration confirmation, role assignment, review submissions, and project updates.</span>
                  </label>
                </div>
              </div>
            </>
          )}
          {error && <div className="text-[12px] text-[#7A3B2E] bg-[#FDF3F2] border border-[#F0C7C5] rounded-md px-3 py-2">{error}</div>}
          <button onClick={onSubmit} className="w-full bg-[#2F6F5E] text-white rounded-md px-4 py-2.5 text-[13px] font-medium hover:bg-[#26594B] transition-colors">
            {authMode === "signin" ? "Sign in" : "Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="block">
      <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">{label}</div>
      <input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px] outline-none focus:border-[#2F6F5E] focus:ring-1 focus:ring-[#2F6F5E]"
      />
    </label>
  );
}

function DashboardView({ currentUser, myProjects, onOpenProject, onCreateProject }) {
  const canCreate = currentUser?.role === "owner";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-semibold">Your workspace</h1>
          <p className="text-[13px] text-[#6B6250] mt-1">Projects you own or have co-evaluated.</p>
        </div>
        {canCreate && (
          <button onClick={onCreateProject} className="inline-flex items-center gap-1.5 bg-[#2F6F5E] text-white rounded-md px-4 py-2.5 text-[13px] font-medium hover:bg-[#26594B]">
            <Plus size={15} /> New project
          </button>
        )}
      </div>

      {myProjects.length === 0 ? (
        <div className="bg-white border border-[#E4DFD0] rounded-2xl p-8 text-center">
          <FolderOpen className="mx-auto mb-3 text-[#2F6F5E]" size={28} />
          <p className="text-[14px] text-[#6B6250]">No projects yet.</p>
          {canCreate && <p className="text-[12px] text-[#6B6250] mt-2">Create a project to begin the assessment workflow.</p>}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {myProjects.map((project) => {
            const score = average(Object.values(project.assessment.domains).map((d) => Number(d.rating || 0))); 
            return (
              <button key={project.id} onClick={() => onOpenProject(project.id)} className="text-left bg-white border border-[#E4DFD0] rounded-xl p-5 hover:border-[#2F6F5E] shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-semibold">{project.name || "Untitled project"}</div>
                    <div className="text-[12px] text-[#6B6250] mt-0.5">{project.funder || "No funder"} · {project.country || "No country"}</div>
                  </div>
                  <ChevronRight size={16} className="text-[#B0AA95]" />
                </div>
                <div className="mt-4 flex items-center justify-between text-[11px] text-[#6B6250]">
                  <span>{project.ownerId === currentUser.id ? "Owned by you" : "Co-evaluated"}</span>
                  <span className="font-medium text-[#2F6F5E]">{score.toFixed(1)}/5</span>
                </div>
                <div className="mt-2 h-1.5 bg-[#EFEAE0] rounded-full overflow-hidden">
                  <div className="h-full bg-[#2F6F5E] rounded-full" style={{ width: `${(score / 5) * 100}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContextView({ project, onChange, onNext }) {
  return (
    <div className="max-w-3xl">
      <div className="bg-white border border-[#E4DFD0] rounded-xl p-6">
        <h1 className="text-[26px] font-semibold mb-2">Programme context</h1>
        <p className="text-[13px] text-[#6B6250] mb-6">Use context to frame the evidence and ensure comparisons remain grounded in the actual programme design.</p>
        <div className="grid md:grid-cols-2 gap-4">
          <FieldInput label="Programme name" value={project.name} onChange={(value) => onChange({ name: value })} placeholder="e.g. PEPFAR Nigeria" />
          <FieldInput label="Funder / organisation" value={project.funder} onChange={(value) => onChange({ funder: value })} placeholder="e.g. Ministry of Health" />
          <FieldInput label="Country / region" value={project.country} onChange={(value) => onChange({ country: value })} placeholder="e.g. Kenya" />
          <FieldInput label="Sector" value={project.sector} onChange={(value) => onChange({ sector: value })} placeholder="Health, food security..." />
          <div className="md:col-span-2 max-w-md">
            <FieldInput label="Assessor name" value={project.assessorName} onChange={(value) => onChange({ assessorName: value })} placeholder="Your name" />
          </div>
        </div>
        <div className="mt-6">
          <button onClick={onNext} className="inline-flex items-center gap-1.5 bg-[#2F6F5E] text-white rounded-md px-4 py-2.5 text-[13px] font-medium hover:bg-[#26594B]">
            Begin assessment <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AssessView({ project, domainIndex, setDomainIndex, onChangeProject, onChangeDomain, onChangeIntegrity, onFinish }) {
  const showIntegrity = domainIndex === ALL_DOMAINS.length;
  const domain = ALL_DOMAINS[domainIndex];
  const data = domain ? project.assessment.domains[domain.id] : null;

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-8">
      <aside className="bg-white border border-[#E4DFD0] rounded-xl p-4 self-start sticky top-20">
        {TRIADS.map((triad) => (
          <div key={triad.key} className="mb-5">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-2" style={{ color: triad.color }}>{triad.label}</div>
            {triad.domains.map((item) => {
              const idx = ALL_DOMAINS.findIndex((d) => d.id === item.id);
              const done = !!(project.assessment.domains[item.id].evidenceSummary || "").trim();
              return (
                <button
                  key={item.id}
                  onClick={() => setDomainIndex(idx)}
                  className={`flex w-full items-center gap-2 text-left text-[12.5px] px-2 py-1.5 rounded-md ${idx === domainIndex && !showIntegrity ? "bg-[#F5F1EA] font-medium" : "text-[#4A4438] hover:bg-[#F5F1EA]"}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-[#2F6F5E]" : "bg-[#D8D2C0]"}`} />
                  {item.name}
                </button>
              );
            })}
          </div>
        ))}
        <button
          onClick={() => setDomainIndex(ALL_DOMAINS.length)}
          className={`flex w-full items-center gap-2 text-left text-[12.5px] px-2 py-1.5 rounded-md ${showIntegrity ? "bg-[#F5F1EA] font-medium" : "text-[#4A4438] hover:bg-[#F5F1EA]"}`}
        >
          <ShieldAlert size={13} /> Integrity checks
        </button>
      </aside>

      <div>
        {!showIntegrity && domain && (
          <DomainForm
            domain={domain}
            data={data}
            onChange={(patch) => onChangeDomain(domain.id, patch)}
            onNext={() => setDomainIndex(Math.min(domainIndex + 1, ALL_DOMAINS.length))}
            onPrev={() => setDomainIndex(Math.max(domainIndex - 1, 0))}
            isFirst={domainIndex === 0}
          />
        )}

        {showIntegrity && (
          <IntegrityForm
            integrity={project.assessment.integrity}
            onChange={onChangeIntegrity}
            onPrev={() => setDomainIndex(ALL_DOMAINS.length - 1)}
            onFinish={onFinish}
          />
        )}
      </div>
    </div>
  );
}

function DomainForm({ domain, data, onChange, onNext, onPrev, isFirst }) {
  return (
    <div className="bg-white border border-[#E4DFD0] rounded-xl p-6">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: domain.triadColor }}>{domain.triadLabel}</div>
      <h2 className="text-[22px] font-semibold mb-4">{domain.name}</h2>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11.5px] font-medium text-[#6B6250]">Rating</span>
          <span className="text-[12px] font-medium" style={{ color: domain.triadColor }}>{data.rating} — {RATING_LABELS[data.rating]}</span>
        </div>
        <input type="range" min={0} max={5} step={1} value={data.rating || 0} onChange={(event) => onChange({ rating: Number(event.target.value) })} className="w-full accent-[#2F6F5E]" />
        <div className="flex justify-between text-[10px] text-[#B0AA95] mt-1">
          <span>0</span><span>5</span>
        </div>
      </div>

      <div className="space-y-4 mb-5">
        {domain.prompts.map((prompt, index) => (
          <label key={index} className="block">
            <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">{prompt}</div>
            <textarea
              value={data.responses[index] || ""}
              onChange={(event) => {
                const responses = [...(data.responses || [])];
                responses[index] = event.target.value;
                onChange({ responses });
              }}
              className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px] outline-none focus:border-[#2F6F5E] resize-none"
              rows={3}
            />
          </label>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Evidence type</div>
          <select value={data.evidenceType || ""} onChange={(event) => onChange({ evidenceType: event.target.value })} className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px]">
            <option value="">Select…</option>
            {EVIDENCE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Confidence</div>
          <select value={data.confidence || ""} onChange={(event) => onChange({ confidence: event.target.value })} className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px]">
            <option value="">Select…</option>
            {CONFIDENCE_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-5">
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Evidence summary</div>
          <textarea value={data.evidenceSummary || ""} onChange={(event) => onChange({ evidenceSummary: event.target.value })} rows={4} className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px] outline-none focus:border-[#2F6F5E] resize-none" />
        </label>
      </div>

      <div className="flex justify-between mt-6">
        <button onClick={onPrev} disabled={isFirst} className="inline-flex items-center gap-1 text-[13px] text-[#6B6250] disabled:opacity-30">
          <ChevronLeft size={15} /> Back
        </button>
        <button onClick={onNext} className="inline-flex items-center gap-1.5 bg-[#2F6F5E] text-white rounded-md px-4 py-2.5 text-[13px] font-medium hover:bg-[#26594B]">
          Continue <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function IntegrityForm({ integrity, onChange, onPrev, onFinish }) {
  return (
    <div className="bg-white border border-[#E4DFD0] rounded-xl p-6">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-1 text-[#7A3B2E]">Cross-cutting check</div>
      <h2 className="text-[22px] font-semibold mb-4">Solidarity integrity & risk</h2>
      <div className="space-y-4">
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Contradictions between programme goals and wider portfolio?</div>
          <textarea value={integrity.alignmentContradiction || ""} onChange={(event) => onChange({ alignmentContradiction: event.target.value })} rows={3} className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px] resize-none" />
        </label>
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Who bears the burden of implementation costs?</div>
          <textarea value={integrity.burdenBearer || ""} onChange={(event) => onChange({ burdenBearer: event.target.value })} rows={3} className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px] resize-none" />
        </label>
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">What is the actual level of community voice in decisions?</div>
          <textarea value={integrity.voiceReality || ""} onChange={(event) => onChange({ voiceReality: event.target.value })} rows={3} className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px] resize-none" />
        </label>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Solidarity-washing risk</div>
          <select value={integrity.washingRisk || "Medium"} onChange={(event) => onChange({ washingRisk: event.target.value })} className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px]">
            {['Low', 'Medium', 'High'].map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Power-imbalance risk</div>
          <select value={integrity.powerRisk || "Medium"} onChange={(event) => onChange({ powerRisk: event.target.value })} className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px]">
            {['Low', 'Medium', 'High'].map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
      </div>

      <div className="flex justify-between mt-6">
        <button onClick={onPrev} className="inline-flex items-center gap-1 text-[13px] text-[#6B6250]">
          <ChevronLeft size={15} /> Back
        </button>
        <button onClick={onFinish} className="inline-flex items-center gap-1.5 bg-[#2F6F5E] text-white rounded-md px-4 py-2.5 text-[13px] font-medium hover:bg-[#26594B]">
          View profile <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function ProfileView({ project, currentUser, onEdit, onOpenReport, onGenerateAi, onExportTeam, onExportAi }) {
  const chartData = ALL_DOMAINS.map((domain) => ({
    domain: domain.name.split(" ")[0] === "Common" ? "Common Good" : domain.name,
    fullName: domain.name,
    rating: Number(project.assessment.domains[domain.id].rating || 0),
  }));

  const triads = TRIADS.map((triad) => {
    const values = triad.domains.map((domain) => Number(project.assessment.domains[domain.id].rating || 0));
    return { ...triad, avg: (average(values)).toFixed(1) };
  });

  const isOwner = currentUser && currentUser.role === "owner";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold">Solidarity profile</h1>
          <p className="text-[13px] text-[#6B6250] mt-1">{project.name || "Untitled project"} · {[project.funder, project.country].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenReport} className="text-[12.5px] text-[#2F6F5E] font-medium underline underline-offset-4">View report</button>
          <button onClick={onEdit} className="text-[12.5px] text-[#2F6F5E] font-medium underline underline-offset-4">Edit assessment</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_360px] gap-6">
        <div className="bg-white border border-[#E4DFD0] rounded-xl p-5">
          <div className="text-[12px] font-medium text-[#6B6250] mb-3">Nine-domain profile — not a single score by design</div>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <RadarChart data={chartData} outerRadius="74%">
                <PolarGrid stroke="#E4DFD0" />
                <PolarAngleAxis dataKey="domain" tick={{ fontSize: 10.5, fill: "#4A4438" }} />
                <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 9, fill: "#B0AA95" }} tickCount={6} />
                <Radar dataKey="rating" stroke="#2F6F5E" fill="#2F6F5E" fillOpacity={0.25} strokeWidth={2} />
                <Tooltip formatter={(value) => [`${value}/5`, "Score"]} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-3">
          {triads.map((triad) => (
            <div key={triad.key} className="bg-white border border-[#E4DFD0] rounded-xl p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: triad.color }}>{triad.label}</div>
              <div className="text-[11px] text-[#6B6250] mb-2">{triad.sub}</div>
              <div className="flex items-baseline gap-1">
                <span className="text-[22px] font-semibold">{triad.avg}</span>
                <span className="text-[11px] text-[#B0AA95]">/ 5 avg.</span>
              </div>
            </div>
          ))}
          <RiskBadge label="Solidarity-washing risk" level={project.assessment.integrity.washingRisk} />
          <RiskBadge label="Power-imbalance risk" level={project.assessment.integrity.powerRisk} />
          <RiskBadge label="Solidarity index" level={`${calculateIndex(project).toFixed(1)}%`} usePercent />
        </div>
      </div>

      {isOwner && (
        <div className="bg-white border border-[#E4DFD0] rounded-xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-[#2F6F5E]" />
              <span className="text-[12px] font-medium text-[#4A4438]">Optional AI analysis</span>
            </div>
            <button onClick={onGenerateAi} className="inline-flex items-center gap-1.5 bg-[#2F6F5E] text-white rounded-md px-4 py-2 text-[12px] font-medium hover:bg-[#26594B]">
              <Sparkles size={13} /> Generate AI summary
            </button>
          </div>
          {project.aiSummary ? (
            <div className="mt-3 text-[12px] text-[#3A362C] whitespace-pre-wrap bg-[#F8F5F0] border border-[#EFEAE0] rounded-md p-3">{project.aiSummary}</div>
          ) : (
            <p className="text-[12px] text-[#6B6250] mt-3">This optional summary is only available to the project owner and should be manually validated against the team report before sign-off.</p>
          )}
        </div>
      )}

      <div className="bg-white border border-[#E4DFD0] rounded-xl p-5">
        <div className="flex items-center gap-2 text-[12px] font-medium text-[#6B6250] mb-3"><FileText size={14} /> Evidence log</div>
        <div className="grid md:grid-cols-3 gap-3">
          {ALL_DOMAINS.map((domain) => {
            const entry = project.assessment.domains[domain.id];
            return (
              <div key={domain.id} className="border border-[#EFEAE0] rounded-md p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: domain.triadColor }}>{domain.name}</div>
                <div className="text-[12px] text-[#3A362C] mt-2">{entry.evidenceSummary || <span className="italic text-[#B0AA95]">No evidence documented yet.</span>}</div>
                {entry.confidence && <div className="text-[10px] text-[#6B6250] mt-2">Confidence: {entry.confidence}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReportView({ project, currentUser, onBackToProfile, onExportTeam, onExportAi, onGenerateAi, reviewDraft, setReviewDraft, onSubmitReview }) {
  const isOwner = currentUser && currentUser.role === "owner";
  const isReviewer = currentUser && currentUser.role === "reviewer";
  const reviewItems = project.comments || [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold">Assessment report</h1>
          <p className="text-[13px] text-[#6B6250] mt-1">{project.name || "Untitled project"}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onBackToProfile} className="text-[12.5px] text-[#2F6F5E] font-medium underline underline-offset-4">Back to profile</button>
          <button onClick={onExportTeam} className="bg-[#2F6F5E] text-white rounded-md px-3 py-2 text-[12px] font-medium hover:bg-[#26594B]">Export team report</button>
          {isOwner && project.aiSummary && (
            <button onClick={onExportAi} className="bg-[#5B4C8A] text-white rounded-md px-3 py-2 text-[12px] font-medium hover:bg-[#4A3D72]">Export AI report</button>
          )}
        </div>
      </div>

      {isOwner && (
        <div className="bg-white border border-[#E4DFD0] rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-medium text-[#4A4438]">Optional AI review</div>
            <div className="text-[11px] text-[#6B6250]">Export separately from the human team report for manual validation.</div>
          </div>
          <button onClick={onGenerateAi} className="inline-flex items-center gap-1.5 bg-[#5B4C8A] text-white rounded-md px-3 py-2 text-[12px] font-medium hover:bg-[#4A3D72]">
            <Sparkles size={13} /> Generate AI summary
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-3">
        <MetricCard label="Programme" value={project.name || "Untitled"} />
        <MetricCard label="Coverage" value={`${Object.values(project.assessment.domains).filter((domain) => (domain.evidenceSummary || "").trim()).length}/${Object.keys(project.assessment.domains).length}`} />
        <MetricCard label="Mean rating" value={average(Object.values(project.assessment.domains).map((d) => Number(d.rating || 0))).toFixed(1)} />
        <MetricCard label="Solidarity index" value={`${calculateIndex(project).toFixed(1)}%`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E4DFD0] rounded-xl p-5">
          <div className="text-[12px] font-medium text-[#6B6250] mb-3">Evidence matrix</div>
          <ul className="space-y-2 text-[12px] text-[#3A362C]">
            {ALL_DOMAINS.map((domain) => (
              <li key={domain.id} className="bg-[#F9F6F1] border border-[#EFEAE0] rounded-md p-3">
                <strong>{domain.name}</strong><br />
                {project.assessment.domains[domain.id].evidenceSummary || "No evidence recorded yet."}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-[#E4DFD0] rounded-xl p-5">
          <div className="text-[12px] font-medium text-[#6B6250] mb-3">Risk register</div>
          <ul className="space-y-2 text-[12px] text-[#3A362C]">
            <li className="bg-[#F9F6F1] border border-[#EFEAE0] rounded-md p-3">Solidarity-washing risk: {project.assessment.integrity.washingRisk}</li>
            <li className="bg-[#F9F6F1] border border-[#EFEAE0] rounded-md p-3">Power-imbalance risk: {project.assessment.integrity.powerRisk}</li>
            <li className="bg-[#F9F6F1] border border-[#EFEAE0] rounded-md p-3">Burden bearer: {project.assessment.integrity.burdenBearer || "Not yet documented"}</li>
            <li className="bg-[#F9F6F1] border border-[#EFEAE0] rounded-md p-3">Community voice: {project.assessment.integrity.voiceReality || "Not yet documented"}</li>
          </ul>
        </div>
      </div>

      {isOwner && project.aiSummary && (
        <div className="bg-white border border-[#E4DFD0] rounded-xl p-5">
          <div className="text-[12px] font-medium text-[#6B6250] mb-3">AI summary</div>
          <div className="text-[12px] text-[#3A362C] whitespace-pre-wrap bg-[#F8F5F0] border border-[#EFEAE0] rounded-md p-3">{project.aiSummary}</div>
        </div>
      )}

      {(isReviewer || isOwner) && (
        <div className="bg-white border border-[#E4DFD0] rounded-xl p-5">
          <div className="text-[12px] font-medium text-[#6B6250] mb-3">Submit project review or comment</div>
          <textarea
            value={reviewDraft || ""}
            onChange={(event) => setReviewDraft(event.target.value)}
            rows={4}
            placeholder="Add a review, note, or comment for the project owner. This will trigger a Solidaris Team notification to the owner."
            className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px] resize-none"
          />
          <div className="mt-3 flex justify-end">
            <button onClick={onSubmitReview} className="bg-[#2F6F5E] text-white rounded-md px-4 py-2 text-[12px] font-medium hover:bg-[#26594B]">
              Submit review
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#E4DFD0] rounded-xl p-5">
        <div className="text-[12px] font-medium text-[#6B6250] mb-3">Project activity</div>
        <div className="space-y-3">
          {reviewItems.length === 0 ? (
            <div className="text-[12px] text-[#6B6250]">No reviews or comments have been submitted yet.</div>
          ) : (
            reviewItems.map((item) => (
              <div key={item.id} className="bg-[#F9F6F1] border border-[#EFEAE0] rounded-md p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[#4A4438]">{item.authorName || "Team member"}</span>
                  <span className="text-[10px] uppercase tracking-wide text-[#6B6250]">{item.type || "comment"}</span>
                </div>
                <div className="text-[12px] text-[#3A362C] mt-2">{item.content}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="bg-white border border-[#E4DFD0] rounded-xl p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#6B6250]">{label}</div>
      <div className="text-[20px] font-semibold mt-2 break-words">{value}</div>
    </div>
  );
}

function RiskBadge({ label, level, usePercent }) {
  const colors = { Low: "#2F6F5E", Medium: "#B0782E", High: "#7A3B2E" };
  const fill = usePercent ? "#2F6F5E" : colors[level] || "#B0AA95";
  return (
    <div className="bg-white border border-[#E4DFD0] rounded-xl p-4 flex items-center justify-between gap-3">
      <span className="text-[12px] text-[#4A4438]">{label}</span>
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: fill }}>{level}</span>
    </div>
  );
}
