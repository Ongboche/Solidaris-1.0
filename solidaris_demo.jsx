import React, { useState, useEffect, useCallback } from "react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip
} from "recharts";
import { Plus, ChevronRight, ChevronLeft, FileText, ShieldAlert, Save, ArrowLeft } from "lucide-react";

// ---------------------------------------------------------------------------
// Domain definitions — mirrors the 3-3-3 framework from the Solidarity
// Profiling Tool / Principles for Embedding Solidarity in the GH Ecosystem.
// ---------------------------------------------------------------------------
const TRIADS = [
  {
    key: "what",
    label: "WHAT",
    sub: "Orientation",
    color: "#2F6F5E",
    domains: [
      {
        id: "d1", name: "Equity & Justice",
        prompts: [
          "To what extent does the programme prioritise the needs of marginalised or underserved populations?",
          "Are resources distributed based on need rather than political or economic factors?",
          "Does the programme address root causes of health inequities, not just symptoms?",
        ],
      },
      {
        id: "d2", name: "Common Good Orientation",
        prompts: [
          "Does the programme prioritise collective health outcomes over individual or organisational gains?",
          "Are public goods (knowledge, technologies) shared openly rather than restricted?",
          "Is the programme designed to strengthen public health systems rather than parallel structures?",
        ],
      },
      {
        id: "d3", name: "Mutual Responsibility",
        prompts: [
          "Are responsibilities and accountabilities clearly shared between all parties?",
          "Do all actors (funders, implementers, communities) bear appropriate shares of risk?",
          "Is there evidence of reciprocal obligations rather than one-way dependency?",
        ],
      },
    ],
  },
  {
    key: "how",
    label: "HOW",
    sub: "Process",
    color: "#B0782E",
    domains: [
      {
        id: "d4", name: "Power Transformation",
        prompts: [
          "To what extent are decision-making powers shared with local actors?",
          "Who sets priorities and controls funding allocation?",
          "Are there mechanisms to shift authority over time to local ownership?",
        ],
      },
      {
        id: "d5", name: "Inclusive Participation",
        prompts: [
          "Are affected communities meaningfully involved in programme design?",
          "Do marginalised groups have genuine voice in decision-making (not just consultation)?",
          "Are participation mechanisms accessible and culturally appropriate?",
        ],
      },
      {
        id: "d6", name: "Transparency & Accountability",
        prompts: [
          "Is information about funding, decisions, and outcomes openly accessible?",
          "Are there mechanisms for communities to hold implementing actors accountable?",
          "Is there honest reporting of failures and challenges, not just successes?",
        ],
      },
    ],
  },
  {
    key: "end",
    label: "TO WHAT END",
    sub: "Outcomes",
    color: "#5B4C8A",
    domains: [
      {
        id: "d7", name: "Sustainability & Sovereignty",
        prompts: [
          "Does the programme strengthen local health system capacity for long-term sustainability?",
          "Is there a clear transition plan toward local ownership and control?",
          "Does the programme respect and build upon national health priorities?",
        ],
      },
      {
        id: "d8", name: "Relational Trust",
        prompts: [
          "Is there evidence of genuine partnership rather than donor-recipient dynamics?",
          "Are relationships characterised by mutual respect and learning?",
          "Has trust been built through consistent, reliable engagement over time?",
        ],
      },
      {
        id: "d9", name: "Transformative Impact",
        prompts: [
          "Does the programme contribute to systemic change beyond immediate health outcomes?",
          "Is there evidence of shifting norms, policies, or structures toward greater equity?",
          "Does the programme challenge rather than reinforce existing inequities?",
        ],
      },
    ],
  },
];
const ALL_DOMAINS = TRIADS.flatMap((t) => t.domains.map((d) => ({ ...d, triad: t.key, triadColor: t.color, triadLabel: t.label })));

const CONFIDENCE_LEVELS = ["Low", "Medium", "High"];
const EVIDENCE_TYPES = ["Interviews", "Observations", "Documents", "Financial records", "Mixed"];

function emptyAssessment() {
  const domains = {};
  ALL_DOMAINS.forEach((d) => {
    domains[d.id] = { rating: 3, responses: d.prompts.map(() => ""), evidenceType: "", evidenceSummary: "", confidence: "" };
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

function newProgramme() {
  return {
    id: `prog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    funder: "",
    country: "",
    sector: "",
    assessorName: "",
    createdAt: new Date().toISOString(),
    assessment: emptyAssessment(),
  };
}

const RATING_LABELS = { 1: "Emerging", 2: "Partial", 3: "Developing", 4: "Consistent", 5: "Exemplary" };

export default function App() {
  const [programmes, setProgrammes] = useState(null); // null = loading
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState("list"); // list | context | assess | profile
  const [domainIdx, setDomainIdx] = useState(0);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [error, setError] = useState("");

  // ---- load from persistent storage ----
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("solidaris:programmes", false);
        setProgrammes(res ? JSON.parse(res.value) : []);
      } catch {
        setProgrammes([]);
      }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setSaveState("saving");
    try {
      await window.storage.set("solidaris:programmes", JSON.stringify(next), false);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1200);
    } catch {
      setError("Could not save. Your changes are only kept for this session.");
    }
  }, []);

  const updateProgrammes = (next) => {
    setProgrammes(next);
    persist(next);
  };

  const active = programmes?.find((p) => p.id === activeId) || null;

  const updateActive = (patch) => {
    const next = programmes.map((p) => (p.id === activeId ? { ...p, ...patch } : p));
    updateProgrammes(next);
  };

  const updateDomain = (domainId, patch) => {
    const next = programmes.map((p) => {
      if (p.id !== activeId) return p;
      return {
        ...p,
        assessment: {
          ...p.assessment,
          domains: { ...p.assessment.domains, [domainId]: { ...p.assessment.domains[domainId], ...patch } },
        },
      };
    });
    updateProgrammes(next);
  };

  const updateIntegrity = (patch) => {
    const next = programmes.map((p) => {
      if (p.id !== activeId) return p;
      return { ...p, assessment: { ...p.assessment, integrity: { ...p.assessment.integrity, ...patch } } };
    });
    updateProgrammes(next);
  };

  const createProgramme = () => {
    const p = newProgramme();
    updateProgrammes([...(programmes || []), p]);
    setActiveId(p.id);
    setView("context");
  };

  if (programmes === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F4EF] text-[#2F3B36]">
        <div className="text-sm tracking-wide">Loading SOLIDARIS…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#20261F]" style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui" }}>
      <Header
        active={active}
        view={view}
        onBack={() => {
          if (view === "assess" || view === "profile") setView("context");
          else if (view === "context") { setActiveId(null); setView("list"); }
        }}
        saveState={saveState}
      />
      <main className="max-w-5xl mx-auto px-6 pb-24">
        {view === "list" && (
          <ListView programmes={programmes} onOpen={(id) => { setActiveId(id); setView("context"); }} onCreate={createProgramme} />
        )}
        {view === "context" && active && (
          <ContextView programme={active} onChange={updateActive} onNext={() => { setDomainIdx(0); setView("assess"); }} />
        )}
        {view === "assess" && active && (
          <AssessView
            programme={active}
            domainIdx={domainIdx}
            setDomainIdx={setDomainIdx}
            updateDomain={updateDomain}
            integrity={active.assessment.integrity}
            updateIntegrity={updateIntegrity}
            onFinish={() => setView("profile")}
          />
        )}
        {view === "profile" && active && <ProfileView programme={active} onEdit={() => setView("assess")} />}
      </main>
      {error && (
        <div className="fixed bottom-4 right-4 bg-[#7A3B2E] text-white text-sm px-4 py-2 rounded-md shadow-lg">{error}</div>
      )}
    </div>
  );
}

function Header({ active, view, onBack, saveState }) {
  return (
    <header className="border-b border-[#DAD4C4] bg-[#F6F4EF]/95 backdrop-blur sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view !== "list" && (
            <button onClick={onBack} className="p-1.5 rounded-full hover:bg-[#EAE5D8] transition-colors">
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
          )}
          <div>
            <div className="text-[17px] font-semibold tracking-tight" style={{ fontFamily: "'Fraunces', ui-serif, Georgia, serif" }}>
              SOLIDARIS
            </div>
            <div className="text-[11px] text-[#6B6250] -mt-0.5">Solidarity Profiling — demo prototype</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {active && view !== "list" && (
            <div className="text-[12px] text-[#6B6250] max-w-[220px] truncate text-right">
              {active.name || "Untitled programme"}
            </div>
          )}
          <SaveIndicator state={saveState} />
        </div>
      </div>
    </header>
  );
}

function SaveIndicator({ state }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[#6B6250] w-16">
      <Save size={13} className={state === "saving" ? "opacity-40" : "opacity-70"} />
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ListView({ programmes, onOpen, onCreate }) {
  return (
    <div className="pt-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold" style={{ fontFamily: "'Fraunces', ui-serif, Georgia, serif" }}>
            Programme assessments
          </h1>
          <p className="text-[13px] text-[#6B6250] mt-1 max-w-md">
            Each assessment builds an evidence-based solidarity profile across nine domains — not a single score.
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-1.5 bg-[#2F6F5E] hover:bg-[#26594B] text-white text-[13px] font-medium px-4 py-2.5 rounded-md transition-colors shrink-0"
        >
          <Plus size={16} /> New assessment
        </button>
      </div>

      {programmes.length === 0 ? (
        <div className="border border-dashed border-[#CFC7B2] rounded-lg py-16 text-center">
          <p className="text-[14px] text-[#6B6250]">No programmes assessed yet.</p>
          <button onClick={onCreate} className="mt-4 text-[13px] text-[#2F6F5E] font-medium underline underline-offset-4">
            Start your first assessment
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {programmes.map((p) => {
            const complete = ALL_DOMAINS.filter((d) => p.assessment.domains[d.id].evidenceSummary).length;
            return (
              <button
                key={p.id}
                onClick={() => onOpen(p.id)}
                className="text-left bg-white border border-[#E4DFD0] rounded-lg p-5 hover:border-[#2F6F5E] hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-[15px]">{p.name || "Untitled programme"}</div>
                    <div className="text-[12px] text-[#6B6250] mt-0.5">{[p.funder, p.country].filter(Boolean).join(" · ") || "No details yet"}</div>
                  </div>
                  <ChevronRight size={16} className="text-[#B0AA95] group-hover:text-[#2F6F5E] transition-colors mt-1" />
                </div>
                <div className="mt-4 h-1.5 bg-[#EFEAE0] rounded-full overflow-hidden">
                  <div className="h-full bg-[#2F6F5E] rounded-full" style={{ width: `${(complete / 9) * 100}%` }} />
                </div>
                <div className="text-[11px] text-[#6B6250] mt-1.5">{complete} of 9 domains documented</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Field({ label, value, onChange, placeholder, textarea }) {
  const Comp = textarea ? "textarea" : "input";
  return (
    <label className="block">
      <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">{label}</div>
      <Comp
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={textarea ? 3 : undefined}
        className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px] outline-none focus:border-[#2F6F5E] focus:ring-1 focus:ring-[#2F6F5E] transition-colors resize-none"
      />
    </label>
  );
}

function ContextView({ programme, onChange, onNext }) {
  return (
    <div className="pt-10 max-w-2xl">
      <h1 className="text-[24px] font-semibold mb-1" style={{ fontFamily: "'Fraunces', ui-serif, Georgia, serif" }}>
        Programme context
      </h1>
      <p className="text-[13px] text-[#6B6250] mb-8">This grounds the assessment. It's not scored, but shapes how evidence is read.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Programme name" value={programme.name} onChange={(v) => onChange({ name: v })} placeholder="e.g. PEPFAR Nigeria" />
        <Field label="Funder / organisation" value={programme.funder} onChange={(v) => onChange({ funder: v })} placeholder="e.g. USG" />
        <Field label="Country / region" value={programme.country} onChange={(v) => onChange({ country: v })} placeholder="e.g. Nigeria" />
        <Field label="Sector" value={programme.sector} onChange={(v) => onChange({ sector: v })} placeholder="e.g. Health — HIV programme" />
        <Field label="Assessor name" value={programme.assessorName} onChange={(v) => onChange({ assessorName: v })} placeholder="Your name" />
      </div>
      <button
        onClick={onNext}
        className="mt-8 flex items-center gap-1.5 bg-[#2F6F5E] hover:bg-[#26594B] text-white text-[13px] font-medium px-5 py-2.5 rounded-md transition-colors"
      >
        Begin domain assessment <ChevronRight size={15} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
function AssessView({ programme, domainIdx, setDomainIdx, updateDomain, integrity, updateIntegrity, onFinish }) {
  const showIntegrity = domainIdx === ALL_DOMAINS.length;
  const domain = ALL_DOMAINS[domainIdx];
  const data = domain ? programme.assessment.domains[domain.id] : null;

  return (
    <div className="pt-8 grid grid-cols-[200px_1fr] gap-8">
      <nav className="pt-2 sticky top-20 self-start">
        {TRIADS.map((t) => (
          <div key={t.key} className="mb-5">
            <div className="text-[10.5px] font-semibold tracking-wide uppercase mb-1.5" style={{ color: t.color }}>
              {t.label}
            </div>
            {t.domains.map((d) => {
              const gi = ALL_DOMAINS.findIndex((x) => x.id === d.id);
              const done = !!programme.assessment.domains[d.id].evidenceSummary;
              return (
                <button
                  key={d.id}
                  onClick={() => setDomainIdx(gi)}
                  className={`block w-full text-left text-[12.5px] px-2 py-1.5 rounded-md mb-0.5 transition-colors ${
                    gi === domainIdx ? "bg-white shadow-sm font-medium" : "hover:bg-[#EFEAE0] text-[#4A4438]"
                  }`}
                >
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${done ? "bg-[#2F6F5E]" : "bg-[#D8D2C0]"}`} />
                  {d.name}
                </button>
              );
            })}
          </div>
        ))}
        <button
          onClick={() => setDomainIdx(ALL_DOMAINS.length)}
          className={`flex items-center gap-1.5 w-full text-left text-[12.5px] px-2 py-1.5 rounded-md transition-colors ${
            showIntegrity ? "bg-white shadow-sm font-medium" : "hover:bg-[#EFEAE0] text-[#4A4438]"
          }`}
        >
          <ShieldAlert size={13} /> Integrity checks
        </button>
      </nav>

      <div>
        {!showIntegrity && domain && (
          <DomainForm
            domain={domain}
            data={data}
            onChange={(patch) => updateDomain(domain.id, patch)}
            onNext={() => setDomainIdx(Math.min(domainIdx + 1, ALL_DOMAINS.length))}
            onPrev={() => setDomainIdx(Math.max(domainIdx - 1, 0))}
            isFirst={domainIdx === 0}
          />
        )}
        {showIntegrity && (
          <IntegrityForm integrity={integrity} onChange={updateIntegrity} onPrev={() => setDomainIdx(ALL_DOMAINS.length - 1)} onFinish={onFinish} />
        )}
      </div>
    </div>
  );
}

function DomainForm({ domain, data, onChange, onNext, onPrev, isFirst }) {
  return (
    <div className="bg-white border border-[#E4DFD0] rounded-lg p-6 max-w-2xl">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-1" style={{ color: domain.triadColor }}>
        {domain.triadLabel}
      </div>
      <h2 className="text-[19px] font-semibold mb-4" style={{ fontFamily: "'Fraunces', ui-serif, Georgia, serif" }}>
        {domain.name}
      </h2>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11.5px] font-medium text-[#6B6250]">Rating</span>
          <span className="text-[12px] font-medium" style={{ color: domain.triadColor }}>
            {data.rating} — {RATING_LABELS[data.rating]}
          </span>
        </div>
        <input
          type="range" min={1} max={5} step={1} value={data.rating}
          onChange={(e) => onChange({ rating: Number(e.target.value) })}
          className="w-full accent-[#2F6F5E]"
        />
        <div className="flex justify-between text-[10px] text-[#B0AA95] mt-0.5">
          <span>Emerging</span><span>Exemplary</span>
        </div>
      </div>

      <div className="space-y-3 mb-5">
        {domain.prompts.map((prompt, i) => (
          <Field
            key={i}
            label={prompt}
            value={data.responses[i]}
            onChange={(v) => {
              const responses = [...data.responses];
              responses[i] = v;
              onChange({ responses });
            }}
            placeholder="Notes on this indicator…"
            textarea
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-1">
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Evidence type</div>
          <select
            value={data.evidenceType}
            onChange={(e) => onChange({ evidenceType: e.target.value })}
            className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px] outline-none focus:border-[#2F6F5E]"
          >
            <option value="">Select…</option>
            {EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Confidence</div>
          <select
            value={data.confidence}
            onChange={(e) => onChange({ confidence: e.target.value })}
            className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px] outline-none focus:border-[#2F6F5E]"
          >
            <option value="">Select…</option>
            {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <Field label="Evidence summary" value={data.evidenceSummary} onChange={(v) => onChange({ evidenceSummary: v })} placeholder="Summarise the supporting evidence for this rating…" textarea />

      <div className="flex justify-between mt-6">
        <button
          onClick={onPrev}
          disabled={isFirst}
          className="flex items-center gap-1 text-[13px] text-[#6B6250] disabled:opacity-30 px-3 py-2"
        >
          <ChevronLeft size={15} /> Back
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-1.5 bg-[#2F6F5E] hover:bg-[#26594B] text-white text-[13px] font-medium px-4 py-2 rounded-md transition-colors"
        >
          Continue <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function IntegrityForm({ integrity, onChange, onPrev, onFinish }) {
  return (
    <div className="bg-white border border-[#E4DFD0] rounded-lg p-6 max-w-2xl">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-1 text-[#7A3B2E]">Cross-cutting check</div>
      <h2 className="text-[19px] font-semibold mb-4" style={{ fontFamily: "'Fraunces', ui-serif, Georgia, serif" }}>
        Solidarity integrity & risk
      </h2>
      <div className="space-y-3 mb-5">
        <Field label="Contradictions between programme goals and the funder's wider portfolio?" value={integrity.alignmentContradiction} onChange={(v) => onChange({ alignmentContradiction: v })} textarea />
        <Field label="Who bears the primary burden of implementation costs?" value={integrity.burdenBearer} onChange={(v) => onChange({ burdenBearer: v })} textarea />
        <Field label="What is the actual (not stated) level of community voice in decisions?" value={integrity.voiceReality} onChange={(v) => onChange({ voiceReality: v })} textarea />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Solidarity-washing risk</div>
          <select value={integrity.washingRisk} onChange={(e) => onChange({ washingRisk: e.target.value })} className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px]">
            {["Low", "Medium", "High"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="text-[11.5px] font-medium text-[#6B6250] mb-1">Power-imbalance risk</div>
          <select value={integrity.powerRisk} onChange={(e) => onChange({ powerRisk: e.target.value })} className="w-full bg-white border border-[#DAD4C4] rounded-md px-3 py-2 text-[13.5px]">
            {["Low", "Medium", "High"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
      </div>
      <div className="flex justify-between mt-6">
        <button onClick={onPrev} className="flex items-center gap-1 text-[13px] text-[#6B6250] px-3 py-2">
          <ChevronLeft size={15} /> Back
        </button>
        <button onClick={onFinish} className="flex items-center gap-1.5 bg-[#2F6F5E] hover:bg-[#26594B] text-white text-[13px] font-medium px-4 py-2 rounded-md transition-colors">
          View profile <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ProfileView({ programme, onEdit }) {
  const chartData = ALL_DOMAINS.map((d) => ({
    domain: d.name.split(" ")[0] === "Common" ? "Common Good" : d.name,
    fullName: d.name,
    rating: programme.assessment.domains[d.id].rating,
    triad: d.triadLabel,
  }));

  const triadAverages = TRIADS.map((t) => {
    const ratings = t.domains.map((d) => programme.assessment.domains[d.id].rating);
    return { ...t, avg: (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) };
  });

  const { washingRisk, powerRisk } = programme.assessment.integrity;

  return (
    <div className="pt-8 pb-10">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-semibold" style={{ fontFamily: "'Fraunces', ui-serif, Georgia, serif" }}>
            Solidarity profile
          </h1>
          <p className="text-[13px] text-[#6B6250] mt-0.5">
            {programme.name || "Untitled programme"} · {[programme.funder, programme.country].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button onClick={onEdit} className="text-[12.5px] text-[#2F6F5E] font-medium underline underline-offset-4">
          Edit assessment
        </button>
      </div>

      <div className="grid md:grid-cols-[1fr_260px] gap-6">
        <div className="bg-white border border-[#E4DFD0] rounded-lg p-5">
          <div className="text-[12px] font-medium text-[#6B6250] mb-2">Nine-domain profile — not a single score by design</div>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <RadarChart data={chartData} outerRadius="75%">
                <PolarGrid stroke="#E4DFD0" />
                <PolarAngleAxis dataKey="domain" tick={{ fontSize: 10.5, fill: "#4A4438" }} />
                <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 9, fill: "#B0AA95" }} tickCount={6} />
                <Radar dataKey="rating" stroke="#2F6F5E" fill="#2F6F5E" fillOpacity={0.28} strokeWidth={2} />
                <Tooltip formatter={(v, n, p) => [`${v} — ${RATING_LABELS[v]}`, p.payload.fullName]} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-3">
          {triadAverages.map((t) => (
            <div key={t.key} className="bg-white border border-[#E4DFD0] rounded-lg p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: t.color }}>{t.label}</div>
              <div className="text-[11px] text-[#6B6250] mb-2">{t.sub}</div>
              <div className="flex items-baseline gap-1">
                <span className="text-[22px] font-semibold" style={{ fontFamily: "'Fraunces', ui-serif, Georgia, serif" }}>{t.avg}</span>
                <span className="text-[11px] text-[#B0AA95]">/ 5 avg.</span>
              </div>
            </div>
          ))}
          <RiskBadge label="Solidarity-washing risk" level={washingRisk} />
          <RiskBadge label="Power-imbalance risk" level={powerRisk} />
        </div>
      </div>

      <div className="mt-6 bg-white border border-[#E4DFD0] rounded-lg p-5">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#6B6250] mb-3">
          <FileText size={14} /> Evidence log
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {ALL_DOMAINS.map((d) => {
            const dd = programme.assessment.domains[d.id];
            return (
              <div key={d.id} className="border border-[#EFEAE0] rounded-md p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: d.triadColor }}>{d.name}</div>
                <div className="text-[12px] mt-1 text-[#3A362C] line-clamp-3">
                  {dd.evidenceSummary || <span className="text-[#B0AA95] italic">No evidence documented yet</span>}
                </div>
                {dd.confidence && <div className="text-[10px] text-[#6B6250] mt-1.5">Confidence: {dd.confidence}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RiskBadge({ label, level }) {
  const colors = { Low: "#2F6F5E", Medium: "#B0782E", High: "#7A3B2E" };
  return (
    <div className="bg-white border border-[#E4DFD0] rounded-lg p-4 flex items-center justify-between">
      <span className="text-[12px] text-[#4A4438]">{label}</span>
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: colors[level] || "#B0AA95" }}>
        {level}
      </span>
    </div>
  );
}
