import type { Employee } from "./types";

/** A ~40-person sample org with deliberately uneven spans and depth. */
export const SAMPLE_ROSTER: Employee[] = [
  { id: "1", name: "Dana Wells", title: "CEO", managerId: null, salary: 480000, level: "E", department: "Executive", location: "HQ" },

  { id: "2", name: "Marcus Lee", title: "VP Engineering", managerId: "1", salary: 320000, level: "VP", department: "Engineering", location: "HQ" },
  { id: "3", name: "Priya Nair", title: "VP Sales", managerId: "1", salary: 310000, level: "VP", department: "Sales", location: "NYC" },
  { id: "4", name: "Tom Becker", title: "VP Operations", managerId: "1", salary: 300000, level: "VP", department: "Operations", location: "HQ" },
  { id: "5", name: "Sofia Ramos", title: "Chief of Staff", managerId: "1", salary: 210000, level: "D", department: "Executive", location: "HQ" },

  // Engineering — Marcus
  { id: "6", name: "Aiden Cole", title: "Director, Platform", managerId: "2", salary: 240000, level: "D", department: "Engineering", location: "HQ" },
  { id: "7", name: "Bea Lin", title: "Director, Product Eng", managerId: "2", salary: 238000, level: "D", department: "Engineering", location: "SF" },
  { id: "8", name: "Carl Yu", title: "Eng Manager, Infra", managerId: "6", salary: 195000, level: "M", department: "Engineering", location: "HQ" },
  { id: "9", name: "Deepa Rao", title: "Eng Manager, Data", managerId: "6", salary: 198000, level: "M", department: "Engineering", location: "SF" },
  { id: "10", name: "Evan Park", title: "Senior Engineer", managerId: "8", salary: 170000, level: "IC4", department: "Engineering", location: "HQ" },
  { id: "11", name: "Fern Diaz", title: "Engineer", managerId: "8", salary: 140000, level: "IC3", department: "Engineering", location: "HQ" },
  { id: "12", name: "Gabe Stone", title: "Engineer", managerId: "8", salary: 138000, level: "IC3", department: "Engineering", location: "Remote" },
  { id: "13", name: "Hana Ito", title: "Data Engineer", managerId: "9", salary: 165000, level: "IC4", department: "Engineering", location: "SF" },
  { id: "14", name: "Ravi Shah", title: "Data Engineer", managerId: "9", salary: 142000, level: "IC3", department: "Engineering", location: "SF", isVacancy: true },
  { id: "15", name: "Ivy Chen", title: "Eng Manager, Web", managerId: "7", salary: 192000, level: "M", department: "Engineering", location: "SF" },
  { id: "16", name: "Jon Adams", title: "Eng Manager, Mobile", managerId: "7", salary: 190000, level: "M", department: "Engineering", location: "Remote" },
  { id: "17", name: "Kira Voss", title: "Senior Engineer", managerId: "15", salary: 172000, level: "IC4", department: "Engineering", location: "SF" },
  { id: "18", name: "Liam Roe", title: "Engineer", managerId: "15", salary: 139000, level: "IC3", department: "Engineering", location: "Remote" },
  { id: "19", name: "Mona Vale", title: "Engineer", managerId: "16", salary: 141000, level: "IC3", department: "Engineering", location: "Remote" },

  // Sales — Priya (one very wide span)
  { id: "20", name: "Nate Frost", title: "Director, Enterprise", managerId: "3", salary: 225000, level: "D", department: "Sales", location: "NYC" },
  { id: "21", name: "Omar Reed", title: "AE", managerId: "20", salary: 130000, level: "IC3", department: "Sales", location: "NYC" },
  { id: "22", name: "Pam Hill", title: "AE", managerId: "20", salary: 128000, level: "IC3", department: "Sales", location: "NYC" },
  { id: "23", name: "Quinn Ash", title: "AE", managerId: "20", salary: 127000, level: "IC3", department: "Sales", location: "Boston" },
  { id: "24", name: "Rosa Mejia", title: "AE", managerId: "20", salary: 131000, level: "IC3", department: "Sales", location: "NYC" },
  { id: "25", name: "Sam Doyle", title: "AE", managerId: "20", salary: 126000, level: "IC3", department: "Sales", location: "Remote" },
  { id: "26", name: "Tina Bloom", title: "AE", managerId: "20", salary: 129000, level: "IC3", department: "Sales", location: "NYC" },
  { id: "27", name: "Uma Ford", title: "AE", managerId: "20", salary: 125000, level: "IC3", department: "Sales", location: "Chicago" },
  { id: "28", name: "Vic Lane", title: "AE", managerId: "20", salary: 124000, level: "IC3", department: "Sales", location: "Remote", isVacancy: true },
  { id: "29", name: "Will Korn", title: "Director, SMB", managerId: "3", salary: 215000, level: "D", department: "Sales", location: "Austin" },
  { id: "30", name: "Xena Pratt", title: "AE", managerId: "29", salary: 118000, level: "IC2", department: "Sales", location: "Austin" },
  { id: "31", name: "Yara Sole", title: "AE", managerId: "29", salary: 119000, level: "IC2", department: "Sales", location: "Austin" },

  // Operations — Tom (deep, narrow chain)
  { id: "32", name: "Zane Hart", title: "Director, Ops", managerId: "4", salary: 205000, level: "D", department: "Operations", location: "HQ" },
  { id: "33", name: "Abby Cruz", title: "Ops Manager", managerId: "32", salary: 160000, level: "M", department: "Operations", location: "HQ" },
  { id: "34", name: "Ben Otto", title: "Ops Lead", managerId: "33", salary: 120000, level: "IC3", department: "Operations", location: "HQ" },
  { id: "35", name: "Cleo Maris", title: "Ops Analyst", managerId: "34", salary: 95000, level: "IC2", department: "Operations", location: "HQ" },
  { id: "36", name: "Drew Bana", title: "Ops Coordinator", managerId: "35", salary: 78000, level: "IC1", department: "Operations", location: "HQ" },

  { id: "37", name: "Elle Tran", title: "People Partner", managerId: "5", salary: 145000, level: "M", department: "People", location: "HQ" },
  { id: "38", name: "Finn Moss", title: "Recruiter", managerId: "37", salary: 105000, level: "IC2", department: "People", location: "HQ" },
];

export const SAMPLE_CSV = [
  "Employee ID,Name,Job Title,Manager ID,Salary,Level,Department,Location,Vacancy",
  ...SAMPLE_ROSTER.map((e) =>
    [e.id, e.name, e.title ?? "", e.managerId ?? "", e.salary ?? "", e.level ?? "", e.department ?? "", e.location ?? "", e.isVacancy ? "Yes" : ""].join(",")
  ),
].join("\n");
