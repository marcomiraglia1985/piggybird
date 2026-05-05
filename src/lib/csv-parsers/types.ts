export type ParsedRow = {
  /** Stable identifier for the row (used for selection in UI) */
  externalId: string;
  date: string; // ISO yyyy-mm-dd
  amount: number; // signed
  description: string;
  rawType?: string;
  /** Pre-suggested account name (canonical) */
  suggestedAccount?: string;
  /** Pre-suggested category emoji */
  suggestedCategoryEmoji?: string | null;
  /** Pre-suggested category NAME — usato quando il parser ha pattern-match
   *  deterministico ed è sicuro della categoria (es. Revolut Savings
   *  riconosce "Interessi netti" → "Interessi"). Disambigua il caso di
   *  emoji condiviso da più categorie. Se assente si usa solo l'emoji. */
  suggestedCategoryName?: string | null;
  /** Whether this row likely matches an existing transaction in DB */
  duplicateOf?: string | null;
  /** Soft match: stessa data+amount+accountId ma description diversa.
   *  Caso tipico: tx aggiunta a mano dall'utente, poi import CSV trova lo
   *  stesso movimento ma con beneficiary "generico" del parser bancario.
   *  L'utente deve decidere: Merge (default), Replace, o Keep both. */
  softDuplicateOf?: {
    id: string;
    beneficiary: string | null;
    notes: string | null;
    categoryId: string | null;
    categoryEmoji: string | null;
    categoryName: string | null;
  } | null;
  notes?: string | null;
  currency: string;
  /** ID che lega due righe formando un transfer interno */
  transferGroupId?: string | null;
  /** Quando isTransfer è true, l'altra riga è il counterpart */
  isTransfer?: boolean;
  /** Match con una tx ricorrente programmata (confirmed=false, recurrenceGroupId).
   *  Quando presente, l'import deve auto-confermare quella tx (date/amount dal CSV)
   *  invece di crearne una nuova. */
  confirmsRecurrence?: { txId: string; newDate: string; newAmount: number } | null;
  /** Vincolo forte sull'account di destinazione (override del pair stage):
   *  la riga deve finire su `suggestedAccount` se esiste, altrimenti viene
   *  droppata. Usato per quirk specifici di una banca dove la riga riguarda
   *  un conto diverso da quello del file (es. Revolut Current CSV che
   *  contiene gli interessi del Savings). */
  requireSuggestedAccount?: boolean;
  /** Account ID risolto server-side da `suggestedAccount`. Se presente,
   *  il commit deve usare questo invece dell'account scelto nel pair stage. */
  forceAccountId?: string | null;
};

export type ParserResult = {
  format: string;
  rows: ParsedRow[];
  warnings: string[];
};
