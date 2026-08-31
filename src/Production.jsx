import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function Production() {
  // =========================================================
  // STATE
  // =========================================================

  const [sites, setSites] = useState([]);
  const [panels, setPanels] = useState([]);

  // Packet master records and panel-to-packet relationships.
  // These are read through the same authenticated Supabase client,
  // so existing RLS/company separation remains in force.
  const [packets, setPackets] = useState([]);
  const [packetPanels, setPacketPanels] = useState([]);

  const [selectedSiteId, setSelectedSiteId] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // =========================================================
  // LOAD SITES + PANELS + PACKETS + PACKET/PANEL RELATIONS
  // FROM SUPABASE
  //
  // IMPORTANT:
  // - No database structure changes.
  // - No service-role key.
  // - Uses the existing authenticated Supabase client.
  // - Existing RLS/company separation continues to control
  //   which rows this user can read.
  // =========================================================

  const loadData = async () => {
    try {
      setError("");

      // -----------------------------------------------------
      // LOAD SITES
      // -----------------------------------------------------

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
        console.error(
          "Production - sites error:",
          sitesError
        );

        throw sitesError;
      }

      // -----------------------------------------------------
      // LOAD PANELS
      // -----------------------------------------------------

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
        console.error(
          "Production - panels error:",
          panelsError
        );

        throw panelsError;
      }

      // -----------------------------------------------------
      // LOAD PACKETS
      //
      // Existing packet structure used by QR Tracking:
      // id
      // site_id
      // site_name
      // packet_code
      // packet_qr (if present)
      // status
      // opened_at
      // closed_at
      // -----------------------------------------------------

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
        console.error(
          "Production - packets error:",
          packetsError
        );

        throw packetsError;
      }

      // -----------------------------------------------------
      // LOAD PACKET/PANEL RELATIONSHIPS
      //
      // Existing relationship:
      // packet_panels.packet_id -> packets.id
      // packet_panels.panel_id  -> panels.id
      //
      // QR Tracking creates these rows when a panel is added
      // to a packet. We use the same relationship here rather
      // than expecting a packet_number column on panels.
      // -----------------------------------------------------

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
        console.error(
          "Production - packet_panels error:",
          packetPanelsError
        );

        throw packetPanelsError;
      }

      // -----------------------------------------------------
      // SAFE ARRAYS
      // -----------------------------------------------------

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

      console.log(
        "TRACKERZ PRODUCTION - SUPABASE SITES:",
        safeSites
      );

      console.log(
        "TRACKERZ PRODUCTION - SUPABASE PANELS:",
        safePanels
      );

      console.log(
        "TRACKERZ PRODUCTION - SUPABASE PACKETS:",
        safePackets
      );

      console.log(
        "TRACKERZ PRODUCTION - SUPABASE PACKET/PANEL RELATIONS:",
        safePacketPanels
      );

      setSites(safeSites);
      setPanels(safePanels);
      setPackets(safePackets);
      setPacketPanels(safePacketPanels);

      // -----------------------------------------------------
      // KEEP CURRENT SITE IF IT STILL EXISTS
      // -----------------------------------------------------

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

      // -----------------------------------------------------
      // AUTOMATICALLY SELECT FIRST SITE
      // -----------------------------------------------------

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

  // =========================================================
  // CHECK PACKED STATUS
  // =========================================================

  const isPacked = (panel) => {
    const status = getPanelStatus(
      panel
    );

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

  // =========================================================
  // SITE NAME
  // =========================================================

  const getSiteName = (site) => {
    return (
      site?.site_name ||
      site?.siteName ||
      site?.name ||
      "Unnamed Site"
    );
  };

  // =========================================================
  // CLIENT NAME
  // =========================================================

  const getClientName = (site) => {
    return (
      site?.client_name ||
      site?.clientName ||
      site?.customer ||
      "Client"
    );
  };

  // =========================================================
  // GET SITE ID
  // =========================================================

  const getSiteId = (site) => {
    return String(
      site?.id || ""
    );
  };

  // =========================================================
  // GET PANEL SITE ID
  // =========================================================

  const getPanelSiteId = (panel) => {
    return String(
      panel?.site_id ||
        panel?.siteId ||
        ""
    );
  };

  // =========================================================
  // GET PANEL SITE NAME
  // =========================================================

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

    const siteId = getSiteId(site);

    const siteName = getSiteName(
      site
    )
      .trim()
      .toLowerCase();

    return panels.filter(
      (panel) => {
        const panelSiteId =
          getPanelSiteId(panel);

        const panelSiteName =
          getPanelSiteName(panel);

        // ---------------------------------------------------
        // PRIMARY MATCH = SITE ID
        // ---------------------------------------------------

        if (
          panelSiteId &&
          panelSiteId === siteId
        ) {
          return true;
        }

        // ---------------------------------------------------
        // FALLBACK = SITE NAME
        // ---------------------------------------------------

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
  // GET PACKET NUMBER / CODE FROM A PACKET RECORD
  // =========================================================

  const getPacketNumber = (packet) => {
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
  // GET PACKET RELATION FOR A PANEL
  //
  // IMPORTANT:
  // Do NOT read packet_number from panels.
  //
  // The actual relationship is:
  // panels.id
  //   -> packet_panels.panel_id
  //   -> packet_panels.packet_id
  //   -> packets.id
  // =========================================================

  const getPacketForPanel = (panel) => {
    if (!panel) {
      return null;
    }

    const panelId = panel?.id;

    if (
      panelId === null ||
      panelId === undefined
    ) {
      return null;
    }

    const relations = packetPanels.filter(
      (relation) =>
        String(relation?.panel_id) ===
        String(panelId)
    );

    if (relations.length === 0) {
      return null;
    }

    // In normal Trackerz operation there should be one
    // relationship because removing a panel from a packet
    // removes the packet_panels row. If duplicates ever exist,
    // prefer the latest relationship row.
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
          String(relation?.packet_id)
      ) || null
    );
  };

  // =========================================================
  // GET PACKET DISPLAY VALUE FOR A PANEL
  // =========================================================

  const getPanelPacketNumber = (panel) => {
    const packet =
      getPacketForPanel(panel);

    if (packet) {
      return getPacketNumber(packet);
    }

    // Keep compatibility with any legacy panel-level packet
    // field, but ONLY as a fallback. The current source of
    // truth is packet_panels -> packets.
    return (
      panel?.packet_number ||
      panel?.packetNumber ||
      panel?.packet_no ||
      panel?.packetNo ||
      "Not Assigned"
    );
  };

  // =========================================================
  // GROUP PACKED PANELS BY ACTUAL PACKET
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
  // DOWNLOAD EXCEL
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

    // -------------------------------------------------------
    // HEADER
    // -------------------------------------------------------

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

    // -------------------------------------------------------
    // DATA
    // -------------------------------------------------------

    packetGroups.forEach(
      ({
        packet,
        panels: packetPanels,
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

    // -------------------------------------------------------
    // ESCAPE HTML
    // -------------------------------------------------------

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

    // -------------------------------------------------------
    // CREATE HTML TABLE
    // -------------------------------------------------------

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

    // -------------------------------------------------------
    // DOWNLOAD
    // -------------------------------------------------------

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
  // DOWNLOAD PACKET EXCEL
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
      "Client",
      "Packet",
      "Panel QR",
      "Panel ID",
      "Panel Name",
      "Material",
      "Thickness",
      "Length",
      "Width",
      "Quantity",
      "Status",
    ]);

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

    // -------------------------------------------------------
    // ESCAPE
    // -------------------------------------------------------

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

    // -------------------------------------------------------
    // TABLE
    // -------------------------------------------------------

    let table = `
      <html>
      <head>
        <meta charset="UTF-8" />
      </head>

      <body>
        <table border="1">
    `;

    rows.forEach(
      (
        row,
        index
      ) => {
        table += "<tr>";

        row.forEach(
          (cell) => {
            table +=
              index === 0
                ? `<th>${escapeHtml(
                    cell
                  )}</th>`
                : `<td>${escapeHtml(
                    cell
                  )}</td>`;
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

    // -------------------------------------------------------
    // DOWNLOAD
    // -------------------------------------------------------

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
      ).replace(
        /[^a-z0-9]/gi,
        "_"
      );

    const safePacket =
      String(
        packet
      ).replace(
        /[^a-z0-9]/gi,
        "_"
      );

    link.download =
      `${safeSiteName}_Packet_${safePacket}.xls`;

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
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "30px",
            marginBottom: "10px",
          }}
        >
          ⟳
        </div>

        <strong>
          Loading Production data...
        </strong>

        <p
          style={{
            color: "#6b7280",
            fontSize: "13px",
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
            Export packed panel data by
            site and packet.
          </p>
        </div>
      </header>

      {/* =====================================================
          SUPABASE ERROR
      ===================================================== */}

      {error && (
        <div
          style={{
            marginBottom: "12px",
            padding: "12px 15px",
            background: "#fef2f2",
            border:
              "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: "600",
          }}
        >
          Production data error:{" "}
          {error}
        </div>
      )}

      {/* =====================================================
          MAIN PANEL
      ===================================================== */}

      <section
        className="panel"
        style={{
          width: "100%",
          boxSizing:
            "border-box",
        }}
      >
        {/* ===================================================
            SITE SELECTOR
        =================================================== */}

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
              width: "100%",
              maxWidth:
                "500px",
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

          {/* DATA SOURCE INDICATOR */}

          <div
            style={{
              marginTop:
                "8px",
              fontSize:
                "11px",
              color:
                "#6b7280",
            }}
          >
            ✓ Data source:
            Supabase
            <span
              style={{
                marginLeft:
                  "10px",
              }}
            >
              {sites.length}{" "}
              sites •{" "}
              {panels.length}{" "}
              panels
            </span>
          </div>
        </div>

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
                ? "No sites are currently available in Supabase."
                : "Select a site above to view packed panels and export reports."}
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
                SITE SUMMARY
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
                  "15px",
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
                      "4px 0 0",
                    color:
                      "#6b7280",
                    fontSize:
                      "13px",
                  }}
                >
                  {sitePanels.length}{" "}
                  total panels •{" "}
                  {
                    packedPanels.length
                  }{" "}
                  packed panels •{" "}
                  {
                    packetGroups.length
                  }{" "}
                  packets
                </p>
              </div>

              {/* MAIN EXCEL */}

              <button
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
                    "11px 16px",
                  fontWeight:
                    "700",
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
                  appear here
                  automatically
                  after QR Tracking
                  updates Supabase.
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
                    display:
                      "grid",
                    gridTemplateColumns:
                      "1fr 120px 160px",
                    gap:
                      "15px",
                    padding:
                      "11px 14px",
                    background:
                      "#f3f4f6",
                    borderRadius:
                      "8px",
                    fontSize:
                      "12px",
                    fontWeight:
                      "700",
                    color:
                      "#6b7280",
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
                      key={
                        packet
                      }
                      style={{
                        display:
                          "grid",
                        gridTemplateColumns:
                          "1fr 120px 160px",
                        gap:
                          "15px",
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
                          {
                            packet
                          }
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