import { useEffect, useMemo, useState } from "react";

function Production() {
  const [sites, setSites] = useState([]);
  const [panels, setPanels] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");

  // =========================================================
  // LOAD TRACKERZ DATA
  // =========================================================

  const loadData = () => {
    try {
      const savedSites = JSON.parse(
        localStorage.getItem("trackerzSites") || "[]"
      );

      const savedPanels = JSON.parse(
        localStorage.getItem("trackerzPanels") || "[]"
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
        "Unable to load Trackerz production data:",
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
  // REFRESH WHEN WINDOW GETS FOCUS
  // =========================================================

  useEffect(() => {
    const refresh = () => {
      loadData();
    };

    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // =========================================================
  // HELPERS
  // =========================================================

  const getPanelStatus = (panel) => {
    return String(
      panel?.status ||
        panel?.productionStatus ||
        panel?.packStatus ||
        ""
    )
      .trim()
      .toLowerCase();
  };

  const isPacked = (panel) => {
    const status = getPanelStatus(panel);

    return (
      status === "packed" ||
      status === "packing" ||
      status === "completed" ||
      status === "delivered" ||
      panel?.packed === true ||
      panel?.isPacked === true
    );
  };

  const getSiteId = (site) => {
    return String(site?.id || "");
  };

  const getSiteName = (site) => {
    return (
      site?.siteName ||
      site?.name ||
      "Unnamed Site"
    );
  };

  // =========================================================
  // GET PANELS BELONGING TO SITE
  // =========================================================

  const getSitePanels = (site) => {
    if (!site) {
      return [];
    }

    const siteId = String(site.id || "");

    const siteName = String(
      site.siteName || site.name || ""
    )
      .trim()
      .toLowerCase();

    return panels.filter((panel) => {
      const panelSiteId = String(
        panel?.siteId || ""
      );

      const panelSiteName = String(
        panel?.siteName || ""
      )
        .trim()
        .toLowerCase();

      return (
        panelSiteId === siteId ||
        (
          siteName !== "" &&
          panelSiteName !== "" &&
          siteName === panelSiteName
        )
      );
    });
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
  }, [sites, selectedSiteId]);

  // =========================================================
  // PACKED PANELS
  // =========================================================

  const packedPanels = useMemo(() => {
    if (!selectedSite) {
      return [];
    }

    return getSitePanels(selectedSite).filter(
      (panel) => isPacked(panel)
    );
  }, [selectedSite, panels]);

  // =========================================================
  // GET PACKET NUMBER
  // =========================================================

  const getPacketNumber = (panel) => {
    return (
      panel?.packetNumber ||
      panel?.packetNo ||
      panel?.packet ||
      panel?.packNo ||
      panel?.packetId ||
      panel?.boxNumber ||
      panel?.boxNo ||
      "Not Assigned"
    );
  };

  // =========================================================
  // GROUP PANELS BY PACKET
  // =========================================================

  const packetGroups = useMemo(() => {
    const groups = {};

    packedPanels.forEach((panel) => {
      const packet = String(
        getPacketNumber(panel)
      );

      if (!groups[packet]) {
        groups[packet] = [];
      }

      groups[packet].push(panel);
    });

    return Object.entries(groups)
      .sort(([a], [b]) =>
        a.localeCompare(b, undefined, {
          numeric: true,
        })
      )
      .map(([packet, packetPanels]) => ({
        packet,
        panels: packetPanels,
      }));
  }, [packedPanels]);

  // =========================================================
  // SAFE VALUE
  // =========================================================

  const value = (item, keys) => {
    for (const key of keys) {
      if (
        item?.[key] !== undefined &&
        item?.[key] !== null &&
        item?.[key] !== ""
      ) {
        return item[key];
      }
    }

    return "";
  };

  // =========================================================
  // DOWNLOAD EXCEL
  // =========================================================

  const downloadExcel = () => {
    if (!selectedSite) {
      alert("Please select a site first.");
      return;
    }

    if (packedPanels.length === 0) {
      alert(
        "No packed panels found for this site."
      );
      return;
    }

    const rows = [];

    // -------------------------------------------------------
    // EXCEL HEADER
    // -------------------------------------------------------

    rows.push([
      "Site",
      "Packet",
      "Panel QR",
      "Panel ID",
      "Room",
      "Unit",
      "Description",
      "Material",
      "Thickness",
      "Length",
      "Width",
      "Quantity",
      "Status",
    ]);

    // -------------------------------------------------------
    // DATA
    // -------------------------------------------------------

    packetGroups.forEach(
      ({ packet, panels: packetPanels }) => {
        packetPanels.forEach((panel) => {
          rows.push([
            getSiteName(selectedSite),

            packet,

            value(panel, [
              "qr",
              "qrCode",
              "qrData",
              "panelQR",
              "panelQr",
              "code",
            ]),

            value(panel, [
              "panelId",
              "id",
              "itemId",
              "cutlistId",
            ]),

            value(panel, [
              "room",
              "roomName",
            ]),

            value(panel, [
              "unit",
              "unitName",
              "cabinet",
            ]),

            value(panel, [
              "description",
              "panelName",
              "name",
              "partName",
            ]),

            value(panel, [
              "material",
              "materialName",
            ]),

            value(panel, [
              "thickness",
              "thicknessMm",
              "thicknessMM",
            ]),

            value(panel, [
              "length",
              "lengthMm",
              "lengthMM",
            ]),

            value(panel, [
              "width",
              "widthMm",
              "widthMM",
            ]),

            value(panel, [
              "quantity",
              "qty",
            ]) || 1,

            getPanelStatus(panel) ||
              "Packed",
          ]);
        });
      }
    );

    // -------------------------------------------------------
    // CREATE EXCEL-COMPATIBLE HTML
    // -------------------------------------------------------

    const escapeHtml = (text) => {
      return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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

    rows.forEach((row, rowIndex) => {
      table += "<tr>";

      row.forEach((cell) => {
        if (rowIndex === 0) {
          table += `<th>${escapeHtml(
            cell
          )}</th>`;
        } else {
          table += `<td>${escapeHtml(
            cell
          )}</td>`;
        }
      });

      table += "</tr>";
    });

    table += `
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(
      [table],
      {
        type: "application/vnd.ms-excel",
      }
    );

    const url =
      window.URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    const safeSiteName =
      getSiteName(selectedSite)
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

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  };

  // =========================================================
  // DOWNLOAD PACKET REPORT
  // =========================================================

  const downloadPacketExcel = (
    packet,
    packetPanels
  ) => {
    if (!selectedSite) {
      return;
    }

    const rows = [];

    rows.push([
      "Site",
      "Packet",
      "Panel QR",
      "Panel ID",
      "Description",
      "Material",
      "Thickness",
      "Length",
      "Width",
      "Quantity",
      "Status",
    ]);

    packetPanels.forEach((panel) => {
      rows.push([
        getSiteName(selectedSite),
        packet,

        value(panel, [
          "qr",
          "qrCode",
          "qrData",
          "panelQR",
          "panelQr",
          "code",
        ]),

        value(panel, [
          "panelId",
          "id",
          "itemId",
          "cutlistId",
        ]),

        value(panel, [
          "description",
          "panelName",
          "name",
          "partName",
        ]),

        value(panel, [
          "material",
          "materialName",
        ]),

        value(panel, [
          "thickness",
          "thicknessMm",
          "thicknessMM",
        ]),

        value(panel, [
          "length",
          "lengthMm",
          "lengthMM",
        ]),

        value(panel, [
          "width",
          "widthMm",
          "widthMM",
        ]),

        value(panel, [
          "quantity",
          "qty",
        ]) || 1,

        getPanelStatus(panel) ||
          "Packed",
      ]);
    });

    const escapeHtml = (text) => {
      return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    let table = `
      <html>
      <head>
        <meta charset="UTF-8" />
      </head>
      <body>
        <table border="1">
    `;

    rows.forEach((row, index) => {
      table += "<tr>";

      row.forEach((cell) => {
        table +=
          index === 0
            ? `<th>${escapeHtml(
                cell
              )}</th>`
            : `<td>${escapeHtml(
                cell
              )}</td>`;
      });

      table += "</tr>";
    });

    table += `
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(
      [table],
      {
        type: "application/vnd.ms-excel",
      }
    );

    const url =
      window.URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    const safeSiteName =
      getSiteName(selectedSite)
        .replace(
          /[^a-z0-9]/gi,
          "_"
        );

    const safePacket =
      String(packet)
        .replace(
          /[^a-z0-9]/gi,
          "_"
        );

    link.download =
      `${safeSiteName}_Packet_${safePacket}.xls`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  };

  // =========================================================
  // UI
  // =========================================================

  return (
    <div
      style={{
        width: "100%",
      }}
    >
      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="topbar">
        <div>
          <p className="eyebrow">
            TRACKERZ PRODUCTION
          </p>

          <h2>
            Production Reports
          </h2>

          <p className="subtitle">
            Export packed panel data by site
            and packet.
          </p>
        </div>
      </header>

      {/* =====================================================
          MAIN REPORT PANEL
      ===================================================== */}

      <section
        className="panel"
        style={{
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* SITE SELECTOR */}

        <div
          style={{
            padding: "22px",
            borderBottom:
              "1px solid #e5e7eb",
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: "700",
              color: "#374151",
              marginBottom: "8px",
            }}
          >
            SELECT SITE
          </label>

          <select
            value={selectedSiteId}
            onChange={(event) =>
              setSelectedSiteId(
                event.target.value
              )
            }
            style={{
              width: "100%",
              maxWidth: "500px",
              padding: "11px 13px",
              border:
                "1px solid #d1d5db",
              borderRadius: "8px",
              background: "#ffffff",
              fontSize: "14px",
              outline: "none",
            }}
          >
            <option value="">
              Select a site
            </option>

            {sites.map((site) => (
              <option
                key={site.id}
                value={site.id}
              >
                {getSiteName(site)}
                {site.clientName
                  ? ` — ${site.clientName}`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        {/* ===================================================
            NO SITE SELECTED
        =================================================== */}

        {!selectedSite && (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              color: "#6b7280",
            }}
          >
            <div
              style={{
                fontSize: "40px",
                marginBottom: "12px",
              }}
            >
              ▥
            </div>

            <h3
              style={{
                margin:
                  "0 0 8px",
                color: "#374151",
              }}
            >
              Select a site
            </h3>

            <p
              style={{
                margin: 0,
              }}
            >
              Select a site above to view
              packed panels and export reports.
            </p>
          </div>
        )}

        {/* ===================================================
            SITE SELECTED
        =================================================== */}

        {selectedSite && (
          <div
            style={{
              padding: "22px",
            }}
          >
            {/* SITE SUMMARY */}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: "15px",
                flexWrap: "wrap",
                marginBottom: "22px",
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
                    color: "#6b7280",
                    fontSize: "14px",
                  }}
                >
                  {packedPanels.length} packed
                  panels in{" "}
                  {packetGroups.length} packets
                </p>
              </div>

              {/* MAIN EXCEL BUTTON */}

              <button
                onClick={
                  downloadExcel
                }
                disabled={
                  packedPanels.length ===
                  0
                }
                style={{
                  border: "none",
                  background:
                    packedPanels.length >
                    0
                      ? "#16a34a"
                      : "#9ca3af",
                  color: "#ffffff",
                  borderRadius: "8px",
                  padding:
                    "11px 16px",
                  fontWeight: "700",
                  cursor:
                    packedPanels.length >
                    0
                      ? "pointer"
                      : "not-allowed",
                }}
              >
                ↓ Export Excel
              </button>
            </div>

            {/* =================================================
                NO PACKED PANELS
            ================================================= */}

            {packedPanels.length ===
              0 && (
              <div
                style={{
                  padding: "45px 20px",
                  textAlign: "center",
                  border:
                    "1px dashed #d1d5db",
                  borderRadius: "10px",
                  color: "#6b7280",
                }}
              >
                <div
                  style={{
                    fontSize: "36px",
                    marginBottom: "10px",
                  }}
                >
                  ✓
                </div>

                <strong
                  style={{
                    display: "block",
                    color: "#374151",
                    marginBottom: "5px",
                  }}
                >
                  No packed panels
                </strong>

                <span
                  style={{
                    fontSize: "14px",
                  }}
                >
                  Packed panels will appear
                  here automatically after QR
                  tracking.
                </span>
              </div>
            )}

            {/* =================================================
                PACKET LIST
            ================================================= */}

            {packetGroups.length >
              0 && (
              <div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1fr 120px 160px",
                    gap: "15px",
                    padding:
                      "11px 14px",
                    background:
                      "#f3f4f6",
                    borderRadius:
                      "8px",
                    fontSize: "12px",
                    fontWeight: "700",
                    color: "#6b7280",
                  }}
                >
                  <span>
                    PACKET
                  </span>

                  <span>
                    PANELS
                  </span>

                  <span>
                    REPORT
                  </span>
                </div>

                {packetGroups.map(
                  ({
                    packet,
                    panels:
                      packetPanels,
                  }) => (
                    <div
                      key={packet}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "1fr 120px 160px",
                        gap: "15px",
                        alignItems:
                          "center",
                        padding:
                          "15px 14px",
                        borderBottom:
                          "1px solid #e5e7eb",
                      }}
                    >
                      <div>
                        <strong>
                          Packet{" "}
                          {packet}
                        </strong>
                      </div>

                      <div>
                        <strong>
                          {
                            packetPanels.length
                          }
                        </strong>
                        <span
                          style={{
                            color:
                              "#6b7280",
                            marginLeft:
                              "4px",
                          }}
                        >
                          panels
                        </span>
                      </div>

                      <div>
                        <button
                          onClick={() =>
                            downloadPacketExcel(
                              packet,
                              packetPanels
                            )
                          }
                          style={{
                            border:
                              "1px solid #2563eb",
                            background:
                              "#ffffff",
                            color:
                              "#2563eb",
                            borderRadius:
                              "7px",
                            padding:
                              "7px 11px",
                            fontWeight:
                              "600",
                            cursor:
                              "pointer",
                          }}
                        >
                          ↓ Excel
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default Production;