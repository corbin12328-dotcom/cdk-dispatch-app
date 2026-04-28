import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  messageReasons,
  normalizeSkill,
  parseCdkText,
  pickRandomEligibleTech,
  skillTypes,
  statuses,
  toSafeHours
} from "./utils";
import "./styles.css";

const sample = `RO,Vehicle,Concern,Skill,Hours,Notes
1005011,2020 Tahoe,Check engine light diagnosis,S12,1.0,Needs scan first
1005012,2019 Silverado,Transmission replacement,S16,8.5,Parts here`;

function useCollection(name) {
  const [items, setItems] = useState([]);
  useEffect(() => onSnapshot(query(collection(db, name), orderBy("createdAt", "desc")), (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))), [name]);
  return items;
}

function Button({ children, variant = "primary", ...props }) { return <button className={`btn ${variant}`} {...props}>{children}</button>; }
function Select({ value, onChange, children }) { return <select value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>; }
const userRoles = {
  "forneyc@autonation.com": {
    role: "dispatcher",
    techName: null
  }
};
function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(null);
  const [selectedTechId, setSelectedTechId] = useState("");
  const [cdkText, setCdkText] = useState(sample);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("Ready.");
  const [newTechName, setNewTechName] = useState("");
  const [newTechSkills, setNewTechSkills] = useState([]);
  const [messageDrafts, setMessageDrafts] = useState({});

  const jobs = useCollection("jobs");
  const techs = useCollection("techs");
  const messages = useCollection("messages");
  const notifications = useCollection("notifications");

useEffect(() => {
  return onAuthStateChanged(auth, (u) => {
    setUser(u);

    if (u) {
      const userConfig = userRoles[u.email];

      if (!userConfig) {
        alert("Access denied");
        signOut(auth);
        return;
      }

      setRole(userConfig.role);
    }
  });
}, []);
  const selectedTech = techs.find((t) => t.id === selectedTechId) || techs[0];
  const visibleJobs = role === "dispatcher" ? jobs : jobs.filter((job) => job.assignedTechId === selectedTech?.id);
  const filteredJobs = visibleJobs.filter((job) => JSON.stringify(job).toLowerCase().includes(search.toLowerCase()));
  const openMessages = messages.filter((m) => m.status === "Open");
  const myNotifications = notifications.filter((n) => role === "dispatcher" ? n.audience === "Dispatch" : n.audience === selectedTech?.name);

async function login() {
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    alert(error.message);
  }
}  async function addNotification(audience, title, body, ro = "") { await addDoc(collection(db, "notifications"), { audience, title, body, ro, read: false, createdAt: serverTimestamp() }); }

  async function addTech() {
    if (!newTechName.trim()) return;
    await addDoc(collection(db, "techs"), { name: newTechName.trim(), skills: newTechSkills, active: true, createdAt: serverTimestamp() });
    setNewTechName(""); setNewTechSkills([]); setNotice("Tech added.");
  }

  async function importRows() {
    const rows = parseCdkText(cdkText);
    for (const row of rows) await addDoc(collection(db, "jobs"), { ...row, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    setNotice(`Imported ${rows.length} ROs.`);
  }

  async function dispatchJob(job) {
    const tech = pickRandomEligibleTech(job, techs, jobs);
    if (!tech) { await updateDoc(doc(db, "jobs", job.id), { status: "Hold", assignedTechId: null, assignedTechName: "Unassigned", updatedAt: serverTimestamp() }); return; }
    await updateDoc(doc(db, "jobs", job.id), { status: "Dispatched", assignedTechId: tech.id, assignedTechName: tech.name, updatedAt: serverTimestamp() });
    await addNotification(tech.name, "New RO Dispatched", `RO ${job.ro} was dispatched to you.`, job.ro);
    setNotice(`RO ${job.ro} sent to ${tech.name}.`);
  }

  async function dispatchAll() { for (const job of jobs.filter((j) => j.status === "Ready" && !j.assignedTechId)) await dispatchJob(job); }
  async function changeJob(job, patch) { await updateDoc(doc(db, "jobs", job.id), { ...patch, updatedAt: serverTimestamp() }); }
  async function accept(job) { await changeJob(job, { status: "Accepted" }); await addNotification("Dispatch", "RO Accepted", `${job.assignedTechName} accepted RO ${job.ro}.`, job.ro); }
  async function start(job) { await changeJob(job, { status: "In Progress" }); await addNotification("Dispatch", "RO Started", `${job.assignedTechName} started RO ${job.ro}.`, job.ro); }
  async function complete(job) { await changeJob(job, { status: "Completed", finalHours: job.finalHours ?? job.hours }); await addNotification("Dispatch", "RO Completed", `${job.assignedTechName} completed RO ${job.ro}.`, job.ro); }

  async function sendDispatchMessage(job) {
    const draft = messageDrafts[job.id] || { reason: "Wrong Skill", note: "" };
    await addDoc(collection(db, "messages"), { jobId: job.id, ro: job.ro, vehicle: job.vehicle, currentSkill: job.skill, assignedTech: job.assignedTechName, fromTech: selectedTech.name, reason: draft.reason, note: draft.note || "", status: "Open", createdAt: serverTimestamp() });
    await addNotification("Dispatch", "Tech Message", `${selectedTech.name}: ${draft.reason} on RO ${job.ro}.`, job.ro);
    setNotice("Message sent to dispatch.");
  }

if (!user) return (
  <main className="page center">
    <section className="card login">
      <h1>CDK RO Skill Dispatcher</h1>
      <p>Sign in with your work email and password.</p>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <Button onClick={login}>Sign In</Button>
    </section>
  </main>
);
  return <main className="page"><header className="top"><div><h1>CDK RO Skill Dispatcher</h1><p>Live shop dispatch board for CDK RO exports.</p></div><Button variant="secondary" onClick={() => signOut(auth)}>Sign Out</Button></header>
    <nav className="nav"><Button variant={role === "dispatcher" ? "primary" : "secondary"} onClick={() => setRole("dispatcher")}>Dispatcher</Button><Button variant={role === "tech" ? "primary" : "secondary"} onClick={() => setRole("tech")}>Tech App</Button>{role === "tech" && <Select value={selectedTechId || selectedTech?.id || ""} onChange={setSelectedTechId}>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}</nav>
    <p className="notice">{notice}</p>
    <section className="grid stats"><div className="card"><b>ROs</b><h2>{visibleJobs.length}</h2></div><div className="card"><b>Notifications</b><h2>{myNotifications.length}</h2></div><div className="card"><b>Tech Alerts</b><h2>{openMessages.length}</h2></div></section>
    {role === "dispatcher" && <section className="grid two"><div className="card"><h2>Import CDK ROs</h2><textarea value={cdkText} onChange={(e) => setCdkText(e.target.value)} /><p>Format: RO, Vehicle, Concern, S-Code, Hours, Notes</p><Button onClick={importRows}>Import</Button><Button variant="secondary" onClick={dispatchAll}>Dispatch All Ready</Button></div><div className="card"><h2>Add Tech</h2><input placeholder="Tech name" value={newTechName} onChange={(e) => setNewTechName(e.target.value)} /><div className="chips">{skillTypes.map((s) => <button key={s} className={newTechSkills.includes(s) ? "chip active" : "chip"} onClick={() => setNewTechSkills((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s])}>{s}</button>)}</div><Button onClick={addTech}>Add Tech</Button></div></section>}
    {role === "dispatcher" && <section className="card"><h2>Messages To Dispatch</h2>{openMessages.map((m) => <div className="alert" key={m.id}><b>RO {m.ro}: {m.reason}</b><p>{m.fromTech} — {m.note}</p><Button variant="secondary" onClick={() => updateDoc(doc(db, "messages", m.id), { status: "Resolved" })}>Resolve</Button></div>)}</section>}
    <section className="card"><input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} /></section>
    <section className="jobs">{filteredJobs.map((job) => <article className="card" key={job.id}><h2>RO {job.ro}</h2><p>{job.vehicle}</p><p><b>{job.skill}</b> · Est {toSafeHours(job.hours).toFixed(1)} hrs · {job.status}</p><p>{job.concern}</p><p>{job.notes}</p>{role === "dispatcher" && <div className="actions"><Button onClick={() => dispatchJob(job)}>Random Dispatch</Button><Select value={job.skill} onChange={(v) => changeJob(job, { skill: normalizeSkill(v) })}>{["Uncoded", ...skillTypes].map((s) => <option key={s}>{s}</option>)}</Select><Select value={job.status} onChange={(v) => changeJob(job, { status: v })}>{statuses.map((s) => <option key={s}>{s}</option>)}</Select></div>}{role === "tech" && <div className="actions"><Button variant="accept" disabled={job.status !== "Dispatched"} onClick={() => accept(job)}>Accept</Button><Button disabled={job.status !== "Accepted"} onClick={() => start(job)}>Start</Button><Button disabled={job.status !== "In Progress"} onClick={() => complete(job)}>Complete</Button>{job.status === "Completed" && <input type="number" step="0.1" value={job.finalHours ?? job.hours} onChange={(e) => changeJob(job, { finalHours: toSafeHours(e.target.value) })} />}<Select value={(messageDrafts[job.id]?.reason) || "Wrong Skill"} onChange={(v) => setMessageDrafts((d) => ({ ...d, [job.id]: { ...(d[job.id] || {}), reason: v } }))}>{messageReasons.map((r) => <option key={r}>{r}</option>)}</Select><input placeholder="Message dispatch" onChange={(e) => setMessageDrafts((d) => ({ ...d, [job.id]: { ...(d[job.id] || {}), note: e.target.value } }))} /><Button variant="warn" onClick={() => sendDispatchMessage(job)}>Message Dispatch</Button></div>}</article>)}</section>
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}