// Shared API helpers used across the data tables.

export const API_ROOT = "/api";

type ApiErrorDetail = {
  code?: string;
  message?: string;
  http_status?: number;
  ui_action?: string;
  field?: string | null;
  constraint?: string | null;
};

// Turn an unsuccessful Response into a human-readable message.
export async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = body?.detail;

    const error = detail?.error as ApiErrorDetail | undefined;
    if (error?.message) {
      return error.code ? `${error.message} [${error.code}]` : error.message;
    }

    if (Array.isArray(detail) && detail[0]?.msg) {
      return detail[0].msg as string;
    }

    if (typeof detail === "string") {
      return detail;
    }
  } catch {
    // body is not JSON – fall back to the status below
  }

  return `HTTP ${response.status}`;
}

// Small wrapper around fetch that throws a readable error on non-2xx responses
// and returns the parsed JSON body.
export async function fetchJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return (await response.json()) as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

// ---------------------------------------------------------------------------
// Metadata shared by every entity page.

// GET /meta/filters/{entity}
export type FilterMeta = {
  field: string;
  label: string;
  type: string; // "select" | "text_search" | ...
  options: string[];
  // Query-param name to use when filtering the entity's list endpoint.
  param: string;
};
export type FiltersResponse = { filters: FilterMeta[] };

// GET /meta/lookups -> { "<lookup_name>": [{ value, label }, ...] }
export type LookupOption = { value: string; label: string };
export type LookupsResponse = Record<string, LookupOption[]>;
