export const skillTypes = ["S10 Maintenance", "S12 Driveability", "S13 Warranty", "S14 Heavy Line", "S16 Transmission", "S17 EV", "S18 HVAC", "S19 Diesel"];
export const statuses = ["Ready", "Dispatched", "Accepted", "In Progress", "Hold", "Completed"];
export const messageReasons = ["Wrong Skill", "Already Being Worked By Another Tech", "Need Dispatch Help"];

export function generateSetupCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function toSafeHours(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 10) / 10;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export function getDateRangeFilter(range, now = new Date()) {
  if (range === "today") {
    const start = startOfToday(now);
    return { start, end: start + 24 * 60 * 60 * 1000 };
  }

  if (range === "week") {
    const today = new Date(startOfToday(now));
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return { start: start.getTime(), end: now.getTime() + 1 };
  }

  if (range === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return { start, end: now.getTime() + 1 };
  }

  return { start: null, end: null };
}

export function filterJobsForReport(jobs, { dateRange = "all", techId = "all", skill = "all" } = {}) {
  const { start, end } = getDateRangeFilter(dateRange);
  return jobs.filter((job) => {
    const jobTime = toMillis(job.updatedAt) || toMillis(job.createdAt);
    const inDateRange = start === null || (jobTime >= start && jobTime < end);
    const matchesTech = techId === "all" || job.assignedTechId === techId;
    const matchesSkill = skill === "all" || job.skill === skill;
    return inDateRange && matchesTech && matchesSkill;
  });
}

export function sumHours(items, field = "hours") {
  return items.reduce((total, item) => {
    const value = field === "finalHours" ? item.finalHours ?? item.hours : item[field];
    return total + toSafeHours(value);
  }, 0);
}

export function buildTechPerformanceReport(jobs, techs, messages = []) {
  return techs.map((tech) => {
    const techJobs = jobs.filter((job) => job.assignedTechId === tech.id);
    const completedJobs = techJobs.filter((job) => job.status === "Completed");
    const finalHoursTotal = sumHours(completedJobs, "finalHours");
    const estimatedHoursTotal = sumHours(completedJobs, "hours");
    const alertsSent = messages.filter((message) => message.fromTech === tech.name).length;

    return {
      techId: tech.id,
      name: tech.name,
      completedRos: completedJobs.length,
      finalHoursTotal,
      estimatedHoursTotal,
      difference: finalHoursTotal - estimatedHoursTotal,
      averageFinalHours: completedJobs.length ? finalHoursTotal / completedJobs.length : 0,
      openRos: techJobs.filter((job) => job.status !== "Completed").length,
      inProgressRos: techJobs.filter((job) => job.status === "In Progress").length,
      acceptedRos: techJobs.filter((job) => job.status === "Accepted").length,
      waitingAcceptanceRos: techJobs.filter((job) => job.status === "Dispatched").length,
      alertsSent
    };
  });
}

export function normalizeSkill(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (raw.includes("s10")) return "S10 Maintenance";
  if (raw.includes("s12")) return "S12 Driveability";
  if (raw.includes("s13")) return "S13 Warranty";
  if (raw.includes("s14")) return "S14 Heavy Line";
  if (raw.includes("s16")) return "S16 Transmission";
  if (raw.includes("s17")) return "S17 EV";
  if (raw.includes("s18")) return "S18 HVAC";
  if (raw.includes("s19")) return "S19 Diesel";
  return "Uncoded";
}

export function parseDelimitedLine(line) {
  const values = [];
  let current = "";
  let insideQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && next === '"') { current += '"'; i += 1; }
    else if (char === '"') insideQuotes = !insideQuotes;
    else if ((char === "," || char === "\t") && !insideQuotes) { values.push(current.trim()); current = ""; }
    else current += char;
  }
  values.push(current.trim());
  return values;
}

export function parseCdkText(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const first = parseDelimitedLine(lines[0]).map((x) => x.toLowerCase());
  const hasHeader = first.some((x) => ["ro", "repair order", "vehicle", "concern", "skill", "hours", "notes"].includes(x));
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines.map((line, index) => {
    const cells = parseDelimitedLine(line);
    const skill = normalizeSkill(cells[3]);
    const hours = toSafeHours(cells[4]);
    return {
      ro: cells[0] || `TEMP-${Date.now()}-${index}`,
      vehicle: cells[1] || "Unknown vehicle",
      concern: cells[2] || "No concern listed",
      skill,
      hours,
      finalHours: hours,
      assignedTechId: null,
      assignedTechName: "Unassigned",
      status: skill === "Uncoded" ? "Hold" : "Ready",
      notes: cells[5] || "Imported from CDK",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });
}

export function pickRandomEligibleTech(job, techs, jobs) {
  const eligible = techs.filter((tech) => tech.active && tech.skills.includes(job.skill));
  if (!eligible.length) return null;
  const load = jobs.reduce((acc, current) => {
    if (!current.assignedTechId || current.status === "Completed") return acc;
    acc[current.assignedTechId] = (acc[current.assignedTechId] || 0) + toSafeHours(current.hours);
    return acc;
  }, {});
  const lowest = Math.min(...eligible.map((tech) => load[tech.id] || 0));
  const lightest = eligible.filter((tech) => (load[tech.id] || 0) === lowest);
  return lightest[Math.floor(Math.random() * lightest.length)];
}
