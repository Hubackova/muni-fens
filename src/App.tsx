import { useState } from "react";
import "./App.css";
import Countries from "./Countries";
import Species from "./Species";

type Tab = "species" | "countries";

function App() {
  const [tab, setTab] = useState<Tab>("species");

  return (
    <>
      <nav className="main-nav">
        <button
          type="button"
          className={tab === "species" ? "nav-active" : ""}
          onClick={() => setTab("species")}
        >
          Species
        </button>
        <button
          type="button"
          className={tab === "countries" ? "nav-active" : ""}
          onClick={() => setTab("countries")}
        >
          Countries
        </button>
      </nav>
      {tab === "species" ? <Species /> : <Countries />}
    </>
  );
}

export default App;
