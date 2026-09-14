// Types for the observations recorded during one sampling.

// GET /eco/samplings/{id}/observations
export type Observation = {
  observation_id: number;
  species_id: number;
  species_name: string;
  specification: string | null;
  alive: number | null;
  empty: number | null;
  undefined: number | null;
  // Computed by the backend as alive + empty + undefined.
  all_individuals: number;
  lot: number | null;
  vouchers: number | null;
  note: string | null;
};

// One row rejected by POST .../observations/import. A single CSV row can
// produce several of these.
export type ImportRowError = {
  row: number;
  field: string;
  code: string;
  message: string;
};

export type ImportResult =
  | { status: "created"; inserted: number }
  | { status: "validation_failed"; errors: ImportRowError[] };

export const SPECIFICATION_MAX = 50;

// The header the import endpoint expects; the optional columns may be omitted.
export const CSV_HEADER =
  "species,specification,alive,empty,undefined,lot,vouchers,note";

export type CountsDraft = {
  alive: string;
  empty: string;
  undefined: string;
  lot: string;
  vouchers: string;
  specification: string;
  note: string;
};

export const emptyCounts: CountsDraft = {
  alive: "",
  empty: "",
  undefined: "",
  lot: "",
  vouchers: "",
  specification: "",
  note: "",
};

export function parseCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isNaN(value) ? null : value;
}

// Empty counts behave as zero, exactly like in the CSV import.
export function totalIndividuals(draft: CountsDraft): number {
  return (
    (parseCount(draft.alive) ?? 0) +
    (parseCount(draft.empty) ?? 0) +
    (parseCount(draft.undefined) ?? 0)
  );
}

export type CountsProblem = { field: string; message: string };

// The same constraints the backend enforces, checked up front so the user does
// not have to round-trip to find a typo.
export function validateCounts(draft: CountsDraft): CountsProblem | null {
  for (const field of ["alive", "empty", "undefined"] as const) {
    const raw = draft[field].trim();
    if (!raw) continue;
    const value = parseCount(draft[field]);
    if (value === null) {
      return { field, message: `"${raw}" is not a valid integer.` };
    }
    if (value < 0) return { field, message: "Value cannot be negative." };
  }

  const all = totalIndividuals(draft);
  if (all <= 0) {
    return {
      field: "alive",
      message: "At least one observed individual must be entered.",
    };
  }

  const lotRaw = draft.lot.trim();
  if (lotRaw) {
    const lot = parseCount(draft.lot);
    if (lot === null) {
      return { field: "lot", message: `"${lotRaw}" is not a valid integer.` };
    }
    if (lot < 0) return { field: "lot", message: "Value cannot be negative." };
  }

  const vouchersRaw = draft.vouchers.trim();
  if (vouchersRaw) {
    const vouchers = parseCount(draft.vouchers);
    if (vouchers === null) {
      return {
        field: "vouchers",
        message: `"${vouchersRaw}" is not a valid integer.`,
      };
    }
    if (vouchers < 0) {
      return { field: "vouchers", message: "Value cannot be negative." };
    }
    if (vouchers > all) {
      return {
        field: "vouchers",
        message: `Vouchers (${vouchers}) cannot exceed the total number of individuals (${all}).`,
      };
    }
  }

  if (draft.specification.trim().length > SPECIFICATION_MAX) {
    return {
      field: "specification",
      message: `Specification cannot exceed ${SPECIFICATION_MAX} characters.`,
    };
  }
  return null;
}

// The payload shared by POST .../observations and PATCH /eco/observations/{id}.
export function countsPayload(draft: CountsDraft) {
  return {
    specification: draft.specification.trim() || null,
    alive: parseCount(draft.alive),
    empty: parseCount(draft.empty),
    undefined: parseCount(draft.undefined),
    lot: parseCount(draft.lot),
    vouchers: parseCount(draft.vouchers),
    note: draft.note.trim() || null,
  };
}
