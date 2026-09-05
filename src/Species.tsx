import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eraser, Filter } from "lucide-react";
import { API_ROOT, errorMessage, fetchJson, readApiError } from "./api";
import Modal from "./Modal";
import FilterDropdown from "./species/FilterDropdown";
import CleanupDialog from "./species/CleanupDialog";
import HistoryDialog from "./species/HistoryDialog";
import SynonymForm from "./species/SynonymForm";
import {
  SPECIES_COLUMNS,
  SPECIES_DEFAULT_SORT,
  SPECIES_ENTITY,
  type FilterMeta,
  type FiltersResponse,
  type CleanupFieldsResponse,
  type LookupsResponse,
  type Species as SpeciesRow,
  type SpeciesColumn,
  type SpeciesListResponse,
  type SortOrder,
} from "./species/types";

const API_BASE = `${API_ROOT}/${SPECIES_ENTITY}`;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

// Inline-editable fields map to the SpeciesUpdate body.
type EditValues = {
  species: string;
  abbreviation: string;
  species_group: string; // sent as `type`
  note: string;
};

function Species() {
  const [rows, setRows] = useState<SpeciesRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Metadata loaded once.
  const [filterMeta, setFilterMeta] = useState<FilterMeta[]>([]);
  const [cleanupFields, setCleanupFields] = useState<Set<string>>(new Set());
  const [lookups, setLookups] = useState<LookupsResponse>({});

  // Search
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Sorting (sortBy holds the column label the API expects)
  const [sortBy, setSortBy] = useState<string>(SPECIES_DEFAULT_SORT);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Filtering: selected values keyed by query param (e.g. filter_abb -> [...])
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  // Screen position of the clicked filter button (the dropdown renders fixed,
  // so it isn't clipped by the scrollable table wrapper).
  const [filterAnchor, setFilterAnchor] = useState<DOMRect | null>(null);

  const closeFilter = () => {
    setOpenFilter(null);
    setFilterAnchor(null);
  };

  // Inline editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({
    species: "",
    abbreviation: "",
    species_group: "",
    note: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  // Dialogs
  const [cleanupField, setCleanupField] = useState<SpeciesColumn | null>(null);
  const [historyFor, setHistoryFor] = useState<SpeciesRow | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const offset = (page - 1) * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isInitialLoading = isLoading && rows.length === 0;
  const typeOptions = lookups["mol_species_groups"] ?? [];

  const filterMetaByField = useMemo(() => {
    const map = new Map<string, FilterMeta>();
    for (const meta of filterMeta) map.set(meta.field, meta);
    return map;
  }, [filterMeta]);

  // Serialize the active filters so the loader re-runs when they change.
  const filtersKey = JSON.stringify(filters);

  // Build the list URL with paging, sorting, search and repeated filter params.
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

  // Load metadata (filters, cleanup fields, lookups). Re-run after mutations so
  // filter options never go stale, and drop any selected filter values that no
  // longer exist.
  const loadMeta = async (signal?: AbortSignal) => {
    try {
      const [filtersRes, cleanupRes, lookupsRes] = await Promise.all([
        fetchJson<FiltersResponse>(
          `${API_ROOT}/meta/filters/${SPECIES_ENTITY}`,
          signal ? { signal } : undefined,
        ),
        fetchJson<CleanupFieldsResponse>(
          `${API_ROOT}/cleanup/${SPECIES_ENTITY}`,
          signal ? { signal } : undefined,
        ),
        fetchJson<LookupsResponse>(
          `${API_ROOT}/meta/lookups`,
          signal ? { signal } : undefined,
        ),
      ]);
      const nextFilters = filtersRes.filters ?? [];
      setFilterMeta(nextFilters);
      setCleanupFields(new Set((cleanupRes.cleanup ?? []).map((c) => c.field)));
      setLookups(lookupsRes ?? {});

      // Prune selected filter values that disappeared from the option lists.
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
      // Metadata is non-fatal: the table still works without filters/cleanup.
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await loadMeta(controller.signal);
    })();
    return () => controller.abort();
  }, []);

  const loadSpecies = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setError(null);
      const payload = await fetchJson<SpeciesListResponse>(
        buildListUrl(offset),
        signal ? { signal } : undefined,
      );
      setRows(payload.data);
      setTotal(payload.total);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(`Failed to load species. (${errorMessage(err)})`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await loadSpecies(controller.signal);
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, sortBy, sortOrder, search, filtersKey]);

  // Debounce the search field, then reset to the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // After a mutation (cleanup/create/edit) the underlying values can change,
  // so refresh the table and the filter/cleanup metadata together.
  const reloadAll = async () => {
    await Promise.all([loadSpecies(), loadMeta()]);
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

  // Inline editing
  const startEditing = (row: SpeciesRow) => {
    setEditingId(row.species_id);
    setEditValues({
      species: row.species_name ?? "",
      abbreviation: row.abbreviation ?? "",
      species_group: row.species_group ?? "",
      note: row.note ?? "",
    });
  };

  const cancelEditing = () => setEditingId(null);

  const saveEditing = async (row: SpeciesRow) => {
    const species = editValues.species.trim();
    if (!species) {
      setError("Species name must not be empty.");
      return;
    }
    try {
      setIsSaving(true);
      await fetchJson(`${API_BASE}/${row.species_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          species,
          abbreviation: editValues.abbreviation.trim() || null,
          note: editValues.note.trim() || null,
          type: editValues.species_group || null,
        }),
      });
      setEditingId(null);
      await reloadAll();
    } catch (err) {
      setError(`Failed to save changes. (${errorMessage(err)})`);
    } finally {
      setIsSaving(false);
    }
  };

  // DELETE - soft-delete a species. The backend keeps the row so that records
  // still referencing it in other tables stay intact.
  const handleDelete = async (row: SpeciesRow) => {
    const name = row.species_name ?? `#${row.species_id}`;
    if (!window.confirm(`Really delete the species "${name}"?`)) return;

    try {
      setIsSaving(true);
      const response = await fetch(`${API_BASE}/${row.species_id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readApiError(response));
      if (editingId === row.species_id) setEditingId(null);
      await reloadAll();
    } catch (err) {
      setError(`Failed to delete the species. (${errorMessage(err)})`);
    } finally {
      setIsSaving(false);
    }
  };

  const renderCell = (
    row: SpeciesRow,
    col: SpeciesColumn,
    isEditing: boolean,
  ) => {
    const value = row[col.key];

    if (isEditing && col.key === "species_name") {
      return (
        <input
          value={editValues.species}
          onChange={(e) =>
            setEditValues((v) => ({ ...v, species: e.target.value }))
          }
          onClick={(e) => e.stopPropagation()}
          autoFocus
        />
      );
    }
    if (isEditing && col.key === "abbreviation") {
      return (
        <input
          value={editValues.abbreviation}
          onChange={(e) =>
            setEditValues((v) => ({ ...v, abbreviation: e.target.value }))
          }
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    if (isEditing && col.key === "species_group") {
      // ENUM/lookup field -> select with values from /meta/lookups
      return (
        <select
          value={editValues.species_group}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setEditValues((v) => ({ ...v, species_group: e.target.value }))
          }
        >
          <option value="">–</option>
          {typeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }
    if (isEditing && col.key === "note") {
      return (
        <input
          value={editValues.note}
          onChange={(e) =>
            setEditValues((v) => ({ ...v, note: e.target.value }))
          }
          onClick={(e) => e.stopPropagation()}
        />
      );
    }

    return value === null || value === "" ? "-" : String(value);
  };

  const openColumn = openFilter
    ? SPECIES_COLUMNS.find((c) => c.key === openFilter)
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
          placeholder="Search species..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button
          type="button"
          className="btn-add"
          onClick={() => setIsAddOpen(true)}
        >
          + Add new
        </button>
      </div>

      {rows.length > 0 ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {SPECIES_COLUMNS.map((col) => {
                    const meta = col.metaField
                      ? filterMetaByField.get(col.metaField)
                      : undefined;
                    const filterParam = meta?.param;
                    const hasCleanup =
                      !!col.metaField && cleanupFields.has(col.metaField);
                    const selectedCount = filterParam
                      ? (filters[filterParam]?.length ?? 0)
                      : 0;
                    const activeFilter = selectedCount > 0;
                    return (
                      <th key={col.key} className={`col-${col.key}`}>
                        <div className="th-inner">
                          <button
                            type="button"
                            className="th-sort"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSort(col.label);
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
                                activeFilter
                                  ? "th-action th-action-active"
                                  : "th-action"
                              }
                              title="Filter"
                              aria-label={`Filter ${col.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openFilter === col.key) {
                                  closeFilter();
                                } else {
                                  setFilterAnchor(
                                    e.currentTarget.getBoundingClientRect(),
                                  );
                                  setOpenFilter(col.key);
                                }
                              }}
                            >
                              <Filter size={13} />
                              {activeFilter && (
                                <span className="th-action-count">
                                  {selectedCount}
                                </span>
                              )}
                            </button>
                          )}

                          {hasCleanup && (
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
                        </div>
                      </th>
                    );
                  })}
                  <th className="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isEditing = editingId === row.species_id;
                  return (
                    <tr
                      key={row.species_id}
                      onClick={() => !isEditing && startEditing(row)}
                      className={isEditing ? "row-editing" : "row-clickable"}
                    >
                      {SPECIES_COLUMNS.map((col) => (
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
                          <>
                            <button
                              type="button"
                              title="Show history"
                              onClick={(e) => {
                                e.stopPropagation();
                                setHistoryFor(row);
                              }}
                            >
                              History
                            </button>
                            <button
                              type="button"
                              className="btn-delete"
                              title="Delete"
                              disabled={isSaving}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(row);
                              }}
                            >
                              &times;
                            </button>
                          </>
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
              Page {page} of {totalPages}
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
        !error && <p className="empty">No species found.</p>
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

      {isAddOpen && (
        <Modal
          title="Add species / synonym"
          onClose={() => setIsAddOpen(false)}
        >
          <SynonymForm
            lookups={lookups}
            onCreated={() => {
              void reloadAll();
              setIsAddOpen(false);
            }}
          />
        </Modal>
      )}

      {cleanupField && cleanupField.metaField && (
        <CleanupDialog
          entity={SPECIES_ENTITY}
          field={cleanupField.metaField}
          label={cleanupField.label}
          onClose={() => setCleanupField(null)}
          onDone={reloadAll}
        />
      )}

      {historyFor && (
        <HistoryDialog
          speciesId={historyFor.species_id}
          speciesName={historyFor.species_name ?? ""}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </section>
  );
}

export default Species;
