import { useState } from "react";
import "./App.css";
import AddNew from "./AddNew";
import Countries from "./Countries";
import Localities from "./Localities";
import Observations from "./Observations";
import Samplings from "./Samplings";
import Species from "./Species";

type Tab =
  | "species"
  | "countries"
  | "localities"
  | "localities-eco"
  | "samplings"
  | "observations"
  | "add";

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
        <button
          type="button"
          className={tab === "localities" ? "nav-active" : ""}
          onClick={() => setTab("localities")}
        >
          Localities
        </button>
        <button
          type="button"
          className={tab === "localities-eco" ? "nav-active" : ""}
          onClick={() => setTab("localities-eco")}
        >
          Localities ECO
        </button>
        <button
          type="button"
          className={tab === "samplings" ? "nav-active" : ""}
          onClick={() => setTab("samplings")}
        >
          Samplings
        </button>
        <button
          type="button"
          className={tab === "observations" ? "nav-active" : ""}
          onClick={() => setTab("observations")}
        >
          Observations
        </button>
        <button
          type="button"
          className={tab === "add" ? "nav-active" : ""}
          onClick={() => setTab("add")}
        >
          Add new
        </button>
      </nav>
      {tab === "species" && <Species />}
      {tab === "countries" && <Countries />}
      {tab === "localities" && <Localities />}
      {tab === "localities-eco" && <Localities eco key="eco" />}
      {tab === "samplings" && <Samplings />}
      {tab === "observations" && <Observations />}
      {tab === "add" && <AddNew />}
    </>
  );
}

export default App;
