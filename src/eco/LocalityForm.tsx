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
  // The template's country: alpha3 goes to the API, the name to the picker.
  const [templateCountry, setTemplateCountry] = useState<{
    alpha3: string;
    name: string;
  } | null>(null);
  // The unique codes copied from the template: while a field still holds the
  // template's value, it would collide on save.
  const [templateCodes, setTemplateCodes] = useState<{
    site_id: string;
    field_code: string;
  } | null>(null);
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
  const countryCode = country?.alpha3 ?? templateCountry?.alpha3 ?? null;

  // Copy an existing locality into the form. Site ID and Field code come over
  // too, but they are UNIQUE, so they are flagged until the user changes them.
  const applyTemplate = async (picked: LocalitySearchResult | null) => {
    setTemplate(picked);
    if (!picked) return;
    try {
      setError(null);
      const detail = await fetchJson<Locality>(
        `${API_ROOT}/localities/${picked.id}`,
      );
      setForm({
        site_id: detail.site_id ?? "",
        field_code: detail.field_code ?? "",
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
      setTemplateCountry({ alpha3: detail.country, name: detail.name_en });
      setTemplateCodes({
        site_id: detail.site_id ?? "",
        field_code: detail.field_code ?? "",
      });
    } catch (err) {
      setError(`Failed to load the template locality. (${errorMessage(err)})`);
    }
  };

  // Clears the form, including a template that was loaded into it.
  // The type-aheads keep the typed text in their own state, so Reset gives
  // them a new key and they come back empty.
  const [resetKey, setResetKey] = useState(0);

  const handleReset = () => {
    setResetKey((n) => n + 1);
    setForm(emptyForm);
    setCountry(null);
    setTemplateCountry(null);
    setTemplateCodes(null);
    setTemplate(null);
    setError(null);
    setErrorField(null);
    setCreated(null);
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

  // True while a unique code is still the one inherited from the template.
  const isInherited = (field: "site_id" | "field_code") =>
    !!templateCodes &&
    templateCodes[field] !== "" &&
    form[field] === templateCodes[field];

  const codeClass = (field: "site_id" | "field_code") =>
    [fieldClass(field), isInherited(field) ? "input-error" : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

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
            key={resetKey}
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
            Copies the values below. Site ID and Field code must be changed
            before saving - they have to stay unique. The new locality is not
            linked to the template.
          </small>
        </label>
      </div>

      <div className="form-row">
        <label>
          Site ID
          <input
            className={codeClass("site_id")}
            value={form.site_id}
            onChange={(e) => update({ site_id: e.target.value })}
          />
          {isInherited("site_id") && (
            <small className="field-warning">
              Taken from the template - change it or clear it.
            </small>
          )}
        </label>
        <label>
          Field code
          <input
            className={codeClass("field_code")}
            value={form.field_code}
            onChange={(e) => update({ field_code: e.target.value })}
          />
          {isInherited("field_code") && (
            <small className="field-warning">
              Taken from the template - change it or clear it.
            </small>
          )}
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
            key={resetKey}
            url={(q) =>
              `${API_ROOT}/countries/search?q=${encodeURIComponent(q)}`
            }
            getKey={(c) => c.alpha3}
            getLabel={(c) => c.name_en}
            getHint={(c) => c.alpha3}
            selected={country}
            onSelect={setCountry}
            invalid={errorField === "country"}
            placeholder={templateCountry?.name ?? "Search a country..."}
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
          KFME Grid
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
        <button
          type="button"
          className="btn-reset"
          disabled={isSaving}
          onClick={handleReset}
        >
          Reset
        </button>
      </div>
    </form>
  );
}

export default LocalityForm;
