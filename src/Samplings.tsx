import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eraser, Filter } from "lucide-react";
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
import ConfirmChangesDialog, {
  type FieldChange,
} from "./ConfirmChangesDialog";
import ErrorBanner from "./ErrorBanner";
import {
  buildExportUrl,
  downloadExport,
  useRowSelection,
} from "./export";
import FilterDropdown from "./FilterDropdown";
import type { LocalitySearchResult } from "./localities/types";
import CleanupDialog from "./species/CleanupDialog";
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
import type {
  CleanupFieldsResponse,
  SortOrder,
} from "./species/types";

const API_BASE = `${API_ROOT}/eco/samplings`;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type EditValues = Record<string, string>;

function Samplings() {
  const [rows, setRows] = useState<Sampling[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const { selected, toggle, setMany, clear } = useRowSelection();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  const [filterMeta, setFilterMeta] = useState<FilterMeta[]>([]);
  const [lookups, setLookups] = useState<LookupsResponse>({});
  // Columns the backend can bulk-rewrite, from /cleanup/samplings.
  const [cleanupFields, setCleanupFields] = useState<Set<string>>(new Set());
  const [cleanupField, setCleanupField] = useState<SamplingColumn | null>(null);

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
  // Holds the edit between the confirmation dialog and the request.
  const [pendingSave, setPendingSave] = useState<{
    row: Sampling;
    patch: Record<string, unknown>;
    changes: FieldChange[];
  } | null>(null);
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

  // Everything but the paging, so the export can reuse it verbatim.
  const buildQuery = () => {
    const params = new URLSearchParams({
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    const trimmed = search.trim();
    if (trimmed) params.set("search", trimmed);
    for (const [param, values] of Object.entries(filters)) {
      for (const value of values) params.append(param, value);
    }
    return params;
  };

  const buildListUrl = (targetOffset: number) => {
    const params = buildQuery();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(targetOffset));
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

  const pageIds = rows.map((row) => row.sampling_id);
  const pageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const handleExport = () => {
    const ids = pageIds.filter((id) => selected.has(id));
    downloadExport(
      buildExportUrl("/eco/samplings/export", buildQuery(), "sampling_ids", ids),
    );
  };

  const loadMeta = async (signal?: AbortSignal) => {
    try {
      const opts = signal ? { signal } : undefined;
      const [filtersRes, lookupsRes, cleanupRes] = await Promise.all([
        fetchJson<FiltersResponse>(
          `${API_ROOT}/meta/filters/${SAMPLING_ENTITY}`,
          opts,
        ),
        fetchJson<LookupsResponse>(`${API_ROOT}/meta/lookups`, opts),
        fetchJson<CleanupFieldsResponse>(
          `${API_ROOT}/cleanup/${SAMPLING_ENTITY}`,
          opts,
        ),
      ]);
      setCleanupFields(new Set((cleanupRes.cleanup ?? []).map((c) => c.field)));
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

  // Only the fields the user actually changed travel to the API.
  const buildPatch = (row: Sampling): Record<string, unknown> | PatchProblem => {
    const patch: Record<string, unknown> = {};

    for (const col of SAMPLING_EDITABLE) {
      if (col.input === "locality") continue;

      const original = row[col.key];
      const raw = (editValues[col.key] ?? "").trim();

      if (!raw) {
        if (col.nullable === false) {
          return {
            field: col.key,
            message: `${col.label} must not be empty.`,
          };
        }
        if (original !== null) patch[col.key] = null;
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
        if (num !== original) patch[col.key] = num;
        continue;
      }

      if (raw !== original) patch[col.key] = raw;
    }

    if (editLocality && editLocality.id !== row.locality_id) {
      patch.locality_id = editLocality.id;
    }
    return patch;
  };

  const describe = (row: Sampling, patch: Record<string, unknown>) =>
    Object.entries(patch).map(([key, value]): FieldChange => {
      if (key === "locality_id") {
        return {
          label: "Locality",
          from: row.site_name,
          to: editLocality?.name ?? String(value),
        };
      }
      const column = SAMPLING_COLUMNS.find((col) => col.key === key);
      const before = row[key as keyof Sampling];
      return {
        label: column?.label ?? key,
        from: before === null || before === "" ? "-" : String(before),
        to: value === null || value === "" ? "-" : String(value),
      };
    });

  const saveEditing = (row: Sampling) => {
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
    setPendingSave({ row, patch, changes: describe(row, patch) });
  };

  const commitSave = async () => {
    if (!pendingSave) return;
    try {
      setIsSaving(true);
      await sendJson(
        `${API_BASE}/${pendingSave.row.sampling_id}`,
        "PATCH",
        pendingSave.patch,
      );
      setPendingSave(null);
      cancelEditing();
      setError(null);
      setErrorField(null);
      await reloadAll();
    } catch (err) {
      setPendingSave(null);
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
      clear();
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
    // The row stores alpha3; the readable name comes alongside it.
    if (col.key === "country") return row.name_en;
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
          className="id-link"
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
          placeholder="Search samplings..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />

        <button type="button" className="toolbar-toggle" onClick={handleExport}>
          {selected.size > 0
            ? `Export ${selected.size} selected`
            : "Export CSV"}
        </button>
      </div>

      {rows.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="samplings-table">
              <thead>
                <tr>
                  <th className="col-select">
                    <input
                      type="checkbox"
                      aria-label="Select the rows on this page"
                      checked={pageSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        setMany(pageIds, e.target.checked);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  {SAMPLING_COLUMNS.map((col) => {
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

                          {cleanupFields.has(col.key) && (
                            <button
                              type="button"
                              className="th-action"
                              title="Cleanup"
                              aria-label={`Cleanup ${col.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setCleanupField(col);
                              }}
                            >
                              <Eraser size={13} />
                            </button>
                          )}

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
                      onKeyDown={(e) => {
                        if (!isEditing) return;
                        // Enter inside the type-ahead belongs to the search.
                        const inAutocomplete = (
                          e.target as HTMLElement
                        ).classList.contains("autocomplete-input");
                        if (e.key === "Enter" && !inAutocomplete) {
                          e.preventDefault();
                          void saveEditing(row);
                        }
                        if (e.key === "Escape") cancelEditing();
                      }}
                      className={isEditing ? "row-editing" : "row-clickable"}
                    >
                      <td className="col-select">
                        <input
                          type="checkbox"
                          aria-label={`Select sampling #${row.sampling_id}`}
                          checked={selected.has(row.sampling_id)}
                          onChange={() => toggle(row.sampling_id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
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

      {cleanupField && (
        <CleanupDialog
          entity={SAMPLING_ENTITY}
          field={cleanupField.key}
          label={cleanupField.label}
          onClose={() => setCleanupField(null)}
          onDone={reloadAll}
        />
      )}

      {pendingSave && (
        <ConfirmChangesDialog
          title={`Save changes to sampling #${pendingSave.row.sampling_id}?`}
          changes={pendingSave.changes}
          isSaving={isSaving}
          onConfirm={commitSave}
          onCancel={() => setPendingSave(null)}
        />
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
