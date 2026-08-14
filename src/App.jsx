import { useEffect, useState } from "react";

import Projects from "./pages/Projects";
import CutlistImport from "./Cutlistimport";
import QRTracking from "./QRTracking";
import Production from "./Production";
import "./App.css";

function App() {
  const [page, setPage] =
    useState("dashboard");

  const [sites, setSites] =
    useState([]);

  const [panels, setPanels] =
    useState([]);

  const [dashboardView, setDashboardView] =
    useState("progress");

  // =========================================================
  // LOAD TRACKERZ DATA
  // =========================================================

  const loadData = () => {
    try {
      const savedSites =
        JSON.parse(
          localStorage.getItem(
            "trackerzSites"
          ) || "[]"
        );

      const savedPanels =
        JSON.parse(
          localStorage.getItem(
            "trackerzPanels"
          ) || "[]"
        );

      setSites(
        Array.isArray(savedSites)
          ? savedSites
          : []
      );

      setPanels(
        Array.isArray(savedPanels)
          ? savedPanels
          : []
      );
    } catch (error) {
      console.error(
        "Unable to load Trackerz data:",
        error
      );

      setSites([]);
      setPanels([]);
    }
  };

  // =========================================================
  // INITIAL LOAD
  // =========================================================

  useEffect(() => {
    loadData();
  }, []);

  // =========================================================
  // RELOAD WHEN PAGE CHANGES
  // =========================================================

  useEffect(() => {
    loadData();
  }, [page]);

  // =========================================================
  // REFRESH WHEN WINDOW GETS FOCUS
  // =========================================================

  useEffect(() => {
    const refreshData = () => {
      loadData();
    };

    window.addEventListener(
      "focus",
      refreshData
    );

    return () => {
      window.removeEventListener(
        "focus",
        refreshData
      );
    };
  }, []);

  // =========================================================
  // GET PANELS FOR SITE
  // =========================================================

  const getSitePanels = (site) => {
    if (!site) {
      return [];
    }

    return panels.filter(
      (panel) => {
        const panelSiteId =
          String(
            panel.siteId || ""
          );

        const panelSiteName =
          String(
            panel.siteName || ""
          )
            .trim()
            .toLowerCase();

        const siteId =
          String(
            site.id || ""
          );

        const siteName =
          String(
            site.siteName || ""
          )
            .trim()
            .toLowerCase();

        return (
          panelSiteId ===
            siteId ||
          (
            panelSiteName !==
              "" &&
            siteName !==
              "" &&
            panelSiteName ===
              siteName
          )
        );
      }
    );
  };

  // =========================================================
  // PANEL STATUS
  // =========================================================

  const getPanelStatus = (
    panel
  ) => {
    return String(
      panel.status ||
        panel.productionStatus ||
        panel.packStatus ||
        ""
    )
      .trim()
      .toLowerCase();
  };

  // =========================================================
  // PACKED PANEL
  // =========================================================

  const isPanelPacked = (
    panel
  ) => {
    const status =
      getPanelStatus(
        panel
      );

    return (
      status === "packed" ||
      status === "packing" ||
      status === "completed" ||
      status === "delivered" ||
      panel.packed === true ||
      panel.isPacked === true
    );
  };

  // =========================================================
  // SITE PROGRESS
  // =========================================================

  const getSiteProgress = (
    site
  ) => {
    const sitePanels =
      getSitePanels(
        site
      );

    const total =
      Number(
        site.panelCount ||
          sitePanels.length ||
          0
      );

    if (total === 0) {
      return {
        total: 0,
        packed: 0,
        balance: 0,
        percentage: 0,
      };
    }

    const packed =
      sitePanels.filter(
        (panel) =>
          isPanelPacked(
            panel
          )
      ).length;

    const percentage =
      Math.min(
        100,
        Math.round(
          (packed /
            total) *
            100
        )
      );

    return {
      total,
      packed,
      balance:
        Math.max(
          total -
            packed,
          0
        ),
      percentage,
    };
  };

  // =========================================================
  // DELIVERED SITE
  // =========================================================

  const isSiteDelivered = (
    site
  ) => {
    const status =
      String(
        site.status || ""
      )
        .trim()
        .toLowerCase();

    return (
      status ===
        "delivered" ||
      site.delivered ===
        true ||
      site.isDelivered ===
        true
    );
  };

  // =========================================================
  // SITE LISTS
  // =========================================================

  const progressSites =
    sites.filter(
      (site) =>
        !isSiteDelivered(
          site
        )
    );

  const deliveredSites =
    sites.filter(
      (site) =>
        isSiteDelivered(
          site
        )
    );

  // =========================================================
  // DELETE SITE
  // =========================================================

  const deleteSite = (
    siteId
  ) => {
    const site =
      sites.find(
        (item) =>
          String(
            item.id
          ) ===
          String(
            siteId
          )
      );

    if (!site) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${
          site.siteName ||
          "this site"
        }"?\n\n` +
          "This will permanently delete the site and all panels belonging to it."
      );

    if (!confirmed) {
      return;
    }

    try {
      const existingSites =
        JSON.parse(
          localStorage.getItem(
            "trackerzSites"
          ) || "[]"
        );

      const updatedSites =
        existingSites.filter(
          (item) =>
            String(
              item.id
            ) !==
            String(
              siteId
            )
        );

      localStorage.setItem(
        "trackerzSites",
        JSON.stringify(
          updatedSites
        )
      );

      const existingPanels =
        JSON.parse(
          localStorage.getItem(
            "trackerzPanels"
          ) || "[]"
        );

      const updatedPanels =
        existingPanels.filter(
          (panel) => {
            const sameSiteId =
              String(
                panel.siteId ||
                  ""
              ) ===
              String(
                siteId
              );

            const sameSiteName =
              String(
                panel.siteName ||
                  ""
              )
                .trim()
                .toLowerCase() ===
              String(
                site.siteName ||
                  ""
              )
                .trim()
                .toLowerCase();

            return (
              !sameSiteId &&
              !sameSiteName
            );
          }
        );

      localStorage.setItem(
        "trackerzPanels",
        JSON.stringify(
          updatedPanels
        )
      );

      setSites(
        updatedSites
      );

      setPanels(
        updatedPanels
      );

      alert(
        `${
          site.siteName ||
          "Site"
        } deleted successfully.`
      );
    } catch (error) {
      console.error(
        "Unable to delete site:",
        error
      );

      alert(
        "Unable to delete the site."
      );
    }
  };

  // =========================================================
  // NAVIGATION
  // =========================================================

  const renderNavigation =
    () => {
      return (
        <aside className="sidebar">

          <div className="logo">

            <div className="logo-mark">
              T
            </div>

            <div>
              <h1>
                TRACKERZ
              </h1>

              <span>
                Panel Production System
              </span>
            </div>

          </div>

          <nav>

            <button
              className={`nav-item ${
                page ===
                "dashboard"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setPage(
                  "dashboard"
                )
              }
            >
              <span>
                ▦
              </span>

              Dashboard
            </button>

            <button
              className={`nav-item ${
                page ===
                "cutlist"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setPage(
                  "cutlist"
                )
              }
            >
              <span>
                ▤
              </span>

              Cutlist Import
            </button>

            <button
              className={`nav-item ${
                page === "qr"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setPage(
                  "qr"
                )
              }
            >
              <span>
                ⌗
              </span>

              QR Tracking
            </button>

            <button
              className={`nav-item ${
                page ===
                "production"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setPage(
                  "production"
                )
              }
            >
              <span>
                ✓
              </span>

              Production
            </button>

            <button
              className={`nav-item ${
                page ===
                "reports"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setPage(
                  "reports"
                )
              }
            >
              <span>
                ▥
              </span>

              Reports
            </button>

          </nav>

          <div className="sidebar-bottom">

            <button
              className={`nav-item ${
                page ===
                "settings"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setPage(
                  "settings"
                )
              }
            >
              <span>
                ⚙
              </span>

              Settings
            </button>

            <div className="user">

              <div className="avatar">
                A
              </div>

              <div>
                <strong>
                  Admin
                </strong>

                <small>
                  Factory Manager
                </small>
              </div>

            </div>

          </div>

        </aside>
      );
    };

  // =========================================================
  // EMPTY DASHBOARD
  // =========================================================

  const renderEmptyState =
    () => {
      const isProgress =
        dashboardView ===
        "progress";

      return (
        <div
          style={{
            padding:
              "50px 20px",
            textAlign:
              "center",
            width:
              "100%",
            boxSizing:
              "border-box",
          }}
        >
          <div
            style={{
              fontSize:
                "42px",
              marginBottom:
                "12px",
            }}
          >
            {isProgress
              ? "▤"
              : "✓"}
          </div>

          <h3>
            {isProgress
              ? "No progress sites"
              : "No delivered sites"}
          </h3>

          <p>
            {isProgress
              ? "Imported production sites will appear here."
              : "Sites marked as delivered will appear here."}
          </p>
        </div>
      );
    };

  // =========================================================
  // SITE TABLE
  // =========================================================

  const renderSiteTable =
    (siteList) => {
      if (
        siteList.length ===
        0
      ) {
        return renderEmptyState();
      }

      return (
        <div
          className="table"
          style={{
            width:
              "100%",
            minWidth:
              "900px",
          }}
        >

          <div
            className="table-header"
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "2fr 1.4fr 0.9fr 1.5fr 1.2fr 0.8fr",
              alignItems:
                "center",
              gap:
                "12px",
              width:
                "100%",
            }}
          >
            <span>
              SITE
            </span>

            <span>
              CLIENT
            </span>

            <span>
              PANELS
            </span>

            <span>
              PROGRESS
            </span>

            <span>
              STATUS
            </span>

            <span>
              DELETE
            </span>
          </div>

          {siteList.map(
            (site) => {
              const progress =
                getSiteProgress(
                  site
                );

              return (
                <div
                  className="table-row"
                  key={
                    site.id
                  }
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "2fr 1.4fr 0.9fr 1.5fr 1.2fr 0.8fr",
                    alignItems:
                      "center",
                    gap:
                      "12px",
                    width:
                      "100%",
                    minHeight:
                      "70px",
                    boxSizing:
                      "border-box",
                  }}
                >

                  <div
                    style={{
                      minWidth:
                        0,
                    }}
                  >
                    <strong
                      style={{
                        display:
                          "block",
                        whiteSpace:
                          "nowrap",
                        overflow:
                          "hidden",
                        textOverflow:
                          "ellipsis",
                      }}
                    >
                      {site.siteName ||
                        "Unnamed Site"}
                    </strong>

                    <small>
                      Trackerz Production Site
                    </small>
                  </div>

                  <span>
                    {site.clientName ||
                      site.customer ||
                      "—"}
                  </span>

                  <div>
                    <strong>
                      {
                        progress.packed
                      }
                      {" / "}
                      {
                        progress.total
                      }
                    </strong>

                    <small
                      style={{
                        display:
                          "block",
                      }}
                    >
                      {
                        progress.balance
                      }{" "}
                      balance
                    </small>
                  </div>

                  <div
                    className="mini-progress"
                  >
                    <div>
                      <div
                        className="mini-fill"
                        style={{
                          width:
                            `${progress.percentage}%`,
                        }}
                      />
                    </div>

                    <span>
                      {
                        progress.percentage
                      }%
                    </span>
                  </div>

                  <span
                    className={`status ${
                      dashboardView ===
                      "delivered"
                        ? "completed-status"
                        : "active-status"
                    }`}
                  >
                    {dashboardView ===
                    "delivered"
                      ? "Delivered"
                      : progress.percentage ===
                        100
                      ? "Ready"
                      : "In Production"}
                  </span>

                  <button
                    onClick={() =>
                      deleteSite(
                        site.id
                      )
                    }
                    style={{
                      padding:
                        "7px 10px",
                      border:
                        "1px solid #ef4444",
                      background:
                        "#fff",
                      color:
                        "#dc2626",
                      borderRadius:
                        "7px",
                      cursor:
                        "pointer",
                      fontWeight:
                        "600",
                      whiteSpace:
                        "nowrap",
                    }}
                  >
                    🗑 Delete
                  </button>

                </div>
              );
            }
          )}

        </div>
      );
    };

  // =========================================================
  // DASHBOARD
  // =========================================================

  const renderDashboard =
    () => {
      const currentSites =
        dashboardView ===
        "progress"
          ? progressSites
          : deliveredSites;

      return (
        <>
          <header className="topbar">
            <div>

              <p className="eyebrow">
                TRACKERZ PRODUCTION
              </p>

              <h2>
                Production Dashboard
              </h2>

              <p className="subtitle">
                Track production progress
                and delivered sites.
              </p>

            </div>
          </header>

          <section
            className="panel projects-panel"
            style={{
              width:
                "100%",
              boxSizing:
                "border-box",
              overflowX:
                "auto",
            }}
          >

            <div
              className="panel-header"
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                minHeight:
                  "65px",
              }}
            >

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "6px",
                }}
              >

                <button
                  onClick={() =>
                    setDashboardView(
                      "progress"
                    )
                  }
                  style={{
                    border:
                      "none",
                    borderBottom:
                      dashboardView ===
                      "progress"
                        ? "3px solid #2563eb"
                        : "3px solid transparent",
                    background:
                      "transparent",
                    padding:
                      "12px 16px",
                    cursor:
                      "pointer",
                    fontWeight:
                      "700",
                    fontSize:
                      "15px",
                    color:
                      dashboardView ===
                      "progress"
                        ? "#2563eb"
                        : "#6b7280",
                  }}
                >
                  ▤ Progress Sites (
                  {
                    progressSites.length
                  }
                  )
                </button>

                <button
                  onClick={() =>
                    setDashboardView(
                      "delivered"
                    )
                  }
                  style={{
                    border:
                      "none",
                    borderBottom:
                      dashboardView ===
                      "delivered"
                        ? "3px solid #16a34a"
                        : "3px solid transparent",
                    background:
                      "transparent",
                    padding:
                      "12px 16px",
                    cursor:
                      "pointer",
                    fontWeight:
                      "700",
                    fontSize:
                      "15px",
                    color:
                      dashboardView ===
                      "delivered"
                        ? "#16a34a"
                        : "#6b7280",
                  }}
                >
                  ✓ Delivered (
                  {
                    deliveredSites.length
                  }
                  )
                </button>

              </div>

            </div>

            {renderSiteTable(
              currentSites
            )}

          </section>
        </>
      );
    };

  // =========================================================
  // PAGE ROUTING
  // =========================================================

  const renderPage =
    () => {
      switch (
        page
      ) {
        case "dashboard":
          return renderDashboard();

        case "cutlist":
          return (
            <CutlistImport />
          );

        case "projects":
          return (
            <Projects />
          );

        case "qr":
          return (
            <QRTracking />
          );

        case "production":
          return (
            <Production />
          );

        case "reports":
          return (
            <Production />
          );

        case "settings":
          return (
            <div className="panel">
              <h2>
                Settings
              </h2>

              <p>
                Trackerz settings
                will be connected
                here.
              </p>
            </div>
          );

        default:
          return renderDashboard();
      }
    };

  // =========================================================
  // APP
  // =========================================================

  return (
    <div className="app">

      {renderNavigation()}

      <main className="main">
        {renderPage()}
      </main>

    </div>
  );
}

export default App;