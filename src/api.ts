// Shared API helpers used across the data tables.

export const API_ROOT = "/api";

// One rejected row of a CSV import; several can share a row number.
export type ApiErrorRow = {
  row: number;
  field: string;
  code: string;
  message: string;
};

type ApiErrorDetail = {
  code?: string;
  message?: string;
  http_status?: number;
  ui_action?: string;
  field?: string | null;
  constraint?: string | null;
  rows?: ApiErrorRow[];
};

// Errors carry the backend's own code and, for constraint violations, the
// field that caused them - forms use it to highlight the offending input.
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly field?: string;
  // "highlight_field" | "toast" - how the backend wants the error presented.
  readonly uiAction?: string;
  // Present when a bulk operation reports problems row by row.
  readonly rows?: ApiErrorRow[];

  constructor(
    message: string,
    status: number,
    code?: string,
    field?: string | null,
    uiAction?: string,
    rows?: ApiErrorRow[],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field ?? undefined;
    this.uiAction = uiAction;
    this.rows = rows;
  }
}

// True when the backend pinned the error to an input we can highlight.
export function isFieldError(
  err: unknown,
): err is ApiError & { field: string } {
  return err instanceof ApiError && !!err.field;
}

// Turn an unsuccessful Response into a readable error carrying the metadata.
export async function readApiErrorDetail(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    const detail = body?.detail;

    const error = detail?.error as ApiErrorDetail | undefined;
    if (error?.message) {
      // The message is written for users; the code travels separately.
      return new ApiError(
        error.message,
        response.status,
        error.code,
        error.field,
        error.ui_action,
        error.rows,
      );
    }

    if (Array.isArray(detail) && detail[0]?.msg) {
      return new ApiError(detail[0].msg as string, response.status);
    }

    if (typeof detail === "string") {
      return new ApiError(detail, response.status);
    }
  } catch {
    // body is not JSON - fall back to the status below
  }

  return new ApiError(`HTTP ${response.status}`, response.status);
}

// Turn an unsuccessful Response into a human-readable message.
export async function readApiError(response: Response): Promise<string> {
  return (await readApiErrorDetail(response)).message;
}

// Small wrapper around fetch that throws a readable error on non-2xx responses
// and returns the parsed JSON body.
export async function fetchJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw await readApiErrorDetail(response);
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

// Same two params, but the bounds are dates - the backend widens each value
// by its date_precision when matching.
export type DateRangeFilterMeta = FilterMetaBase & {
  type: "date_range";
  min_param: string;
  max_param: string;
  min: string | null;
  max: string | null;
};

export type FilterMeta =
  | ValueFilterMeta
  | RangeFilterMeta
  | DateRangeFilterMeta;

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
    throw await readApiErrorDetail(response);
  }
}
