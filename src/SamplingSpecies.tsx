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
import SamplingDetail from "./observations/SamplingDetail";
import { SPECIFICATION_LOOKUP, parseCount } from "./observations/types";
import type { SpeciesSearchResult } from "./species/types";
import {
  SAMPLING_SPECIES_COLUMNS,
  SAMPLING_SPECIES_DEFAULT_SORT,
  SAMPLING_SPECIES_EDITABLE,
  SAMPLING_SPECIES_ENTITY,
  type SamplingSpeciesColumn,
  type SamplingSpeciesListResponse,
  type SamplingSpeciesRow,
} from "./samplingSpecies/types";
import type { SortOrder } from "./species/types";

const API_BASE = `${API_ROOT}/eco/sampling-species`;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type EditValues = Record<string, string>;

// One row per observation, with the whole locality and sampling context
// alongside it. Editing is limited to the observation's own fields.
function SamplingSpecies() {
  const [rows, setRows] = useState<SamplingSpeciesRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  const [filterMeta, setFilterMeta] = useState<FilterMeta[]>([]);
  const [lookups, setLookups] = useState<LookupsResponse>({});

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [sortBy, setSortBy] = useState<string>(SAMPLING_SPECIES_DEFAULT_SORT);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<DOMRect | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({});
  // Set only when the row is repointed at a different species.
  const [editSpecies, setEditSpecies] = useState<SpeciesSearchResult | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  const [openSampling, setOpenSampling] = useState<number | null>(null);

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
    return `${API_BASE}?${params.toString()}`;
  };

  const loadRows = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await fetchJson<SamplingSpeciesListResponse>(
        buildListUrl(offset),
        signal ? { signal } : undefined,
      );
      setRows(data.data);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(`Failed to load the table. (${errorMessage(err)})`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMeta = async (signal?: AbortSignal) => {
    try {
      const opts = signal ? { signal } : undefined;
      const [filtersRes, lookupsRes] = await Promise.all([
        fetchJson<FiltersResponse>(
          `${API_ROOT}/meta/filters/${SAMPLING_SPECIES_ENTITY}`,
          opts,
        ),
        fetchJson<LookupsResponse>(`${API_ROOT}/meta/lookups`, opts),
      ]);
      const nextFilters = filtersRes.filters ?? [];
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
      await loadRows(controller.signal);
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
    await Promise.all([loadRows(), loadMeta()]);
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

  const startEditing = (row: SamplingSpeciesRow) => {
    setEditingId(row.observation_id);
    const values: EditValues = {};
    for (const col of SAMPLING_SPECIES_EDITABLE) {
      if (col.input === "species") continue;
      const value = row[col.key];
      values[col.key] = value === null ? "" : String(value);
    }
    setEditValues(values);
    setEditSpecies(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditSpecies(null);
  };

  type PatchProblem = { field: string; message: string };

  const buildPatch = (
    row: SamplingSpeciesRow,
  ): Record<string, unknown> | PatchProblem => {
    const patch: Record<string, unknown> = {};

    for (const col of SAMPLING_SPECIES_EDITABLE) {
      if (col.input === "species") continue;

      const target = col.patchKey ?? col.key;
      const original = row[col.key];
      const raw = (editValues[col.key] ?? "").trim();

      if (!raw) {
        if (original !== null) patch[target] = null;
        continue;
      }

      if (col.input === "integer") {
        const num = parseCount(raw);
        if (num === null) {
          return { field: col.key, message: `"${raw}" is not a valid integer.` };
        }
        if (num < 0) {
          return { field: col.key, message: "Value cannot be negative." };
        }
        // Both Lot no. columns write the same stored value, so two different
        // numbers in one edit would be ambiguous.
        if (
          target in patch &&
          patch[target] !== null &&
          patch[target] !== num
        ) {
          return {
            field: col.key,
            message:
              "Both Lot no. columns hold the same value - set them to the same number.",
          };
        }
        if (num !== original) patch[target] = num;
        continue;
      }

      if (raw !== original) patch[target] = raw;
    }

    if (editSpecies) patch.species_id = editSpecies.id;

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

  const saveEditing = async (row: SamplingSpeciesRow) => {
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
      await sendJson(
        `${API_ROOT}/eco/observations/${row.observation_id}`,
        "PATCH",
        patch,
      );
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

  // Rendering ----------------------------------------------------------------

  const formatValue = (row: SamplingSpeciesRow, col: SamplingSpeciesColumn) => {
    if (col.key === "country") return row.name_en;
    if (col.key === "sampling_date") {
      // No date_precision in this view, so the stored date is printed as is.
      return row.sampling_date ?? "-";
    }
    const value = row[col.key];
    return value === null || value === "" ? "-" : String(value);
  };

  const renderCell = (
    row: SamplingSpeciesRow,
    col: SamplingSpeciesColumn,
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

    if (col.input === "species") {
      return (
        <Autocomplete<SpeciesSearchResult>
          url={(q) => `${API_ROOT}/species/search?q=${encodeURIComponent(q)}`}
          getKey={(s) => s.id}
          getLabel={(s) => s.name}
          selected={editSpecies}
          onSelect={setEditSpecies}
          placeholder={row.species_name}
        />
      );
    }

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
        type="number"
        value={editValues[col.key] ?? ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) =>
          setEditValues((v) => ({ ...v, [col.key]: e.target.value }))
        }
      />
    );
  };

  const openColumn = openFilter
    ? SAMPLING_SPECIES_COLUMNS.find((c) => c.key === openFilter)
    : undefined;
  const openMeta = openColumn
    ? filterMetaByField.get(openColumn.key)
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
          placeholder="Search..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {rows.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="sampling-species-table">
              <thead>
                <tr>
                  {SAMPLING_SPECIES_COLUMNS.map((col) => {
                    const meta = filterMetaByField.get(col.key);
                    const selectedCount = meta
                      ? filterParams(meta).filter((p) => filters[p]?.length)
                          .length
                      : 0;
                    const sortKey = col.sortKey ?? col.key;
                    return (
                      <th key={col.key} className={`col-${col.key}`}>
                        <div className="th-inner">
                          <button
                            type="button"
                            className="th-sort"
                            disabled={!col.sortable}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (col.sortable) handleSort(sortKey);
                            }}
                          >
                            {col.label}
                            {sortBy === sortKey &&
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
                      {SAMPLING_SPECIES_COLUMNS.map((col) => (
                        <td key={col.key} className={`col-${col.key}`}>
                          {renderCell(row, col, isEditing)}
                        </td>
                      ))}
                      <td className="cell-actions">
                        {isEditing && (
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
              Page {page} of {totalPages} ({total} rows)
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
        !isInitialLoading && !error && <p className="empty">Nothing found.</p>
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

export default SamplingSpecies;
