/**
 * lib/departments.ts
 * Static department definitions — shared across hub, department view, and chat.
 * Pure data, no server-only imports. Safe for both server and client code.
 */

export interface Department {
  id:          string;
  label:       string;
  emoji:       string;
  color:       string;
  dark:        string;
  glow:        string;
  tagline:     string;
  description: string;
}

export const DEPARTMENTS: Department[] = [
  {
    id:          "marketing",
    label:       "Marketing",
    emoji:       "📣",
    color:       "#FF6B6B",
    dark:        "#C0392B",
    glow:        "rgba(255,107,107,0.35)",
    tagline:     "Brand & Campaigns",
    description: "Brand campaigns, content strategy, and audience targeting. Marketing agents automate outreach, A/B tests, and analytics reports.",
  },
  {
    id:          "sales",
    label:       "Sales",
    emoji:       "💰",
    color:       "#4ECDC4",
    dark:        "#148F85",
    glow:        "rgba(78,205,196,0.35)",
    tagline:     "Leads & Deals",
    description: "Pipeline management, lead qualification, and deal tracking. Sales agents handle prospecting, follow-ups, and CRM data entry.",
  },
  {
    id:          "operations",
    label:       "Operations",
    emoji:       "⚙️",
    color:       "#FFEAA7",
    dark:        "#D4AF00",
    glow:        "rgba(255,234,167,0.35)",
    tagline:     "Process & Workflow",
    description: "Process automation, workflow management, and ops reporting. Keep your business running smoothly with intelligent process agents.",
  },
  {
    id:          "engineering",
    label:       "Engineering",
    emoji:       "🔧",
    color:       "#A29BFE",
    dark:        "#6C5CE7",
    glow:        "rgba(162,155,254,0.35)",
    tagline:     "Code & Systems",
    description: "Code review, documentation, and technical analysis. Engineering agents assist with development workflows, bug triage, and release notes.",
  },
  {
    id:          "finance",
    label:       "Finance",
    emoji:       "📊",
    color:       "#55EFC4",
    dark:        "#00A67E",
    glow:        "rgba(85,239,196,0.35)",
    tagline:     "Budget & Reports",
    description: "Budget tracking, expense categorization, and financial forecasting. Keep your numbers accurate with specialized finance agents.",
  },
  {
    id:          "support",
    label:       "Support",
    emoji:       "💬",
    color:       "#FD79A8",
    dark:        "#D63085",
    glow:        "rgba(253,121,168,0.35)",
    tagline:     "Help & Service",
    description: "Customer service, ticket routing, and knowledge base management. Support agents handle inquiries, escalations, and FAQ generation.",
  },
];

export const DEPT_IDS = new Set(DEPARTMENTS.map((d) => d.id));

export function getDepartment(id: string): Department | undefined {
  return DEPARTMENTS.find((d) => d.id === id);
}
