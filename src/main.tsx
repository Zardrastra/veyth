import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Link, RouterProvider } from "react-router-dom";
import App from "./App";
import Home from "./pages/Home";
import Thanks from "./pages/Thanks";
import About from "./pages/About";
import Privacy from "./pages/Privacy";
import { Mascot } from "./components/Mascot";
import { TOOLS } from "./tools";
import "./index.css";

function NotFound() {
  return (
    <div className="flex items-center gap-4 py-12">
      <Mascot size={64} mood="oops" />
      <div>
        <h1 className="text-2xl font-bold">Nothing here</h1>
        <Link to="/" className="text-sm text-[var(--color-accent)] hover:underline">Back to all tools →</Link>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      ...TOOLS.map(({ slug, Component }) => ({ path: slug, element: <Component /> })),
      { path: "thanks", element: <Thanks /> },
      { path: "about", element: <About /> },
      { path: "privacy", element: <Privacy /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
