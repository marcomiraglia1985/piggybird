/**
 * Provider esterni per Account: definiscono quale integrazione (API key,
 * sync automatico, ecc.) è disponibile in Impostazioni → Integrazioni.
 *
 * Pattern: ogni provider può essere associato a 0+ account. Le integrazioni
 * in Impostazioni vengono mostrate SOLO se almeno 1 account dell'utente
 * è collegato a quel provider — così un utente nuovo non vede setup di
 * Binance/Revolut X se non li ha mai connessi.
 */

export type AccountProviderId =
  | "generic"
  | "binance"
  | "revolut-x";

export type AccountProvider = {
  id: AccountProviderId;
  label: string;
  emoji: string;
  /** Tipo di account compatibile (filtra dropdown) */
  compatibleAccountTypes: ReadonlyArray<string>;
  /** Descrizione mostrata nel form di creazione */
  description: string;
  /** Se true, mostra card di integrazione in Impostazioni quando >0 account
   *  hanno questo provider. Generic non ha integrazione. */
  hasIntegration: boolean;
  /** Hint UX: cosa serve per attivare l'integrazione */
  integrationHint?: string;
};

export const ACCOUNT_PROVIDERS: ReadonlyArray<AccountProvider> = [
  {
    id: "generic",
    label: "Generico",
    emoji: "🏦",
    compatibleAccountTypes: ["liquid", "joint", "cash", "savings", "credit", "investment", "friendsplit"],
    description: "Conto manuale: import CSV o inserimento manuale movimenti",
    hasIntegration: false,
  },
  {
    id: "binance",
    label: "Binance",
    emoji: "🟡",
    compatibleAccountTypes: ["investment"],
    description: "Sync automatico saldi crypto via API read-only",
    hasIntegration: true,
    integrationHint: "API key + secret read-only da Binance Account",
  },
  {
    id: "revolut-x",
    label: "Revolut X",
    emoji: "💎",
    compatibleAccountTypes: ["investment"],
    description: "Sync automatico portfolio crypto via Ed25519 API",
    hasIntegration: true,
    integrationHint: "Chiave pubblica Ed25519 + private key generata in Revolut X",
  },
] as const;

export function getProvider(id: string | null | undefined): AccountProvider {
  return ACCOUNT_PROVIDERS.find((p) => p.id === id) ?? ACCOUNT_PROVIDERS[0];
}

/** Provider con integrazione che hanno almeno 1 account associato.
 *  Usato per filtrare le card in Impostazioni → Integrazioni. */
export function getActiveIntegrationProviders(
  accounts: ReadonlyArray<{ provider: string }>,
): AccountProvider[] {
  const usedIds = new Set(accounts.map((a) => a.provider).filter(Boolean));
  return ACCOUNT_PROVIDERS.filter(
    (p) => p.hasIntegration && usedIds.has(p.id),
  );
}

/** Provider compatibili con un dato tipo di account (per dropdown form). */
export function getProvidersForAccountType(accountType: string): AccountProvider[] {
  return ACCOUNT_PROVIDERS.filter((p) =>
    p.compatibleAccountTypes.includes(accountType),
  );
}
