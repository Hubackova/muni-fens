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
import ErrorBanner from "./ErrorBanner";
import FilterDropdown from "./FilterDropdown";
import DuplicatesDialog from "./observations/DuplicatesDialog";
import { formatSamplingDate } from "./samplings/types";
import {
  OBSERVATION_COLUMNS,
  OBSERVATION_DEFAULT_SORT,
  OBSERVATION_EDITABLE,
  OBSERVATION_ENTITY,
  SPECIFICATION_LOOKUP,
  parseCount,
  type ObservationColumn,
  type ObservationListResponse,
  type ObservationRow,
} from "./observations/types";
import type { SortOrder } from "./species/types";

const API_BASE = `${API_ROOT}/eco/observations`;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type EditValues = Record<string, string>;

// Every observation in the database. Starts limited to the ones entered
// through ECO and can be widened to include DNA.
function Observations() {
  const [rows, setRows] = useState<ObservationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  const [filterMeta, setFilterMeta] = useState<FilterMeta[]>([]);
  const [lookups, setLookups] = useState<LookupsResponse>({});

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [sortBy, setSortBy] = useState<string>(OBSERVATION_DEFAULT_SORT);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<DOMRect | null>(null);

  // false widens the table to DNA observations as well.
  const [onlyEco, setOnlyEco] = useState(true);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({});
  const [isSaving, setIsSaving] = useState(false);

  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false);

  const offset = (page - 1) * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isInitialLoading = isLoading && rows.length === 0;
  const specificationOptions = lookups[SPECIFICATION_LOOKUP] ?? [];

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
    if (onlyEco) params.set("filter_entry_point", "ECO");
    return `${API_BASE}?${params.toString()}`;
  };

  const loadObservations = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await fetchJson<ObservationListResponse>(
        buildListUrl(offset),
        signal ? { signal } : undefined,
      );
      setRows(data.data);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(`Failed to load observations. (${errorMessage(err)})`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMeta = async (signal?: AbortSignal) => {
    try {
      const opts = signal ? { signal } : undefined;
      const [filtersRes, lookupsRes] = await Promise.all([
        fetchJson<FiltersResponse>(
          `${API_ROOT}/meta/filters/${OBSERVATION_ENTITY}`,
          opts,
        ),
        fetchJson<LookupsResponse>(`${API_ROOT}/meta/lookups`, opts),
      ]);
      // entry_point is driven by the button above the table, so it gets no
      // column filter of its own.
      const nextFilters = (filtersRes.filters ?? []).filter(
        (m) => m.field !== "entry_point",
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
      await loadObservations(controller.signal);
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, sortBy, sortOrder, search, filtersKey, onlyEco]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const reloadAll = async () => {
    await Promise.all([loadObservations(), loadMeta()]);
  };

  // Widening the table changes what the filters and the sort can even match,
  // so both start over together with the paging.
  const toggleScope = () => {
    setOnlyEco((current) => !current);
    setFilters({});
    setSortBy(OBSERVATION_DEFAULT_SORT);
    setSortOrder("asc");
    setSearchInput("");
    setSearch("");
    setPage(1);
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

  const startEditing = (row: ObservationRow) => {
    setEditingId(row.observation_id);
    const values: EditValues = {};
    for (const col of OBSERVATION_EDITABLE) {
      const value = row[col.key];
      values[col.key] = value === null ? "" : String(value);
    }
    setEditValues(values);
  };

  const cancelEditing = () => setEditingId(null);

  type PatchProblem = { field: string; message: string };

  const buildPatch = (
    row: ObservationRow,
  ): Record<string, unknown> | PatchProblem => {
    const patch: Record<string, unknown> = {};

    for (const col of OBSERVATION_EDITABLE) {
      const original = row[col.key];
      const raw = (editValues[col.key] ?? "").trim();

      if (!raw) {
        if (original !== null) patch[col.key] = null;
        continue;
      }

      if (col.input === "integer") {
        const num = parseCount(raw);
        if (num === null) {
          return {
            field: col.key,
            message: `"${raw}" is not a valid integer.`,
          };
        }
        if (num < 0) {
          return { field: col.key, message: "Value cannot be negative." };
        }
        if (num !== original) patch[col.key] = num;
        continue;
      }

      if (raw !== original) patch[col.key] = raw;
    }

    // The counts are interdependent, so they are checked against the values
    // the row will actually end up with.
    const resolve = (key: "alive" | "empty" | "undefined" | "vouchers") =>
      key in patch ? ((patch[key] as number | null) ?? 0) : (row[key] ?? 0);
    const all = resolve("alive") + resolve("empty") + resolve("undefined");
    if (all <= 0) {
      return {
        field: "alive",
        message: "At least one observed individual must be entered.",
      };
    }
    const vouchers = resolve("vouchers");
    if (vouchers > all) {
      return {
        field: "vouchers",
        message: `Vouchers (${vouchers}) cannot exceed the total number of individuals (${all}).`,
      };
    }
    return patch;
  };

  const saveEditing = async (row: ObservationRow) => {
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
      await sendJson(`${API_BASE}/${row.observation_id}`, "PATCH", patch);
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

  // Soft delete: the row stays in the database so the DNA side can keep using
  // it, it only disappears from the ECO views.
  const handleDelete = async (row: ObservationRow) => {
    const confirmed = window.confirm(
      `Remove observation #${row.observation_id} (${row.species_name}) from ECO?\n\n` +
        "It stays in the database for the DNA part and only disappears from " +
        "the ECO views.",
    );
    if (!confirmed) return;

    try {
      setIsSaving(true);
      await sendJson(`${API_BASE}/${row.observation_id}/soft`, "DELETE");
      if (editingId === row.observation_id) cancelEditing();
      await reloadAll();
    } catch (err) {
      setError(`Failed to remove the observation. (${errorMessage(err)})`);
    } finally {
      setIsSaving(false);
    }
  };

  // Rendering ----------------------------------------------------------------

  const formatValue = (row: ObservationRow, col: ObservationColumn) => {
    if (col.key === "sampling_date") return formatSamplingDate(row);
    const value = row[col.key];
    return value === null || value === "" ? "-" : String(value);
  };

  const renderCell = (
    row: ObservationRow,
    col: ObservationColumn,
    isEditing: boolean,
  ) => {
    if (!isEditing || !col.input) return formatValue(row, col);

    if (col.input === "specification") {
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
          {specificationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        className={errorField === col.key ? "input-error" : undefined}
        type={col.input === "integer" ? "number" : "text"}
        value={editValues[col.key] ?? ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) =>
          setEditValues((v) => ({ ...v, [col.key]: e.target.value }))
        }
      />
    );
  };

  const openColumn = openFilter
    ? OBSERVATION_COLUMNS.find((c) => c.key === openFilter)
    : undefined;
  const openMeta = openColumn
    ? filterMetaByField.get(openColumn.key)
    : undefined;

  return (
    <section className="page" onClick={closeFilter}>
      {isInitialLoading && <p>Loading...</p>}
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search observations..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />

        <button type="button" className="toolbar-toggle" onClick={toggleScope}>
          {onlyEco ? "Include DNA observations" : "Show only ECO observations"}
        </button>
      </div>

      {rows.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="observations-list">
              <thead>
                <tr>
                  {OBSERVATION_COLUMNS.map((col) => {
                    const meta = filterMetaByField.get(col.key);
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
                            disabled={!col.sortable}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (col.sortable) handleSort(col.key);
                            }}
                          >
                            {col.label}
                            {sortBy === col.key &&
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
                  const isEditing = editingId === row.observation_id;
                  return (
                    <tr
                      key={row.observation_id}
                      onClick={() => !isEditing && startEditing(row)}
                      className={isEditing ? "row-editing" : "row-clickable"}
                    >
                      {OBSERVATION_COLUMNS.map((col) => (
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
                            title="Remove from ECO"
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
              Page {page} of {totalPages} ({total} observations)
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
        !error && <p className="empty">No observations found.</p>
      )}

      <div className="toolbar">
        <button
          type="button"
          className="toolbar-toggle"
          onClick={() => setIsDuplicatesOpen(true)}
        >
          Check for duplicate species
        </button>
      </div>

      {openMeta && filterAnchor && (
        <FilterDropdown
          meta={openMeta}
          anchor={filterAnchor}
          values={filters}
          onChange={setColumnFilter}
          onClose={closeFilter}
        />
      )}

      {isDuplicatesOpen && (
        <DuplicatesDialog onClose={() => setIsDuplicatesOpen(false)} />
      )}
    </section>
  );
}

export default Observations;
