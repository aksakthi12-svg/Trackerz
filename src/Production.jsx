import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function Production() {
  // =========================================================
  // STATE
  // =========================================================

  const [sites, setSites] = useState([]);
  const [panels, setPanels] = useState([]);

  // Packet master records and panel-to-packet relationships.
  // These are read only for the report.
  const [packets, setPackets] = useState([]);
  const [packetPanels, setPacketPanels] = useState([]);

  const [selectedSiteId, setSelectedSiteId] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // =========================================================
  // LOAD SITES + PANELS + PACKETS + RELATIONSHIPS
  // =========================================================

  const loadData = async () => {
    try {
      setError("");

      const {
        data: sitesData,
        error: sitesError,
      } = await supabase
        .from("sites")
        .select("*")
        .order("id", {
          ascending: true,
        });

      if (sitesError) {
        throw sitesError;
      }

      const {
        data: panelsData,
        error: panelsError,
      } = await supabase
        .from("panels")
        .select("*")
        .order("id", {
          ascending: true,
        });

      if (panelsError) {
        throw panelsError;
      }

      const {
        data: packetsData,
        error: packetsError,
      } = await supabase
        .from("packets")
        .select("*")
        .order("id", {
          ascending: true,
        });

      if (packetsError) {
        throw packetsError;
      }

      const {
        data: packetPanelsData,
        error: packetPanelsError,
      } = await supabase
        .from("packet_panels")
        .select("*")
        .order("id", {
          ascending: true,
        });

      if (packetPanelsError) {
        throw packetPanelsError;
      }

      const safeSites = Array.isArray(sitesData)
        ? sitesData
        : [];

      const safePanels = Array.isArray(panelsData)
        ? panelsData
        : [];

      const safePackets = Array.isArray(packetsData)
        ? packetsData
        : [];

      const safePacketPanels = Array.isArray(
        packetPanelsData
      )
        ? packetPanelsData
        : [];

      setSites(safeSites);
      setPanels(safePanels);
      setPackets(safePackets);
      setPacketPanels(safePacketPanels);

      // Keep the currently selected site if it still exists.
      if (selectedSiteId) {
        const currentSiteExists =
          safeSites.some(
            (site) =>
              String(site.id) ===
              String(selectedSiteId)
          );

        if (!currentSiteExists) {
          setSelectedSiteId("");
        }
      }

      // Automatically select the first available site.
      if (
        !selectedSiteId &&
        safeSites.length > 0
      ) {
        setSelectedSiteId(
          String(safeSites[0].id)
        );
      }
    } catch (err) {
      console.error(
        "Unable to load Production data:",
        err
      );

      setError(
        err?.message ||
          "Unable to load Production data from Supabase."
      );

      setSites([]);
      setPanels([]);
      setPackets([]);
      setPacketPanels([]);
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // INITIAL LOAD
  // =========================================================

  useEffect(() => {
    loadData();
  }, []);

  // =========================================================
  // REFRESH WHEN WINDOW GETS FOCUS
  // =========================================================

  useEffect(() => {
    const handleFocus = () => {
      loadData();
    };

    window.addEventListener(
      "focus",
      handleFocus
    );

    return () => {
      window.removeEventListener(
        "focus",
        handleFocus
      );
    };
  }, []);

  // =========================================================
  // REFRESH WHEN TAB BECOMES VISIBLE
  // =========================================================

  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        loadData();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, []);

  // =========================================================
  // HELPERS
  // =========================================================

  const getPanelStatus = (panel) => {
    return String(
      panel?.status ||
        panel?.production_status ||
        panel?.productionStatus ||
        panel?.pack_status ||
        panel?.packStatus ||
        ""
    )
      .trim()
      .toLowerCase();
  };

  const isPacked = (panel) => {
    const status =
      getPanelStatus(panel);

    return (
      panel?.packed === true ||
      panel?.is_packed === true ||
      panel?.isPacked === true ||
      status === "packed" ||
      status === "packing" ||
      status === "completed" ||
      status === "delivered"
    );
  };

  const getSiteName = (site) => {
    return (
      site?.site_name ||
      site?.siteName ||
      site?.name ||
      "Unnamed Site"
    );
  };

  const getClientName = (site) => {
    return (
      site?.client_name ||
      site?.clientName ||
      site?.customer ||
      "Client"
    );
  };

  const getSiteId = (site) => {
    return String(
      site?.id || ""
    );
  };

  const getPanelSiteId = (panel) => {
    return String(
      panel?.site_id ||
        panel?.siteId ||
        ""
    );
  };

  const getPanelSiteName = (panel) => {
    return String(
      panel?.site_name ||
        panel?.siteName ||
        ""
    )
      .trim()
      .toLowerCase();
  };

  // =========================================================
  // GET PANELS FOR SITE
  // =========================================================

  const getSitePanels = (site) => {
    if (!site) {
      return [];
    }

    const siteId =
      getSiteId(site);

    const siteName =
      getSiteName(site)
        .trim()
        .toLowerCase();

    return panels.filter(
      (panel) => {
        const panelSiteId =
          getPanelSiteId(panel);

        const panelSiteName =
          getPanelSiteName(panel);

        // Primary match = site ID.
        if (
          panelSiteId &&
          panelSiteId === siteId
        ) {
          return true;
        }

        // Fallback = site name for older data.
        if (
          !panelSiteId &&
          panelSiteName &&
          siteName &&
          panelSiteName === siteName
        ) {
          return true;
        }

        return false;
      }
    );
  };

  // =========================================================
  // SELECTED SITE
  // =========================================================

  const selectedSite = useMemo(() => {
    if (!selectedSiteId) {
      return null;
    }

    return (
      sites.find(
        (site) =>
          String(site.id) ===
          String(selectedSiteId)
      ) || null
    );
  }, [
    sites,
    selectedSiteId,
  ]);

  // =========================================================
  // SELECTED SITE PANELS
  // =========================================================

  const sitePanels = useMemo(() => {
    if (!selectedSite) {
      return [];
    }

    return getSitePanels(
      selectedSite
    );
  }, [
    selectedSite,
    panels,
  ]);

  // =========================================================
  // PACKED PANELS
  // =========================================================

  const packedPanels = useMemo(() => {
    return sitePanels.filter(
      (panel) =>
        isPacked(panel)
    );
  }, [sitePanels]);

  // =========================================================
  // GET PACKET NUMBER / CODE
  // =========================================================

  const getPacketNumber = (
    packet
  ) => {
    if (!packet) {
      return "Not Assigned";
    }

    return (
      packet?.packet_code ||
      packet?.packet_qr ||
      packet?.packet_number ||
      packet?.packetNumber ||
      packet?.packet_no ||
      packet?.packetNo ||
      packet?.id ||
      "Not Assigned"
    );
  };

  // =========================================================
  // GET PACKET RELATION FOR PANEL
  //
  // panels.id
  //   -> packet_panels.panel_id
  //   -> packet_panels.packet_id
  //   -> packets.id
  // =========================================================

  const getPacketForPanel = (
    panel
  ) => {
    if (!panel) {
      return null;
    }

    const panelId =
      panel?.id;

    if (
      panelId === null ||
      panelId === undefined
    ) {
      return null;
    }

    const relations =
      packetPanels.filter(
        (relation) =>
          String(
            relation?.panel_id
          ) ===
          String(panelId)
      );

    if (
      relations.length === 0
    ) {
      return null;
    }

    // Prefer the latest relationship if duplicates exist.
    const relation =
      [...relations].sort(
        (a, b) =>
          Number(b?.id || 0) -
          Number(a?.id || 0)
      )[0];

    return (
      packets.find(
        (packet) =>
          String(packet?.id) ===
          String(
            relation?.packet_id
          )
      ) || null
    );
  };

  // =========================================================
  // GET PACKET DISPLAY VALUE
  // =========================================================

  const getPanelPacketNumber = (
    panel
  ) => {
    const packet =
      getPacketForPanel(
        panel
      );

    if (packet) {
      return getPacketNumber(
        packet
      );
    }

    // Legacy fallback.
    return (
      panel?.packet_number ||
      panel?.packetNumber ||
      panel?.packet_no ||
      panel?.packetNo ||
      "Not Assigned"
    );
  };

  // =========================================================
  // PACKET GROUPS
  //
  // Used for the report Excel and packet count only.
  // Individual packet download buttons are intentionally
  // removed from the UI.
  // =========================================================

  const packetGroups = useMemo(() => {
    const groups = {};

    packedPanels.forEach(
      (panel) => {
        const packet =
          String(
            getPanelPacketNumber(
              panel
            )
          );

        if (!groups[packet]) {
          groups[packet] = [];
        }

        groups[packet].push(
          panel
        );
      }
    );

    return Object.entries(
      groups
    )
      .sort(
        ([a], [b]) =>
          a.localeCompare(
            b,
            undefined,
            {
              numeric: true,
            }
          )
      )
      .map(
        ([
          packet,
          packetPanelsForReport,
        ]) => ({
          packet,
          panels:
            packetPanelsForReport,
        })
      );
  }, [
    packedPanels,
    packets,
    packetPanels,
  ]);

  // =========================================================
  // SAFE VALUE
  // =========================================================

  const value = (
    item,
    keys
  ) => {
    for (
      const key of keys
    ) {
      if (
        item?.[key] !==
          undefined &&
        item?.[key] !==
          null &&
        item?.[key] !== ""
      ) {
        return item[key];
      }
    }

    return "";
  };

  // =========================================================
  // COMPLETE EXCEL EXPORT
  //
  // This remains the main report download.
  // No individual packet Excel files are created.
  // =========================================================

  const downloadExcel = () => {
    if (!selectedSite) {
      alert(
        "Please select a site first."
      );

      return;
    }

    if (
      packedPanels.length === 0
    ) {
      alert(
        "No packed panels found for this site."
      );

      return;
    }

    const rows = [];

    rows.push([
      "Site",
      "Client",
      "Packet",
      "Panel QR",
      "Panel ID",
      "Room",
      "Unit",
      "Panel Name",
      "Material",
      "Thickness",
      "Length",
      "Width",
      "Quantity",
      "Status",
    ]);

    packetGroups.forEach(
      ({
        packet,
        panels:
          packetPanels,
      }) => {
        packetPanels.forEach(
          (panel) => {
            rows.push([
              getSiteName(
                selectedSite
              ),

              getClientName(
                selectedSite
              ),

              packet,

              value(panel, [
                "qr_data",
                "qrData",
                "qr_code",
                "qrCode",
                "qr",
                "panel_qr",
                "panelQR",
                "code",
              ]),

              value(panel, [
                "panel_name",
                "panelName",
                "panel_id",
                "panelId",
                "id",
              ]),

              value(panel, [
                "room",
                "room_name",
                "roomName",
              ]),

              value(panel, [
                "unit",
                "unit_name",
                "unitName",
                "cabinet",
              ]),

              value(panel, [
                "panel_name",
                "panelName",
                "description",
                "name",
                "partName",
              ]),

              value(panel, [
                "material",
                "material_name",
                "materialName",
              ]),

              value(panel, [
                "thickness",
                "thickness_mm",
                "thicknessMm",
                "thicknessMM",
              ]),

              value(panel, [
                "length",
                "length_mm",
                "lengthMm",
                "lengthMM",
              ]),

              value(panel, [
                "width",
                "width_mm",
                "widthMm",
                "widthMM",
              ]),

              value(panel, [
                "quantity",
                "qty",
              ]) || 1,

              getPanelStatus(
                panel
              ) || "Packed",
            ]);
          }
        );
      }
    );

    const escapeHtml = (
      text
    ) => {
      return String(
        text ?? ""
      )
        .replace(
          /&/g,
          "&amp;"
        )
        .replace(
          /</g,
          "&lt;"
        )
        .replace(
          />/g,
          "&gt;"
        )
        .replace(
          /"/g,
          "&quot;"
        )
        .replace(
          /'/g,
          "&#039;"
        );
    };

    let table = `
      <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          table {
            border-collapse: collapse;
            width: 100%;
          }

          th {
            background: #1f2937;
            color: white;
            font-weight: bold;
            border: 1px solid #999;
            padding: 8px;
          }

          td {
            border: 1px solid #999;
            padding: 7px;
          }
        </style>
      </head>

      <body>
        <table>
    `;

    rows.forEach(
      (
        row,
        rowIndex
      ) => {
        table += "<tr>";

        row.forEach(
          (cell) => {
            if (
              rowIndex === 0
            ) {
              table += `<th>${escapeHtml(
                cell
              )}</th>`;
            } else {
              table += `<td>${escapeHtml(
                cell
              )}</td>`;
            }
          }
        );

        table += "</tr>";
      }
    );

    table += `
        </table>
      </body>
      </html>
    `;

    const blob =
      new Blob(
        [table],
        {
          type:
            "application/vnd.ms-excel",
        }
      );

    const url =
      window.URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    const safeSiteName =
      getSiteName(
        selectedSite
      )
        .replace(
          /[^a-z0-9]/gi,
          "_"
        )
        .replace(
          /_+/g,
          "_"
        );

    link.download =
      `${safeSiteName}_Packed_Panels.xls`;

    document.body.appendChild(
      link
    );

    link.click();

    document.body.removeChild(
      link
    );

    window.URL.revokeObjectURL(
      url
    );
  };

  // =========================================================
  // LOADING SCREEN
  // =========================================================

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          padding: "50px",
          boxSizing:
            "border-box",
          textAlign:
            "center",
        }}
      >
        <div
          style={{
            fontSize: "30px",
            marginBottom:
              "10px",
          }}
        >
          ⟳
        </div>

        <strong>
          Loading Production data...
        </strong>

        <p
          style={{
            color:
              "#6b7280",
            fontSize:
              "13px",
          }}
        >
          Reading sites and panels
          from Supabase.
        </p>
      </div>
    );
  }

  // =========================================================
  // MAIN UI
  // =========================================================

  return (
    <div
      style={{
        width: "100%",
      }}
    >
      {/* =====================================================
          HEADER
          SELECT SITE IS NOW TOP RIGHT
      ===================================================== */}

      <header
        className="topbar"
        style={{
          alignItems:
            "flex-end",
          gap: "20px",
        }}
      >
        <div>
          <p className="eyebrow">
            TRACKERZ PRODUCTION
          </p>

          <h2>
            Production Reports
          </h2>

          <p className="subtitle">
            Export complete packed panel data for the selected site.
          </p>
        </div>

        <div
          style={{
            width:
              "min(360px, 100%)",
            flexShrink: 0,
          }}
        >
          <label
            style={{
              display:
                "block",
              fontSize:
                "11px",
              fontWeight:
                "700",
              color:
                "#6b7280",
              marginBottom:
                "6px",
              letterSpacing:
                "0.5px",
            }}
          >
            SELECT SITE
          </label>

          <select
            value={
              selectedSiteId
            }
            onChange={(
              event
            ) =>
              setSelectedSiteId(
                event.target
                  .value
              )
            }
            style={{
              width:
                "100%",
              boxSizing:
                "border-box",
              padding:
                "11px 13px",
              border:
                "1px solid #d1d5db",
              borderRadius:
                "8px",
              background:
                "#ffffff",
              fontSize:
                "14px",
              outline:
                "none",
            }}
          >
            <option value="">
              Select a site
            </option>

            {sites.map(
              (site) => (
                <option
                  key={
                    site.id
                  }
                  value={
                    site.id
                  }
                >
                  {getSiteName(
                    site
                  )}

                  {getClientName(
                    site
                  ) &&
                    getClientName(
                      site
                    ) !==
                      "Client"
                    ? ` — ${getClientName(
                        site
                      )}`
                    : ""}
                </option>
              )
            )}
          </select>
        </div>
      </header>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && (
        <div
          style={{
            marginBottom:
              "12px",
            padding:
              "12px 15px",
            background:
              "#fef2f2",
            border:
              "1px solid #fecaca",
            color:
              "#b91c1c",
            borderRadius:
              "8px",
            fontSize:
              "13px",
            fontWeight:
              "600",
          }}
        >
          Production data error:{" "}
          {error}
        </div>
      )}

      {/* =====================================================
          MAIN REPORT PANEL
      ===================================================== */}

      <section
        className="panel"
        style={{
          width:
            "100%",
          boxSizing:
            "border-box",
        }}
      >
        {/* ===================================================
            NO SITE
        =================================================== */}

        {!selectedSite && (
          <div
            style={{
              padding:
                "60px 20px",
              textAlign:
                "center",
              color:
                "#6b7280",
            }}
          >
            <div
              style={{
                fontSize:
                  "40px",
                marginBottom:
                  "12px",
              }}
            >
              ▥
            </div>

            <h3
              style={{
                margin:
                  "0 0 8px",
                color:
                  "#374151",
              }}
            >
              {sites.length ===
              0
                ? "No sites found"
                : "Select a site"}
            </h3>

            <p
              style={{
                margin: 0,
              }}
            >
              {sites.length ===
              0
                ? "No sites are currently available."
                : "Select a site above to view the production summary and export the complete Excel report."}
            </p>
          </div>
        )}

        {/* ===================================================
            SITE SELECTED
        =================================================== */}

        {selectedSite && (
          <div
            style={{
              padding:
                "22px",
            }}
          >
            {/* =================================================
                SITE SUMMARY + MAIN EXCEL
            ================================================= */}

            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                gap:
                  "20px",
                flexWrap:
                  "wrap",
                marginBottom:
                  "22px",
              }}
            >
              <div>
                <h3
                  style={{
                    margin:
                      "0 0 5px",
                  }}
                >
                  {getSiteName(
                    selectedSite
                  )}
                </h3>

                <p
                  style={{
                    margin: 0,
                    color:
                      "#6b7280",
                    fontSize:
                      "14px",
                  }}
                >
                  Client:{" "}
                  {getClientName(
                    selectedSite
                  )}
                </p>

                <p
                  style={{
                    margin:
                      "5px 0 0",
                    color:
                      "#475569",
                    fontSize:
                      "14px",
                    fontWeight:
                      "600",
                  }}
                >
                  {sitePanels.length}{" "}
                  total panels •{" "}
                  {packedPanels.length}{" "}
                  packed panels •{" "}
                  {packetGroups.length}{" "}
                  packets
                </p>
              </div>

              <button
                type="button"
                onClick={
                  downloadExcel
                }
                disabled={
                  packedPanels.length ===
                  0
                }
                style={{
                  border:
                    "none",
                  background:
                    packedPanels.length >
                    0
                      ? "#16a34a"
                      : "#9ca3af",
                  color:
                    "#ffffff",
                  borderRadius:
                    "8px",
                  padding:
                    "11px 17px",
                  fontWeight:
                    "700",
                  cursor:
                    packedPanels.length >
                    0
                      ? "pointer"
                      : "not-allowed",
                  whiteSpace:
                    "nowrap",
                }}
              >
                ↓ Export Complete Excel
              </button>
            </div>

            {/* =================================================
                REPORT INFORMATION
            ================================================= */}

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(3, minmax(0, 1fr))",
                gap:
                  "12px",
                marginBottom:
                  "20px",
              }}
            >
              <div
                style={{
                  padding:
                    "14px 16px",
                  border:
                    "1px solid #e5e7eb",
                  borderRadius:
                    "9px",
                  background:
                    "#f8fafc",
                }}
              >
                <div
                  style={{
                    fontSize:
                      "11px",
                    color:
                      "#6b7280",
                    fontWeight:
                      "700",
                    marginBottom:
                      "4px",
                  }}
                >
                  TOTAL PANELS
                </div>

                <strong
                  style={{
                    fontSize:
                      "22px",
                  }}
                >
                  {
                    sitePanels.length
                  }
                </strong>
              </div>

              <div
                style={{
                  padding:
                    "14px 16px",
                  border:
                    "1px solid #bbf7d0",
                  borderRadius:
                    "9px",
                  background:
                    "#f0fdf4",
                }}
              >
                <div
                  style={{
                    fontSize:
                      "11px",
                    color:
                      "#15803d",
                    fontWeight:
                      "700",
                    marginBottom:
                      "4px",
                  }}
                >
                  PACKED PANELS
                </div>

                <strong
                  style={{
                    fontSize:
                      "22px",
                    color:
                      "#15803d",
                  }}
                >
                  {
                    packedPanels.length
                  }
                </strong>
              </div>

              <div
                style={{
                  padding:
                    "14px 16px",
                  border:
                    "1px solid #e5e7eb",
                  borderRadius:
                    "9px",
                  background:
                    "#f8fafc",
                }}
              >
                <div
                  style={{
                    fontSize:
                      "11px",
                    color:
                      "#6b7280",
                    fontWeight:
                      "700",
                    marginBottom:
                      "4px",
                  }}
                >
                  PACKETS
                </div>

                <strong
                  style={{
                    fontSize:
                      "22px",
                  }}
                >
                  {
                    packetGroups.length
                  }
                </strong>
              </div>
            </div>

            {/* =================================================
                NO PACKED PANELS
            ================================================= */}

            {packedPanels.length ===
              0 && (
              <div
                style={{
                  padding:
                    "45px 20px",
                  textAlign:
                    "center",
                  border:
                    "1px dashed #d1d5db",
                  borderRadius:
                    "10px",
                  color:
                    "#6b7280",
                }}
              >
                <div
                  style={{
                    fontSize:
                      "36px",
                    marginBottom:
                      "10px",
                  }}
                >
                  ✓
                </div>

                <strong
                  style={{
                    display:
                      "block",
                    color:
                      "#374151",
                    marginBottom:
                      "5px",
                  }}
                >
                  No packed panels
                </strong>

                <span
                  style={{
                    fontSize:
                      "14px",
                  }}
                >
                  Packed panels will
                  appear here automatically
                  after QR Tracking updates
                  Supabase.
                </span>
              </div>
            )}

            {/* =================================================
                REPORT READY
                Individual packet Excel downloads intentionally
                removed. The complete Excel above contains all
                packed panel data with packet information.
            ================================================= */}

            {packedPanels.length >
              0 && (
              <div
                style={{
                  padding:
                    "18px",
                  border:
                    "1px solid #e5e7eb",
                  borderRadius:
                    "10px",
                  background:
                    "#ffffff",
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap:
                      "10px",
                    marginBottom:
                      "6px",
                  }}
                >
                  <div
                    style={{
                      width:
                        "32px",
                      height:
                        "32px",
                      borderRadius:
                        "8px",
                      background:
                        "#dcfce7",
                      color:
                        "#15803d",
                      display:
                        "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "center",
                      fontWeight:
                        "800",
                    }}
                  >
                    ✓
                  </div>

                  <strong
                    style={{
                      fontSize:
                        "15px",
                      color:
                        "#111827",
                    }}
                  >
                    Complete production report ready
                  </strong>
                </div>

                <p
                  style={{
                    margin:
                      "0 0 0 42px",
                    color:
                      "#64748b",
                    fontSize:
                      "13px",
                  }}
                >
                  The Excel export contains
                  all packed panels for this
                  site, including packet,
                  QR, panel, material and
                  size details.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default Production;