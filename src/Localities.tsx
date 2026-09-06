import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Filter } from "lucide-react";
import {
  API_ROOT,
  errorMessage,
  fetchJson,
  type FilterMeta,
  type FiltersResponse,
  type LookupsResponse,
} from "./api";
import Autocomplete from "./Autocomplete";
import FilterDropdown from "./FilterDropdown";
import MergeDialog from "./localities/MergeDialog";
import PruneDialog from "./localities/PruneDialog";
import {
  LOCALITY_COLUMNS,
  LOCALITY_DEFAULT_SORT,
  LOCALITY_EDITABLE,
  LOCALITY_ENTITY,
  type CountrySearchResult,
  type Locality,
  type LocalityColumn,
  type LocalityListResponse,
} from "./localities/types";
import type { SortOrder } from "./species/types";

const API_BASE = `${API_ROOT}/${LOCALITY_ENTITY}`;
const PAGE_SIZE = 50;
const INPUT_DEBOUNCE_MS = 300;

// "all" keeps the API default (soft-deleted rows are included in the list).
type DeletedMode = "all" | "active" | "deleted";

// Edited values are kept as strings (that is what the inputs hold) and are
// converted back to the API types on save.
type EditValues = Record<string, string>;

function Localities() {
  const [rows, setRows] = useState<Locality[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Metadata
  const [filterMeta, setFilterMeta] = useState<FilterMeta[]>([]);
  const [lookups, setLookups] = useState<LookupsResponse>({});

  // Search
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Sorting (sortBy holds the column label the API expects)
  const [sortBy, setSortBy] = useState<string>(LOCALITY_DEFAULT_SORT);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Column filters: selected values keyed by query param.
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<DOMRect | null>(null);

  // Filters that have no option list: an altitude range and the deleted flag.
  const [maslInput, setMaslInput] = useState({ min: "", max: "" });
  const [masl, setMasl] = useState({ min: "", max: "" });
  const [deletedMode, setDeletedMode] = useState<DeletedMode>("active");

  // Inline editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({});
  // Country is picked from a dropdown of names but PATCHed as alpha3, so the
  // whole country record is kept instead of the edited string.
  const [editCountry, setEditCountry] = useState<CountrySearchResult | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  const [pruneFor, setPruneFor] = useState<Locality | null>(null);
  const [isMergeOpen, setIsMergeOpen] = useState(false);

  const offset = (page - 1) * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isInitialLoading = isLoading && rows.length === 0;

  // The deleted flag is only worth a column when deleted rows can show up.
  const visibleColumns = useMemo(
    () =>
      LOCALITY_COLUMNS.filter(
        (col) => col.key !== "deleted" || deletedMode === "all",
      ),
    [deletedMode],
  );

  const filterMetaByField = useMemo(() => {
    const map = new Map<string, FilterMeta>();
    for (const meta of filterMeta) map.set(meta.field, meta);
    return map;
  }, [filterMeta]);

  const closeFilter = () => {
    setOpenFilter(null);
    setFilterAnchor(null);
  };

  // Serialize everything the loader depends on so it re-runs on any change.
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
    if (masl.min) params.set("filter_masl_min", masl.min);
    if (masl.max) params.set("filter_masl_max", masl.max);
    if (deletedMode !== "all") {
      params.set("filter_deleted", deletedMode === "deleted" ? "1" : "0");
    }
    return `${API_BASE}?${params.toString()}`;
  };

  const loadLocalities = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await fetchJson<LocalityListResponse>(
        buildListUrl(offset),
        signal ? { signal } : undefined,
      );
      setRows(data.data);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(`Failed to load localities. (${errorMessage(err)})`);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter options and lookups.
  const loadMeta = async (signal?: AbortSignal) => {
    try {
      const opts = signal ? { signal } : undefined;
      const [filtersRes, lookupsRes] = await Promise.all([
        fetchJson<FiltersResponse>(
          `${API_ROOT}/meta/filters/${LOCALITY_ENTITY}`,
          opts,
        ),
        fetchJson<LookupsResponse>(`${API_ROOT}/meta/lookups`, opts),
      ]);
      const nextFilters = filtersRes.filters ?? [];
      setFilterMeta(nextFilters);
      setLookups(lookupsRes ?? {});

      // Drop selected filter values that disappeared from the option lists.
      const optionsByParam = new Map<string, Set<string>>();
      for (const m of nextFilters) {
        if (m.param) optionsByParam.set(m.param, new Set(m.options));
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
      await loadLocalities(controller.signal);
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    offset,
    sortBy,
    sortOrder,
    search,
    filtersKey,
    masl.min,
    masl.max,
    deletedMode,
  ]);

  // Debounce the free-text inputs, then reset to the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, INPUT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMasl(maslInput);
      setPage(1);
    }, INPUT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [maslInput]);

  const reloadAll = async () => {
    await Promise.all([loadLocalities(), loadMeta()]);
  };

  const handleSort = (label: string) => {
    if (sortBy === label) {
      setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(label);
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

  const startEditing = (row: Locality) => {
    setEditingId(row.id);
    const values: EditValues = {};
    for (const col of LOCALITY_EDITABLE) {
      const value = row[col.key];
      values[col.key] = value === null ? "" : String(value);
    }
    setEditValues(values);
    setEditCountry(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditCountry(null);
  };

  // Build a PATCH body holding only the fields the user actually changed.
  // An emptied nullable field is sent as null; a non-nullable one is an error.
  const buildPatch = (row: Locality): Record<string, unknown> | string => {
    const patch: Record<string, unknown> = {};

    for (const col of LOCALITY_EDITABLE) {
      if (col.input === "country") continue;

      const original = row[col.key];
      const raw = (editValues[col.key] ?? "").trim();

      if (!raw) {
        if (col.nullable === false) return `${col.label} must not be empty.`;
        if (original !== null) patch[col.key] = null;
        continue;
      }

      if (col.input === "decimal" || col.input === "integer") {
        // Coordinates are typed on Czech keyboards, so accept a decimal comma
        // and hand the API the dot notation it requires.
        const num =
          col.input === "integer"
            ? Number.parseInt(raw, 10)
            : Number(raw.replace(",", "."));
        if (Number.isNaN(num)) return `${col.label} must be a number.`;
        if (col.key === "latitude" && (num < -90 || num > 90)) {
          return "Latitude must be between -90 and 90.";
        }
        if (col.key === "longitude" && (num < -180 || num > 180)) {
          return "Longitude must be between -180 and 180.";
        }
        if (num !== original) patch[col.key] = num;
        continue;
      }

      if (raw !== original) patch[col.key] = raw;
    }

    // The row carries the country *name* while PATCH wants the alpha3 code, so
    // an unchanged country is recognised by either representation.
    if (
      editCountry &&
      editCountry.name_en !== row.country &&
      editCountry.alpha3 !== row.country
    ) {
      patch.country = editCountry.alpha3;
    }
    return patch;
  };

  const saveEditing = async (row: Locality) => {
    const patch = buildPatch(row);
    if (typeof patch === "string") {
      setError(patch);
      return;
    }
    if (Object.keys(patch).length === 0) {
      cancelEditing();
      return;
    }

    try {
      setIsSaving(true);
      await fetchJson(`${API_BASE}/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      cancelEditing();
      setError(null);
      await reloadAll();
    } catch (err) {
      setError(`Failed to save changes. (${errorMessage(err)})`);
    } finally {
      setIsSaving(false);
    }
  };

  // Rendering ----------------------------------------------------------------

  const formatValue = (row: Locality, col: LocalityColumn) => {
    if (col.key === "deleted") return row.deleted ? "yes" : "no";
    const value = row[col.key];
    return value === null || value === "" ? "-" : String(value);
  };

  const renderCell = (row: Locality, col: LocalityColumn, isEditing: boolean) => {
    if (!isEditing || !col.input) return formatValue(row, col);

    if (col.input === "country") {
      return (
        <Autocomplete<CountrySearchResult>
          url={(q) => `${API_ROOT}/countries/search?q=${encodeURIComponent(q)}`}
          getKey={(c) => c.alpha3}
          getLabel={(c) => c.name_en}
          getHint={(c) => c.alpha3}
          selected={editCountry}
          onSelect={setEditCountry}
          placeholder={row.country}
        />
      );
    }

    if (col.input === "lookup") {
      const options = col.lookup ? (lookups[col.lookup] ?? []) : [];
      return (
        <select
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

    // Decimals stay text inputs: a number input silently discards a value
    // typed with a comma instead of reporting it.
    const isDecimal = col.input === "decimal";
    return (
      <input
        type={col.input === "integer" ? "number" : "text"}
        inputMode={isDecimal ? "decimal" : undefined}
        value={editValues[col.key] ?? ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) =>
          setEditValues((v) => ({ ...v, [col.key]: e.target.value }))
        }
      />
    );
  };

  const openColumn = openFilter
    ? LOCALITY_COLUMNS.find((c) => c.key === openFilter)
    : undefined;
  const openMeta = openColumn?.metaField
    ? filterMetaByField.get(openColumn.metaField)
    : undefined;
  const openParam = openMeta?.param;

  return (
    <section className="page" onClick={closeFilter}>
      {isInitialLoading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}

      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search localities..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />

        <label className="toolbar-field">
          m a.s.l.
          <input
            type="number"
            className="num-input"
            placeholder="min"
            value={maslInput.min}
            onChange={(e) =>
              setMaslInput((m) => ({ ...m, min: e.target.value }))
            }
          />
          <input
            type="number"
            className="num-input"
            placeholder="max"
            value={maslInput.max}
            onChange={(e) =>
              setMaslInput((m) => ({ ...m, max: e.target.value }))
            }
          />
        </label>

        <label className="toolbar-field">
          Deleted
          <select
            value={deletedMode}
            onChange={(e) => {
              const mode = e.target.value as DeletedMode;
              setDeletedMode(mode);
              if (mode !== "all" && sortBy === "Deleted") {
                setSortBy(LOCALITY_DEFAULT_SORT);
                setSortOrder("asc");
              }
              setPage(1);
            }}
          >
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="deleted">Deleted only</option>
          </select>
        </label>

        <button
          type="button"
          className="btn-add"
          onClick={() => setIsMergeOpen(true)}
        >
          Merge localities
        </button>
      </div>

      {rows.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="localities-table">
              <thead>
                <tr>
                  {visibleColumns.map((col) => {
                    const meta = col.metaField
                      ? filterMetaByField.get(col.metaField)
                      : undefined;
                    const filterParam = meta?.param;
                    const selectedCount = filterParam
                      ? (filters[filterParam]?.length ?? 0)
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
                              if (col.sortable) handleSort(col.label);
                            }}
                          >
                            {col.label}
                            {sortBy === col.label &&
                              (sortOrder === "asc" ? (
                                <ArrowUp size={13} className="sort-indicator" />
                              ) : (
                                <ArrowDown
                                  size={13}
                                  className="sort-indicator"
                                />
                              ))}
                          </button>

                          {meta && filterParam && (
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
                  const isEditing = editingId === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => !isEditing && startEditing(row)}
                      className={isEditing ? "row-editing" : "row-clickable"}
                    >
                      {visibleColumns.map((col) => (
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
                            title="Prune (permanent delete)"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPruneFor(row);
                            }}
                          >
                            Prune
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
              Page {page} of {totalPages} ({total} localities)
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
        !error && <p className="empty">No localities found.</p>
      )}

      {openMeta && openParam && filterAnchor && (
        <FilterDropdown
          meta={openMeta}
          anchor={filterAnchor}
          selected={filters[openParam] ?? []}
          onChange={(values) => setColumnFilter(openParam, values)}
          onClose={closeFilter}
        />
      )}

      {isMergeOpen && (
        <MergeDialog onClose={() => setIsMergeOpen(false)} onDone={reloadAll} />
      )}

      {pruneFor && (
        <PruneDialog
          locality={pruneFor}
          onClose={() => setPruneFor(null)}
          onDone={reloadAll}
        />
      )}
    </section>
  );
}

export default Localities;
