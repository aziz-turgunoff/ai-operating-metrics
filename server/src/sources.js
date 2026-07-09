// Single source of truth for what each source is called and what unlocks it.
// The frontend never hardcodes this — it reads sourcesMeta from /api/metrics.
export const SOURCES_META = {
  openrouter: { label: "OpenRouter" },
  openwebui: { label: "Open WebUI gateway" },
  leadbank: { label: "LeadBank BI" },
  apollo: { label: "Apollo ERP" },
  qdrant: { label: "Qdrant" },
  fireflies: { label: "Fireflies" },
  cicd: { label: "CI/CD (Engineering Squad)" },
  workflows: { label: "n8n / Zapier" },
  derived: { label: "Derived formula" },
  companyai: { label: "Company AI (fallback)" },
};
