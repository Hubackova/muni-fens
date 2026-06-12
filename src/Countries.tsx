import { useEffect, useState } from "react";

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

  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isInitialLoading = isLoading && countries.length === 0;

  useEffect(() => {
    const controller = new AbortController();

    const loadCountries = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `${API_BASE}?limit=${pageSize}&offset=${offset}`,
          {
            signal: controller.signal,
          },
        );

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
  }, [offset]);

  const reloadCurrentPage = async () => {
    try {
      const response = await fetch(
        `${API_BASE}?limit=${pageSize}&offset=${offset}`,
      );
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

      {!error && countries.length > 0 && (
        <div>
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
                  <th>Alpha2</th>
                  <th>Alpha3</th>
                  <th>Name EN</th>
                  <th>Name CS</th>
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
        </div>
      )}

      <form className="create-form" onSubmit={handleCreate}>
        <h2>Add country</h2>
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
    </section>
  );
}

export default Countries;
