/**
 * Setting keys per il templates registry. Estratti in un file standalone
 * (no Prisma import) così possono essere usati anche da client components.
 */
export const TEMPLATE_SETTINGS = {
  share: "templates.share",
  lastSync: "templates.lastSync",
  seeded: "templates.seeded",
} as const;

export type TemplateKind = "bank" | "broker";
