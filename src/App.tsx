import { useState } from "react";
import "./App.css";
import AddNew from "./AddNew";
import Countries from "./Countries";
import Localities from "./Localities";
import Observations from "./Observations";
import SamplingSpecies from "./SamplingSpecies";
import Samplings from "./Samplings";
import Species from "./Species";

type Tab =
  | "species"
  | "countries"
  | "localities"
  | "localities-eco"
  | "samplings"
  | "observations"
  | "sampling-species"
  | "add";

// The tabs split in two: data shared by every interface, and the ECO part.
const SHARED_TABS: { id: Tab; label: string }[] = [
  { id: "species", label: "Species" },
  { id: "countries", label: "Countries" },
  { id: "localities", label: "Localities" },
];

const ECO_TABS: { id: Tab; label: string }[] = [
  { id: "add", label: "Add new" },
  { id: "localities-eco", label: "Localities" },
  { id: "samplings", label: "Samplings" },
  { id: "observations", label: "Observations" },
  { id: "sampling-species", label: "All data" },
];

function App() {
  const [tab, setTab] = useState<Tab>("species");

  const renderGroup = (label: string, tabs: { id: Tab; label: string }[]) => (
    <div className="nav-group">
      <span className="nav-group-label">{label}</span>
      <div className="nav-group-tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "nav-active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <nav className="main-nav">
        {renderGroup("Shared", SHARED_TABS)}
        <span className="nav-divider" aria-hidden="true" />
        {renderGroup("ECO", ECO_TABS)}
      </nav>
      {tab === "species" && <Species />}
      {tab === "countries" && <Countries />}
      {tab === "localities" && <Localities />}
      {tab === "localities-eco" && <Localities eco key="eco" />}
      {tab === "samplings" && <Samplings />}
      {tab === "observations" && <Observations />}
      {tab === "sampling-species" && <SamplingSpecies />}
      {tab === "add" && <AddNew />}
    </>
  );
}

export default App;
