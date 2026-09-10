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

// GET /meta/filters/{entity}. The backend sends a discriminated union:
// "select" and "text_search" both offer a list of values under one query
// param, while "range" spans two params and has no option list at all.
type FilterMetaBase = {
  field: string;
  label: string;
};

export type ValueFilterMeta = FilterMetaBase & {
  type: "select" | "text_search";
  // Query param the selected values are appended to (repeat = OR).
  param: string;
  options: string[];
};

export type RangeFilterMeta = FilterMetaBase & {
  type: "range";
  min_param: string;
  max_param: string;
  // Bounds present in the data, for placeholders.
  min: number | null;
  max: number | null;
};

export type FilterMeta = ValueFilterMeta | RangeFilterMeta;

export type FiltersResponse = { filters: FilterMeta[] };

export function isValueFilter(meta: FilterMeta): meta is ValueFilterMeta {
  return meta.type === "select" || meta.type === "text_search";
}

// Every query param a filter can write to, so callers can clear or count them.
export function filterParams(meta: FilterMeta): string[] {
  return isValueFilter(meta) ? [meta.param] : [meta.min_param, meta.max_param];
}

// Write responses: {status, id} for updates, {created_id} for creates.
export type StatusIdResponse = { status: string; id: number };

// GET /meta/lookups -> { "<lookup_name>": [{ value, label }, ...] }
export type LookupOption = { value: string; label: string };
export type LookupsResponse = Record<string, LookupOption[]>;

// Write requests whose response body we do not need. Several endpoints answer
// 200 with an empty body, which fetchJson would choke on in response.json().
export async function sendJson(
  input: string,
  method: string,
  body?: unknown,
): Promise<void> {
  const response = await fetch(input, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
}
