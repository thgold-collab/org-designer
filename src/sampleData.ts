import type { Employee } from "./types";
import { parseRoster } from "./csv";
// Embedded at build time so the default org ships in the bundle (no fetch).
import rosterCsv from "../test-roster-600.csv?raw";

/** Default in-app roster: the ~600-person sample organization. */
export const SAMPLE_ROSTER: Employee[] = parseRoster(rosterCsv).employees;

/** The raw CSV behind the default org, offered for download / re-import. */
export const SAMPLE_CSV = rosterCsv;

/** Small, clean CSV offered via the "Get template" button. */
export const TEMPLATE_CSV = [
  "Employee ID,Name,Job Title,Manager ID,Salary,Level,Department,Location,Vacancy",
  "E1,Alex Chen,CEO,,400000,E,Executive,HQ,",
  "E2,Jordan Lee,VP Engineering,E1,300000,VP,Engineering,HQ,",
  "E3,Sam Patel,Engineering Manager,E2,180000,M,Engineering,HQ,",
  "E4,Riley Kim,Senior Engineer,E3,160000,IC4,Engineering,Remote,",
  "E5,Casey Ng,Engineer,E3,130000,IC3,Engineering,Remote,Yes",
  "E6,Morgan Diaz,Engineer,E3,128000,IC3,Engineering,HQ,",
].join("\n");
