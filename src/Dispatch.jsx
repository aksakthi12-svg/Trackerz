import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

/*
=========================================================
TRACKERZ - DISPATCH
=========================================================

WORKFLOW:

Select Site
    ↓
READY FOR DISPATCH
    ↓
Scan Packet QR
    ↓
packets.status = "dispatched"
dispatched_at = current time
    ↓
Packet automatically moves to DISPATCHED

IMPORTANT:
- Does NOT modify QRTracking.jsx
- Uses existing packets table
- Uses existing packet_panels table
- Uses existing panels table
- Uses existing sites table
- Supabase remains the source of truth
=========================================================
*/

function Dispatch() {
  /* ======================================================
     DATA
  ====================================================== */

  const [sites, setSites] = useState([]);
  const [packets, setPackets] = useState([]);
  const [packetPanels, setPacketPanels] = useState([]);
  const [panels, setPanels] = useState([]);

  /* ======================================================
     UI STATE
  ====================================================== */

  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedPacketId, setSelectedPacketId] = useState(null);

  const [scanValue, setScanValue] = useState("");

  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const inputRef = useRef(null);

  /* ======================================================
     LOAD SITES
  ====================================================== */

  async function loadSites() {
    const {
      data,
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

    setSites(
      Array.isArray(data)
        ? data
        : []
    );

    return Array.isArray(data)
      ? data
      : [];
  }

  /* ======================================================
     LOAD PACKETS
  ====================================================== */

  async function loadPackets() {
    const {
      data,
      error: packetsError,
    } = await supabase
      .from("packets")
      .select("*")
      .order("id", {
        ascending: false,
      });

    if (packetsError) {
      throw packetsError;
    }

    setPackets(
      Array.isArray(data)
        ? data
        : []
    );

    return Array.isArray(data)
      ? data
      : [];
  }

  /* ======================================================
     LOAD PACKET/PANEL RELATIONSHIPS
  ====================================================== */

  async function loadPacketPanels() {
    const {
      data,
      error: relationError,
    } = await supabase
      .from("packet_panels")
      .select("*")
      .order("id", {
        ascending: true,
      });

    if (relationError) {
      throw relationError;
    }

    setPacketPanels(
      Array.isArray(data)
        ? data
        : []
    );

    return Array.isArray(data)
      ? data
      : [];
  }

  /* ======================================================
     LOAD PANELS
  ====================================================== */

  async function loadPanels() {
    const {
      data,
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

    setPanels(
      Array.isArray(data)
        ? data
        : []
    );

    return Array.isArray(data)
      ? data
      : [];
  }

  /* ======================================================
     LOAD ALL DISPATCH DATA
  ====================================================== */

  async function loadAllData() {
    try {
      setLoading(true);
      setError("");

      await Promise.all([
        loadSites(),
        loadPackets(),
        loadPacketPanels(),
        loadPanels(),
      ]);
    } catch (err) {
      console.error(
        "Dispatch data loading error:",
        err
      );

      setError(
        err?.message ||
          "Unable to load Dispatch data from Supabase."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ======================================================
     INITIAL LOAD
  ====================================================== */

  useEffect(() => {
    loadAllData();
  }, []);

  /* ======================================================
     KEEP SCANNER READY
  ====================================================== */

  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [loading]);

  /* ======================================================
     REFRESH WHEN WINDOW BECOMES ACTIVE
  ====================================================== */

  useEffect(() => {
    const handleFocus = () => {
      loadAllData();
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

  /* ======================================================
     SITE FILTER
  ====================================================== */

  const filteredPackets = useMemo(() => {
    if (!selectedSiteId) {
      return packets;
    }

    return packets.filter(
      (packet) =>
        String(packet.site_id) ===
        String(selectedSiteId)
    );
  }, [
    packets,
    selectedSiteId,
  ]);

  /* ======================================================
     READY FOR DISPATCH
     
     A packet is ready when:
     - status is closed
     - not dispatched
  ====================================================== */

  const readyPackets = useMemo(() => {
    return filteredPackets.filter(
      (packet) => {
        const status =
          String(
            packet.status || ""
          ).toLowerCase();

        return (
          status === "closed" &&
          !packet.dispatched_at
        );
      }
    );
  }, [filteredPackets]);

  /* ======================================================
     DISPATCHED
  ====================================================== */

  const dispatchedPackets = useMemo(() => {
    return filteredPackets.filter(
      (packet) => {
        const status =
          String(
            packet.status || ""
          ).toLowerCase();

        return (
          status === "dispatched" ||
          Boolean(
            packet.dispatched_at
          )
        );
      }
    );
  }, [filteredPackets]);

  /* ======================================================
     GET PACKET PANEL COUNT
  ====================================================== */

  function getPacketPanelRelations(
    packetId
  ) {
    return packetPanels.filter(
      (relation) =>
        String(
          relation.packet_id
        ) === String(packetId)
    );
  }

  function getPacketPanelCount(
    packetId
  ) {
    return getPacketPanelRelations(
      packetId
    ).length;
  }

  /* ======================================================
     GET PACKET SITE
  ====================================================== */

  function getPacketSite(packet) {
    if (!packet) {
      return null;
    }

    return sites.find(
      (site) =>
        String(site.id) ===
        String(packet.site_id)
    );
  }

  /* ======================================================
     GET PANEL BY ID
  ====================================================== */

  function getPanel(panelId) {
    return panels.find(
      (panel) =>
        String(panel.id) ===
        String(panelId)
    );
  }

  /* ======================================================
     GET PANEL QR
  ====================================================== */

  function getPanelQR(panel) {
    if (!panel) {
      return "";
    }

    return (
      panel.qr_data ||
      panel.qrData ||
      panel.panel_qr ||
      ""
    );
  }

  /* ======================================================
     GET PACKET QR
  ====================================================== */

  function getPacketQR(packet) {
    if (!packet) {
      return "";
    }

    return (
      packet.packet_qr ||
      packet.packet_code ||
      ""
    );
  }

  /* ======================================================
     SELECT PACKET
  ====================================================== */

  function selectPacket(packet) {
    setSelectedPacketId(
      packet
        ? packet.id
        : null
    );

    setError("");
    setMessage("");
  }

  /* ======================================================
     CURRENT SELECTED PACKET
  ====================================================== */

  const selectedPacket = useMemo(() => {
    if (!selectedPacketId) {
      return null;
    }

    return (
      packets.find(
        (packet) =>
          String(packet.id) ===
          String(selectedPacketId)
      ) || null
    );
  }, [
    packets,
    selectedPacketId,
  ]);

  /* ======================================================
     SCAN PACKET QR
  ====================================================== */

  async function handleScan(
    event
  ) {
    if (
      event &&
      event.preventDefault
    ) {
      event.preventDefault();
    }

    const qr =
      scanValue
        .trim();

    if (!qr || scanning) {
      return;
    }

    setError("");
    setMessage("");
    setScanning(true);

    try {
      /*
      -----------------------------------------------------
      FIND PACKET BY PACKET QR
      -----------------------------------------------------
      */

      const {
        data: packet,
        error: findError,
      } = await supabase
        .from("packets")
        .select("*")
        .eq(
          "packet_qr",
          qr
        )
        .maybeSingle();

      if (findError) {
        throw findError;
      }

      if (!packet) {
        throw new Error(
          "Packet QR not found in Supabase."
        );
      }

      /*
      -----------------------------------------------------
      SITE CHECK
      -----------------------------------------------------

      If a particular site is selected,
      don't allow a packet from another site
      to be dispatched here.
      */

      if (
        selectedSiteId &&
        String(
          packet.site_id
        ) !==
          String(
            selectedSiteId
          )
      ) {
        throw new Error(
          "This packet belongs to another site. Select the correct site before dispatching."
        );
      }

      /*
      -----------------------------------------------------
      ALREADY DISPATCHED CHECK
      -----------------------------------------------------
      */

      const currentStatus =
        String(
          packet.status || ""
        ).toLowerCase();

      if (
        currentStatus ===
          "dispatched" ||
        packet.dispatched_at
      ) {
        setSelectedPacketId(
          packet.id
        );

        throw new Error(
          `${getPacketQR(
            packet
          )} is already dispatched.`
        );
      }

      /*
      -----------------------------------------------------
      ONLY CLOSED PACKETS CAN BE DISPATCHED
      -----------------------------------------------------
      */

      if (
        currentStatus !==
        "closed"
      ) {
        throw new Error(
          `${getPacketQR(
            packet
          )} is not ready for dispatch. Packet status is "${packet.status}".`
        );
      }

      /*
      -----------------------------------------------------
      UPDATE PACKET
      -----------------------------------------------------
      */

      const dispatchedAt =
        new Date().toISOString();

      const {
        data: updatedPacket,
        error: updateError,
      } = await supabase
        .from("packets")
        .update({
          status:
            "dispatched",

          dispatched_at:
            dispatchedAt,
        })
        .eq(
          "id",
          packet.id
        )
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      /*
      -----------------------------------------------------
      UPDATE LOCAL DATA
      -----------------------------------------------------
      */

      setPackets(
        (current) =>
          current.map(
            (item) =>
              String(item.id) ===
              String(packet.id)
                ? updatedPacket
                : item
          )
      );

      setSelectedPacketId(
        packet.id
      );

      setMessage(
        `${getPacketQR(
          packet
        )} dispatched successfully.`
      );

      setScanValue("");

      /*
      -----------------------------------------------------
      KEEP SCANNER READY
      -----------------------------------------------------
      */

      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } catch (err) {
      console.error(
        "Dispatch scan error:",
        err
      );

      setError(
        err?.message ||
          "Unable to dispatch packet."
      );
    } finally {
      setScanning(false);
    }
  }

  /* ======================================================
     FORMAT DATE
  ====================================================== */

  function formatDate(
    value
  ) {
    if (!value) {
      return "-";
    }

    try {
      return new Date(
        value
      ).toLocaleString(
        undefined,
        {
          dateStyle:
            "medium",
          timeStyle:
            "short",
        }
      );
    } catch {
      return value;
    }
  }

  /* ======================================================
     PACKET CARD
  ====================================================== */

  function PacketCard({
    packet,
    dispatched = false,
  }) {
    const site =
      getPacketSite(
        packet
      );

    const panelCount =
      getPacketPanelCount(
        packet.id
      );

    const packetQR =
      getPacketQR(
        packet
      );

    const isSelected =
      String(
        selectedPacketId
      ) ===
      String(packet.id);

    return (
      <button
        type="button"
        onClick={() =>
          selectPacket(
            packet
          )
        }
        style={{
          width:
            "100%",
          textAlign:
            "left",
          border:
            isSelected
              ? "2px solid #2563eb"
              : "1px solid #e5e7eb",
          background:
            "#ffffff",
          borderRadius:
            "12px",
          padding:
            "15px",
          marginBottom:
            "10px",
          cursor:
            "pointer",
          boxSizing:
            "border-box",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
            gap:
              "12px",
          }}
        >
          <div>
            <div
              style={{
                fontSize:
                  "16px",
                fontWeight:
                  "700",
                color:
                  "#111827",
              }}
            >
              {packetQR}
            </div>

            <div
              style={{
                marginTop:
                  "5px",
                fontSize:
                  "12px",
                color:
                  "#6b7280",
              }}
            >
              {site?.site_name ||
                packet.site_name ||
                "Unknown site"}
            </div>
          </div>

          <div
            style={{
              textAlign:
                "right",
            }}
          >
            <div
              style={{
                fontWeight:
                  "700",
                color:
                  dispatched
                    ? "#16a34a"
                    : "#2563eb",
              }}
            >
              {panelCount}
            </div>

            <div
              style={{
                fontSize:
                  "11px",
                color:
                  "#6b7280",
              }}
            >
              panels
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop:
              "10px",
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
          }}
        >
          <span
            style={{
              display:
                "inline-block",
              padding:
                "4px 9px",
              borderRadius:
                "999px",
              fontSize:
                "11px",
              fontWeight:
                "700",
              background:
                dispatched
                  ? "#dcfce7"
                  : "#dbeafe",
              color:
                dispatched
                  ? "#15803d"
                  : "#1d4ed8",
            }}
          >
            {dispatched
              ? "DISPATCHED"
              : "READY FOR DISPATCH"}
          </span>

          {dispatched && (
            <span
              style={{
                fontSize:
                  "11px",
                color:
                  "#6b7280",
              }}
            >
              {formatDate(
                packet.dispatched_at
              )}
            </span>
          )}
        </div>
      </button>
    );
  }

  /* ======================================================
     LOADING
  ====================================================== */

  if (loading) {
    return (
      <div
        style={{
          width:
            "100%",
          padding:
            "60px 30px",
          textAlign:
            "center",
        }}
      >
        <div
          style={{
            fontSize:
              "28px",
            marginBottom:
              "10px",
          }}
        >
          ⟳
        </div>

        <strong>
          Loading Dispatch...
        </strong>

        <p
          style={{
            color:
              "#6b7280",
            fontSize:
              "13px",
          }}
        >
          Reading packets from Supabase.
        </p>
      </div>
    );
  }

  /* ======================================================
     SELECTED PACKET PANEL DETAILS
  ====================================================== */

  const selectedRelations =
    selectedPacket
      ? getPacketPanelRelations(
          selectedPacket.id
        )
      : [];

  /* ======================================================
     MAIN UI
  ====================================================== */

  return (
    <div
      style={{
        width:
          "100%",
        boxSizing:
          "border-box",
        padding:
          "28px",
      }}
    >
      {/* ==================================================
          HEADER
      ================================================== */}

      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap:
            "20px",
          marginBottom:
            "22px",
        }}
      >
        <div>
          <div
            style={{
              fontSize:
                "12px",
              fontWeight:
                "800",
              letterSpacing:
                "1.5px",
              color:
                "#2563eb",
              marginBottom:
                "6px",
            }}
          >
            TRACKERZ PRODUCTION
          </div>

          <h1
            style={{
              margin:
                "0",
              fontSize:
                "28px",
              color:
                "#111827",
            }}
          >
            Dispatch
          </h1>

          <p
            style={{
              margin:
                "7px 0 0",
              color:
                "#6b7280",
              fontSize:
                "13px",
            }}
          >
            Scan the packet QR to record
            dispatch automatically.
          </p>
        </div>

        <button
          type="button"
          onClick={
            loadAllData
          }
          style={{
            padding:
              "9px 15px",
            border:
              "1px solid #9ca3af",
            background:
              "#ffffff",
            borderRadius:
              "7px",
            cursor:
              "pointer",
            fontWeight:
              "600",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* ==================================================
          SITE SELECTOR
      ================================================== */}

      <div
        style={{
          background:
            "#ffffff",
          border:
            "1px solid #e5e7eb",
          borderRadius:
            "12px",
          padding:
            "18px",
          marginBottom:
            "18px",
        }}
      >
        <label
          style={{
            display:
              "block",
            fontSize:
              "12px",
            fontWeight:
              "700",
            color:
              "#374151",
            marginBottom:
              "7px",
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
          ) => {
            setSelectedSiteId(
              event.target
                .value
            );

            setSelectedPacketId(
              null
            );

            setError("");
            setMessage("");
          }}
          style={{
            width:
              "100%",
            maxWidth:
              "500px",
            padding:
              "12px",
            border:
              "1px solid #d1d5db",
            borderRadius:
              "8px",
            background:
              "#ffffff",
            fontSize:
              "14px",
          }}
        >
          <option value="">
            All Sites
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
                {site.site_name ||
                  `Site ${site.id}`}
                {site.client_name
                  ? ` — ${site.client_name}`
                  : ""}
              </option>
            )
          )}
        </select>
      </div>

      {/* ==================================================
          MESSAGE
      ================================================== */}

      {message && (
        <div
          style={{
            background:
              "#ecfdf5",
            border:
              "1px solid #86efac",
            color:
              "#166534",
            borderRadius:
              "8px",
            padding:
              "11px 14px",
            marginBottom:
              "12px",
            fontSize:
              "13px",
            fontWeight:
              "600",
          }}
        >
          ✓ {message}
        </div>
      )}

      {error && (
        <div
          style={{
            background:
              "#fef2f2",
            border:
              "1px solid #fca5a5",
            color:
              "#b91c1c",
            borderRadius:
              "8px",
            padding:
              "11px 14px",
            marginBottom:
              "12px",
            fontSize:
              "13px",
            fontWeight:
              "600",
          }}
        >
          {error}
        </div>
      )}

      {/* ==================================================
          PACKET QR SCANNER
      ================================================== */}

      <div
        style={{
          background:
            "#ffffff",
          border:
            "1px solid #e5e7eb",
          borderRadius:
            "12px",
          padding:
            "18px",
          marginBottom:
            "18px",
        }}
      >
        <div
          style={{
            fontSize:
              "15px",
            fontWeight:
              "700",
            color:
              "#111827",
            marginBottom:
              "9px",
          }}
        >
          Scan Packet QR
        </div>

        <form
          onSubmit={
            handleScan
          }
          style={{
            display:
              "flex",
            gap:
              "10px",
          }}
        >
          <input
            ref={
              inputRef
            }
            value={
              scanValue
            }
            onChange={(
              event
            ) =>
              setScanValue(
                event.target
                  .value
              )
            }
            placeholder="Scan packet QR here..."
            autoComplete="off"
            style={{
              flex:
                "1",
              minWidth:
                "0",
              padding:
                "13px",
                border:
                "1px solid #2563eb",
              borderRadius:
                "8px",
              outline:
                "none",
              fontSize:
                "14px",
            }}
          />

          <button
            type="submit"
            disabled={
              scanning
            }
            style={{
              padding:
                "0 24px",
              border:
                "none",
              borderRadius:
                "8px",
              background:
                scanning
                  ? "#93c5fd"
                  : "#2563eb",
              color:
                "#ffffff",
              fontWeight:
                "700",
              cursor:
                scanning
                  ? "default"
                  : "pointer",
            }}
          >
            {scanning
              ? "Processing..."
              : "Scan"}
          </button>
        </form>

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
          Scan the packet QR. A closed packet
          will automatically move to Dispatched.
        </div>
      </div>

      {/* ==================================================
          PACKET LISTS
      ================================================== */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap:
            "18px",
          alignItems:
            "start",
        }}
      >
        {/* ================================================
            READY FOR DISPATCH
        ================================================= */}

        <div
          style={{
            background:
              "#ffffff",
            border:
              "1px solid #e5e7eb",
            borderRadius:
              "12px",
            padding:
              "18px",
            minHeight:
              "300px",
          }}
        >
          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              marginBottom:
                "14px",
            }}
          >
            <div>
              <h2
                style={{
                  margin:
                    "0",
                  fontSize:
                    "18px",
                  color:
                    "#111827",
                }}
              >
                Ready for Dispatch
              </h2>

              <div
                style={{
                  marginTop:
                    "4px",
                  fontSize:
                    "12px",
                  color:
                    "#6b7280",
                }}
              >
                Closed packets waiting to leave
                the factory
              </div>
            </div>

            <div
              style={{
                fontSize:
                  "22px",
                fontWeight:
                  "800",
                color:
                  "#2563eb",
              }}
            >
              {
                readyPackets.length
              }
            </div>
          </div>

          {readyPackets.length ===
          0 ? (
            <div
              style={{
                padding:
                  "35px 15px",
                textAlign:
                  "center",
                color:
                  "#9ca3af",
                fontSize:
                  "13px",
                border:
                  "1px dashed #d1d5db",
                borderRadius:
                  "9px",
              }}
            >
              No packets ready for dispatch.
            </div>
          ) : (
            <div
              style={{
                maxHeight:
                  "500px",
                overflowY:
                  "auto",
                paddingRight:
                  "3px",
              }}
            >
              {readyPackets.map(
                (packet) => (
                  <PacketCard
                    key={
                      packet.id
                    }
                    packet={
                      packet
                    }
                  />
                )
              )}
            </div>
          )}
        </div>

        {/* ================================================
            DISPATCHED
        ================================================= */}

        <div
          style={{
            background:
              "#ffffff",
            border:
              "1px solid #e5e7eb",
            borderRadius:
              "12px",
            padding:
              "18px",
            minHeight:
              "300px",
          }}
        >
          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              marginBottom:
                "14px",
            }}
          >
            <div>
              <h2
                style={{
                  margin:
                    "0",
                  fontSize:
                  "18px",
                  color:
                    "#111827",
                }}
              >
                Dispatched
              </h2>

              <div
                style={{
                  marginTop:
                    "4px",
                  fontSize:
                    "12px",
                  color:
                    "#6b7280",
                }}
              >
                Packets already dispatched
              </div>
            </div>

            <div
              style={{
                fontSize:
                  "22px",
                fontWeight:
                  "800",
                color:
                  "#16a34a",
              }}
            >
              {
                dispatchedPackets.length
              }
            </div>
          </div>

          {dispatchedPackets.length ===
          0 ? (
            <div
              style={{
                padding:
                  "35px 15px",
                textAlign:
                  "center",
                color:
                  "#9ca3af",
                fontSize:
                  "13px",
                border:
                  "1px dashed #d1d5db",
                borderRadius:
                  "9px",
              }}
            >
              No packets dispatched yet.
            </div>
          ) : (
            <div
              style={{
                maxHeight:
                  "500px",
                overflowY:
                  "auto",
                paddingRight:
                  "3px",
              }}
            >
              {dispatchedPackets.map(
                (packet) => (
                  <PacketCard
                    key={
                      packet.id
                    }
                    packet={
                      packet
                    }
                    dispatched
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* ==================================================
          SELECTED PACKET DETAILS
      ================================================== */}

      {selectedPacket && (
        <div
          style={{
            marginTop:
              "18px",
            background:
              "#ffffff",
            border:
              "1px solid #e5e7eb",
            borderRadius:
              "12px",
            padding:
              "20px",
          }}
        >
          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "flex-start",
              gap:
                "20px",
              marginBottom:
                "15px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize:
                    "11px",
                  fontWeight:
                    "700",
                  color:
                    "#6b7280",
                  marginBottom:
                    "5px",
                }}
              >
                PACKET DETAILS
              </div>

              <h2
                style={{
                  margin:
                    "0",
                  fontSize:
                    "21px",
                  color:
                    "#111827",
                }}
              >
                {getPacketQR(
                  selectedPacket
                )}
              </h2>

              <div
                style={{
                  marginTop:
                    "6px",
                  fontSize:
                    "13px",
                  color:
                    "#6b7280",
                }}
              >
                {
                  getPacketSite(
                    selectedPacket
                  )?.site_name ||
                  selectedPacket.site_name ||
                  "Unknown site"
                }
              </div>
            </div>

            <div
              style={{
                textAlign:
                  "right",
              }}
            >
              <div
                style={{
                  fontWeight:
                    "700",
                  color:
                    String(
                      selectedPacket.status ||
                        ""
                    ).toLowerCase() ===
                    "dispatched"
                      ? "#16a34a"
                      : "#2563eb",
                }}
              >
                {String(
                  selectedPacket.status ||
                    ""
                ).toUpperCase()}
              </div>

              {selectedPacket.dispatched_at && (
                <div
                  style={{
                    marginTop:
                      "5px",
                    fontSize:
                      "11px",
                    color:
                      "#6b7280",
                  }}
                >
                  {formatDate(
                    selectedPacket.dispatched_at
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              borderTop:
                "1px solid #e5e7eb",
              paddingTop:
                "15px",
            }}
          >
            <div
              style={{
                fontWeight:
                  "700",
                marginBottom:
                  "10px",
                color:
                  "#111827",
              }}
            >
              Panels inside packet (
              {
                selectedRelations.length
              }
              )
            </div>

            {selectedRelations.length ===
            0 ? (
              <div
                style={{
                  color:
                    "#9ca3af",
                  fontSize:
                    "13px",
                }}
              >
                No panel relationships found.
              </div>
            ) : (
              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(220px, 1fr))",
                  gap:
                    "8px",
                }}
              >
                {selectedRelations.map(
                  (
                    relation,
                    index
                  ) => {
                    const panel =
                      getPanel(
                        relation.panel_id
                      );

                    const panelQR =
                      relation.qr_data ||
                      getPanelQR(
                        panel
                      ) ||
                      `Panel ${index + 1}`;

                    return (
                      <div
                        key={
                          relation.id ||
                          `${selectedPacket.id}-${relation.panel_id}-${index}`
                        }
                        style={{
                          border:
                            "1px solid #e5e7eb",
                          borderRadius:
                            "8px",
                          padding:
                            "10px",
                          background:
                            "#f9fafb",
                        }}
                      >
                        <div
                          style={{
                            fontWeight:
                              "700",
                            fontSize:
                              "13px",
                            color:
                              "#111827",
                          }}
                        >
                          {panelQR}
                        </div>

                        {panel && (
                          <div
                            style={{
                              marginTop:
                                "4px",
                              fontSize:
                                "11px",
                              color:
                                "#6b7280",
                            }}
                          >
                            {panel.length ||
                              "-"}{" "}
                            ×{" "}
                            {panel.width ||
                              "-"}{" "}
                            ×{" "}
                            {panel.thickness ||
                              "-"}{" "}
                            mm
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Dispatch;