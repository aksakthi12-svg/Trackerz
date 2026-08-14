import { useEffect, useMemo, useState } from "react";

function QRTracking() {
  // =========================================================
  // STORAGE KEYS
  // =========================================================

  const SITES_KEY = "trackerzSites";
  const PANELS_KEY = "trackerzPanels";

  // =========================================================
  // STATE
  // =========================================================

  const [sites, setSites] = useState([]);
  const [panels, setPanels] = useState([]);

  const [selectedSiteId, setSelectedSiteId] = useState("");

  // Top-level view:
  // remaining | packed | packets
  const [activeView, setActiveView] = useState("remaining");

  const [manualQR, setManualQR] = useState("");

  // Automatically created packet currently being packed
  const [openPacket, setOpenPacket] = useState(null);

  // Selected closed packet
  const [selectedPacketId, setSelectedPacketId] = useState(null);

  // Selected panel
  const [selectedPanelId, setSelectedPanelId] = useState(null);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  // =========================================================
  // LOAD DATA
  // =========================================================

  const loadData = () => {
    try {
      const savedSites = JSON.parse(
        localStorage.getItem(SITES_KEY) || "[]"
      );

      const savedPanels = JSON.parse(
        localStorage.getItem(PANELS_KEY) || "[]"
      );

      setSites(Array.isArray(savedSites) ? savedSites : []);
      setPanels(Array.isArray(savedPanels) ? savedPanels : []);
    } catch (error) {
      console.error("Trackerz load error:", error);

      setSites([]);
      setPanels([]);
    }
  };

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
  // SELECT FIRST SITE
  // =========================================================

  useEffect(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(String(sites[0].id));
    }
  }, [sites, selectedSiteId]);

  // =========================================================
  // SELECTED SITE
  // =========================================================

  const selectedSite = useMemo(() => {
    return sites.find(
      (site) =>
        String(site.id) === String(selectedSiteId)
    );
  }, [sites, selectedSiteId]);

  // =========================================================
  // SITE PANELS
  // =========================================================

  const sitePanels = useMemo(() => {
    if (!selectedSite) {
      return [];
    }

    const siteId = String(selectedSite.id || "");

    const siteName = String(
      selectedSite.siteName || ""
    )
      .trim()
      .toLowerCase();

    return panels.filter((panel) => {
      const panelSiteId = String(
        panel.siteId || ""
      );

      const panelSiteName = String(
        panel.siteName || ""
      )
        .trim()
        .toLowerCase();

      return (
        panelSiteId === siteId ||
        (
          panelSiteName &&
          siteName &&
          panelSiteName === siteName
        )
      );
    });
  }, [panels, selectedSite]);

  // =========================================================
  // STATUS
  // =========================================================

  const isPanelPacked = (panel) => {
    const status = String(
      panel.status ||
        panel.productionStatus ||
        panel.packStatus ||
        ""
    )
      .trim()
      .toLowerCase();

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
  // REMAINING / PACKED
  // =========================================================

  const packedPanels = useMemo(() => {
    return sitePanels.filter((panel) =>
      isPanelPacked(panel)
    );
  }, [sitePanels]);

  const remainingPanels = useMemo(() => {
    return sitePanels.filter(
      (panel) => !isPanelPacked(panel)
    );
  }, [sitePanels]);

  // =========================================================
  // PACKET ID
  // =========================================================

  const getPacketId = (panel) => {
    return (
      panel.packetId ||
      panel.packetNumber ||
      panel.packetNo ||
      panel.packet?.id ||
      null
    );
  };

  // =========================================================
  // PACKET NAME
  // =========================================================

  const getPacketName = (packetId, index = 0) => {
    if (!packetId) {
      return `Packet ${String(
        index + 1
      ).padStart(3, "0")}`;
    }

    const value = String(packetId);

    if (
      value.toLowerCase().startsWith("packet")
    ) {
      return value;
    }

    return value;
  };

  // =========================================================
  // CLOSED PACKETS
  // =========================================================

  const packets = useMemo(() => {
    const groups = {};

    packedPanels.forEach((panel) => {
      const packetId = getPacketId(panel);

      if (!packetId) {
        return;
      }

      if (!groups[packetId]) {
        groups[packetId] = [];
      }

      groups[packetId].push(panel);
    });

    return Object.entries(groups).map(
      ([packetId, packetPanels], index) => ({
        id: packetId,
        name: getPacketName(
          packetId,
          index
        ),
        panels: packetPanels,
      })
    );
  }, [packedPanels]);

  // =========================================================
  // PROGRESS
  // =========================================================

  const totalPanels = sitePanels.length;

  const packedCount = packedPanels.length;

  const remainingCount =
    remainingPanels.length;

  const progress =
    totalPanels > 0
      ? Math.min(
          100,
          Math.round(
            (packedCount / totalPanels) * 100
          )
        )
      : 0;

  // =========================================================
  // MESSAGE
  // =========================================================

  const showMessage = (
    text,
    type = "success"
  ) => {
    setMessage(text);
    setMessageType(type);

    window.clearTimeout(
      window.__trackerzMessageTimer
    );

    window.__trackerzMessageTimer =
      window.setTimeout(() => {
        setMessage("");
      }, 3000);
  };

  // =========================================================
  // SAVE PANELS
  // =========================================================

  const savePanels = (updatedPanels) => {
    localStorage.setItem(
      PANELS_KEY,
      JSON.stringify(updatedPanels)
    );

    setPanels(updatedPanels);
  };

  // =========================================================
  // SAVE SITES
  // =========================================================

  const saveSites = (updatedSites) => {
    localStorage.setItem(
      SITES_KEY,
      JSON.stringify(updatedSites)
    );

    setSites(updatedSites);
  };

  // =========================================================
  // PANEL LABEL
  // =========================================================

  const getPanelLabel = (
    panel,
    index = 0
  ) => {
    return (
      panel.qrData ||
      panel.qrCode ||
      panel.panelId ||
      panel.uniqueId ||
      panel.trackerId ||
      panel.id ||
      `Panel ${index + 1}`
    );
  };

  // =========================================================
  // PANEL DESCRIPTION
  // =========================================================

  const getPanelDescription = (panel) => {
    const parts = [];

    if (panel.material) {
      parts.push(panel.material);
    }

    if (panel.length) {
      parts.push(`${panel.length} mm`);
    }

    if (panel.width) {
      parts.push(`${panel.width} mm`);
    }

    if (panel.thickness) {
      parts.push(
        `${panel.thickness} mm`
      );
    }

    if (panel.description) {
      parts.push(panel.description);
    }

    return parts.join(" • ");
  };

  // =========================================================
  // FIND PANEL BY QR
  // =========================================================

  const findPanelByQR = (qrValue) => {
    const value = String(qrValue || "")
      .trim()
      .toLowerCase();

    if (!value) {
      return null;
    }

    return sitePanels.find((panel) => {
      const possibleValues = [
        panel.qrData,
        panel.qrCode,
        panel.qr,
        panel.panelId,
        panel.uniqueId,
        panel.trackerId,
        panel.id,
      ];

      return possibleValues.some(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() === value
      );
    });
  };

  // =========================================================
  // CREATE AUTOMATIC PACKET
  // =========================================================

  const createPacket = () => {
    return `PKT-${String(Date.now()).slice(-8)}`;
  };

  // =========================================================
  // AUTOMATICALLY OPEN PACKET
  // =========================================================

  const ensureOpenPacket = () => {
    if (openPacket) {
      return openPacket;
    }

    if (!selectedSite) {
      return null;
    }

    const packetId = createPacket();

    const newPacket = {
      id: packetId,
      siteId: selectedSite.id,
      siteName: selectedSite.siteName,
      openedAt: new Date().toISOString(),
    };

    setOpenPacket(newPacket);

    return newPacket;
  };

  // =========================================================
  // SCAN PANEL
  // =========================================================

  const handleScanPanel = () => {
    const qrValue = manualQR.trim();

    if (!qrValue) {
      showMessage(
        "Enter or scan a panel QR.",
        "error"
      );

      return;
    }

    if (!selectedSite) {
      showMessage(
        "Please select a site first.",
        "error"
      );

      return;
    }

    const panel = findPanelByQR(qrValue);

    if (!panel) {
      showMessage(
        "Panel not found in the selected site.",
        "error"
      );

      return;
    }

    if (isPanelPacked(panel)) {
      showMessage(
        "This panel is already packed.",
        "error"
      );

      setSelectedPanelId(panel.id);

      return;
    }

    // Automatically create packet
    const packet =
      ensureOpenPacket();

    if (!packet) {
      showMessage(
        "Unable to create packet.",
        "error"
      );

      return;
    }

    const updatedPanels = panels.map(
      (item) => {
        if (
          String(item.id) !==
          String(panel.id)
        ) {
          return item;
        }

        return {
          ...item,

          status: "packed",
          packStatus: "packed",

          packed: true,
          isPacked: true,

          packetId: packet.id,
          packetNumber: packet.id,

          packedAt:
            new Date().toISOString(),

          packedSiteId:
            selectedSite.id,

          packedSiteName:
            selectedSite.siteName,
        };
      }
    );

    savePanels(updatedPanels);

    setManualQR("");

    setActiveView("packed");

    setSelectedPanelId(panel.id);

    showMessage(
      `${getPanelLabel(
        panel
      )} added to ${packet.id}`
    );
  };

  // =========================================================
  // ENTER KEY
  // =========================================================

  const handleQRKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();

      handleScanPanel();
    }
  };

  // =========================================================
  // CLOSE CURRENT PACKET
  // =========================================================

  const handleClosePacket = () => {
    if (!openPacket) {
      return;
    }

    const packetPanels = panels.filter(
      (panel) =>
        String(
          getPacketId(panel)
        ) ===
        String(openPacket.id)
    );

    if (packetPanels.length === 0) {
      showMessage(
        "Cannot close an empty packet.",
        "error"
      );

      return;
    }

    const closedAt =
      new Date().toISOString();

    // Store closed information on panels.
    const updatedPanels = panels.map(
      (panel) => {
        if (
          String(
            getPacketId(panel)
          ) !==
          String(openPacket.id)
        ) {
          return panel;
        }

        return {
          ...panel,

          packetStatus: "closed",
          packetClosed: true,

          packetOpenedAt:
            openPacket.openedAt,

          packetClosedAt:
            closedAt,
        };
      }
    );

    savePanels(updatedPanels);

    setOpenPacket(null);

    setSelectedPacketId(
      openPacket.id
    );

    setActiveView("packets");

    setSelectedPanelId(null);

    showMessage(
      `${openPacket.id} closed successfully.`
    );
  };

  // =========================================================
  // DELETE PANEL FROM CURRENT PACKET
  // =========================================================

  const handleDeletePanel = (
    panel
  ) => {
    if (!panel) {
      return;
    }

    const confirmed =
      window.confirm(
        "Remove this panel from the packet and return it to Remaining?"
      );

    if (!confirmed) {
      return;
    }

    const updatedPanels =
      panels.map((item) => {
        if (
          String(item.id) !==
          String(panel.id)
        ) {
          return item;
        }

        return {
          ...item,

          status: "pending",
          packStatus: "pending",

          packed: false,
          isPacked: false,

          packetId: null,
          packetNumber: null,
          packetNo: null,

          packetStatus: null,
          packetClosed: false,

          packetOpenedAt: null,
          packetClosedAt: null,

          packedAt: null,

          packedSiteId: null,
          packedSiteName: null,
        };
      });

    savePanels(updatedPanels);

    setSelectedPanelId(null);

    setActiveView("remaining");

    showMessage(
      "Panel removed from packet and returned to Remaining."
    );
  };

  // =========================================================
  // DELETE OPEN PACKET
  // =========================================================

  const handleDeleteOpenPacket = () => {
    if (!openPacket) {
      return;
    }

    const confirmed =
      window.confirm(
        "Delete this packet and return all its panels to Remaining?"
      );

    if (!confirmed) {
      return;
    }

    const updatedPanels =
      panels.map((panel) => {
        if (
          String(
            getPacketId(panel)
          ) !==
          String(openPacket.id)
        ) {
          return panel;
        }

        return {
          ...panel,

          status: "pending",
          packStatus: "pending",

          packed: false,
          isPacked: false,

          packetId: null,
          packetNumber: null,
          packetNo: null,

          packetStatus: null,
          packetClosed: false,

          packetOpenedAt: null,
          packetClosedAt: null,

          packedAt: null,

          packedSiteId: null,
          packedSiteName: null,
        };
      });

    savePanels(updatedPanels);

    setOpenPacket(null);
    setSelectedPacketId(null);
    setSelectedPanelId(null);

    setActiveView("remaining");

    showMessage(
      "Packet deleted. All panels returned to Remaining."
    );
  };

  // =========================================================
  // DELETE CLOSED PACKET
  // =========================================================

  const handleDeleteClosedPacket = (
    packet
  ) => {
    if (!packet) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete ${packet.name} and return all ${packet.panels.length} panels to Remaining?`
      );

    if (!confirmed) {
      return;
    }

    const packetId = packet.id;

    const updatedPanels =
      panels.map((panel) => {
        if (
          String(
            getPacketId(panel)
          ) !== String(packetId)
        ) {
          return panel;
        }

        return {
          ...panel,

          status: "pending",
          packStatus: "pending",

          packed: false,
          isPacked: false,

          packetId: null,
          packetNumber: null,
          packetNo: null,

          packetStatus: null,
          packetClosed: false,

          packetOpenedAt: null,
          packetClosedAt: null,

          packedAt: null,

          packedSiteId: null,
          packedSiteName: null,
        };
      });

    savePanels(updatedPanels);

    setSelectedPacketId(null);
    setSelectedPanelId(null);

    setActiveView("remaining");

    showMessage(
      `${packet.name} deleted and panels returned to Remaining.`
    );
  };

  // =========================================================
  // SITE CHANGE
  // =========================================================

  const handleSiteChange = (event) => {
    const newSiteId =
      event.target.value;

    setSelectedSiteId(newSiteId);

    setActiveView("remaining");

    setOpenPacket(null);

    setSelectedPacketId(null);

    setSelectedPanelId(null);

    setManualQR("");

    setMessage("");
  };

  // =========================================================
  // MARK SITE DELIVERED
  // =========================================================

  const handleMarkDelivered = () => {
    if (!selectedSite) {
      return;
    }

    if (remainingCount > 0) {
      showMessage(
        `Cannot mark delivered. ${remainingCount} panels are still remaining.`,
        "error"
      );

      return;
    }

    if (openPacket) {
      showMessage(
        "Please close the current packet first.",
        "error"
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Mark "${selectedSite.siteName}" as Delivered?`
      );

    if (!confirmed) {
      return;
    }

    const updatedSites =
      sites.map((site) => {
        if (
          String(site.id) !==
          String(selectedSite.id)
        ) {
          return site;
        }

        return {
          ...site,

          status: "Delivered",

          delivered: true,
          isDelivered: true,

          deliveredAt:
            new Date().toISOString(),
        };
      });

    saveSites(updatedSites);

    showMessage(
      `${selectedSite.siteName} marked as Delivered.`
    );
  };

  // =========================================================
  // SELECT PANEL
  // =========================================================

  const handleSelectPanel = (panel) => {
    setSelectedPanelId(panel.id);
  };

  // =========================================================
  // SELECT PACKET
  // =========================================================

  const handleSelectPacket = (packet) => {
    setSelectedPacketId(packet.id);

    setSelectedPanelId(null);
  };

  // =========================================================
  // SELECTED PANEL
  // =========================================================

  const selectedPanel = useMemo(() => {
    return sitePanels.find(
      (panel) =>
        String(panel.id) ===
        String(selectedPanelId)
    );
  }, [
    sitePanels,
    selectedPanelId,
  ]);

  // =========================================================
  // SELECTED PACKET
  // =========================================================

  const selectedPacket = useMemo(() => {
    return packets.find(
      (packet) =>
        String(packet.id) ===
        String(selectedPacketId)
    );
  }, [
    packets,
    selectedPacketId,
  ]);

  // =========================================================
  // COMMON BUTTON STYLE
  // =========================================================

  const topButtonStyle = (
    active,
    type = "blue"
  ) => {
    const styles = {
      blue: {
        border: "#2563eb",
        background: "#eff6ff",
      },

      green: {
        border: "#16a34a",
        background: "#f0fdf4",
      },

      purple: {
        border: "#7c3aed",
        background: "#f5f3ff",
      },
    };

    const selected =
      styles[type];

    return {
      flex: "1 1 0",
      minWidth: "0",
      border: active
        ? `1px solid ${selected.border}`
        : "1px solid #e5e7eb",
      background: active
        ? selected.background
        : "#ffffff",
      borderRadius: "10px",
      padding: "11px 12px",
      cursor: "pointer",
      textAlign: "left",
      transition: "all 0.15s ease",
    };
  };

  // =========================================================
  // PANEL CARD
  // =========================================================

  const renderPanelCard = (
    panel,
    index,
    showDelete = false
  ) => {
    const active =
      String(panel.id) ===
      String(selectedPanelId);

    return (
      <div
        key={
          panel.id ||
          `${index}-${getPanelLabel(
            panel,
            index
          )}`
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          border: active
            ? "1px solid #2563eb"
            : "1px solid #e5e7eb",
          background: active
            ? "#eff6ff"
            : "#ffffff",
          borderRadius: "9px",
          padding: "9px 10px",
          minHeight: "50px",
        }}
      >
        <button
          onClick={() =>
            handleSelectPanel(panel)
          }
          style={{
            flex: "1",
            minWidth: "0",
            border: "none",
            background: "transparent",
            padding: "0",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <strong
            style={{
              display: "block",
              fontSize: "13px",
              color: "#111827",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {getPanelLabel(
              panel,
              index
            )}
          </strong>

          <small
            style={{
              display: "block",
              marginTop: "3px",
              color: "#6b7280",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {getPanelDescription(
              panel
            ) || "Panel data"}
          </small>
        </button>

        {showDelete && (
          <button
            onClick={() =>
              handleDeletePanel(panel)
            }
            title="Delete panel"
            style={{
              flexShrink: 0,
              width: "30px",
              height: "30px",
              border:
                "1px solid #fecaca",
              borderRadius: "7px",
              background: "#fff",
              color: "#dc2626",
              cursor: "pointer",
              fontWeight: "700",
            }}
          >
            ×
          </button>
        )}
      </div>
    );
  };

  // =========================================================
  // PANEL LIST
  // =========================================================

  const renderPanelList = (
    list,
    options = {}
  ) => {
    const {
      showDelete = false,
      emptyText = "No panels",
    } = options;

    if (list.length === 0) {
      return (
        <div
          style={{
            height: "100%",
            minHeight: "180px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "#6b7280",
            border:
              "1px dashed #d1d5db",
            borderRadius: "10px",
            padding: "20px",
            boxSizing: "border-box",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "30px",
                marginBottom: "7px",
              }}
            >
              ✓
            </div>

            <strong>
              {emptyText}
            </strong>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "8px",
          overflowY: "auto",
          maxHeight: "100%",
          paddingRight: "3px",
        }}
      >
        {list.map(
          (panel, index) =>
            renderPanelCard(
              panel,
              index,
              showDelete
            )
        )}
      </div>
    );
  };

  // =========================================================
  // PACKET LIST
  // =========================================================

  const renderPacketList = () => {
    if (packets.length === 0) {
      return (
        <div
          style={{
            height: "100%",
            minHeight: "180px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "#6b7280",
            border:
              "1px dashed #d1d5db",
            borderRadius: "10px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "32px",
                marginBottom: "7px",
              }}
            >
              📦
            </div>

            <strong>
              No closed packets yet
            </strong>

            <div
              style={{
                fontSize: "12px",
                marginTop: "5px",
              }}
            >
              Scan panels to automatically
              create a packet.
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "9px",
          overflowY: "auto",
          maxHeight: "100%",
        }}
      >
        {packets.map((packet) => {
          const active =
            String(
              selectedPacketId
            ) === String(packet.id);

          return (
            <button
              key={packet.id}
              onClick={() =>
                handleSelectPacket(
                  packet
                )
              }
              style={{
                border: active
                  ? "1px solid #7c3aed"
                  : "1px solid #e5e7eb",
                background: active
                  ? "#f5f3ff"
                  : "#ffffff",
                borderRadius: "10px",
                padding: "13px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  gap: "10px",
                }}
              >
                <strong>
                  📦{" "}
                  {packet.name}
                </strong>

                <span
                  style={{
                    color: "#7c3aed",
                    fontWeight: "700",
                  }}
                >
                  →
                </span>
              </div>

              <small
                style={{
                  display: "block",
                  marginTop: "6px",
                  color: "#6b7280",
                }}
              >
                {packet.panels.length} panels
              </small>
            </button>
          );
        })}
      </div>
    );
  };

  // =========================================================
  // PANEL DETAIL
  // =========================================================

  const renderPanelDetail = () => {
    if (!selectedPanel) {
      return null;
    }

    const fields = [
      [
        "QR",
        selectedPanel.qrData ||
          selectedPanel.qrCode ||
          "—",
      ],

      [
        "Panel ID",
        selectedPanel.panelId ||
          selectedPanel.id ||
          "—",
      ],

      [
        "Material",
        selectedPanel.material ||
          "—",
      ],

      [
        "Length",
        selectedPanel.length
          ? `${selectedPanel.length} mm`
          : "—",
      ],

      [
        "Width",
        selectedPanel.width
          ? `${selectedPanel.width} mm`
          : "—",
      ],

      [
        "Thickness",
        selectedPanel.thickness
          ? `${selectedPanel.thickness} mm`
          : "—",
      ],

      [
        "Status",
        selectedPanel.status ||
          "—",
      ],

      [
        "Packet",
        getPacketId(
          selectedPanel
        ) || "—",
      ],
    ];

    return (
      <div
        style={{
          border:
            "1px solid #dbeafe",
          background: "#f8fbff",
          borderRadius: "10px",
          padding: "13px",
          marginBottom: "10px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              minWidth: "0",
            }}
          >
            <small
              style={{
                color: "#6b7280",
              }}
            >
              PANEL DETAILS
            </small>

            <strong
              style={{
                display: "block",
                marginTop: "3px",
                overflow: "hidden",
                textOverflow:
                  "ellipsis",
                whiteSpace:
                  "nowrap",
              }}
            >
              {getPanelLabel(
                selectedPanel
              )}
            </strong>
          </div>

          <button
            onClick={() =>
              setSelectedPanelId(null)
            }
            style={{
              border:
                "1px solid #d1d5db",
              background: "#ffffff",
              borderRadius: "7px",
              padding:
                "6px 10px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(4, minmax(0, 1fr))",
            gap: "7px",
          }}
        >
          {fields.map(
            ([label, value]) => (
              <div
                key={label}
                style={{
                  border:
                    "1px solid #e5e7eb",
                  borderRadius: "7px",
                  padding: "8px",
                  background:
                    "#ffffff",
                  minWidth: "0",
                }}
              >
                <small
                  style={{
                    display:
                      "block",
                    color:
                      "#6b7280",
                    fontSize:
                      "10px",
                    marginBottom:
                      "3px",
                  }}
                >
                  {label}
                </small>

                <strong
                  style={{
                    display:
                      "block",
                    fontSize:
                      "12px",
                    overflow:
                      "hidden",
                    textOverflow:
                      "ellipsis",
                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {String(value)}
                </strong>
              </div>
            )
          )}
        </div>

        {openPacket &&
          String(
            getPacketId(
              selectedPanel
            )
          ) ===
            String(openPacket.id) && (
            <button
              onClick={() =>
                handleDeletePanel(
                  selectedPanel
                )
              }
              style={{
                marginTop: "9px",
                border:
                  "1px solid #fecaca",
                background: "#fff",
                color: "#dc2626",
                borderRadius: "7px",
                padding:
                  "7px 12px",
                cursor: "pointer",
                fontWeight: "700",
              }}
            >
              Delete Panel
            </button>
          )}
      </div>
    );
  };

  // =========================================================
  // SELECTED PACKET CONTENT
  // =========================================================

  const renderSelectedPacket = () => {
    if (!selectedPacket) {
      return null;
    }

    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: "0",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          <div>
            <small
              style={{
                color: "#7c3aed",
                fontWeight: "700",
              }}
            >
              CLOSED PACKET
            </small>

            <h3
              style={{
                margin:
                  "2px 0 0",
                fontSize: "18px",
              }}
            >
              📦{" "}
              {selectedPacket.name}
            </h3>
          </div>

          <button
            onClick={() =>
              handleDeleteClosedPacket(
                selectedPacket
              )
            }
            style={{
              border:
                "1px solid #fecaca",
              background: "#fff",
              color: "#dc2626",
              borderRadius: "7px",
              padding:
                "7px 10px",
              cursor: "pointer",
              fontWeight: "700",
            }}
          >
            Delete Packet
          </button>
        </div>

        <div
          style={{
            fontSize: "12px",
            color: "#6b7280",
            marginBottom: "9px",
          }}
        >
          {selectedPacket.panels.length}{" "}
          panels inside packet
        </div>

        <div
          style={{
            flex: "1",
            minHeight: "0",
          }}
        >
          {renderPanelList(
            selectedPacket.panels,
            {
              showDelete: false,
            }
          )}
        </div>

        {selectedPanel &&
          selectedPacket.panels.some(
            (panel) =>
              String(panel.id) ===
              String(
                selectedPanel.id
              )
          ) &&
          renderPanelDetail()}
      </div>
    );
  };

  // =========================================================
  // MAIN WORKSPACE
  // =========================================================

  const renderWorkspace = () => {
    // -------------------------------------------------------
    // PACKET DETAIL
    // -------------------------------------------------------

    if (
      activeView === "packets" &&
      selectedPacket
    ) {
      return renderSelectedPacket();
    }

    // -------------------------------------------------------
    // PANEL DETAIL
    // -------------------------------------------------------

    if (selectedPanel) {
      return (
        <div
          style={{
            height: "100%",
            minHeight: "0",
          }}
        >
          {renderPanelDetail()}

          <div
            style={{
              height: "calc(100% - 175px)",
              minHeight: "0",
            }}
          >
            {activeView ===
              "remaining" &&
              renderPanelList(
                remainingPanels
              )}

            {activeView ===
              "packed" &&
              renderPanelList(
                packedPanels
              )}
          </div>
        </div>
      );
    }

    // -------------------------------------------------------
    // REMAINING
    // -------------------------------------------------------

    if (
      activeView === "remaining"
    ) {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            minHeight: "0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              marginBottom: "9px",
            }}
          >
            <div>
              <strong
                style={{
                  fontSize: "16px",
                }}
              >
                Remaining Panels
              </strong>

              <div
                style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  marginTop: "2px",
                }}
              >
                Panels waiting to be
                packed
              </div>
            </div>

            <span
              style={{
                fontWeight: "700",
                color: "#2563eb",
              }}
            >
              {remainingCount}
            </span>
          </div>

          <div
            style={{
              flex: "1",
              minHeight: "0",
            }}
          >
            {renderPanelList(
              remainingPanels,
              {
                emptyText:
                  "All panels are packed.",
              }
            )}
          </div>
        </div>
      );
    }

    // -------------------------------------------------------
    // PACKED
    // -------------------------------------------------------

    if (
      activeView === "packed"
    ) {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            minHeight: "0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              marginBottom: "9px",
            }}
          >
            <div>
              <strong
                style={{
                  fontSize: "16px",
                }}
              >
                Packed Panels
              </strong>

              <div
                style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  marginTop: "2px",
                }}
              >
                Panels already assigned
                to packets
              </div>
            </div>

            <span
              style={{
                fontWeight: "700",
                color: "#16a34a",
              }}
            >
              {packedCount}
            </span>
          </div>

          <div
            style={{
              flex: "1",
              minHeight: "0",
            }}
          >
            {renderPanelList(
              packedPanels
            )}
          </div>
        </div>
      );
    }

    // -------------------------------------------------------
    // PACKETS
    // -------------------------------------------------------

    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: "0",
        }}
      >
        <div
          style={{
            marginBottom: "9px",
          }}
        >
          <strong
            style={{
              fontSize: "16px",
            }}
          >
            Closed Packets
          </strong>

          <div
            style={{
              fontSize: "11px",
              color: "#6b7280",
              marginTop: "2px",
            }}
          >
            Select a packet to see its
            panels
          </div>
        </div>

        <div
          style={{
            flex: "1",
            minHeight: "0",
          }}
        >
          {renderPacketList()}
        </div>
      </div>
    );
  };

  // =========================================================
  // NO SITES
  // =========================================================

  if (sites.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          padding: "30px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: "650px",
            margin: "0 auto",
            background: "#ffffff",
            border:
              "1px solid #e5e7eb",
            borderRadius: "14px",
            padding: "45px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "40px",
              marginBottom: "10px",
            }}
          >
            ▤
          </div>

          <h2
            style={{
              margin: "0 0 7px",
            }}
          >
            No sites available
          </h2>

          <p
            style={{
              margin: "0",
              color: "#6b7280",
            }}
          >
            Import a cutlist first to
            create a site and generate
            QR panels.
          </p>
        </div>
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
        height: "calc(100vh - 90px)",
        minHeight: "620px",
        boxSizing: "border-box",
        overflow: "hidden",
        padding: "10px",
        background: "#f8fafc",
      }}
    >
      {/* ===================================================
          HEADER
      =================================================== */}

      <div
        style={{
          height: "50px",
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: "15px",
          marginBottom: "10px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "10px",
              fontWeight: "800",
              color: "#2563eb",
              letterSpacing:
                "0.08em",
            }}
          >
            TRACKERZ
          </div>

          <h2
            style={{
              margin: "1px 0 0",
              fontSize: "21px",
              lineHeight: "1",
            }}
          >
            QR Tracking
          </h2>
        </div>

        {/* SITE SELECTOR */}

        <div
          style={{
            width: "310px",
          }}
        >
          <select
            value={
              selectedSiteId
            }
            onChange={
              handleSiteChange
            }
            style={{
              width: "100%",
              height: "40px",
              padding:
                "0 12px",
              border:
                "1px solid #d1d5db",
              borderRadius: "8px",
              background:
                "#ffffff",
              fontWeight: "700",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {sites.map((site) => (
              <option
                key={site.id}
                value={site.id}
              >
                {site.siteName}
                {site.clientName
                  ? ` — ${site.clientName}`
                  : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedSite && (
        <div
          style={{
            height:
              "calc(100% - 60px)",
            display: "flex",
            flexDirection:
              "column",
            minHeight: "0",
          }}
        >
          {/* =================================================
              TOP STATUS NAVIGATION
          ================================================= */}

          <div
            style={{
              display: "flex",
              gap: "8px",
              height: "65px",
              flexShrink: 0,
              marginBottom: "10px",
            }}
          >
            {/* REMAINING */}

            <button
              onClick={() => {
                setActiveView(
                  "remaining"
                );
                setSelectedPacketId(
                  null
                );
                setSelectedPanelId(
                  null
                );
              }}
              style={topButtonStyle(
                activeView ===
                  "remaining",
                "blue"
              )}
            >
              <small
                style={{
                  display: "block",
                  color: "#6b7280",
                  fontWeight: "700",
                  fontSize: "10px",
                }}
              >
                REMAINING
              </small>

              <strong
                style={{
                  display: "block",
                  fontSize: "21px",
                  marginTop: "2px",
                }}
              >
                {remainingCount}
              </strong>
            </button>

            {/* PACKED */}

            <button
              onClick={() => {
                setActiveView(
                  "packed"
                );
                setSelectedPacketId(
                  null
                );
                setSelectedPanelId(
                  null
                );
              }}
              style={topButtonStyle(
                activeView ===
                  "packed",
                "green"
              )}
            >
              <small
                style={{
                  display: "block",
                  color: "#6b7280",
                  fontWeight: "700",
                  fontSize: "10px",
                }}
              >
                PACKED
              </small>

              <strong
                style={{
                  display: "block",
                  fontSize: "21px",
                  marginTop: "2px",
                }}
              >
                {packedCount}
              </strong>
            </button>

            {/* PACKETS */}

            <button
              onClick={() => {
                setActiveView(
                  "packets"
                );
                setSelectedPacketId(
                  null
                );
                setSelectedPanelId(
                  null
                );
              }}
              style={topButtonStyle(
                activeView ===
                  "packets",
                "purple"
              )}
            >
              <small
                style={{
                  display: "block",
                  color: "#6b7280",
                  fontWeight: "700",
                  fontSize: "10px",
                }}
              >
                PACKETS
              </small>

              <strong
                style={{
                  display: "block",
                  fontSize: "21px",
                  marginTop: "2px",
                }}
              >
                {packets.length}
              </strong>
            </button>

            {/* PROGRESS */}

            <div
              style={{
                flex: "1 1 0",
                minWidth: "0",
                border:
                  "1px solid #e5e7eb",
                background:
                  "#ffffff",
                borderRadius: "10px",
                padding:
                  "9px 12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                }}
              >
                <small
                  style={{
                    color:
                      "#6b7280",
                    fontWeight:
                      "700",
                    fontSize:
                      "10px",
                  }}
                >
                  PROGRESS
                </small>

                <strong>
                  {progress}%
                </strong>
              </div>

              <div
                style={{
                  height: "6px",
                  background:
                    "#e5e7eb",
                  borderRadius:
                    "10px",
                  overflow:
                    "hidden",
                  marginTop: "7px",
                }}
              >
                <div
                  style={{
                    width:
                      `${progress}%`,
                    height: "100%",
                    background:
                      "#16a34a",
                    transition:
                      "width 0.2s ease",
                  }}
                />
              </div>
            </div>
          </div>

          {/* =================================================
              SCAN BAR
          ================================================= */}

          <div
            style={{
              height: "54px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                flex: "1",
                display: "flex",
                gap: "7px",
                minWidth: "0",
              }}
            >
              <input
                autoFocus
                value={manualQR}
                onChange={(event) =>
                  setManualQR(
                    event.target
                      .value
                  )
                }
                onKeyDown={
                  handleQRKeyDown
                }
                placeholder="Scan panel QR or type QR data and press Enter..."
                style={{
                  flex: "1",
                  minWidth: "0",
                  height: "42px",
                  boxSizing:
                    "border-box",
                  padding:
                    "0 13px",
                  border:
                    "1px solid #2563eb",
                  borderRadius:
                    "8px",
                  background:
                    "#ffffff",
                  outline:
                    "none",
                  fontSize:
                    "14px",
                }}
              />

              <button
                onClick={
                  handleScanPanel
                }
                style={{
                  height: "42px",
                  padding:
                    "0 20px",
                  border: "none",
                  borderRadius:
                    "8px",
                  background:
                    "#2563eb",
                  color: "#ffffff",
                  fontWeight:
                    "800",
                  cursor:
                    "pointer",
                }}
              >
                Scan
              </button>
            </div>

            {/* CURRENT PACKET */}

            {openPacket ? (
              <div
                style={{
                  display: "flex",
                  alignItems:
                    "center",
                  gap: "6px",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    height: "40px",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    padding:
                      "0 10px",
                    borderRadius:
                      "8px",
                    background:
                      "#fff7ed",
                    color:
                      "#c2410c",
                    fontWeight:
                      "800",
                    fontSize:
                      "12px",
                  }}
                >
                  🟠{" "}
                  {openPacket.id}
                </span>

                <button
                  onClick={
                    handleClosePacket
                  }
                  style={{
                    height: "40px",
                    padding:
                      "0 13px",
                    border:
                      "1px solid #16a34a",
                    borderRadius:
                      "8px",
                    background:
                      "#f0fdf4",
                    color:
                      "#15803d",
                    fontWeight:
                      "800",
                    cursor:
                      "pointer",
                  }}
                >
                  Close
                </button>

                <button
                  onClick={
                    handleDeleteOpenPacket
                  }
                  title="Delete open packet"
                  style={{
                    width: "40px",
                    height: "40px",
                    border:
                      "1px solid #fecaca",
                    borderRadius:
                      "8px",
                    background:
                      "#ffffff",
                    color:
                      "#dc2626",
                    fontWeight:
                      "800",
                    cursor:
                      "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div
                style={{
                  height: "40px",
                  display:
                    "flex",
                  alignItems:
                    "center",
                  padding:
                    "0 11px",
                  border:
                    "1px solid #e5e7eb",
                  borderRadius:
                    "8px",
                  background:
                    "#ffffff",
                  color:
                    "#6b7280",
                  fontSize:
                    "11px",
                  fontWeight:
                    "700",
                  flexShrink: 0,
                }}
              >
                Scan first panel →
                packet opens
                automatically
              </div>
            )}
          </div>

          {/* =================================================
              MESSAGE
          ================================================= */}

          {message && (
            <div
              style={{
                height: "34px",
                flexShrink: 0,
                boxSizing:
                  "border-box",
                display:
                  "flex",
                alignItems:
                  "center",
                padding:
                  "0 10px",
                borderRadius:
                  "7px",
                marginBottom:
                  "8px",
                background:
                  messageType ===
                  "error"
                    ? "#fef2f2"
                    : "#f0fdf4",
                border:
                  messageType ===
                  "error"
                    ? "1px solid #fecaca"
                    : "1px solid #bbf7d0",
                color:
                  messageType ===
                  "error"
                    ? "#b91c1c"
                    : "#166534",
                fontSize:
                  "12px",
                fontWeight:
                  "700",
              }}
            >
              {message}
            </div>
          )}

          {/* =================================================
              MAIN SINGLE WINDOW
          ================================================= */}

          <div
            style={{
              flex: "1",
              minHeight: "0",
              display: "grid",
              gridTemplateColumns:
                "minmax(0, 1fr) 290px",
              gap: "10px",
            }}
          >
            {/* =================================================
                LEFT — DATA
            ================================================= */}

            <div
              style={{
                minWidth: "0",
                minHeight: "0",
                background:
                  "#ffffff",
                border:
                  "1px solid #e5e7eb",
                borderRadius:
                  "12px",
                padding:
                  "13px",
                boxSizing:
                  "border-box",
                overflow:
                  "hidden",
              }}
            >
              {renderWorkspace()}
            </div>

            {/* =================================================
                RIGHT — CURRENT PACKING PANEL
            ================================================= */}

            <div
              style={{
                minWidth: "0",
                background:
                  "#ffffff",
                border:
                  "1px solid #e5e7eb",
                borderRadius:
                  "12px",
                padding:
                  "13px",
                boxSizing:
                  "border-box",
                overflow:
                  "hidden",
                display:
                  "flex",
                flexDirection:
                  "column",
              }}
            >
              {/* SITE */}

              <div
                style={{
                  paddingBottom:
                    "10px",
                  borderBottom:
                    "1px solid #e5e7eb",
                  marginBottom:
                    "10px",
                }}
              >
                <small
                  style={{
                    display:
                      "block",
                    color:
                      "#6b7280",
                    fontSize:
                      "10px",
                    fontWeight:
                      "700",
                  }}
                >
                  SITE
                </small>

                <strong
                  style={{
                    display:
                      "block",
                    marginTop:
                      "3px",
                    overflow:
                      "hidden",
                    textOverflow:
                      "ellipsis",
                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {
                    selectedSite.siteName
                  }
                </strong>

                <small
                  style={{
                    display:
                      "block",
                    marginTop:
                      "2px",
                    color:
                      "#6b7280",
                    overflow:
                      "hidden",
                    textOverflow:
                      "ellipsis",
                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {selectedSite.clientName ||
                    selectedSite.customer ||
                    "Client"}
                </small>
              </div>

              {/* CURRENT PACKET */}

              <div
                style={{
                  padding:
                    "10px",
                  borderRadius:
                    "9px",
                  background:
                    openPacket
                      ? "#fff7ed"
                      : "#f9fafb",
                  border:
                    openPacket
                      ? "1px solid #fed7aa"
                      : "1px solid #e5e7eb",
                  marginBottom:
                    "10px",
                }}
              >
                <small
                  style={{
                    display:
                      "block",
                    color:
                      "#6b7280",
                    fontSize:
                      "10px",
                    fontWeight:
                      "700",
                  }}
                >
                  CURRENT PACKET
                </small>

                <strong
                  style={{
                    display:
                      "block",
                    marginTop:
                      "3px",
                    color:
                      openPacket
                        ? "#c2410c"
                        : "#374151",
                  }}
                >
                  {openPacket
                    ? openPacket.id
                    : "No packet open"}
                </strong>

                {openPacket && (
                  <small
                    style={{
                      display:
                        "block",
                      marginTop:
                        "3px",
                      color:
                        "#6b7280",
                    }}
                  >
                    Scan more panels
                    or close packet
                  </small>
                )}
              </div>

              {/* PROGRESS */}

              <div
                style={{
                  padding:
                    "10px",
                  borderRadius:
                    "9px",
                  background:
                    "#f9fafb",
                  border:
                    "1px solid #e5e7eb",
                  marginBottom:
                    "10px",
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    fontSize:
                      "11px",
                  }}
                >
                  <span>
                    Packing progress
                  </span>

                  <strong>
                    {packedCount}/
                    {totalPanels}
                  </strong>
                </div>

                <div
                  style={{
                    height:
                      "7px",
                    background:
                      "#e5e7eb",
                    borderRadius:
                      "10px",
                    overflow:
                      "hidden",
                    marginTop:
                      "7px",
                  }}
                >
                  <div
                    style={{
                      width:
                        `${progress}%`,
                      height:
                        "100%",
                      background:
                        "#16a34a",
                    }}
                  />
                </div>
              </div>

              {/* DELIVERED */}

              {remainingCount ===
                0 &&
                !openPacket &&
                !(
                  selectedSite
                    .status ===
                    "Delivered"
                ) && (
                  <button
                    onClick={
                      handleMarkDelivered
                    }
                    style={{
                      width:
                        "100%",
                      padding:
                        "10px",
                      border:
                        "none",
                      borderRadius:
                        "8px",
                      background:
                        "#16a34a",
                      color:
                        "#ffffff",
                      fontWeight:
                        "800",
                      cursor:
                        "pointer",
                      marginBottom:
                        "10px",
                    }}
                  >
                    ✓ Mark Site
                    Delivered
                  </button>
                )}

              {selectedSite.status ===
                "Delivered" && (
                <div
                  style={{
                    padding:
                      "10px",
                    borderRadius:
                      "8px",
                    background:
                      "#f0fdf4",
                    border:
                      "1px solid #bbf7d0",
                    color:
                      "#166534",
                    fontWeight:
                      "800",
                    textAlign:
                      "center",
                    marginBottom:
                      "10px",
                  }}
                >
                  ✓ Site Delivered
                </div>
              )}

              {/* SELECTED PANEL */}

              {selectedPanel && (
                <div
                  style={{
                    marginTop:
                      "auto",
                    paddingTop:
                      "10px",
                    borderTop:
                      "1px solid #e5e7eb",
                  }}
                >
                  <small
                    style={{
                      color:
                        "#6b7280",
                      fontSize:
                        "10px",
                      fontWeight:
                        "700",
                    }}
                  >
                    SELECTED PANEL
                  </small>

                  <strong
                    style={{
                      display:
                        "block",
                      marginTop:
                        "4px",
                      fontSize:
                        "12px",
                      overflow:
                        "hidden",
                      textOverflow:
                        "ellipsis",
                      whiteSpace:
                        "nowrap",
                    }}
                  >
                    {getPanelLabel(
                      selectedPanel
                    )}
                  </strong>

                  <small
                    style={{
                      display:
                        "block",
                      marginTop:
                        "3px",
                      color:
                        "#6b7280",
                    }}
                  >
                    {getPanelDescription(
                      selectedPanel
                    ) ||
                      "Panel data"}
                  </small>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QRTracking;