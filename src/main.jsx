import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  buildTechPerformanceReport,
  filterJobsForReport,
  filterHistoryJobs,
  generateSetupCode,
  getDateRangeFilter,
  getJobCompletedTime,
  getTechHourSummary,
  messageReasons,
  normalizeSkill,
  parseCdkText,
  pickRandomEligibleTech,
  skillTypes,
  statuses,
  sumHours,
  toSafeHours
} from "./utils";
import "./styles.css";

const dispatcherEmail = "forneyc@autonation.com";
const sample = `RO,Vehicle,Concern,Skill,Hours,Notes
1005011,2020 Tahoe,Check engine light diagnosis,S12,1.0,Needs scan first
1005012,2019 Silverado,Transmission replacement,S16,8.5,Parts here`;

function useCollection(name) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    return onSnapshot(query(collection(db, name), orderBy("createdAt", "desc")), (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [name]);

  return items;
}

function Button({ children, variant = "primary", ...props }) {
  return <button className={`btn ${variant}`} {...props}>{children}</button>;
}

function Select({ value, onChange, children }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>;
}

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [role, setRole] = useState(null);
  const [currentTech, setCurrentTech] = useState(null);
  const [cdkText, setCdkText] = useState(sample);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("Ready.");
  const [newTechName, setNewTechName] = useState("");
  const [newTechSkills, setNewTechSkills] = useState([]);
  const [messageDrafts, setMessageDrafts] = useState({});
  const [reportRange, setReportRange] = useState("month");
  const [reportTechId, setReportTechId] = useState("all");
  const [reportSkill, setReportSkill] = useState("all");
  const [techTab, setTechTab] = useState("active");
  const [dispatcherTab, setDispatcherTab] = useState("ready");
  const [techHistoryRange, setTechHistoryRange] = useState("month");
  const [techHistorySearch, setTechHistorySearch] = useState("");
  const [dispatcherHistoryRange, setDispatcherHistoryRange] = useState("month");
  const [dispatcherHistoryTechId, setDispatcherHistoryTechId] = useState("all");
  const [dispatcherHistorySkill, setDispatcherHistorySkill] = useState("all");
  const [dispatcherHistorySearch, setDispatcherHistorySearch] = useState("");
  const [expandedJobId, setExpandedJobId] = useState("");
  const setupInProgress = useRef(false);

  const jobs = useCollection("jobs");
  const techs = useCollection("techs");
  const messages = useCollection("messages");
  const notifications = useCollection("notifications");

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setRole(null);
      setCurrentTech(null);
      setAuthReady(false);
      if (setupInProgress.current) return;

      try {
        if (!u) return;

        if (u.email?.toLowerCase() === dispatcherEmail) {
          setRole("dispatcher");
          return;
        }

        const techSnap = await getDocs(query(collection(db, "techs"), where("authUid", "==", u.uid), limit(1)));
        if (techSnap.empty) {
          alert("Access denied");
          await signOut(auth);
          return;
        }

        const techDoc = techSnap.docs[0];
        setCurrentTech({ id: techDoc.id, ...techDoc.data() });
        setRole("tech");
      } finally {
        setAuthReady(true);
      }
    });
  }, []);

  const selectedTech = currentTech ? (techs.find((t) => t.id === currentTech.id) || currentTech) : null;
  const visibleJobs = role === "dispatcher" ? jobs : jobs.filter((job) => selectedTech && job.assignedTechId === selectedTech.id);
  const activeJobs = visibleJobs.filter((job) => job.status !== "Completed");
  const readyJobs = jobs.filter((job) => ["Ready", "Hold"].includes(job.status) && !job.assignedTechId);
  const dispatchedJobs = jobs.filter((job) => ["Dispatched", "Accepted", "In Progress"].includes(job.status) && job.assignedTechId);
  const dispatcherWorkJobs = dispatcherTab === "ready" ? readyJobs : dispatchedJobs;
  const workListJobs = role === "dispatcher" ? dispatcherWorkJobs : activeJobs;
  const filteredJobs = workListJobs.filter((job) => JSON.stringify(job).toLowerCase().includes(search.toLowerCase()));
  const openMessages = messages.filter((m) => m.status === "Open");
  const resolvedMessages = messages.filter((m) => m.status === "Resolved");
  const myNotifications = notifications.filter((n) => role === "dispatcher" ? n.audience === "Dispatch" : n.audience === selectedTech?.name);
  const techHourSummary = selectedTech ? getTechHourSummary(jobs, selectedTech.id) : null;
  const techHistoryJobs = selectedTech ? filterHistoryJobs(jobs, {
    dateRange: techHistoryRange,
    techId: selectedTech.id,
    search: techHistorySearch
  }) : [];
  const dispatcherHistoryJobs = filterHistoryJobs(jobs, {
    dateRange: dispatcherHistoryRange,
    techId: dispatcherHistoryTechId,
    skill: dispatcherHistorySkill,
    search: dispatcherHistorySearch
  });
  const reportJobs = filterJobsForReport(jobs, { dateRange: reportRange, techId: reportTechId, skill: reportSkill });
  const completedReportJobs = reportJobs.filter((job) => job.status === "Completed");
  const totalFinalHours = sumHours(completedReportJobs, "finalHours");
  const totalEstimatedHours = sumHours(completedReportJobs, "hours");
  const reportTechs = reportTechId === "all" ? techs : techs.filter((tech) => tech.id === reportTechId);
  const reportDateFilter = getDateRangeFilter(reportRange);
  const reportMessages = messages.filter((message) => {
    const rawCreatedAt = typeof message.createdAt?.toMillis === "function" ? message.createdAt.toMillis() : message.createdAt;
    const createdAt = Number(rawCreatedAt) || Date.parse(rawCreatedAt) || 0;
    const inDateRange = reportDateFilter.start === null || (createdAt >= reportDateFilter.start && createdAt < reportDateFilter.end);
    const matchesSkill = reportSkill === "all" || message.currentSkill === reportSkill;
    return inDateRange && matchesSkill;
  });
  const techPerformance = buildTechPerformanceReport(reportJobs, reportTechs, reportMessages);
  const reportCards = [
    { label: "Total completed ROs", value: completedReportJobs.length },
    { label: "Total final hours", value: totalFinalHours.toFixed(1) },
    { label: "Total estimated hours", value: totalEstimatedHours.toFixed(1) },
    { label: "Final vs estimated", value: (totalFinalHours - totalEstimatedHours).toFixed(1) },
    { label: "Avg final hours per completed RO", value: completedReportJobs.length ? (totalFinalHours / completedReportJobs.length).toFixed(1) : "0.0" },
    { label: "Open ROs", value: reportJobs.filter((job) => job.status !== "Completed").length },
    { label: "Waiting acceptance", value: reportJobs.filter((job) => job.status === "Dispatched").length },
    { label: "In progress", value: reportJobs.filter((job) => job.status === "In Progress").length }
  ];

  function formatCompletedDate(job) {
    const millis = getJobCompletedTime(job);
    return millis ? new Date(millis).toLocaleString() : "Not recorded";
  }

  function formatMessageDate(message) {
    const rawCreatedAt = typeof message.createdAt?.toMillis === "function" ? message.createdAt.toMillis() : message.createdAt;
    const createdAt = Number(rawCreatedAt) || Date.parse(rawCreatedAt) || 0;
    return createdAt ? new Date(createdAt).toLocaleString() : "Not recorded";
  }

  async function login() {
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch (error) {
      alert(error.message);
    }
  }

  async function firstTimeSetup() {
    const normalizedEmail = setupEmail.trim().toLowerCase();
    const normalizedCode = setupCode.trim().toUpperCase();
    if (!normalizedEmail || !setupPassword || !normalizedCode) return;

    setupInProgress.current = true;
    let createdUser = null;
    try {
      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, setupPassword);
      createdUser = credential.user;
      const techSnap = await getDocs(query(collection(db, "techs"), where("setupCode", "==", normalizedCode), limit(1)));

      if (techSnap.empty) {
        await deleteUser(credential.user);
        setUser(null);
        setRole(null);
        setCurrentTech(null);
        setAuthReady(true);
        alert("Invalid or already used setup code.");
        return;
      }

      const techDoc = techSnap.docs[0];
      const tech = techDoc.data();
      if (tech.authUid || tech.setupCodeUsed) {
        await deleteUser(credential.user);
        setUser(null);
        setRole(null);
        setCurrentTech(null);
        setAuthReady(true);
        alert("This setup code has already been used.");
        return;
      }

      await updateDoc(doc(db, "techs", techDoc.id), {
        authUid: credential.user.uid,
        email: normalizedEmail,
        setupCode: deleteField(),
        setupCodeUsed: true,
        setupCodeUsedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setSetupEmail("");
      setSetupPassword("");
      setSetupCode("");
      setUser(credential.user);
      setCurrentTech({ ...tech, id: techDoc.id, authUid: credential.user.uid, email: normalizedEmail, setupCode: null, setupCodeUsed: true });
      setRole("tech");
      setAuthReady(true);
      setNotice("Technician setup complete.");
    } catch (error) {
      if (createdUser) {
        await signOut(auth);
        setUser(null);
        setRole(null);
        setCurrentTech(null);
      }
      setAuthReady(true);
      alert(error.message);
    } finally {
      setupInProgress.current = false;
    }
  }

  async function addNotification(audience, title, body, ro = "") {
    await addDoc(collection(db, "notifications"), { audience, title, body, ro, read: false, createdAt: serverTimestamp() });
  }

  async function addTech() {
    if (!newTechName.trim()) return;
    const setupCode = generateSetupCode();
    await addDoc(collection(db, "techs"), {
      name: newTechName.trim(),
      skills: newTechSkills,
      active: true,
      setupCode,
      setupCodeUsed: false,
      authUid: null,
      email: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setNewTechName("");
    setNewTechSkills([]);
    setNotice(`Tech added. Setup code: ${setupCode}`);
  }

  async function deleteTech(tech) {
    const confirmed = window.confirm("Delete this tech? Their active assigned ROs will be moved back to Ready / Unassigned.");
    if (!confirmed) return;

    const activeAssignedJobs = jobs.filter((job) => job.assignedTechId === tech.id && job.status !== "Completed");
    for (const job of activeAssignedJobs) {
      await updateDoc(doc(db, "jobs", job.id), {
        assignedTechId: null,
        assignedTechName: "Unassigned",
        status: "Ready",
        updatedAt: serverTimestamp()
      });
    }

    await deleteDoc(doc(db, "techs", tech.id));
    setNotice(`${tech.name} deleted. ${activeAssignedJobs.length} active ROs moved back to Ready.`);
  }

  async function importRows() {
    const rows = parseCdkText(cdkText);
    for (const row of rows) {
      await addDoc(collection(db, "jobs"), { ...row, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    setNotice(`Imported ${rows.length} ROs.`);
  }

  async function dispatchJob(job) {
    const tech = pickRandomEligibleTech(job, techs, jobs);
    if (!tech) {
      await updateDoc(doc(db, "jobs", job.id), {
        status: "Hold",
        assignedTechId: null,
        assignedTechName: "Unassigned",
        updatedAt: serverTimestamp()
      });
      return;
    }

    await updateDoc(doc(db, "jobs", job.id), {
      status: "Dispatched",
      assignedTechId: tech.id,
      assignedTechName: tech.name,
      updatedAt: serverTimestamp()
    });
    await addNotification(tech.name, "New RO Dispatched", `RO ${job.ro} was dispatched to you.`, job.ro);
    setNotice(`RO ${job.ro} sent to ${tech.name}.`);
  }

  async function dispatchAll() {
    const workload = jobs.reduce((acc, current) => {
      if (!current.assignedTechId || current.status === "Completed") return acc;
      acc[current.assignedTechId] = (acc[current.assignedTechId] || 0) + toSafeHours(current.hours);
      return acc;
    }, {});
    let dispatchedCount = 0;
    let heldCount = 0;

    for (const job of jobs.filter((j) => j.status === "Ready" && !j.assignedTechId)) {
      const eligible = techs.filter((tech) => tech.active && tech.skills.includes(job.skill));
      if (!eligible.length) {
        await updateDoc(doc(db, "jobs", job.id), {
          status: "Hold",
          assignedTechId: null,
          assignedTechName: "Unassigned",
          updatedAt: serverTimestamp()
        });
        heldCount += 1;
        continue;
      }

      const lowest = Math.min(...eligible.map((tech) => workload[tech.id] || 0));
      const lightest = eligible.filter((tech) => (workload[tech.id] || 0) === lowest);
      const tech = lightest[Math.floor(Math.random() * lightest.length)];

      await updateDoc(doc(db, "jobs", job.id), {
        status: "Dispatched",
        assignedTechId: tech.id,
        assignedTechName: tech.name,
        updatedAt: serverTimestamp()
      });
      await addNotification(tech.name, "New RO Dispatched", `RO ${job.ro} was dispatched to you.`, job.ro);
      workload[tech.id] = (workload[tech.id] || 0) + toSafeHours(job.hours);
      dispatchedCount += 1;
    }

    setDispatcherTab(dispatchedCount ? "dispatched" : "ready");
    setNotice(`Randomized ${dispatchedCount} ready ROs.${heldCount ? ` Moved ${heldCount} to Hold.` : ""}`);
  }

  async function changeJob(job, patch) {
    await updateDoc(doc(db, "jobs", job.id), { ...patch, updatedAt: serverTimestamp() });
  }

  async function accept(job) {
    await changeJob(job, { status: "Accepted" });
    await addNotification("Dispatch", "RO Accepted", `${job.assignedTechName} accepted RO ${job.ro}.`, job.ro);
  }

  async function start(job) {
    await changeJob(job, { status: "In Progress" });
    await addNotification("Dispatch", "RO Started", `${job.assignedTechName} started RO ${job.ro}.`, job.ro);
  }

  async function complete(job) {
    const finalHours = toSafeHours(job.finalHours ?? job.hours);
    await changeJob(job, {
      status: "Completed",
      finalHours,
      completedAt: serverTimestamp(),
      completedByTechId: selectedTech?.id || job.assignedTechId || null,
      completedByTechName: selectedTech?.name || job.assignedTechName || "Unknown tech"
    });
    await addNotification("Dispatch", "RO Completed", `${job.assignedTechName} completed RO ${job.ro}.`, job.ro);
  }

  async function sendDispatchMessage(job) {
    if (!selectedTech) return;
    const draft = messageDrafts[job.id] || { reason: "Wrong Skill", note: "" };
    const reason = draft.reason || "Wrong Skill";
    const note = draft.note ?? "";
    await addDoc(collection(db, "messages"), {
      jobId: job.id,
      ro: job.ro,
      vehicle: job.vehicle,
      currentSkill: job.skill,
      assignedTechId: job.assignedTechId || selectedTech.id,
      assignedTechName: job.assignedTechName || selectedTech.name,
      fromTechId: selectedTech.id,
      fromTechName: selectedTech.name,
      reason,
      note,
      status: "Open",
      createdAt: serverTimestamp()
    });
    await addNotification("Dispatch", "Tech Message", `${selectedTech.name} sent a message on RO ${job.ro}: ${reason}${note ? ` - ${note}` : ""}`, job.ro);
    setMessageDrafts((drafts) => ({ ...drafts, [job.id]: { reason, note: "" } }));
    setNotice("Message sent to dispatch");
  }

  async function resolveMessage(message) {
    await updateDoc(doc(db, "messages", message.id), {
      status: "Resolved",
      resolvedAt: serverTimestamp(),
      resolvedBy: user?.email || dispatcherEmail
    });
    setNotice(`Message for RO ${message.ro} resolved.`);
  }

  function jumpToMessageRo(message) {
    const targetJob = jobs.find((job) => job.id === message.jobId || job.ro === message.ro);
    if (targetJob?.status === "Completed") setDispatcherTab("history");
    else if (targetJob?.assignedTechId) setDispatcherTab("dispatched");
    else setDispatcherTab("ready");
    setSearch(message.ro || "");
    setDispatcherHistorySearch(message.ro || "");
    setNotice(`Filtered to RO ${message.ro}.`);
  }

  if (!authReady && user) {
    return (
      <main className="page center">
        <section className="card login">
          <h1>CDK RO Skill Dispatcher</h1>
          <p>Loading your workspace...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page center">
        <section className="card login">
          <h1>CDK RO Skill Dispatcher</h1>
          <p>Sign in with your work email and password.</p>

          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button onClick={login}>Sign In</Button>
          <Button variant="secondary" onClick={() => setShowSetup((current) => !current)}>First-Time Setup</Button>

          {showSetup && (
            <div className="setup-panel">
              <h2>First-Time Setup</h2>
              <input placeholder="Email" value={setupEmail} onChange={(e) => setSetupEmail(e.target.value)} />
              <input placeholder="Password" type="password" value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} />
              <input placeholder="Setup code" value={setupCode} onChange={(e) => setSetupCode(e.target.value)} />
              <Button onClick={firstTimeSetup}>Create Account</Button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="top">
        <div>
          <h1>CDK RO Skill Dispatcher</h1>
          <p>Live shop dispatch board for CDK RO exports.</p>
        </div>
        <Button variant="secondary" onClick={() => signOut(auth)}>Sign Out</Button>
      </header>

      <nav className="nav">
        <span>{role === "dispatcher" ? "Dispatcher View" : `${selectedTech?.name || "Tech"} View`}</span>
      </nav>

      <p className="notice">{notice}</p>

      <section className="grid stats">
        <div className="card"><b>ROs</b><h2>{role === "dispatcher" ? jobs.filter((job) => job.status !== "Completed").length : activeJobs.length}</h2></div>
        <div className="card"><b>Notifications</b><h2>{myNotifications.length}</h2></div>
        <div className="card"><b>Tech Alerts</b><h2>{openMessages.length}</h2></div>
      </section>

      {role === "tech" && techHourSummary && (
        <section className="card reports">
          <div className="report-header">
            <div>
              <h2>Tech Hours</h2>
              <p>Completed work for {selectedTech?.name}.</p>
            </div>
            <div className="tabs">
              <button className={techTab === "active" ? "tab active" : "tab"} onClick={() => setTechTab("active")}>Active</button>
              <button className={techTab === "history" ? "tab active" : "tab"} onClick={() => setTechTab("history")}>History</button>
            </div>
          </div>
          <div className="report-cards">
            <div className="report-card"><span>Today completed hours</span><b>{techHourSummary.todayHours.toFixed(1)}</b></div>
            <div className="report-card"><span>This week completed hours</span><b>{techHourSummary.weekHours.toFixed(1)}</b></div>
            <div className="report-card"><span>This month completed hours</span><b>{techHourSummary.monthHours.toFixed(1)}</b></div>
            <div className="report-card"><span>All-time completed hours</span><b>{techHourSummary.allTimeHours.toFixed(1)}</b></div>
            <div className="report-card"><span>Completed RO count</span><b>{techHourSummary.completedCount}</b></div>
            <div className="report-card"><span>Avg final hours per completed RO</span><b>{techHourSummary.averageFinalHours.toFixed(1)}</b></div>
          </div>
        </section>
      )}

      {role === "dispatcher" && (
        <section className="grid two">
          <div className="card">
            <h2>Import CDK ROs</h2>
            <textarea value={cdkText} onChange={(e) => setCdkText(e.target.value)} />
            <p>Format: RO, Vehicle, Concern, S-Code, Hours, Notes</p>
            <Button onClick={importRows}>Import</Button>
            <Button variant="secondary" onClick={dispatchAll}>Randomize All Ready</Button>
          </div>

          <div className="card">
            <h2>Add Tech</h2>
            <input placeholder="Tech name" value={newTechName} onChange={(e) => setNewTechName(e.target.value)} />
            <div className="chips">
              {skillTypes.map((s) => (
                <button
                  key={s}
                  className={newTechSkills.includes(s) ? "chip active" : "chip"}
                  onClick={() => setNewTechSkills((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s])}
                >
                  {s}
                </button>
              ))}
            </div>
            <Button onClick={addTech}>Add Tech</Button>

            <div className="tech-list">
              {techs.map((tech) => (
                <div className="tech-row" key={tech.id}>
                  <b>{tech.name}</b>
                  <span>{tech.email || "Not set up"}</span>
                  {tech.setupCode && <code>{tech.setupCode}</code>}
                  <Button variant="warn" onClick={() => deleteTech(tech)}>Delete</Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {role === "dispatcher" && (
        <section className="card messages">
          <div className="report-header">
            <div>
              <h2>Messages To Dispatch</h2>
              <p>Open messages are shown first.</p>
            </div>
          </div>

          <h3>Open</h3>
          {openMessages.map((m) => (
            <div className="alert message-item" key={m.id}>
              <div>
                <b>RO {m.ro}: {m.reason}</b>
                <p>{m.vehicle} - {m.fromTechName || m.fromTech || m.assignedTechName || "Unknown tech"}</p>
                <p><b>Note:</b> {m.note || "No note added."}</p>
                <span>{formatMessageDate(m)}</span>
              </div>
              <div className="actions">
                <Button variant="secondary" onClick={() => jumpToMessageRo(m)}>Jump to RO</Button>
                <Button onClick={() => resolveMessage(m)}>Mark Resolved</Button>
              </div>
            </div>
          ))}
          {!openMessages.length && <p>No open messages.</p>}

          <details>
            <summary>Resolved Messages ({resolvedMessages.length})</summary>
            {resolvedMessages.map((m) => (
              <div className="alert message-item resolved" key={m.id}>
                <div>
                  <b>RO {m.ro}: {m.reason}</b>
                  <p>{m.vehicle} - {m.fromTechName || m.fromTech || m.assignedTechName || "Unknown tech"}</p>
                  <p><b>Note:</b> {m.note || "No note added."}</p>
                  <span>{formatMessageDate(m)}</span>
                </div>
                <Button variant="secondary" onClick={() => jumpToMessageRo(m)}>Jump to RO</Button>
              </div>
            ))}
          </details>
        </section>
      )}

      {role === "dispatcher" && (
        <section className="card">
          <div className="report-header">
            <div>
              <h2>RO Workflow</h2>
              <p>Ready ROs are unassigned. Dispatched ROs are assigned and still active.</p>
            </div>
            <div className="tabs">
              <button className={dispatcherTab === "ready" ? "tab active" : "tab"} onClick={() => setDispatcherTab("ready")}>Ready</button>
              <button className={dispatcherTab === "dispatched" ? "tab active" : "tab"} onClick={() => setDispatcherTab("dispatched")}>Dispatched</button>
              <button className={dispatcherTab === "history" ? "tab active" : "tab"} onClick={() => setDispatcherTab("history")}>History</button>
            </div>
          </div>
          <div className="report-cards">
            <div className="report-card"><span>Ready or Hold</span><b>{readyJobs.length}</b></div>
            <div className="report-card"><span>Dispatched active</span><b>{dispatchedJobs.length}</b></div>
            <div className="report-card"><span>Completed history</span><b>{jobs.filter((job) => job.status === "Completed").length}</b></div>
          </div>
        </section>
      )}

      {role === "dispatcher" && (
        <section className="card reports">
          <div className="report-header">
            <div>
              <h2>Reports</h2>
              <p>Hours and tech performance from Firestore jobs.</p>
            </div>
            <div className="report-filters">
              <Select value={reportRange} onChange={setReportRange}>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
              </Select>
              <Select value={reportTechId} onChange={setReportTechId}>
                <option value="all">All techs</option>
                {techs.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}
              </Select>
              <Select value={reportSkill} onChange={setReportSkill}>
                <option value="all">All S-codes</option>
                {skillTypes.map((skill) => <option value={skill} key={skill}>{skill}</option>)}
              </Select>
            </div>
          </div>

          <div className="report-cards">
            {reportCards.map((card) => (
              <div className="report-card" key={card.label}>
                <span>{card.label}</span>
                <b>{card.value}</b>
              </div>
            ))}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tech</th>
                  <th>Completed ROs</th>
                  <th>Final Hours</th>
                  <th>Est Hours</th>
                  <th>Diff</th>
                  <th>Avg Final</th>
                  <th>Open</th>
                  <th>In Progress</th>
                  <th>Accepted</th>
                  <th>Waiting</th>
                  <th>Alerts</th>
                </tr>
              </thead>
              <tbody>
                {techPerformance.map((row) => (
                  <tr key={row.techId}>
                    <td>{row.name}</td>
                    <td>{row.completedRos}</td>
                    <td>{row.finalHoursTotal.toFixed(1)}</td>
                    <td>{row.estimatedHoursTotal.toFixed(1)}</td>
                    <td>{row.difference.toFixed(1)}</td>
                    <td>{row.averageFinalHours.toFixed(1)}</td>
                    <td>{row.openRos}</td>
                    <td>{row.inProgressRos}</td>
                    <td>{row.acceptedRos}</td>
                    <td>{row.waitingAcceptanceRos}</td>
                    <td>{row.alertsSent}</td>
                  </tr>
                ))}
                {!techPerformance.length && (
                  <tr>
                    <td colSpan="11">No techs match this report.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {role === "dispatcher" && dispatcherTab === "history" && (
        <section className="card reports">
          <div className="report-header">
            <div>
              <h2>Completed History</h2>
              <p>Completed ROs across the shop.</p>
            </div>
            <div className="report-filters">
              <input placeholder="Search completed ROs" value={dispatcherHistorySearch} onChange={(e) => setDispatcherHistorySearch(e.target.value)} />
              <Select value={dispatcherHistoryRange} onChange={setDispatcherHistoryRange}>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
              </Select>
              <Select value={dispatcherHistoryTechId} onChange={setDispatcherHistoryTechId}>
                <option value="all">All techs</option>
                {techs.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}
              </Select>
              <Select value={dispatcherHistorySkill} onChange={setDispatcherHistorySkill}>
                <option value="all">All S-codes</option>
                {skillTypes.map((skill) => <option value={skill} key={skill}>{skill}</option>)}
              </Select>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>RO</th>
                  <th>Tech</th>
                  <th>Vehicle</th>
                  <th>Skill</th>
                  <th>Est Hours</th>
                  <th>Final Hours</th>
                  <th>Completed</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {dispatcherHistoryJobs.map((job) => (
                  <React.Fragment key={job.id}>
                    <tr>
                      <td>{job.ro}</td>
                      <td>{job.completedByTechName || job.assignedTechName}</td>
                      <td>{job.vehicle}</td>
                      <td>{job.skill}</td>
                      <td>{toSafeHours(job.hours).toFixed(1)}</td>
                      <td>{toSafeHours(job.finalHours ?? job.hours).toFixed(1)}</td>
                      <td>{formatCompletedDate(job)}</td>
                      <td><Button variant="secondary" onClick={() => setExpandedJobId((id) => id === job.id ? "" : job.id)}>View</Button></td>
                    </tr>
                    {expandedJobId === job.id && (
                      <tr className="detail-row">
                        <td colSpan="8">
                          <b>{job.concern}</b>
                          <p>{job.notes}</p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {!dispatcherHistoryJobs.length && (
                  <tr><td colSpan="8">No completed ROs match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {role === "tech" && techTab === "history" && (
        <section className="card reports">
          <div className="report-header">
            <div>
              <h2>History</h2>
              <p>Completed ROs assigned to you.</p>
            </div>
            <div className="report-filters">
              <input placeholder="Search completed ROs" value={techHistorySearch} onChange={(e) => setTechHistorySearch(e.target.value)} />
              <Select value={techHistoryRange} onChange={setTechHistoryRange}>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
              </Select>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>RO</th>
                  <th>Vehicle</th>
                  <th>Concern</th>
                  <th>Skill</th>
                  <th>Est Hours</th>
                  <th>Final Hours</th>
                  <th>Completed</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {techHistoryJobs.map((job) => (
                  <React.Fragment key={job.id}>
                    <tr>
                      <td>{job.ro}</td>
                      <td>{job.vehicle}</td>
                      <td>{job.concern}</td>
                      <td>{job.skill}</td>
                      <td>{toSafeHours(job.hours).toFixed(1)}</td>
                      <td><input className="hours-input" type="number" step="0.1" value={job.finalHours ?? job.hours} onChange={(e) => changeJob(job, { finalHours: toSafeHours(e.target.value) })} /></td>
                      <td>{formatCompletedDate(job)}</td>
                      <td><Button variant="secondary" onClick={() => setExpandedJobId((id) => id === job.id ? "" : job.id)}>View</Button></td>
                    </tr>
                    {expandedJobId === job.id && (
                      <tr className="detail-row">
                        <td colSpan="8">
                          <b>{job.concern}</b>
                          <p>{job.notes}</p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {!techHistoryJobs.length && (
                  <tr><td colSpan="8">No completed ROs match your history filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {((role === "dispatcher" && dispatcherTab !== "history") || (role === "tech" && techTab === "active")) && <section className="card">
        <input placeholder={role === "dispatcher" ? `Search ${dispatcherTab} ROs` : "Search"} value={search} onChange={(e) => setSearch(e.target.value)} />
      </section>}

      {((role === "dispatcher" && dispatcherTab !== "history") || (role === "tech" && techTab === "active")) && <section className="jobs">
        {filteredJobs.map((job) => (
          <article className="card" key={job.id}>
            <h2>RO {job.ro}</h2>
            <p>{job.vehicle}</p>
            <p><b>{job.skill}</b> - Est {toSafeHours(job.hours).toFixed(1)} hrs - {job.status}</p>
            <p>{job.concern}</p>
            <p>{job.notes}</p>

            {role === "dispatcher" && (
              <div className="actions">
                {["Ready", "Hold"].includes(job.status) && !job.assignedTechId && <Button onClick={() => dispatchJob(job)}>Random Dispatch</Button>}
                <Select value={job.skill} onChange={(v) => changeJob(job, { skill: normalizeSkill(v) })}>
                  {["Uncoded", ...skillTypes].map((s) => <option key={s}>{s}</option>)}
                </Select>
                <Select value={job.status} onChange={(v) => changeJob(job, { status: v })}>
                  {statuses.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </div>
            )}

            {role === "tech" && (
              <div className="actions">
                <Button variant="accept" disabled={job.status !== "Dispatched"} onClick={() => accept(job)}>Accept</Button>
                <Button disabled={job.status !== "Accepted"} onClick={() => start(job)}>Start</Button>
                <Button disabled={job.status !== "In Progress"} onClick={() => complete(job)}>Complete</Button>
                {["Accepted", "In Progress"].includes(job.status) && (
                  <input type="number" step="0.1" value={job.finalHours ?? job.hours} onChange={(e) => changeJob(job, { finalHours: toSafeHours(e.target.value) })} />
                )}
                <Select value={(messageDrafts[job.id]?.reason) || "Wrong Skill"} onChange={(v) => setMessageDrafts((d) => ({ ...d, [job.id]: { ...(d[job.id] || {}), reason: v } }))}>
                  {messageReasons.map((r) => <option key={r}>{r}</option>)}
                </Select>
                <input placeholder="Message dispatch" value={messageDrafts[job.id]?.note || ""} onChange={(e) => setMessageDrafts((d) => ({ ...d, [job.id]: { ...(d[job.id] || {}), note: e.target.value } }))} />
                <Button variant="warn" onClick={() => sendDispatchMessage(job)}>Send Message</Button>
              </div>
            )}
          </article>
        ))}
      </section>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}
