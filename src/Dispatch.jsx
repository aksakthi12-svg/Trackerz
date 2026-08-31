import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

/*
=========================================================
TRACKERZ - DISPATCH
=========================================================

WORKFLOW

LOGIN
  ↓
COMPANY
  ↓
SELECT ONE SITE
  ↓
READY FOR DISPATCH
  ↓
SCAN PACKET QR
  ↓
PACKET STATUS = DISPATCHED
  ↓
DISPATCHED

IMPORTANT

1. No "All Sites" option.
2. No packets are shown until a site is selected.
3. Only ONE site is active at a time.
4. Only packets belonging to the selected site appear.
5. The selected site must belong to the logged-in user's
   company.
6. Scanner rejects packets from another site.
7. Supabase remains the source of truth.
8. Existing packet/panel workflow is preserved.
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
     COMPANY
  ====================================================== */

  const [companyId, setCompanyId] = useState(null);
  const [companyName, setCompanyName] = useState("");

  /* ======================================================
     SITE
  ====================================================== */

  const [selectedSiteId, setSelectedSiteId] =
    useState("");

  /* ======================================================
     PACKET
  ====================================================== */

  const [selectedPacketId, setSelectedPacketId] =
    useState(null);

  /* ======================================================
     SCANNER
  ====================================================== */

  const [scanValue, setScanValue] = useState("");
  const [scanning, setScanning] = useState(false);

  const inputRef = useRef(null);

  /* ======================================================
     UI
  ====================================================== */

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  /* ======================================================
     CURRENT USER
  ====================================================== */

  async function getCurrentUser() {
    const {
      data,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      throw authError;
    }

    if (!data?.user) {
      throw new Error(
        "No authenticated user found. Please sign in again."
      );
    }

    return data.user;
  }

  /* ======================================================
     LOAD COMPANY
  ====================================================== */

  async function loadUserCompany() {
    const user = await getCurrentUser();

    const {
      data: membership,
      error: membershipError,
    } = await supabase
      .from("company_users")
      .select(`
        company_id,
        companies (
          id,
          company_name
        )
      `)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    if (!membership?.company_id) {
      throw new Error(
        "Your user account is not assigned to a company."
      );
    }

    const currentCompanyId =
      membership.company_id;

    const currentCompanyName =
      membership.companies?.company_name ||
      "";

    setCompanyId(currentCompanyId);
    setCompanyName(currentCompanyName);

    return {
      companyId: currentCompanyId,
      companyName: currentCompanyName,
    };
  }

  /* ======================================================
     LOAD COMPANY SITES
  ====================================================== */

  async function loadSites(currentCompanyId) {
    if (!currentCompanyId) {
      setSites([]);
      return [];
    }

    const {
      data,
      error: sitesError,
    } = await supabase
      .from("sites")
      .select("*")
      .eq(
        "company_id",
        currentCompanyId
      )
      .order("id", {
        ascending: true,
      });

    if (sitesError) {
      throw sitesError;
    }

    const siteList =
      Array.isArray(data)
        ? data
        : [];

    setSites(siteList);

    return siteList;
  }

  /* ======================================================
     LOAD COMPANY PACKETS
     
     We first obtain the company sites.
     Then packets are loaded only for those sites.

     This is intentionally NOT:

       .from("packets").select("*")

     without a company/site restriction.
  ====================================================== */

  async function loadPackets(companySites) {
    const siteIds =
      Array.isArray(companySites)
        ? companySites
            .map(
              (site) =>
                site.id
            )
            .filter(
              (id) =>
                id !== null &&
                id !== undefined
            )
        : [];

    if (siteIds.length === 0) {
      setPackets([]);
      return [];
    }

    const {
      data,
      error: packetsError,
    } = await supabase
      .from("packets")
      .select("*")
      .in(
        "site_id",
        siteIds
      )
      .order("id", {
        ascending: false,
      });

    if (packetsError) {
      throw packetsError;
    }

    const packetList =
      Array.isArray(data)
        ? data
        : [];

    setPackets(packetList);

    return packetList;
  }

  /* ======================================================
     LOAD PACKET/PANEL RELATIONSHIPS
  ====================================================== */

  async function loadPacketPanels(
    companyPackets
  ) {
    const packetIds =
      Array.isArray(companyPackets)
        ? companyPackets
            .map(
              (packet) =>
                packet.id
            )
            .filter(
              (id) =>
                id !== null &&
                id !== undefined
            )
        : [];

    if (packetIds.length === 0) {
      setPacketPanels([]);
      return [];
    }

    const {
      data,
      error: relationError,
    } = await supabase
      .from("packet_panels")
      .select("*")
      .in(
        "packet_id",
        packetIds
      )
      .order("id", {
        ascending: true,
      });

    if (relationError) {
      throw relationError;
    }

    const relationList =
      Array.isArray(data)
        ? data
        : [];

    setPacketPanels(
      relationList
    );

    return relationList;
  }

  /* ======================================================
     LOAD PANELS
  ====================================================== */

  async function loadPanels(
    companyPacketPanels
  ) {
    const panelIds =
      Array.isArray(
        companyPacketPanels
      )
        ? companyPacketPanels
            .map(
              (row) =>
                row.panel_id
            )
            .filter(
              (id) =>
                id !== null &&
                id !== undefined
            )
        : [];

    if (panelIds.length === 0) {
      setPanels([]);
      return [];
    }

    const {
      data,
      error: panelsError,
    } = await supabase
      .from("panels")
      .select("*")
      .in(
        "id",
        panelIds
      )
      .order("id", {
        ascending: true,
      });

    if (panelsError) {
      throw panelsError;
    }

    const panelList =
      Array.isArray(data)
        ? data
        : [];

    setPanels(panelList);

    return panelList;
  }

  /* ======================================================
     FULL DATA LOAD
  ====================================================== */

  async function loadAllData() {
    try {
      setLoading(true);
      setError("");

      const {
        companyId:
          currentCompanyId,
        companyName:
          currentCompanyName,
      } =
        await loadUserCompany();

      const companySites =
        await loadSites(
          currentCompanyId
        );

      const companyPackets =
        await loadPackets(
          companySites
        );

      const companyPacketPanels =
        await loadPacketPanels(
          companyPackets
        );

      await loadPanels(
        companyPacketPanels
      );

      setCompanyId(
        currentCompanyId
      );

      setCompanyName(
        currentCompanyName || ""
      );

      /*
      ------------------------------------------------------
      IMPORTANT

      Do NOT automatically select the first site.

      The factory user must deliberately choose the site.
      ------------------------------------------------------
      */

      setSelectedSiteId(
        (currentSelectedSiteId) => {
          if (
            currentSelectedSiteId &&
            companySites.some(
              (site) =>
                String(site.id) ===
                String(
                  currentSelectedSiteId
                )
            )
          ) {
            return currentSelectedSiteId;
          }

          return "";
        }
      );
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
     REFRESH WHEN WINDOW RETURNS
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
     SELECTED SITE
  ====================================================== */

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

  /* ======================================================
     FILTER PACKETS

     THIS IS THE MAIN BEHAVIOR CHANGE.

     No site selected:
       return []

     Site selected:
       return ONLY that site's packets.
  ====================================================== */

  const filteredPackets = useMemo(() => {
    if (!selectedSiteId) {
      return [];
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
  ====================================================== */

  const readyPackets = useMemo(() => {
    return filteredPackets.filter(
      (packet) => {
        const status =
          String(
            packet.status || ""
          )
            .trim()
            .toLowerCase();

        return (
          status === "closed" &&
          !packet.dispatched_at
        );
      }
    );
  }, [
    filteredPackets,
  ]);

  /* ======================================================
     DISPATCHED
  ====================================================== */

  const dispatchedPackets = useMemo(() => {
    return filteredPackets.filter(
      (packet) => {
        const status =
          String(
            packet.status || ""
          )
            .trim()
            .toLowerCase();

        return (
          status === "dispatched" ||
          Boolean(
            packet.dispatched_at
          )
        );
      }
    );
  }, [
    filteredPackets,
  ]);

  /* ======================================================
     PACKET/PANEL HELPERS
  ====================================================== */

  function getPacketPanelRelations(
    packetId
  ) {
    return packetPanels.filter(
      (relation) =>
        String(
          relation.packet_id
        ) ===
        String(packetId)
    );
  }

  function getPacketPanelCount(
    packetId
  ) {
    return getPacketPanelRelations(
      packetId
    ).length;
  }

  function getPacketSite(
    packet
  ) {
    if (!packet) {
      return null;
    }

    return sites.find(
      (site) =>
        String(site.id) ===
        String(packet.site_id)
    );
  }

  function getPanel(
    panelId
  ) {
    return panels.find(
      (panel) =>
        String(panel.id) ===
        String(panelId)
    );
  }

  function getPacketQR(
    packet
  ) {
    if (!packet) {
      return "";
    }

    return (
      packet.packet_qr ||
      packet.packet_code ||
      ""
    );
  }

  function getPanelQR(
    panel
  ) {
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
     SELECT PACKET
  ====================================================== */

  function selectPacket(
    packet
  ) {
    setSelectedPacketId(
      packet
        ? packet.id
        : null
    );

    setError("");
    setMessage("");
  }

  /* ======================================================
     SELECTED PACKET
  ====================================================== */

  const selectedPacket =
    useMemo(() => {
      if (!selectedPacketId) {
        return null;
      }

      return (
        filteredPackets.find(
          (packet) =>
            String(
              packet.id
            ) ===
            String(
              selectedPacketId
            )
        ) || null
      );
    }, [
      filteredPackets,
      selectedPacketId,
    ]);

  /* ======================================================
     SITE CHANGE

     Changing the site immediately clears packet state.
  ====================================================== */

  function handleSiteChange(
    event
  ) {
    const newSiteId =
      event.target.value;

    setSelectedSiteId(
      newSiteId
    );

    setSelectedPacketId(
      null
    );

    setScanValue("");

    setError("");
    setMessage("");

    /*
    Scanner is only focused after a real site
    has been selected.
    */

    if (newSiteId) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }

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
      scanValue.trim();

    setError("");
    setMessage("");

    /*
    ------------------------------------------------------
    SITE MUST BE SELECTED FIRST
    ------------------------------------------------------
    */

    if (!selectedSiteId) {
      setError(
        "Select a site before scanning a packet."
      );

      setScanValue("");

      return;
    }

    if (!qr) {
      return;
    }

    if (scanning) {
      return;
    }

    setScanning(true);

    try {
      /*
      ------------------------------------------------------
      FIND PACKET
      ------------------------------------------------------
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
      ------------------------------------------------------
      COMPANY CHECK

      Packet must belong to one of the sites belonging
      to the current company.
      ------------------------------------------------------
      */

      const packetBelongsToCompany =
        sites.some(
          (site) =>
            String(
              site.id
            ) ===
            String(
              packet.site_id
            )
        );

      if (
        !packetBelongsToCompany
      ) {
        throw new Error(
          "This packet does not belong to your company."
        );
      }

      /*
      ------------------------------------------------------
      SITE CHECK

      THIS IS IMPORTANT.

      Even if the packet exists, it must belong to the
      ONE site currently selected on screen.
      ------------------------------------------------------
      */

      if (
        String(
          packet.site_id
        ) !==
        String(
          selectedSiteId
        )
      ) {
        const packetSite =
          getPacketSite(
            packet
          );

        throw new Error(
          `Wrong site. This packet belongs to ${
            packetSite?.site_name ||
            "another site"
          }. Please select that site before dispatching.`
        );
      }

      /*
      ------------------------------------------------------
      ALREADY DISPATCHED
      ------------------------------------------------------
      */

      const currentStatus =
        String(
          packet.status || ""
        )
          .trim()
          .toLowerCase();

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
      ------------------------------------------------------
      ONLY CLOSED PACKETS CAN BE DISPATCHED
      ------------------------------------------------------
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
      ------------------------------------------------------
      DISPATCH TIME
      ------------------------------------------------------
      */

      const dispatchedAt =
        new Date().toISOString();

      /*
      ------------------------------------------------------
      UPDATE SUPABASE
      ------------------------------------------------------
      */

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
      ------------------------------------------------------
      UPDATE LOCAL STATE
      ------------------------------------------------------
      */

      setPackets(
        (current) =>
          current.map(
            (item) =>
              String(
                item.id
              ) ===
              String(
                packet.id
              )
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
      ------------------------------------------------------
      RETURN SCANNER TO READY STATE
      ------------------------------------------------------
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
     DATE FORMAT
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
      String(
        packet.id
      );

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
          Reading your company dispatch data.
        </p>
      </div>
    );
  }

  /* ======================================================
     SELECTED PACKET DETAILS
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
            Select one site before viewing or dispatching packets.
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
          COMPANY
      ================================================== */}

      {companyName && (
        <div
          style={{
            background:
              "#eff6ff",
            border:
              "1px solid #bfdbfe",
            borderRadius:
              "10px",
            padding:
              "10px 14px",
            marginBottom:
              "18px",
            fontSize:
              "13px",
            color:
              "#1e40af",
            fontWeight:
              "700",
          }}
        >
          Company: {companyName}
        </div>
      )}

      {/* ==================================================
          SELECT SITE
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
          onChange={
            handleSiteChange
          }
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
          {/* NO ALL SITES OPTION */}

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
                {site.site_name ||
                  `Site ${site.id}`}
                {site.client_name
                  ? ` — ${site.client_name}`
                  : ""}
              </option>
            )
          )}
        </select>

        {/* SELECTED SITE INFORMATION */}

        {selectedSite ? (
          <div
            style={{
              marginTop:
                "10px",
              fontSize:
                "11px",
              color:
                "#2563eb",
              fontWeight:
                "600",
            }}
          >
            Dispatching only:
            {" "}
            {selectedSite.site_name}
          </div>
        ) : (
          <div
            style={{
              marginTop:
                "10px",
              fontSize:
                "11px",
              color:
                "#6b7280",
            }}
          >
            Select a site to view its packets.
          </div>
        )}
      </div>

      {/* ==================================================
          MESSAGES
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
          SCANNER
          
          ONLY ACTIVE AFTER SITE SELECTION
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
            placeholder={
              selectedSiteId
                ? "Scan packet QR here..."
                : "Select a site first..."
            }
            autoComplete="off"
            disabled={
              !selectedSiteId ||
              scanning
            }
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
              background:
                !selectedSiteId
                  ? "#f3f4f6"
                  : "#ffffff",
            }}
          />

          <button
            type="submit"
            disabled={
              !selectedSiteId ||
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
                !selectedSiteId ||
                scanning
                  ? "#93c5fd"
                  : "#2563eb",
              color:
                "#ffffff",
              fontWeight:
                "700",
              cursor:
                !selectedSiteId ||
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
          {!selectedSiteId
            ? "Select a site before scanning a packet."
            : `Only ${selectedSite?.site_name || "the selected site"} packets can be dispatched.`}
        </div>
      </div>

      {/* ==================================================
          PACKET LISTS
          
          IMPORTANT:
          When selectedSiteId is empty, this entire
          section is NOT displayed.

          Therefore the factory user sees ZERO packets
          before choosing a site.
      ================================================== */}

      {!selectedSiteId ? (
        <div
          style={{
            background:
              "#ffffff",
            border:
              "1px solid #e5e7eb",
            borderRadius:
              "12px",
            padding:
              "55px 20px",
            textAlign:
              "center",
            color:
              "#6b7280",
          }}
        >
          <div
            style={{
              fontSize:
                "38px",
              marginBottom:
                "12px",
            }}
          >
            ▤
          </div>

          <h2
            style={{
              margin:
                "0 0 8px",
              color:
                "#374151",
              fontSize:
                "20px",
            }}
          >
            Select a site
          </h2>

          <p
            style={{
              margin:
                "0",
              fontSize:
                "13px",
            }}
          >
            Ready for Dispatch and Dispatched packets
            will appear after you select one site.
          </p>
        </div>
      ) : (
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
          {/* ==============================================
              READY FOR DISPATCH
          ============================================== */}

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
                  {selectedSite?.site_name}
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
                No packets ready for dispatch
                for this site.
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

          {/* ==============================================
              DISPATCHED
          ============================================== */}

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
                  {selectedSite?.site_name}
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
                No dispatched packets
                for this site.
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
      )}

      {/* ==================================================
          SELECTED PACKET DETAILS
          
          Only available after a packet from the selected
          site has been clicked.
      ================================================== */}

      {selectedPacket &&
        selectedSiteId && (
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
                    selectedSite?.site_name
                  }
                </div>

                {companyName && (
                  <div
                    style={{
                      marginTop:
                        "4px",
                      fontSize:
                        "11px",
                      color:
                        "#2563eb",
                      fontWeight:
                        "700",
                    }}
                  >
                    {companyName}
                  </div>
                )}
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
                        `Panel ${
                          index + 1
                        }`;

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