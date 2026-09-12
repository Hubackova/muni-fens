import { useState } from "react";
import {
  API_ROOT,
  errorMessage,
  fetchJson,
  isFieldError,
  type LookupsResponse,
  type StatusIdResponse,
} from "../api";
import ErrorBanner from "../ErrorBanner";
import Autocomplete from "../Autocomplete";
import type { CountrySearchResult, Locality, LocalitySearchResult } from "../localities/types";
import { SUBGRID_LOOKUP, parseDecimal, parseInteger } from "./types";

type Props = {
  lookups: LookupsResponse;
};

const emptyForm = {
  site_id: "",
  field_code: "",
  name: "",
  latitude: "",
  longitude: "",
  settlement: "",
  state: "",
  masl: "",
  eur_grid: "",
  eur_subgrid: "",
  note: "",
};

// Add a brand new locality. An existing locality can be used as a template:
// its values are copied into the form, but the new locality is not linked to
// it in any way.
function LocalityForm({ lookups }: Props) {
  const [form, setForm] = useState(emptyForm);
  // Country is chosen by name but sent as alpha3.
  const [country, setCountry] = useState<CountrySearchResult | null>(null);
  const [templateCountry, setTemplateCountry] = useState<string | null>(null);
  const [template, setTemplate] = useState<LocalitySearchResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The message itself goes to the banner; this only marks which input the
  // backend blamed, so it can be outlined in red.
  const [errorField, setErrorField] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(null);

  // Every validation failure names its field, so the banner and the outline
  // always agree.
  const fail = (field: string | null, message: string) => {
    setError(message);
    setErrorField(field);
  };

  const subgridOptions = lookups[SUBGRID_LOOKUP] ?? [];
  const update = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));

  // alpha3 actually sent: a freshly picked country wins over the template's.
  const countryCode = country?.alpha3 ?? templateCountry;

  // Copy an existing locality into the form. Site ID and Field code are left
  // empty on purpose - they are UNIQUE, so copying them guarantees a 409.
  const applyTemplate = async (picked: LocalitySearchResult | null) => {
    setTemplate(picked);
    if (!picked) return;
    try {
      setError(null);
      const detail = await fetchJson<Locality>(
        `${API_ROOT}/localities/${picked.id}`,
      );
      setForm({
        site_id: "",
        field_code: "",
        name: detail.name,
        latitude: String(detail.latitude),
        longitude: String(detail.longitude),
        settlement: detail.settlement ?? "",
        state: detail.state ?? "",
        masl: detail.masl === null ? "" : String(detail.masl),
        eur_grid: detail.eur_grid === null ? "" : String(detail.eur_grid),
        eur_subgrid: detail.eur_subgrid ?? "",
        note: detail.note ?? "",
      });
      setCountry(null);
      setTemplateCountry(detail.country);
    } catch (err) {
      setError(`Failed to load the template locality. (${errorMessage(err)})`);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setErrorField(null);
    setCreated(null);

    const name = form.name.trim();
    const latitude = parseDecimal(form.latitude);
    const longitude = parseDecimal(form.longitude);

    if (!name) return fail("name", "Site name is required.");
    if (latitude === null || latitude < -90 || latitude > 90) {
      return fail(
        "latitude",
        "Latitude is required and must be between -90 and 90.",
      );
    }
    if (longitude === null || longitude < -180 || longitude > 180) {
      return fail(
        "longitude",
        "Longitude is required and must be between -180 and 180.",
      );
    }
    if (!countryCode) return fail("country", "Country is required.");

    try {
      setIsSaving(true);
      const result = await fetchJson<StatusIdResponse>(
        `${API_ROOT}/eco/localities`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            site_id: form.site_id.trim() || null,
            field_code: form.field_code.trim() || null,
            name,
            latitude,
            longitude,
            country: countryCode,
            settlement: form.settlement.trim() || null,
            state: form.state.trim() || null,
            masl: form.masl.trim() ? parseInteger(form.masl) : null,
            eur_grid: form.eur_grid.trim() ? parseInteger(form.eur_grid) : null,
            eur_subgrid: form.eur_subgrid || null,
            note: form.note.trim() || null,
          }),
        },
      );
      setForm(emptyForm);
      setCountry(null);
      setTemplateCountry(null);
      setTemplate(null);
      setCreated(result.id);
    } catch (err) {
      setError(errorMessage(err));
      setErrorField(isFieldError(err) ? err.field : null);
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClass = (field: string) =>
    errorField === field ? "input-error" : undefined;

  return (
    <form className="modal-form" onSubmit={handleSubmit}>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {created !== null && (
        <p className="notice">Locality #{created} created.</p>
      )}

      <div className="form-row">
        <label className="grow">
          Use locality as template
          <Autocomplete<LocalitySearchResult>
            url={(q) =>
              `${API_ROOT}/localities/search?q=${encodeURIComponent(q)}`
            }
            getKey={(l) => l.id}
            getLabel={(l) => l.name}
            getHint={(l) => `#${l.id}`}
            selected={template}
            onSelect={applyTemplate}
            placeholder="Search an existing locality..."
          />
          <small className="hint">
            Copies the values below. Site ID and Field code are left empty
            because they must stay unique; the new locality is not linked to the
            template.
          </small>
        </label>
      </div>

      <div className="form-row">
        <label>
          Site ID
          <input
            className={fieldClass("site_id")}
            value={form.site_id}
            onChange={(e) => update({ site_id: e.target.value })}
          />
        </label>
        <label>
          Field code
          <input
            className={fieldClass("field_code")}
            value={form.field_code}
            onChange={(e) => update({ field_code: e.target.value })}
          />
        </label>
        <label className="grow">
          Site name *
          <input
            className={fieldClass("name")}
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>
      </div>

      <div className="form-row">
        <label>
          Latitude *
          <input
            className={fieldClass("latitude")}
            inputMode="decimal"
            placeholder="49.1951"
            value={form.latitude}
            onChange={(e) => update({ latitude: e.target.value })}
          />
        </label>
        <label>
          Longitude *
          <input
            className={fieldClass("longitude")}
            inputMode="decimal"
            placeholder="16.6068"
            value={form.longitude}
            onChange={(e) => update({ longitude: e.target.value })}
          />
        </label>
        <label className="grow">
          Country *
          <Autocomplete<CountrySearchResult>
            url={(q) =>
              `${API_ROOT}/countries/search?q=${encodeURIComponent(q)}`
            }
            getKey={(c) => c.alpha3}
            getLabel={(c) => c.name_en}
            getHint={(c) => c.alpha3}
            selected={country}
            onSelect={setCountry}
            invalid={errorField === "country"}
            placeholder={templateCountry ?? "Search a country..."}
          />
        </label>
      </div>

      <div className="form-row">
        <label>
          Settlement
          <input
            value={form.settlement}
            onChange={(e) => update({ settlement: e.target.value })}
          />
        </label>
        <label>
          State/Province/Region
          <input
            value={form.state}
            onChange={(e) => update({ state: e.target.value })}
          />
        </label>
        <label>
          Elevation (m a.s.l.)
          <input
            type="number"
            value={form.masl}
            onChange={(e) => update({ masl: e.target.value })}
          />
        </label>
      </div>

      <div className="form-row">
        <label>
          Grid
          <input
            type="number"
            value={form.eur_grid}
            onChange={(e) => update({ eur_grid: e.target.value })}
          />
        </label>
        <label>
          Subgrid
          <select
            value={form.eur_subgrid}
            onChange={(e) => update({ eur_subgrid: e.target.value })}
          >
            <option value="">-</option>
            {subgridOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Note
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => update({ note: e.target.value })}
          />
        </label>
      </div>

      <div className="form-row">
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Add locality"}
        </button>
      </div>
    </form>
  );
}

export default LocalityForm;
