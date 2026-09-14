import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Filter } from "lucide-react";
import {
  API_ROOT,
  errorMessage,
  fetchJson,
  filterParams,
  isFieldError,
  isValueFilter,
  sendJson,
  type FilterMeta,
  type FiltersResponse,
  type LookupsResponse,
} from "./api";
import Autocomplete from "./Autocomplete";
import ErrorBanner from "./ErrorBanner";
import FilterDropdown from "./FilterDropdown";
import type { LocalitySearchResult } from "./localities/types";
import SamplingDetail from "./observations/SamplingDetail";
import {
  SAMPLING_COLUMNS,
  SAMPLING_DEFAULT_SORT,
  SAMPLING_EDITABLE,
  SAMPLING_ENTITY,
  formatSamplingDate,
  type Sampling,
  type SamplingColumn,
  type SamplingListResponse,
} from "./samplings/types";
import type { SortOrder } from "./species/types";

const API_BASE = `${API_ROOT}/eco/samplings`;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type EditValues = Record<string, string>;

function Samplings() {
  const [rows, setRows] = useState<Sampling[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  const [filterMeta, setFilterMeta] = useState<FilterMeta[]>([]);
  const [lookups, setLookups] = useState<LookupsResponse>({});

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [sortBy, setSortBy] = useState<string>(SAMPLING_DEFAULT_SORT);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<DOMRect | null>(null);

  // Inline editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({});
  // Set only when the user moves the sampling to another locality.
  const [editLocality, setEditLocality] = useState<LocalitySearchResult | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  // Opening a sampling shows its observations instead of the table.
  const [openSampling, setOpenSampling] = useState<number | null>(null);

  const offset = (page - 1) * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isInitialLoading = isLoading && rows.length === 0;

  const filterMetaByField = useMemo(() => {
    const map = new Map<string, FilterMeta>();
    for (const meta of filterMeta) map.set(meta.field, meta);
    return map;
  }, [filterMeta]);

  const closeFilter = () => {
    setOpenFilter(null);
    setFilterAnchor(null);
  };

  const filtersKey = JSON.stringify(filters);

  const buildListUrl = (targetOffset: number) => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(targetOffset),
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    const trimmed = search.trim();
    if (trimmed) params.set("search", trimmed);
    for (const [param, values] of Object.entries(filters)) {
      for (const value of values) params.append(param, value);
    }
    return `${API_BASE}?${params.toString()}`;
  };

  const loadSamplings = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await fetchJson<SamplingListResponse>(
        buildListUrl(offset),
        signal ? { signal } : undefined,
      );
      setRows(data.data);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(`Failed to load samplings. (${errorMessage(err)})`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMeta = async (signal?: AbortSignal) => {
    try {
      const opts = signal ? { signal } : undefined;
      const [filtersRes, lookupsRes] = await Promise.all([
        fetchJson<FiltersResponse>(
          `${API_ROOT}/meta/filters/${SAMPLING_ENTITY}`,
          opts,
        ),
        fetchJson<LookupsResponse>(`${API_ROOT}/meta/lookups`, opts),
      ]);
      // date_precision drives the date filter on the backend but is never
      // shown, so it gets no column and no filter of its own.
      const nextFilters = (filtersRes.filters ?? []).filter(
        (m) => m.field !== "date_precision",
      );
      setFilterMeta(nextFilters);
      setLookups(lookupsRes ?? {});

      const optionsByParam = new Map<string, Set<string>>();
      for (const m of nextFilters) {
        if (isValueFilter(m)) optionsByParam.set(m.param, new Set(m.options));
      }
      setFilters((cur) => {
        let changed = false;
        const next: Record<string, string[]> = {};
        for (const [param, values] of Object.entries(cur)) {
          const opts = optionsByParam.get(param);
          const kept = opts ? values.filter((v) => opts.has(v)) : values;
          if (kept.length !== values.length) changed = true;
          if (kept.length > 0) next[param] = kept;
        }
        return changed ? next : cur;
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Metadata is non-fatal: the table still works without filters.
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await loadMeta(controller.signal);
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await loadSamplings(controller.signal);
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, sortBy, sortOrder, search, filtersKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const reloadAll = async () => {
    await Promise.all([loadSamplings(), loadMeta()]);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const setColumnFilter = (param: string, values: string[]) => {
    setFilters((cur) => {
      const next = { ...cur };
      if (values.length === 0) delete next[param];
      else next[param] = values;
      return next;
    });
    setPage(1);
  };

  // Inline editing -----------------------------------------------------------

  const startEditing = (row: Sampling) => {
    setEditingId(row.sampling_id);
    const values: EditValues = {};
    for (const col of SAMPLING_EDITABLE) {
      if (col.input === "locality") continue;
      const value = row[col.key];
      values[col.key] = value === null ? "" : String(value);
    }
    setEditValues(values);
    setEditLocality(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditLocality(null);
  };

  type PatchProblem = { field: string; message: string };

  // Only the fields the user actually changed travel to the API, under the
  // names SamplingUpdate expects (they differ from the response for three).
  const buildPatch = (row: Sampling): Record<string, unknown> | PatchProblem => {
    const patch: Record<string, unknown> = {};

    for (const col of SAMPLING_EDITABLE) {
      if (col.input === "locality") continue;

      const target = col.patchKey ?? col.key;
      const original = row[col.key];
      const raw = (editValues[col.key] ?? "").trim();

      if (!raw) {
        if (col.nullable === false) {
          return {
            field: col.key,
            message: `${col.label} must not be empty.`,
          };
        }
        if (original !== null) patch[target] = null;
        continue;
      }

      if (col.input === "decimal" || col.input === "integer") {
        const num =
          col.input === "integer"
            ? Number.parseInt(raw, 10)
            : Number(raw.replace(",", "."));
        if (Number.isNaN(num)) {
          return { field: col.key, message: `${col.label} must be a number.` };
        }
        if (num !== original) patch[target] = num;
        continue;
      }

      if (raw !== original) patch[target] = raw;
    }

    if (editLocality) patch.locality_id = editLocality.id;
    return patch;
  };

  const saveEditing = async (row: Sampling) => {
    const patch = buildPatch(row);
    if ("message" in patch && "field" in patch) {
      setError(patch.message as string);
      setErrorField(patch.field as string);
      return;
    }
    if (Object.keys(patch).length === 0) {
      cancelEditing();
      return;
    }

    try {
      setIsSaving(true);
      await sendJson(`${API_BASE}/${row.sampling_id}`, "PATCH", patch);
      cancelEditing();
      setError(null);
      setErrorField(null);
      await reloadAll();
    } catch (err) {
      setError(`Failed to save changes. (${errorMessage(err)})`);
      setErrorField(isFieldError(err) ? err.field : null);
    } finally {
      setIsSaving(false);
    }
  };

  // Soft delete: the sampling and its observations stop showing up, the
  // locality stays.
  const handleDelete = async (row: Sampling) => {
    const confirmed = window.confirm(
      `Delete sampling #${row.sampling_id} on "${row.site_name}"?\n\n` +
        "All species observed during this sampling are removed from the " +
        "regular views together with it. The locality itself is kept.",
    );
    if (!confirmed) return;

    try {
      setIsSaving(true);
      await sendJson(`${API_BASE}/${row.sampling_id}`, "DELETE");
      if (editingId === row.sampling_id) cancelEditing();
      await reloadAll();
    } catch (err) {
      setError(`Failed to delete the sampling. (${errorMessage(err)})`);
    } finally {
      setIsSaving(false);
    }
  };

  // Rendering ----------------------------------------------------------------

  const formatValue = (row: Sampling, col: SamplingColumn) => {
    if (col.key === "sampling_date") return formatSamplingDate(row);
    const value = row[col.key];
    return value === null || value === "" ? "-" : String(value);
  };

  const renderCell = (
    row: Sampling,
    col: SamplingColumn,
    isEditing: boolean,
  ) => {
    if (col.key === "sampling_id" && !isEditing) {
      return (
        <button
          type="button"
          className="link-btn"
          title="Species at this sampling"
          onClick={(e) => {
            e.stopPropagation();
            setOpenSampling(row.sampling_id);
          }}
        >
          {row.sampling_id}
        </button>
      );
    }

    if (!isEditing || !col.input) return formatValue(row, col);

    if (col.input === "locality") {
      return (
        <Autocomplete<LocalitySearchResult>
          url={(q) =>
            `${API_ROOT}/localities/search?q=${encodeURIComponent(q)}`
          }
          getKey={(l) => l.id}
          getLabel={(l) => l.name}
          getHint={(l) => `#${l.id}`}
          selected={editLocality}
          onSelect={setEditLocality}
          placeholder={row.site_name}
          invalid={errorField === "locality_id"}
        />
      );
    }

    if (col.input === "lookup") {
      const options = col.lookup ? (lookups[col.lookup] ?? []) : [];
      return (
        <select
          className={errorField === col.key ? "input-error" : undefined}
          value={editValues[col.key] ?? ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setEditValues((v) => ({ ...v, [col.key]: e.target.value }))
          }
        >
          <option value="">-</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        className={errorField === col.key ? "input-error" : undefined}
        type={col.input === "integer" ? "number" : "text"}
        inputMode={col.input === "decimal" ? "decimal" : undefined}
        value={editValues[col.key] ?? ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) =>
          setEditValues((v) => ({ ...v, [col.key]: e.target.value }))
        }
      />
    );
  };

  const openColumn = openFilter
    ? SAMPLING_COLUMNS.find((c) => c.key === openFilter)
    : undefined;
  const openMeta = openColumn?.metaField
    ? filterMetaByField.get(openColumn.metaField)
    : undefined;

  if (openSampling !== null) {
    return (
      <SamplingDetail
        samplingId={openSampling}
        lookups={lookups}
        onBack={() => {
          setOpenSampling(null);
          void reloadAll();
        }}
      />
    );
  }

  return (
    <section className="page" onClick={closeFilter}>
      {isInitialLoading && <p>Loading...</p>}
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search samplings..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {rows.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="samplings-table">
              <thead>
                <tr>
                  {SAMPLING_COLUMNS.map((col) => {
                    const meta = col.metaField
                      ? filterMetaByField.get(col.metaField)
                      : undefined;
                    const selectedCount = meta
                      ? filterParams(meta).filter((p) => filters[p]?.length)
                          .length
                      : 0;
                    return (
                      <th key={col.key} className={`col-${col.key}`}>
                        <div className="th-inner">
                          <button
                            type="button"
                            className="th-sort"
                            disabled={!col.sortKey}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (col.sortKey) handleSort(col.sortKey);
                            }}
                          >
                            {col.label}
                            {sortBy === col.sortKey &&
                              (sortOrder === "asc" ? (
                                <ArrowUp size={13} className="sort-indicator" />
                              ) : (
                                <ArrowDown
                                  size={13}
                                  className="sort-indicator"
                                />
                              ))}
                          </button>

                          {meta && (
                            <button
                              type="button"
                              className={
                                selectedCount > 0
                                  ? "th-action th-action-active"
                                  : "th-action"
                              }
                              title={`Filter ${col.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenFilter(col.key);
                                setFilterAnchor(
                                  e.currentTarget.getBoundingClientRect(),
                                );
                              }}
                            >
                              <Filter size={13} />
                              {selectedCount > 0 && (
                                <span className="th-action-count">
                                  {selectedCount}
                                </span>
                              )}
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isEditing = editingId === row.sampling_id;
                  return (
                    <tr
                      key={row.sampling_id}
                      onClick={() => !isEditing && startEditing(row)}
                      className={isEditing ? "row-editing" : "row-clickable"}
                    >
                      {SAMPLING_COLUMNS.map((col) => (
                        <td key={col.key} className={`col-${col.key}`}>
                          {renderCell(row, col, isEditing)}
                        </td>
                      ))}
                      <td className="cell-actions">
                        {isEditing ? (
                          <span onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => saveEditing(row)}
                              disabled={isSaving}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              disabled={isSaving}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn-delete"
                            title="Delete sampling"
                            disabled={isSaving}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(row);
                            }}
                          >
                            &times;
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button
              type="button"
              onClick={() => setPage((c) => Math.max(1, c - 1))}
              disabled={page === 1 || isLoading}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages} ({total} samplings)
            </span>
            {isLoading && <span>Loading...</span>}
            <button
              type="button"
              onClick={() => setPage((c) => Math.min(totalPages, c + 1))}
              disabled={page >= totalPages || isLoading}
            >
              Next
            </button>
          </div>
        </>
      ) : (
        !isInitialLoading &&
        !error && <p className="empty">No samplings found.</p>
      )}

      {openMeta && filterAnchor && (
        <FilterDropdown
          meta={openMeta}
          anchor={filterAnchor}
          values={filters}
          onChange={setColumnFilter}
          onClose={closeFilter}
        />
      )}
    </section>
  );
}

export default Samplings;
