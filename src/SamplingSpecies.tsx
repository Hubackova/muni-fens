import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Filter } from "lucide-react";
import {
  API_ROOT,
  errorMessage,
  fetchJson,
  filterParams,
  isValueFilter,
  type FilterMeta,
  type FiltersResponse,
  type LookupsResponse,
} from "./api";
import DeletedModeSelect from "./DeletedModeSelect";
import ErrorBanner from "./ErrorBanner";
import { useDeletedMode } from "./useDeletedMode";
import WrapTextToggle from "./WrapTextToggle";
import { useWrapText } from "./useWrapText";
import {
  buildExportUrl,
  downloadExport,
  useRowSelection,
} from "./export";
import FilterDropdown from "./FilterDropdown";
import SamplingDetail from "./observations/SamplingDetail";
import TaxonomicChangePanel from "./taxonomy/TaxonomicChangePanel";
import { formatSamplingDate } from "./samplings/types";
import {
  SAMPLING_SPECIES_COLUMNS,
  SAMPLING_SPECIES_DEFAULT_SORT,
  SAMPLING_SPECIES_ENTITY,
  type SamplingSpeciesColumn,
  type SamplingSpeciesListResponse,
  type SamplingSpeciesRow,
} from "./samplingSpecies/types";
import type { SortOrder } from "./species/types";

const API_BASE = `${API_ROOT}/eco/sampling-species`;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

// One row per observation, with the whole locality and sampling context
// alongside it. Read-only: the row is stitched together from three tables, so
// every field is edited in the tab it belongs to.
function SamplingSpecies() {
  const [rows, setRows] = useState<SamplingSpeciesRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const { wrapped, toggle: toggleWrap, tableClass } = useWrapText();
  const {
    mode: deletedMode,
    setMode: setDeletedMode,
    apply: applyDeleted,
    showDeletedColumn,
  } = useDeletedMode();
  const { selected, toggle, setMany, clear: clearSelection } = useRowSelection();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterMeta, setFilterMeta] = useState<FilterMeta[]>([]);
  const [lookups, setLookups] = useState<LookupsResponse>({});

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [sortBy, setSortBy] = useState<string>(SAMPLING_SPECIES_DEFAULT_SORT);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<DOMRect | null>(null);

  const [openSampling, setOpenSampling] = useState<number | null>(null);
  const [isTaxonomyOpen, setIsTaxonomyOpen] = useState(false);
  // Set by the taxonomic panel to narrow the table to its source species.
  const [speciesFilter, setSpeciesFilter] = useState<number[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const offset = (page - 1) * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isInitialLoading = isLoading && rows.length === 0;

  // The flag is only worth a column when deleted rows can show up.
  const visibleColumns = useMemo(
    () => SAMPLING_SPECIES_COLUMNS.filter((col) => col.key !== "deleted" || showDeletedColumn),
    [showDeletedColumn],
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

  const filtersKey = JSON.stringify(filters);
  const speciesFilterKey = JSON.stringify(speciesFilter);

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
    applyDeleted(params);
    for (const id of speciesFilter) {
      params.append("filter_species_id", String(id));
    }
    return params;
  };

  const buildListUrl = (targetOffset: number) => {
    const params = buildQuery();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(targetOffset));
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

  const pageIds = rows.map((row) => row.observation_id);
  const pageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  // Closing the panel drops everything it set up: the species narrowing and
  // the row ticks that were only there to feed it.
  const closeTaxonomy = () => {
    setIsTaxonomyOpen(false);
    setSpeciesFilter([]);
    clearSelection();
    setPage(1);
  };

  const handleExport = async () => {
    const ids = pageIds.filter((id) => selected.has(id));
    try {
      await downloadExport(
        buildExportUrl(
          "/eco/sampling-species/export",
          buildQuery(),
          "observation_ids",
          ids,
        ),
      );
    } catch (err) {
      setError(`Failed to export the data. (${errorMessage(err)})`);
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
  }, [
    offset,
    sortBy,
    sortOrder,
    search,
    filtersKey,
    deletedMode,
    speciesFilterKey,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // The panel needs every row matching the current filters, not just the
  // page on screen; the export endpoints do the same with no paging.
  const fetchMatching = async () => {
    const params = buildQuery();
    params.set("limit", "1000");
    params.set("offset", "0");
    const data = await fetchJson<SamplingSpeciesListResponse>(
      `${API_BASE}?${params.toString()}`,
    );
    return data.data;
  };

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

  // Rendering ----------------------------------------------------------------

  const formatValue = (row: SamplingSpeciesRow, col: SamplingSpeciesColumn) => {
    if (col.key === "country") return row.name_en;
    if (col.key === "sampling_date") return formatSamplingDate(row);
    const value = row[col.key];
    return value === null || value === "" ? "-" : String(value);
  };

  const renderCell = (
    row: SamplingSpeciesRow,
    col: SamplingSpeciesColumn,
  ) => {
    if (col.key === "sampling_id") {
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
    return formatValue(row, col);
  };

  const openColumn = openFilter
    ? SAMPLING_SPECIES_COLUMNS.find((c) => c.key === openFilter)
    : undefined;
  const openMeta = openColumn
    ? filterMetaByField.get(openColumn.metaField ?? openColumn.key)
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
      {notice && <p className="notice">{notice}</p>}

      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Search..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />

        <button type="button" className="toolbar-toggle" onClick={handleExport}>
          {selected.size > 0
            ? `Export ${selected.size} selected`
            : "Export CSV"}
        </button>

        <DeletedModeSelect
          value={deletedMode}
          onChange={(mode) => {
            setDeletedMode(mode);
            if (mode !== "all" && sortBy === "deleted") {
              setSortBy(SAMPLING_SPECIES_DEFAULT_SORT);
              setSortOrder("asc");
            }
            setPage(1);
          }}
        />

        <WrapTextToggle wrapped={wrapped} onToggle={toggleWrap} />

        <button
          type="button"
          className="toolbar-toggle"
          onClick={() =>
            isTaxonomyOpen ? closeTaxonomy() : setIsTaxonomyOpen(true)
          }
        >
          Taxonomic changes
        </button>
      </div>

      {isTaxonomyOpen && (
        <TaxonomicChangePanel
          selectedIds={Array.from(selected)}
          fetchMatching={fetchMatching}
          onSourceChange={(ids) => {
            setSpeciesFilter(ids);
            setPage(1);
          }}
          onSelectAll={(ids) => setMany(ids, true)}
          onClearSelection={clearSelection}
          onClose={closeTaxonomy}
          onSaved={async (message) => {
            setNotice(message);
            clearSelection();
            await reloadAll();
          }}
        />
      )}

      {rows.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className={`sampling-species-table${tableClass}`}>
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
                  {visibleColumns.map((col) => {
                    const meta = filterMetaByField.get(col.metaField ?? col.key);
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
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.observation_id}>
                    <td className="col-select">
                      <input
                        type="checkbox"
                        aria-label={`Select record #${row.observation_id}`}
                        checked={selected.has(row.observation_id)}
                        onChange={() => toggle(row.observation_id)}
                      />
                    </td>
                    {visibleColumns.map((col) => (
                      <td key={col.key} className={`col-${col.key}`}>
                        {renderCell(row, col)}
                      </td>
                    ))}
                  </tr>
                ))}
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
