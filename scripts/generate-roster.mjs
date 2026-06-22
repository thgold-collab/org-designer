// Generates a realistic ~600-person org roster CSV with varied spans, depth,
// comp, departments, locations, levels, tenure, ratings, and some vacancies.
// Usage: node scripts/generate-roster.mjs [count] > test-roster-600.csv

const TARGET = Number(process.argv[2] || 600);

// Deterministic PRNG so re-runs are stable.
let seed = 1234567;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randint = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const FIRST = [
  "James","Mary","John","Patricia","Robert","Jennifer","Michael","Linda","David","Elizabeth",
  "William","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Sarah","Charles","Karen",
  "Aisha","Wei","Priya","Diego","Yuki","Omar","Fatima","Chen","Ananya","Mateo",
  "Nia","Kenji","Sofia","Ravi","Lena","Tariq","Mei","Pablo","Zara","Ibrahim",
  "Grace","Noah","Olivia","Liam","Emma","Lucas","Ava","Ethan","Maya","Leo",
];
const LAST = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez",
  "Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Lee",
  "Patel","Nguyen","Kim","Chen","Singh","Khan","Ali","Wang","Yamamoto","Okafor",
  "Cohen","Rossi","Müller","Andersson","Ivanov","Santos","Costa","Dubois","Novak","Haddad",
];

// Departments with their own size weight and location bias.
const DEPARTMENTS = [
  { name: "Engineering", weight: 34, locations: ["HQ - Seattle","SF Bay Area","Remote - US","Bangalore","Remote - EU"] },
  { name: "Sales", weight: 18, locations: ["New York","Chicago","Austin","London","Remote - US"] },
  { name: "Customer Success", weight: 12, locations: ["Austin","Dublin","Remote - US","Singapore"] },
  { name: "Marketing", weight: 8, locations: ["HQ - Seattle","New York","Remote - US"] },
  { name: "Operations", weight: 9, locations: ["HQ - Seattle","Austin","Bangalore"] },
  { name: "Finance", weight: 6, locations: ["HQ - Seattle","New York"] },
  { name: "People", weight: 5, locations: ["HQ - Seattle","Remote - US"] },
  { name: "Product", weight: 5, locations: ["HQ - Seattle","SF Bay Area","Remote - US"] },
  { name: "Legal", weight: 3, locations: ["HQ - Seattle","New York"] },
];

const RATINGS = ["Exceeds","Exceeds","Meets","Meets","Meets","Meets","Developing","Outstanding"];

// Level definitions: title pattern + salary band. Higher index = more senior.
const LEVELS = {
  CEO:    { salary: [450000, 600000], title: () => "CEO" },
  EVP:    { salary: [320000, 420000], title: (d) => `EVP, ${d}` },
  VP:     { salary: [240000, 330000], title: (d) => `VP, ${d}` },
  SrDir:  { salary: [190000, 250000], title: (d) => `Senior Director, ${d}` },
  Dir:    { salary: [160000, 210000], title: (d) => `Director, ${d}` },
  SrMgr:  { salary: [140000, 180000], title: (d) => `Senior Manager, ${d}` },
  Mgr:    { salary: [120000, 155000], title: (d) => `Manager, ${d}` },
  IC4:    { salary: [150000, 200000], title: (d) => `Principal ${icRole(d)}` },
  IC3:    { salary: [120000, 160000], title: (d) => `Senior ${icRole(d)}` },
  IC2:    { salary: [90000, 125000], title: (d) => icRole(d) },
  IC1:    { salary: [65000, 95000], title: (d) => `Associate ${icRole(d)}` },
};

function icRole(dept) {
  switch (dept) {
    case "Engineering": return "Engineer";
    case "Sales": return "Account Executive";
    case "Customer Success": return "CSM";
    case "Marketing": return "Marketer";
    case "Operations": return "Operations Analyst";
    case "Finance": return "Financial Analyst";
    case "People": return "People Partner";
    case "Product": return "Product Manager";
    case "Legal": return "Counsel";
    default: return "Specialist";
  }
}

const usedNames = new Set();
function name() {
  for (let i = 0; i < 50; i++) {
    const n = `${pick(FIRST)} ${pick(LAST)}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
  return `${pick(FIRST)} ${pick(LAST)} ${randint(2, 99)}`;
}

let nextId = 1000;
const people = [];
function add(level, dept, managerId, location) {
  const id = `E${nextId++}`;
  const band = LEVELS[level].salary;
  const salary = Math.round((band[0] + rand() * (band[1] - band[0])) / 1000) * 1000;
  const isVacancy = rand() < 0.04; // ~4% open reqs
  people.push({
    id,
    name: isVacancy ? "(Open Req)" : name(),
    title: LEVELS[level].title(dept),
    managerId: managerId ?? "",
    salary,
    level,
    fte: rand() < 0.06 ? "0.5" : "1.0",
    department: dept,
    location: location ?? pick(DEPARTMENTS.find((d) => d.name === dept).locations),
    costCenter: `CC-${dept.slice(0, 3).toUpperCase()}-${randint(100, 199)}`,
    tenureMonths: randint(1, 140),
    rating: isVacancy ? "" : pick(RATINGS),
    isVacancy,
  });
  return id;
}

// --- Build hierarchy ---
const ceo = add("CEO", "Executive", "", "HQ - Seattle");

// Weighted allocation of remaining headcount to departments.
const totalWeight = DEPARTMENTS.reduce((a, d) => a + d.weight, 0);
const remaining = TARGET - 1;
for (const d of DEPARTMENTS) {
  d.target = Math.max(8, Math.round((d.weight / totalWeight) * remaining));
}

for (const dept of DEPARTMENTS) {
  const loc = () => pick(dept.locations);
  let made = 0;
  const cap = dept.target;

  // Department head reports to CEO.
  const headLevel = dept.target > 60 ? "EVP" : "VP";
  const head = add(headLevel, dept.name, ceo, loc());
  made++;

  // Directors under the head (span 3-6).
  const dirCount = Math.max(2, Math.min(8, Math.round(cap / 22)));
  for (let di = 0; di < dirCount && made < cap; di++) {
    const dirLevel = rand() < 0.3 ? "SrDir" : "Dir";
    const dir = add(dirLevel, dept.name, head, loc());
    made++;

    // Managers under each director (span 2-5). Occasionally a deep extra layer.
    const mgrCount = Math.max(2, Math.min(6, randint(2, 5)));
    for (let mi = 0; mi < mgrCount && made < cap; mi++) {
      const mgrLevel = rand() < 0.25 ? "SrMgr" : "Mgr";
      const mgr = add(mgrLevel, dept.name, dir, loc());
      made++;

      // Deliberately varied spans: most teams 4-8, some very wide (sales pods),
      // a few very narrow (1-2) to surface as flags.
      let span;
      const r = rand();
      if (r < 0.12) span = randint(1, 2);          // narrow
      else if (r > 0.85) span = randint(11, 16);   // wide
      else span = randint(4, 8);                    // healthy

      // Optional extra management layer for ~15% of managers (creates depth).
      const deep = rand() < 0.15 && made + span + 2 < cap;
      let parentForICs = mgr;
      if (deep) {
        const lead = add("Mgr", dept.name, mgr, loc());
        made++;
        parentForICs = lead;
      }

      for (let s = 0; s < span && made < cap; s++) {
        const ic = pick(["IC1", "IC2", "IC2", "IC3", "IC3", "IC4"]);
        add(ic, dept.name, parentForICs, loc());
        made++;
      }
    }
  }

  // Top up any shortfall with ICs spread under existing managers in this dept.
  if (made < cap) {
    const mgrs = people.filter((p) => p.department === dept.name && /Mgr|SrMgr/.test(p.level));
    while (made < cap && mgrs.length) {
      const m = pick(mgrs);
      add(pick(["IC1", "IC2", "IC3"]), dept.name, m.id, loc());
      made++;
    }
  }
}

// --- Emit CSV ---
const headers = [
  "Employee ID","Name","Job Title","Manager ID","Salary","Level","FTE",
  "Department","Location","Cost Center","Tenure (mo)","Rating","Vacancy",
];
const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const lines = [headers.join(",")];
for (const p of people) {
  lines.push([
    p.id, p.name, p.title, p.managerId, p.salary, p.level, p.fte,
    p.department, p.location, p.costCenter, p.tenureMonths, p.rating,
    p.isVacancy ? "Yes" : "",
  ].map(esc).join(","));
}
process.stdout.write(lines.join("\n") + "\n");
process.stderr.write(`Generated ${people.length} people across ${DEPARTMENTS.length} departments.\n`);
