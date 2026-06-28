import { useEffect, useState } from "react";
import Modal from "./Modal";

type Country = {
  id: number;
  alpha2: string;
  alpha3: string;
  name_cs: string | null;
  name_en: string;
};

type CountryListResponse = {
  data: Country[];
  total: number;
  limit: number;
  offset: number;
};

const API_BASE = "/api/countries";

type ApiErrorDetail = {
  code?: string;
  message?: string;
  http_status?: number;
  ui_action?: string;
  field?: string | null;
  constraint?: string | null;
};

async function readApiError(response: Response): Promise<string> {
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

const emptyForm = {
  alpha2: "",
  alpha3: "",
  name_en: "",
  name_cs: "",
};

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type SortOrder = "asc" | "desc";

// Columns the API can sort by (sort_by values match these keys).
const SORTABLE_COLUMNS = [
  { key: "alpha2", label: "Alpha2" },
  { key: "alpha3", label: "Alpha3" },
  { key: "name_en", label: "Name EN" },
  { key: "name_cs", label: "Name CS" },
] as const;

function Countries() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState({ name_en: "", name_cs: "" });
  const [isSaving, setIsSaving] = useState(false);

  // Form for adding a country
  const [form, setForm] = useState(emptyForm);
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Search (searchInput is the live field, search is the debounced value sent to the API)
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Sorting
  const [sortBy, setSortBy] = useState<string>("id");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const offset = (page - 1) * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isInitialLoading = isLoading && countries.length === 0;

  // Build the list endpoint URL with paging, sorting and search.
  const buildListUrl = (targetOffset: number) => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(targetOffset),
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    const trimmed = search.trim();
    if (trimmed) {
      params.set("search", trimmed);
    }
    return `${API_BASE}?${params.toString()}`;
  };

  useEffect(() => {
    const controller = new AbortController();

    const loadCountries = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(buildListUrl(offset), {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        const payload = (await response.json()) as CountryListResponse;
        setCountries(payload.data);
        setTotal(payload.total);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        const message = err instanceof Error ? err.message : "Unknown error";
        setError(`Failed to load the list of countries. (${message})`);
      } finally {
        setIsLoading(false);
      }
    };

    loadCountries();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, sortBy, sortOrder, search]);

  // Debounce the search field, then reset to the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const reloadCurrentPage = async () => {
    try {
      const response = await fetch(buildListUrl(offset));
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const payload = (await response.json()) as CountryListResponse;
      setCountries(payload.data);
      setTotal(payload.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to reload the list. (${message})`);
    }
  };

  // Toggle sort order when clicking the active column, otherwise sort the new column ascending.
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setPage(1);
  };

  // POST – add a new country
  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const alpha2 = form.alpha2.trim().toUpperCase();
    const alpha3 = form.alpha3.trim().toUpperCase();
    const name_en = form.name_en.trim();
    const name_cs = form.name_cs.trim();

    if (alpha2.length !== 2 || alpha3.length !== 3 || !name_en) {
      setFormError(
        "Please fill in Alpha2 (2 chars), Alpha3 (3 chars) and Name EN.",
      );
      return;
    }

    try {
      setIsCreating(true);
      const response = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alpha2,
          alpha3,
          name_en,
          name_cs: name_cs || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setForm(emptyForm);
      setIsAddOpen(false);
      await reloadCurrentPage();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setFormError(`Failed to add the country. (${message})`);
    } finally {
      setIsCreating(false);
    }
  };

  // Start inline editing
  const startEditing = (country: Country) => {
    setEditingId(country.id);
    setEditValues({
      name_en: country.name_en,
      name_cs: country.name_cs ?? "",
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  // PATCH – save changes (only name_cs and name_en), keyed by id
  const saveEditing = async (country: Country) => {
    const name_en = editValues.name_en.trim();
    const name_cs = editValues.name_cs.trim();

    if (!name_en) {
      setError("Name EN must not be empty.");
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch(`${API_BASE}/${country.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name_en,
          name_cs: name_cs || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setCountries((current) =>
        current.map((item) =>
          item.id === country.id
            ? { ...item, name_en, name_cs: name_cs || null }
            : item,
        ),
      );
      setEditingId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to save changes. (${message})`);
    } finally {
      setIsSaving(false);
    }
  };

  // DELETE – remove a country
  const handleDelete = async (country: Country) => {
    const confirmed = window.confirm(
      `Really delete the country "${country.name_en}"?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/${country.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await reloadCurrentPage();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to delete the country. (${message})`);
    }
  };

  return (
    <section className="page">
      {isInitialLoading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}

      {!error && (
        <div>
          <div className="toolbar">
            <input
              type="search"
              className="search-input"
              placeholder="Search countries..."
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

          {countries.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <colgroup>
                    <col className="col-alpha2" />
                    <col className="col-alpha3" />
                    <col className="col-name-en" />
                    <col className="col-name-cs" />
                    <col className="col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      {SORTABLE_COLUMNS.map((col) => (
                        <th key={col.key}>
                          <button
                            type="button"
                            className="th-sort"
                            onClick={() => handleSort(col.key)}
                          >
                            {col.label}
                            {sortBy === col.key && (
                              <span className="sort-indicator">
                                {sortOrder === "asc" ? " ▲" : " ▼"}
                              </span>
                            )}
                          </button>
                        </th>
                      ))}
                      <th></th>
                    </tr>
                  </thead>
              <tbody>
                {countries.map((country) => {
                  const isEditing = editingId === country.id;

                  return (
                    <tr
                      key={country.id}
                      onClick={() => !isEditing && startEditing(country)}
                      className={isEditing ? "row-editing" : "row-clickable"}
                    >
                      <td>{country.alpha2}</td>
                      <td>{country.alpha3}</td>
                      <td>
                        {isEditing ? (
                          <input
                            value={editValues.name_en}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                name_en: e.target.value,
                              }))
                            }
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        ) : (
                          country.name_en
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            value={editValues.name_cs}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                name_cs: e.target.value,
                              }))
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          (country.name_cs ?? "-")
                        )}
                      </td>
                      <td className="cell-actions">
                        {isEditing ? (
                          <span onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => saveEditing(country)}
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
                            title="Delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(country);
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
              onClick={() => setPage((current) => Math.max(1, current - 1))}
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
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page >= totalPages || isLoading}
            >
              Next
            </button>
          </div>
            </>
          ) : (
            !isInitialLoading && (
              <p className="empty">No countries found.</p>
            )
          )}
        </div>
      )}

      {isAddOpen && (
        <Modal title="Add country" onClose={() => setIsAddOpen(false)}>
          <form className="modal-form" onSubmit={handleCreate}>
            {formError && <p className="error">{formError}</p>}
            <div className="form-row">
          <label>
            Alpha2
            <input
              value={form.alpha2}
              maxLength={2}
              placeholder="CZ"
              onChange={(e) =>
                setForm((f) => ({ ...f, alpha2: e.target.value }))
              }
            />
          </label>
          <label>
            Alpha3
            <input
              value={form.alpha3}
              maxLength={3}
              placeholder="CZE"
              onChange={(e) =>
                setForm((f) => ({ ...f, alpha3: e.target.value }))
              }
            />
          </label>
          <label>
            Name EN
            <input
              value={form.name_en}
              placeholder="Czechia"
              onChange={(e) =>
                setForm((f) => ({ ...f, name_en: e.target.value }))
              }
            />
          </label>
          <label>
            Name CS
            <input
              value={form.name_cs}
              placeholder="Cesko"
              onChange={(e) =>
                setForm((f) => ({ ...f, name_cs: e.target.value }))
              }
            />
          </label>
              <button type="submit" disabled={isCreating}>
                {isCreating ? "Adding..." : "Add"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

export default Countries;
