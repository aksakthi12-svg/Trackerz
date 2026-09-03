import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

/*
 * Trackerz QR Tracking
 *
 * UI revision:
 * - READY packets shown first
 * - DISPATCHED packets shown below
 * - 3 packet columns
 * - Packet cards show packet number + status only
 * - Packet QR is NOT displayed in the packet card
 * - Opening a packet shows details + Print Packet QR button
 * - Closing a packet automatically opens printing
 *
 * DATABASE LOGIC:
 * - No database structure changes
 * - Existing Supabase authentication retained
 * - Existing RLS retained
 * - Existing company separation retained
 * - Existing sites table retained
 * - Existing panels table retained
 * - Existing packets table retained
 * - Existing packet_panels table retained
 */

function QRTracking() {
  const [sites, setSites] = useState([]);
  const [panels, setPanels] = useState([]);
  const [allPackets, setAllPackets] = useState([]);

  const [selectedSiteId, setSelectedSiteId] = useState("");

  const [activeView, setActiveView] = useState("remaining");

  const [manualQR, setManualQR] = useState("");

  const [openPacket, setOpenPacket] = useState(null);

  const [closedPackets, setClosedPackets] = useState([]);

  const [selectedPacketId, setSelectedPacketId] = useState(null);

  const [selectedPanelId, setSelectedPanelId] = useState(null);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const inputRef = useRef(null);

  /* =========================================================
     MESSAGE
  ========================================================= */

  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);

    window.clearTimeout(window.__trackerzMessageTimer);

    window.__trackerzMessageTimer = window.setTimeout(() => {
      setMessage("");
    }, 3000);
  };

  /* =========================================================
     BASIC HELPERS
  ========================================================= */

  const getSiteName = (site) =>
    site?.site_name ||
    site?.siteName ||
    site?.name ||
    "Unnamed Site";

  const getClientName = (site) =>
    site?.client_name ||
    site?.clientName ||
    site?.customer ||
    "Client";

  const getPacketStatus = (packet) =>
    String(packet?.status || "")
      .trim()
      .toLowerCase();

  const isPacketOpen = (packet) =>
    getPacketStatus(packet) === "open";

  const isPacketDispatched = (packet) => {
    const status = getPacketStatus(packet);

    return (
      status === "dispatched" ||
      status === "dispatch" ||
      status === "delivered"
    );
  };

  const isPacketClosed = (packet) => {
    const status = getPacketStatus(packet);

    return (
      status === "closed" ||
      status === "packed" ||
      status === "ready"
    );
  };

  const getDispatchTimestamp = (packet) =>
    packet?.dispatched_at ||
    packet?.dispatch_at ||
    packet?.dispatch_timestamp ||
    packet?.dispatchedAt ||
    packet?.dispatchAt ||
    null;

  const formatDateTime = (value) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  /* =========================================================
     PANEL HELPERS
  ========================================================= */

  const getPanelStatus = (panel) =>
    String(
      panel?.status ||
        panel?.production_status ||
        panel?.productionStatus ||
        panel?.pack_status ||
        panel?.packStatus ||
        ""
    )
      .trim()
      .toLowerCase();

  const isPanelPacked = (panel) => {
    const status = getPanelStatus(panel);

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

  const getPanelLabel = (panel, index = 0) =>
    panel?.qr_data ||
    panel?.qrData ||
    panel?.qr_code ||
    panel?.qrCode ||
    panel?.panel_name ||
    panel?.panelName ||
    panel?.panel_id ||
    panel?.panelId ||
    panel?.id ||
    `Panel ${index + 1}`;

  const getPanelLength = (panel) =>
    panel?.length ??
    panel?.fb_length ??
    panel?.fbLength ??
    "-";

  const getPanelWidth = (panel) =>
    panel?.width ??
    panel?.fb_width ??
    panel?.fbWidth ??
    "-";

  const getPanelThickness = (panel) =>
    panel?.thickness ??
    panel?.thk ??
    "-";

  const getPanelRemarks = (panel) =>
    panel?.remarks ??
    panel?.remark ??
    panel?.notes ??
    panel?.note ??
    panel?.comments ??
    "";

  const getPanelNameForPrint = (panel) =>
    panel?.fb_name ||
    panel?.panel_name ||
    panel?.panelName ||
    panel?.name ||
    getPanelLabel(panel) ||
    "Panel";

  const getPanelSectionForPrint = (panel) =>
    panel?.section_name ||
    panel?.sectionName ||
    panel?.section ||
    "-";

  const getPanelLabelNumberForPrint = (panel) =>
    panel?.assembly_label ||
    panel?.assemblyLabel ||
    panel?.label_number ||
    panel?.labelNumber ||
    panel?.barcode ||
    "-";

  /* =========================================================
     PACKET NUMBER
  ========================================================= */

  const getNextPacketCode = async (siteId) => {
    if (!siteId) {
      throw new Error(
        "Site ID is required to create a packet."
      );
    }

    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("site_name")
      .eq("id", siteId)
      .single();

    if (siteError) throw siteError;

    const sitePrefix = String(site?.site_name || "SITE")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const { data, error } = await supabase
      .from("packets")
      .select("packet_code")
      .eq("site_id", siteId);

    if (error) throw error;

    let highestNumber = 0;

    const escapedPrefix = sitePrefix.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    const regex = new RegExp(
      `^PKT-${escapedPrefix}-(\\d{4})$`
    );

    (Array.isArray(data) ? data : []).forEach((row) => {
      const match = String(row?.packet_code || "")
        .trim()
        .match(regex);

      if (match) {
        const number = Number(match[1]);

        if (
          Number.isFinite(number) &&
          number > highestNumber
        ) {
          highestNumber = number;
        }
      }
    });

    return `PKT-${sitePrefix}-${String(
      highestNumber + 1
    ).padStart(4, "0")}`;
  };

  /* =========================================================
     LOAD SITES + PANELS
  ========================================================= */

  const loadBaseData = async () => {
    const { data: sitesData, error: sitesError } =
      await supabase
        .from("sites")
        .select("*")
        .order("id", { ascending: true });

    if (sitesError) throw sitesError;

    const { data: panelsData, error: panelsError } =
      await supabase
        .from("panels")
        .select("*")
        .order("id", { ascending: true });

    if (panelsError) throw panelsError;

    return {
      sites: Array.isArray(sitesData)
        ? sitesData
        : [],

      panels: Array.isArray(panelsData)
        ? panelsData
        : [],
    };
  };

  /* =========================================================
     LOAD PACKETS FOR SELECTED SITE
  ========================================================= */

  const loadPacketsForSite = async (siteId) => {
    if (!siteId) {
      setOpenPacket(null);
      setClosedPackets([]);
      setAllPackets([]);
      return;
    }

    const { data: packetRows, error: packetError } =
      await supabase
        .from("packets")
        .select("*")
        .eq("site_id", siteId)
        .order("id", { ascending: false });

    if (packetError) throw packetError;

    const safePackets = Array.isArray(packetRows)
      ? packetRows
      : [];

    let relationRows = [];

    if (safePackets.length) {
      const packetIds = safePackets.map(
        (packet) => packet.id
      );

      const { data, error } = await supabase
        .from("packet_panels")
        .select("*")
        .in("packet_id", packetIds);

      if (error) throw error;

      relationRows = Array.isArray(data)
        ? data
        : [];
    }

    const packetObjects = safePackets.map((packet) => {
      const relations = relationRows.filter(
        (row) =>
          String(row.packet_id) ===
          String(packet.id)
      );

      const panelIds = relations
        .map((row) => row.panel_id)
        .filter(
          (id) =>
            id !== null &&
            id !== undefined
        );

      return {
        ...packet,

        dbId: packet.id,

        id:
          packet.packet_code ||
          `PKT-${packet.id}`,

        packetId: packet.id,

        panelIds,

        panelQRs: relations
          .map((row) => row.qr_data)
          .filter(Boolean),
      };
    });

    setAllPackets(packetObjects);

    setOpenPacket(
      packetObjects.find(isPacketOpen) ||
        null
    );

    setClosedPackets(
      packetObjects.filter(
        (packet) =>
          isPacketClosed(packet) ||
          isPacketDispatched(packet)
      )
    );
  };

  /* =========================================================
     LOAD EVERYTHING
  ========================================================= */

  const loadData = async (
    keepSelectedSite = true
  ) => {
    try {
      setLoading(true);

      const {
        sites: sitesData,
        panels: panelsData,
      } = await loadBaseData();

      setSites(sitesData);
      setPanels(panelsData);

      let siteToUse = selectedSiteId;

      if (
        keepSelectedSite &&
        siteToUse
      ) {
        const stillExists =
          sitesData.some(
            (site) =>
              String(site.id) ===
              String(siteToUse)
          );

        if (!stillExists) {
          siteToUse =
            sitesData.length
              ? String(sitesData[0].id)
              : "";
        }
      }

      if (
        !siteToUse &&
        sitesData.length
      ) {
        siteToUse = String(
          sitesData[0].id
        );
      }

      if (!siteToUse) {
        setSelectedSiteId("");
        setOpenPacket(null);
        setClosedPackets([]);
        setAllPackets([]);
        return;
      }

      if (
        String(siteToUse) !==
        String(selectedSiteId)
      ) {
        setSelectedSiteId(siteToUse);
      }

      await loadPacketsForSite(
        siteToUse
      );
    } catch (error) {
      console.error(
        "Trackerz QR Tracking load error:",
        error
      );

      showMessage(
        error?.message ||
          "Unable to load QR Tracking data from Supabase.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  /* =========================================================
     SITE CHANGE
  ========================================================= */

  useEffect(() => {
    if (!selectedSiteId) return;

    const reload = async () => {
      try {
        await loadPacketsForSite(
          selectedSiteId
        );

        setActiveView("remaining");
        setSelectedPacketId(null);
        setSelectedPanelId(null);
        setManualQR("");
      } catch (error) {
        console.error(
          "Site packet load error:",
          error
        );

        showMessage(
          error?.message ||
            "Unable to load packets.",
          "error"
        );
      }
    };

    reload();
  }, [selectedSiteId]);

  /* =========================================================
     REFRESH WHEN WINDOW FOCUS RETURNS
  ========================================================= */

  useEffect(() => {
    const refresh = async () => {
      try {
        const {
          sites: sitesData,
          panels: panelsData,
        } = await loadBaseData();

        setSites(sitesData);
        setPanels(panelsData);

        if (selectedSiteId) {
          await loadPacketsForSite(
            selectedSiteId
          );
        }
      } catch (error) {
        console.error(
          "Trackerz refresh error:",
          error
        );
      }
    };

    window.addEventListener(
      "focus",
      refresh
    );

    const handleVisibility = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        refresh();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      window.removeEventListener(
        "focus",
        refresh
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, [selectedSiteId]);

  /* =========================================================
     SELECTED SITE
  ========================================================= */

  const selectedSite = useMemo(
    () =>
      sites.find(
        (site) =>
          String(site.id) ===
          String(selectedSiteId)
      ),
    [sites, selectedSiteId]
  );

  /* =========================================================
     SITE PANELS
  ========================================================= */

  const sitePanels = useMemo(() => {
    if (!selectedSite) return [];

    const siteId = String(
      selectedSite.id
    );

    const siteName = getSiteName(
      selectedSite
    )
      .trim()
      .toLowerCase();

    return panels.filter((panel) => {
      const panelSiteId = String(
        panel?.site_id ||
          panel?.siteId ||
          ""
      );

      const panelSiteName = String(
        panel?.site_name ||
          panel?.siteName ||
          ""
      )
        .trim()
        .toLowerCase();

      if (
        panelSiteId &&
        panelSiteId === siteId
      ) {
        return true;
      }

      return (
        !panelSiteId &&
        panelSiteName &&
        panelSiteName === siteName
      );
    });
  }, [panels, selectedSite]);

  /* =========================================================
     COUNTS
  ========================================================= */

  const packedPanels = useMemo(
    () =>
      sitePanels.filter(
        isPanelPacked
      ),
    [sitePanels]
  );

  const remainingPanels = useMemo(
    () =>
      sitePanels.filter(
        (panel) =>
          !isPanelPacked(panel)
      ),
    [sitePanels]
  );

  const dispatchedPackets = useMemo(
    () =>
      allPackets.filter(
        isPacketDispatched
      ),
    [allPackets]
  );

  const readyPackets = useMemo(
    () =>
      allPackets.filter(
        (packet) =>
          isPacketClosed(packet) &&
          !isPacketDispatched(packet)
      ),
    [allPackets]
  );

  const totalPanels =
    sitePanels.length;

  const packedCount =
    packedPanels.length;

  const remainingCount =
    remainingPanels.length;

  const totalPackets =
    allPackets.length;

  const dispatchedPacketCount =
    dispatchedPackets.length;

  const readyPacketCount =
    readyPackets.length;

  const progress = totalPanels
    ? Math.min(
        100,
        Math.round(
          (packedCount /
            totalPanels) *
            100
        )
      )
    : 0;

  /* =========================================================
     FIND PANEL BY QR
  ========================================================= */

  const findPanelByQR = (
    qrValue
  ) => {
    const value = String(
      qrValue || ""
    )
      .trim()
      .toLowerCase();

    if (!value) return null;

    return sitePanels.find(
      (panel) =>
        [
          panel?.qr_data,
          panel?.qrData,
          panel?.qr_code,
          panel?.qrCode,
          panel?.qr,
          panel?.panel_name,
          panel?.panelName,
          panel?.panel_id,
          panel?.panelId,
          panel?.id,
        ].some(
          (item) =>
            String(item || "")
              .trim()
              .toLowerCase() ===
            value
        )
    );
  };

  /* =========================================================
     CREATE OPEN PACKET
  ========================================================= */

  const createOpenPacket = async () => {
    if (!selectedSite) {
      throw new Error(
        "Please select a site first."
      );
    }

    const packetCode =
      await getNextPacketCode(
        selectedSite.id
      );

    const {
      data,
      error,
    } = await supabase
      .from("packets")
      .insert([
        {
          site_id:
            selectedSite.id,

          site_name:
            getSiteName(
              selectedSite
            ),

          packet_code:
            packetCode,

          packet_qr:
            packetCode,

          status: "open",

          opened_at:
            new Date().toISOString(),

          closed_at: null,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return {
      ...data,

      dbId: data.id,

      id:
        data.packet_code ||
        packetCode,

      packetId: data.id,

      panelIds: [],

      panelQRs: [],
    };
  };

  /* =========================================================
     ADD PANEL TO PACKET
  ========================================================= */

  const addPanelToPacket = async (
    packetDbId,
    panelId,
    qrData
  ) => {
    const {
      data,
      error,
    } = await supabase
      .from("packet_panels")
      .insert([
        {
          packet_id:
            packetDbId,

          panel_id:
            panelId,

          qr_data:
            qrData || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return data;
  };

  /* =========================================================
     UPDATE PANEL
  ========================================================= */

  const updatePanelInSupabase = async (
    panelId,
    updates
  ) => {
    const {
      data,
      error,
    } = await supabase
      .from("panels")
      .update(updates)
      .eq("id", panelId)
      .select()
      .single();

    if (error) throw error;

    return data;
  };

  /* =========================================================
     LOAD PACKET PANEL IDS
  ========================================================= */

  const loadPacketPanelIds =
    async (packetDbId) => {
      const {
        data,
        error,
      } = await supabase
        .from("packet_panels")
        .select("*")
        .eq(
          "packet_id",
          packetDbId
        )
        .order("id", {
          ascending: true,
        });

      if (error) throw error;

      return Array.isArray(data)
        ? data
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
    };

  /* =========================================================
     SCAN PANEL
  ========================================================= */

  const handleScanPanel =
    async () => {
      const qrValue =
        manualQR.trim();

      if (!qrValue) {
        return showMessage(
          "Scan or enter a QR value.",
          "error"
        );
      }

      if (!selectedSite) {
        return showMessage(
          "Please select a site first.",
          "error"
        );
      }

      if (actionLoading) return;

      const panel =
        findPanelByQR(
          qrValue
        );

      if (!panel) {
        showMessage(
          "Panel not found in the selected site.",
          "error"
        );

        setManualQR("");

        setTimeout(
          () =>
            inputRef.current?.focus(),
          50
        );

        return;
      }

      if (isPanelPacked(panel)) {
        showMessage(
          `${getPanelLabel(
            panel
          )} is already packed.`,
          "error"
        );

        setSelectedPanelId(
          panel.id
        );

        setManualQR("");

        setTimeout(
          () =>
            inputRef.current?.focus(),
          50
        );

        return;
      }

      try {
        setActionLoading(true);

        let packet =
          openPacket;

        if (!packet) {
          packet =
            await createOpenPacket();

          setOpenPacket(packet);
        }

        const packetDbId =
          packet.dbId ||
          packet.packetId ||
          packet.id;

        const currentPacketPanelIds =
          await loadPacketPanelIds(
            packetDbId
          );

        if (
          currentPacketPanelIds.some(
            (id) =>
              String(id) ===
              String(panel.id)
          )
        ) {
          showMessage(
            `${getPanelLabel(
              panel
            )} is already inside ${packet.id}.`,
            "error"
          );

          setManualQR("");

          return;
        }

        await addPanelToPacket(
          packetDbId,
          panel.id,
          getPanelLabel(panel)
        );

        let updatedPanel;

        try {
          updatedPanel =
            await updatePanelInSupabase(
              panel.id,
              {
                status:
                  "packed",
                packed:
                  true,
              }
            );
        } catch (
          panelError
        ) {
          try {
            await supabase
              .from(
                "packet_panels"
              )
              .delete()
              .eq(
                "packet_id",
                packetDbId
              )
              .eq(
                "panel_id",
                panel.id
              );
          } catch (
            cleanupError
          ) {
            console.error(
              "Packet relation cleanup failed:",
              cleanupError
            );
          }

          throw panelError;
        }

        setPanels(
          (current) =>
            current.map(
              (item) =>
                String(item.id) ===
                String(panel.id)
                  ? {
                      ...item,
                      ...(updatedPanel ||
                        {}),
                      status:
                        "packed",
                      packed:
                        true,
                    }
                  : item
            )
        );

        const updatedPacket =
          {
            ...packet,

            panelIds: [
              ...(packet.panelIds ||
                []),
              panel.id,
            ],

            panelQRs: [
              ...(packet.panelQRs ||
                []),
              getPanelLabel(
                panel
              ),
            ],
          };

        setOpenPacket(
          updatedPacket
        );

        setManualQR("");

        setActiveView(
          "remaining"
        );

        setSelectedPanelId(
          panel.id
        );

        showMessage(
          `${getPanelLabel(
            panel
          )} added to ${packet.id}`
        );

        setTimeout(
          () =>
            inputRef.current?.focus(),
          50
        );
      } catch (error) {
        console.error(
          "QR Tracking packing error:",
          error
        );

        showMessage(
          error?.message ||
            "Unable to pack panel.",
          "error"
        );
      } finally {
        setActionLoading(false);
      }
    };

  const handleQRKeyDown =
    (event) => {
      if (
        event.key ===
        "Enter"
      ) {
        event.preventDefault();

        handleScanPanel();
      }
    };

  /* =========================================================
     PACKET QR
  ========================================================= */

  const getPacketQRValue =
    (packet) =>
      String(
        packet?.packet_qr ||
          packet?.packet_code ||
          packet?.id ||
          ""
      ).trim();

  const escapePrintHtml =
    (value) =>
      String(value ?? "")
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

  const getPacketQRImageUrl =
    (qrValue) =>
      `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=10&data=${encodeURIComponent(
        qrValue
      )}`;

  /* =========================================================
     GET PANELS INSIDE PACKET
  ========================================================= */

  const getPacketPanels =
    (packet) =>
      packet
        ? (packet.panelIds ||
            [])
            .map((id) =>
              sitePanels.find(
                (panel) =>
                  String(
                    panel.id
                  ) ===
                  String(id)
              )
            )
            .filter(Boolean)
        : [];

  /* =========================================================
     PRINT PACKET LABEL
  ========================================================= */

  const printPacketLabel = (
    packet,
    site
  ) => {
    const qrValue =
      getPacketQRValue(
        packet
      );

    if (!qrValue) {
      return showMessage(
        "Packet QR data is missing.",
        "error"
      );
    }

    const siteName =
      getSiteName(site);

    const clientName =
      getClientName(site);

    const qrImageUrl =
      getPacketQRImageUrl(
        qrValue
      );

    const packetPanels =
      getPacketPanels(
        packet
      );

    const hasRemarks =
      packetPanels.some(
        (panel) =>
          String(
            getPanelRemarks(
              panel
            ) || ""
          ).trim()
      );

    const firstPagePanels =
      packetPanels.slice(
        0,
        10
      );

    const remainingPanels =
      packetPanels.slice(
        10
      );

    const continuationChunks =
      [];

    for (
      let i = 0;
      i <
      remainingPanels.length;
      i += 8
    ) {
      continuationChunks.push(
        remainingPanels.slice(
          i,
          i + 8
        )
      );
    }

    const renderPanelRows =
      (
        rows,
        startIndex = 0
      ) => {
        if (!rows.length) {
          return `
            <div class="empty-panels">
              No panel details available
            </div>
          `;
        }

        return rows
          .map(
            (
              panel,
              index
            ) => `
              <div class="panel-row ${
                hasRemarks
                  ? "with-remarks"
                  : ""
              }">

                <div class="panel-no">
                  ${
                    startIndex +
                    index +
                    1
                  }
                </div>

                <div class="panel-main">
                  <div class="panel-name">
                    ${escapePrintHtml(
                      getPanelNameForPrint(
                        panel
                      )
                    )}
                  </div>

                  <div class="panel-section">
                    ${escapePrintHtml(
                      getPanelSectionForPrint(
                        panel
                      )
                    )}
                  </div>
                </div>

                <div class="panel-label">
                  ${escapePrintHtml(
                    getPanelLabelNumberForPrint(
                      panel
                    )
                  )}
                </div>

                <div class="panel-size">
                  <span>
                    T ${escapePrintHtml(
                      getPanelThickness(
                        panel
                      )
                    )}
                  </span>

                  <span>
                    L ${escapePrintHtml(
                      getPanelLength(
                        panel
                      )
                    )}
                  </span>

                  <span>
                    W ${escapePrintHtml(
                      getPanelWidth(
                        panel
                      )
                    )}
                  </span>
                </div>

                ${
                  hasRemarks
                    ? `
                      <div class="panel-remarks">
                        ${escapePrintHtml(
                          getPanelRemarks(
                            panel
                          ) || "-"
                        )}
                      </div>
                    `
                    : ""
                }

              </div>
            `
          )
          .join("");
      };

    const buildLabel =
      ({
        title,
        rows,
        startIndex,
        includeQR,
      }) => `
        <section class="label-page">

          <div class="label-top">

            <div class="label-info">

              <div class="brand">
                TRACKERZ
              </div>

              <div class="title">
                ${escapePrintHtml(
                  title
                )}
              </div>

              <div class="packet-code">
                ${escapePrintHtml(
                  qrValue
                )}
              </div>

              <div class="site">
                ${escapePrintHtml(
                  siteName
                )}
              </div>

              <div class="client">
                ${escapePrintHtml(
                  clientName
                )}
              </div>

              <div class="panel-summary">
                ${
                  packetPanels.length
                } PANELS
              </div>

            </div>

            ${
              includeQR
                ? `
                  <img
                    id="packet-qr-image"
                    class="qr"
                    alt="Packet QR"
                  />
                `
                : `
                  <div class="continuation-mark">
                    PACKET<br/>
                    PANELS
                  </div>
                `
            }

          </div>

          <div class="panel-header ${
            hasRemarks
              ? "with-remarks"
              : ""
          }">

            <span>#</span>

            <span>
              Panel / Section
            </span>

            <span>
              Label
            </span>

            <span>
              T / L / W
            </span>

            ${
              hasRemarks
                ? "<span>Remarks</span>"
                : ""
            }

          </div>

          <div class="panel-list">
            ${renderPanelRows(
              rows,
              startIndex
            )}
          </div>

          <div class="footer-code">
            PACKET QR:
            ${escapePrintHtml(
              qrValue
            )}
          </div>

        </section>
      `;

    const labels = [
      buildLabel({
        title:
          "PACKET QR + PANEL DETAILS",

        rows:
          firstPagePanels,

        startIndex: 0,

        includeQR: true,
      }),
    ];

    continuationChunks.forEach(
      (
        chunk,
        index
      ) => {
        labels.push(
          buildLabel({
            title: `PACKET PANELS — CONT. ${
              index + 1
            }`,

            rows: chunk,

            startIndex:
              10 +
              index * 8,

            includeQR:
              false,
          })
        );
      }
    );

    const iframe =
      document.createElement(
        "iframe"
      );

    iframe.style.position =
      "fixed";

    iframe.style.right =
      "0";

    iframe.style.bottom =
      "0";

    iframe.style.width =
      "0";

    iframe.style.height =
      "0";

    iframe.style.border =
      "0";

    iframe.style.opacity =
      "0";

    iframe.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.appendChild(
      iframe
    );

    const printDocument =
      iframe.contentWindow
        ?.document;

    if (!printDocument) {
      document.body.removeChild(
        iframe
      );

      return showMessage(
        "Unable to open print window.",
        "error"
      );
    }

    printDocument.open();

    printDocument.write(`
      <!DOCTYPE html>

      <html>

        <head>

          <title>
            ${escapePrintHtml(
              qrValue
            )}
          </title>

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />

          <style>

            @page {
              size: 100mm 100mm;
              margin: 0;
            }

            * {
              box-sizing: border-box;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              width: 100mm;
              background: #fff;
              font-family:
                Arial,
                Helvetica,
                sans-serif;
              color: #111827;
            }

            .label-page {
              width: 100mm;
              height: 100mm;
              padding: 3mm;
              overflow: hidden;
              page-break-after: always;
              background: #fff;
            }

            .label-page:last-child {
              page-break-after: auto;
            }

            .label-top {
              height: 22mm;
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 3mm;
              border-bottom:
                0.2mm solid #d1d5db;
              padding-bottom: 2mm;
            }

            .label-info {
              min-width: 0;
              flex: 1;
              padding-top: 0.3mm;
            }

            .brand {
              font-size: 5.5px;
              line-height: 1;
              font-weight: 900;
              letter-spacing: 0.8px;
              color: #2563eb;
            }

            .title {
              margin-top: 1mm;
              font-size: 4.2px;
              line-height: 1;
              font-weight: 700;
              color: #6b7280;
            }

            .packet-code {
              margin-top: 2.2mm;
              font-size: 7px;
              line-height: 1;
              font-weight: 900;
              color: #111827;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .site {
              margin-top: 1.1mm;
              font-size: 5.4px;
              line-height: 1;
              font-weight: 800;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .client {
              margin-top: 0.7mm;
              font-size: 4.3px;
              line-height: 1;
              color: #6b7280;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .panel-summary {
              margin-top: 1.5mm;
              font-size: 5.2px;
              line-height: 1;
              font-weight: 900;
            }

            .qr {
              width: 16mm;
              height: 16mm;
              object-fit: contain;
              display: block;
              flex-shrink: 0;
              margin-top: 0.5mm;
            }

            .continuation-mark {
              width: 16mm;
              height: 16mm;
              flex-shrink: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              text-align: center;
              font-size: 5px;
              line-height: 1.25;
              font-weight: 900;
              color: #9ca3af;
              border:
                0.3mm dashed #d1d5db;
              border-radius: 1.5mm;
            }

            .panel-header,
            .panel-row {
              display: grid;
              grid-template-columns:
                5mm
                1fr
                12mm
                23mm;

              column-gap: 1mm;

              align-items: center;
            }

            .panel-header.with-remarks,
            .panel-row.with-remarks {
              grid-template-columns:
                5mm
                1fr
                11mm
                22mm
                22mm;
            }

            .panel-header {
              min-height: 5mm;
              padding:
                1mm
                0.8mm;

              margin-top: 1.2mm;

              background: #f3f4f6;

              border-top:
                0.2mm solid #d1d5db;

              border-bottom:
                0.2mm solid #d1d5db;

              font-size: 4.4px;

              line-height: 1;

              font-weight: 900;

              color: #4b5563;
            }

            .panel-row {
              min-height: 6.2mm;

              padding:
                0.9mm
                0.8mm;

              border-bottom:
                0.15mm solid #e5e7eb;
            }

            .panel-no {
              font-size: 5px;
              font-weight: 900;
              text-align: center;
            }

            .panel-main {
              min-width: 0;
            }

            .panel-name {
              font-size: 5.5px;
              line-height: 1.05;
              font-weight: 900;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .panel-section {
              margin-top: 0.7mm;
              font-size: 4px;
              line-height: 1;
              color: #6b7280;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .panel-label {
              font-size: 4.3px;
              line-height: 1.05;
              font-weight: 800;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .panel-size {
              display: flex;
              gap: 1mm;
              white-space: nowrap;
              font-size: 4.3px;
              line-height: 1;
              font-weight: 900;
            }

            .panel-remarks {
              font-size: 4px;
              line-height: 1.1;
              color: #374151;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .footer-code {
              margin-top: 1mm;
              font-size: 3px;
              line-height: 1;
              color: #9ca3af;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .empty-panels {
              padding: 3mm 1mm;
              font-size: 5px;
              color: #6b7280;
            }

          </style>

        </head>

        <body>
          ${labels.join("\n")}
        </body>

      </html>
    `);

    printDocument.close();

    const qrImage =
      printDocument.getElementById(
        "packet-qr-image"
      );

    let printed = false;

    const cleanup = () => {
      window.setTimeout(() => {
        if (
          iframe.parentNode
        ) {
          iframe.parentNode.removeChild(
            iframe
          );
        }
      }, 1000);
    };

    const doPrint = () => {
      if (printed) return;

      printed = true;

      try {
        iframe.contentWindow.focus();

        iframe.contentWindow.print();
      } catch (error) {
        console.error(
          "Packet label print error:",
          error
        );
      }

      cleanup();
    };

    if (qrImage) {
      qrImage.onload = () =>
        window.setTimeout(
          doPrint,
          150
        );

      qrImage.onerror = () => {
        showMessage(
          "QR image could not be loaded. Check the factory internet connection.",
          "error"
        );

        window.setTimeout(
          doPrint,
          150
        );
      };

      qrImage.src =
        qrImageUrl;
    } else {
      window.setTimeout(
        doPrint,
        150
      );
    }
  };

  /* =========================================================
     CLOSE PACKET
  ========================================================= */

  const handleClosePacket =
    async () => {
      if (!openPacket) {
        return showMessage(
          "No packet is currently open.",
          "error"
        );
      }

      const packetDbId =
        openPacket.dbId ||
        openPacket.packetId;

      try {
        setActionLoading(true);

        const panelIds =
          await loadPacketPanelIds(
            packetDbId
          );

        if (!panelIds.length) {
          return showMessage(
            "Cannot close an empty packet.",
            "error"
          );
        }

        const {
          data,
          error,
        } = await supabase
          .from("packets")
          .update({
            status: "closed",

            packet_qr:
              openPacket.packet_qr ||
              openPacket.packet_code ||
              openPacket.id,

            closed_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            packetDbId
          )
          .select()
          .single();

        if (error) throw error;

        const closedPacket =
          {
            ...openPacket,

            ...data,

            dbId: data.id,

            packetId: data.id,

            id:
              data.packet_code ||
              openPacket.id,

            panelIds,

            panelQRs:
              panelIds.map(
                (id) => {
                  const panel =
                    panels.find(
                      (item) =>
                        String(
                          item.id
                        ) ===
                        String(id)
                    );

                  return panel
                    ? getPanelLabel(
                        panel
                      )
                    : String(id);
                }
              ),
          };

        /*
         * IMPORTANT:
         * Packet QR printing remains exactly part
         * of packet closing.
         */

        printPacketLabel(
          closedPacket,
          selectedSite
        );

        setOpenPacket(null);

        setAllPackets(
          (current) => [
            closedPacket,

            ...current.filter(
              (item) =>
                String(
                  item.dbId ||
                    item.packetId
                ) !==
                String(
                  packetDbId
                )
            ),
          ]
        );

        setClosedPackets(
          (current) => [
            closedPacket,

            ...current.filter(
              (item) =>
                String(
                  item.dbId ||
                    item.packetId
                ) !==
                String(
                  packetDbId
                )
            ),
          ]
        );

        setSelectedPacketId(
          closedPacket.id
        );

        setSelectedPanelId(
          null
        );

        /*
         * After closing, show packet history
         * so the newly created READY packet is visible.
         */
        setActiveView(
          "packets"
        );

        showMessage(
          `${closedPacket.id} closed with ${
            panelIds.length
          } panel${
            panelIds.length === 1
              ? ""
              : "s"
          }.`
        );

        setTimeout(
          () =>
            inputRef.current?.focus(),
          50
        );
      } catch (error) {
        console.error(
          "Close packet error:",
          error
        );

        showMessage(
          error?.message ||
            "Unable to close packet.",
          "error"
        );
      } finally {
        setActionLoading(false);
      }
    };

  /* =========================================================
     REMOVE PANEL FROM OPEN PACKET
  ========================================================= */

  const handleDeletePanelFromOpenPacket =
    async (panel) => {
      if (
        !panel ||
        !openPacket
      ) {
        return;
      }

      if (
        !window.confirm(
          `Remove ${getPanelLabel(
            panel
          )} from the current packet?`
        )
      ) {
        return;
      }

      try {
        setActionLoading(true);

        const packetDbId =
          openPacket.dbId ||
          openPacket.packetId;

        const {
          error,
        } = await supabase
          .from(
            "packet_panels"
          )
          .delete()
          .eq(
            "packet_id",
            packetDbId
          )
          .eq(
            "panel_id",
            panel.id
          );

        if (error) throw error;

        const updatedPanel =
          await updatePanelInSupabase(
            panel.id,
            {
              status:
                "pending",
              packed:
                false,
            }
          );

        setPanels(
          (current) =>
            current.map(
              (item) =>
                String(item.id) ===
                String(panel.id)
                  ? {
                      ...item,
                      ...(updatedPanel ||
                        {}),
                      status:
                        "pending",
                      packed:
                        false,
                    }
                  : item
            )
        );

        setOpenPacket(
          (packet) =>
            packet
              ? {
                  ...packet,

                  panelIds:
                    (
                      packet.panelIds ||
                      []
                    ).filter(
                      (id) =>
                        String(id) !==
                        String(
                          panel.id
                        )
                    ),

                  panelQRs:
                    (
                      packet.panelQRs ||
                      []
                    ).filter(
                      (qr) =>
                        String(
                          qr
                        ) !==
                        String(
                          getPanelLabel(
                            panel
                          )
                        )
                    ),
                }
              : packet
        );

        showMessage(
          `${getPanelLabel(
            panel
          )} returned to Remaining.`
        );
      } catch (error) {
        console.error(
          "Remove panel error:",
          error
        );

        showMessage(
          error?.message ||
            "Unable to remove panel.",
          "error"
        );
      } finally {
        setActionLoading(false);

        setTimeout(
          () =>
            inputRef.current?.focus(),
          50
        );
      }
    };

  /* =========================================================
     DELETE PACKET
  ========================================================= */

  const deletePacketAndReturnPanels =
    async (packet) => {
      if (!packet) return;

      const packetDbId =
        packet.dbId ||
        packet.packetId;

      const panelIds =
        await loadPacketPanelIds(
          packetDbId
        );

      for (
        const panelId of panelIds
      ) {
        await updatePanelInSupabase(
          panelId,
          {
            status:
              "pending",
            packed:
              false,
          }
        );
      }

      const {
        error:
          relationDeleteError,
      } = await supabase
        .from(
          "packet_panels"
        )
        .delete()
        .eq(
          "packet_id",
          packetDbId
        );

      if (
        relationDeleteError
      ) {
        throw relationDeleteError;
      }

      const {
        error:
          packetDeleteError,
      } = await supabase
        .from("packets")
        .delete()
        .eq(
          "id",
          packetDbId
        );

      if (
        packetDeleteError
      ) {
        throw packetDeleteError;
      }

      setPanels(
        (current) =>
          current.map(
            (panel) =>
              panelIds.some(
                (id) =>
                  String(id) ===
                  String(
                    panel.id
                  )
              )
                ? {
                    ...panel,
                    status:
                      "pending",
                    packed:
                      false,
                  }
                : panel
          )
      );

      setAllPackets(
        (current) =>
          current.filter(
            (item) =>
              String(
                item.dbId ||
                  item.packetId
              ) !==
              String(
                packetDbId
              )
          )
      );

      setClosedPackets(
        (current) =>
          current.filter(
            (item) =>
              String(
                item.dbId ||
                  item.packetId
              ) !==
              String(
                packetDbId
              )
          )
      );

      if (
        openPacket &&
        String(
          openPacket.dbId ||
            openPacket.packetId
        ) ===
          String(
            packetDbId
          )
      ) {
        setOpenPacket(
          null
        );
      }

      setSelectedPacketId(
        null
      );

      setSelectedPanelId(
        null
      );

      setActiveView(
        "remaining"
      );

      showMessage(
        `${packet.id} deleted and ${
          panelIds.length
        } panel${
          panelIds.length === 1
            ? ""
            : "s"
        } returned to Remaining.`
      );
    };

  const handleDeleteOpenPacket =
    async () => {
      if (!openPacket) return;

      if (
        !window.confirm(
          `Delete ${openPacket.id} and return its panels to Remaining?`
        )
      ) {
        return;
      }

      try {
        setActionLoading(true);

        await deletePacketAndReturnPanels(
          openPacket
        );
      } catch (error) {
        console.error(
          "Delete open packet error:",
          error
        );

        showMessage(
          error?.message ||
            "Unable to delete packet.",
          "error"
        );
      } finally {
        setActionLoading(false);

        setTimeout(
          () =>
            inputRef.current?.focus(),
          50
        );
      }
    };

  const handleDeleteClosedPacket =
    async (packet) => {
      if (!packet) return;

      if (
        !window.confirm(
          `Delete ${packet.id} and return its panels to Remaining?`
        )
      ) {
        return;
      }

      try {
        setActionLoading(true);

        await deletePacketAndReturnPanels(
          packet
        );
      } catch (error) {
        console.error(
          "Delete packet error:",
          error
        );

        showMessage(
          error?.message ||
            "Unable to delete packet.",
          "error"
        );
      } finally {
        setActionLoading(false);
      }
    };

  /* =========================================================
     SITE CHANGE
  ========================================================= */

  const handleSiteChange =
    (event) => {
      const newSiteId =
        event.target.value;

      if (
        openPacket?.panelIds
          ?.length
      ) {
        if (
          !window.confirm(
            `Packet ${openPacket.id} is still open. Change site anyway?`
          )
        ) {
          return;
        }
      }

      setSelectedSiteId(
        newSiteId
      );

      setActiveView(
        "remaining"
      );

      setOpenPacket(null);

      setSelectedPacketId(
        null
      );

      setSelectedPanelId(
        null
      );

      setManualQR("");

      setMessage("");
    };

  /* =========================================================
     SELECTED PACKET
  ========================================================= */

  const selectedPacket =
    useMemo(
      () =>
        closedPackets.find(
          (packet) =>
            String(
              packet.id
            ) ===
            String(
              selectedPacketId
            )
        ),

      [
        closedPackets,
        selectedPacketId,
      ]
    );

  /* =========================================================
     SELECTED PANEL
  ========================================================= */

  const selectedPanel =
    useMemo(
      () =>
        sitePanels.find(
          (panel) =>
            String(
              panel.id
            ) ===
            String(
              selectedPanelId
            )
        ),

      [
        sitePanels,
        selectedPanelId,
      ]
    );

  const handleSelectPanel =
    (panel) =>
      setSelectedPanelId(
        panel.id
      );

  /* =========================================================
     DIMENSIONS
  ========================================================= */

  const getPanelDimensions =
    (panel) =>
      `T ${getPanelThickness(
        panel
      )} × L ${getPanelLength(
        panel
      )} × W ${getPanelWidth(
        panel
      )}`;

  /* =========================================================
     TOP CARD STYLE
  ========================================================= */

  const topButtonStyle = (
    active,
    type = "blue"
  ) => {
    const colors = {
      blue: {
        border:
          "#2563eb",
        background:
          "#eff6ff",
        text:
          "#1d4ed8",
      },

      green: {
        border:
          "#16a34a",
        background:
          "#f0fdf4",
        text:
          "#15803d",
      },

      purple: {
        border:
          "#7c3aed",
        background:
          "#f5f3ff",
        text:
          "#6d28d9",
      },
    };

    const c =
      colors[type];

    return {
      flex:
        "1 1 0",

      minWidth: 0,

      border: active
        ? `1px solid ${c.border}`
        : "1px solid #e5e7eb",

      background:
        active
          ? c.background
          : "#fff",

      borderRadius:
        10,

      padding:
        "8px 10px",

      cursor:
        "pointer",

      textAlign:
        "left",
    };
  };

  /* =========================================================
     PANEL CARD
  ========================================================= */

  const renderPanelCard =
    (
      panel,
      index
    ) => {
      const active =
        String(
          panel.id
        ) ===
        String(
          selectedPanelId
        );

      const isInOpenPacket =
        openPacket?.panelIds?.some(
          (id) =>
            String(id) ===
            String(panel.id)
        );

      const remarks =
        getPanelRemarks(
          panel
        );

      return (
        <div
          key={
            panel.id ||
            `${index}-${getPanelLabel(
              panel
            )}`
          }
          onClick={() =>
            handleSelectPanel(
              panel
            )
          }
          style={{
            border: active
              ? "2px solid #2563eb"
              : "1px solid #e5e7eb",

            background: active
              ? "#eff6ff"
              : "#fff",

            borderRadius: 9,

            padding:
              "9px 10px",

            cursor:
              "pointer",

            minHeight: 68,

            boxShadow: active
              ? "0 2px 8px rgba(37,99,235,0.08)"
              : "none",
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

              gap: 7,
            }}
          >
            <strong
              style={{
                fontSize:
                  14,

                lineHeight:
                  1.15,

                color:
                  "#111827",

                overflow:
                  "hidden",

                textOverflow:
                  "ellipsis",

                whiteSpace:
                  "nowrap",

                flex: 1,
              }}
            >
              {getPanelLabel(
                panel,
                index
              )}
            </strong>

            {isInOpenPacket && (
              <span
                style={{
                  flexShrink: 0,

                  fontSize: 8,

                  background:
                    "#fff7ed",

                  color:
                    "#c2410c",

                  padding:
                    "3px 5px",

                  borderRadius:
                    4,

                  fontWeight:
                    800,
                }}
              >
                OPEN
              </span>
            )}
          </div>

          <div
            style={{
              marginTop: 5,

              fontSize: 12,

              color:
                "#374151",

              fontWeight: 700,

              lineHeight:
                1.25,
            }}
          >
            {getPanelDimensions(
              panel
            )}

            {panel?.quantity !=
              null
              ? ` • Qty ${panel.quantity}`
              : ""}
          </div>

          {remarks && (
            <div
              style={{
                marginTop: 4,

                fontSize: 10,

                color:
                  "#6b7280",

                whiteSpace:
                  "nowrap",

                overflow:
                  "hidden",

                textOverflow:
                  "ellipsis",
              }}
            >
              Remarks:
              {" "}
              {remarks}
            </div>
          )}
        </div>
      );
    };

  /* =========================================================
     PANEL LIST
  ========================================================= */

  const renderPanelList =
    (
      list,
      emptyText = "No panels"
    ) => {
      if (!list.length) {
        return (
          <div
            style={{
              height:
                "100%",

              minHeight:
                160,

              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              textAlign:
                "center",

              color:
                "#6b7280",

              border:
                "1px dashed #d1d5db",

              borderRadius:
                10,

              padding:
                20,
            }}
          >
            <div>
              <div
                style={{
                  fontSize:
                    28,

                  marginBottom:
                    6,
                }}
              >
                ✓
              </div>

              <strong>
                {
                  emptyText
                }
              </strong>
            </div>
          </div>
        );
      }

      return (
        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(auto-fill, minmax(250px, 1fr))",

            gap: 8,

            overflowY:
              "auto",

            height:
              "100%",

            paddingRight:
              3,

            alignContent:
              "start",
          }}
        >
          {list.map(
            renderPanelCard
          )}
        </div>
      );
    };

  /* =========================================================
     OPEN PACKET PANEL
  ========================================================= */

  const renderOpenPacketPanels =
    () => {
      if (!openPacket)
        return null;

      const packetPanels =
        getPacketPanels(
          openPacket
        );

      return (
        <div
          style={{
            marginBottom:
              8,

            border:
              "1px solid #fed7aa",

            background:
              "#fff7ed",

            borderRadius:
              9,

            padding: 8,
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
                6,

              gap: 8,
            }}
          >
            <div>
              <strong
                style={{
                  color:
                    "#c2410c",

                  fontSize:
                    12,
                }}
              >
                📦{" "}
                {
                  openPacket.id
                }
              </strong>

              <div
                style={{
                  fontSize:
                    9,

                  color:
                    "#6b7280",

                  marginTop:
                    2,
                }}
              >
                {
                  packetPanels.length
                }{" "}
                panel
                {packetPanels.length ===
                1
                  ? ""
                  : "s"}{" "}
                in current
                packet
              </div>
            </div>

            <div
              style={{
                display:
                  "flex",

                gap: 5,
              }}
            >
              <button
                disabled={
                  actionLoading
                }
                onClick={
                  handleClosePacket
                }
                style={{
                  border:
                    "1px solid #16a34a",

                  background:
                    "#f0fdf4",

                  color:
                    "#15803d",

                  borderRadius:
                    6,

                  padding:
                    "6px 9px",

                  fontWeight:
                    800,

                  cursor:
                    actionLoading
                      ? "not-allowed"
                      : "pointer",

                  fontSize:
                    10,
                }}
              >
                ✓ CLOSE &
                PRINT
              </button>

              <button
                disabled={
                  actionLoading
                }
                onClick={
                  handleDeleteOpenPacket
                }
                style={{
                  width: 30,

                  height: 30,

                  border:
                    "1px solid #fecaca",

                  background:
                    "#fff",

                  color:
                    "#dc2626",

                  borderRadius:
                    6,

                  fontWeight:
                    800,

                  cursor:
                    actionLoading
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div
            style={{
              maxHeight:
                74,

              overflowY:
                "auto",

              display:
                "grid",

              gap: 3,
            }}
          >
            {packetPanels.map(
              (
                panel,
                index
              ) => (
                <div
                  key={
                    panel.id
                  }
                  style={{
                    display:
                      "flex",

                    justifyContent:
                      "space-between",

                    alignItems:
                      "center",

                    gap: 8,

                    background:
                      "#fff",

                    border:
                      "1px solid #e5e7eb",

                    borderRadius:
                      5,

                    padding:
                      "4px 6px",
                  }}
                >
                  <strong
                    style={{
                      fontSize:
                        10,
                    }}
                  >
                    {index +
                      1}
                    .{" "}
                    {getPanelLabel(
                      panel
                    )}
                  </strong>

                  <button
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      handleDeletePanelFromOpenPacket(
                        panel
                      )
                    }
                    style={{
                      border:
                        "1px solid #fecaca",

                      background:
                        "#fff",

                      color:
                        "#dc2626",

                      borderRadius:
                        4,

                      padding:
                        "2px 6px",

                      cursor:
                        actionLoading
                          ? "not-allowed"
                          : "pointer",

                      fontWeight:
                        700,
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      );
    };

  /* =========================================================
     PACKET CARD
     
     IMPORTANT:
     Packet QR is intentionally NOT visible here.
  ========================================================= */

  const renderPacketCard =
    (packet) => {
      const active =
        String(
          selectedPacketId
        ) ===
        String(
          packet.id
        );

      const dispatched =
        isPacketDispatched(
          packet
        );

      return (
        <button
          key={
            packet.dbId ||
            packet.packetId ||
            packet.id
          }
          onClick={() => {
            setSelectedPacketId(
              packet.id
            );

            setSelectedPanelId(
              null
            );

            setActiveView(
              "packets"
            );
          }}
          style={{
            width:
              "100%",

            minHeight:
              70,

            border: active
              ? "2px solid #2563eb"
              : "1px solid #e5e7eb",

            background:
              active
                ? "#eff6ff"
                : "#fff",

            borderRadius:
              8,

            padding:
              "13px 12px",

            cursor:
              "pointer",

            textAlign:
              "left",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "space-between",

            gap: 10,

            transition:
              "all 0.15s ease",
          }}
        >
          <strong
            style={{
              fontSize:
                14,

              color:
                "#111827",

              overflow:
                "hidden",

              textOverflow:
                "ellipsis",

              whiteSpace:
                "nowrap",

              flex: 1,
            }}
          >
            {packet.id}
          </strong>

          <span
            style={{
              flexShrink:
                0,

              fontSize:
                8,

              padding:
                "4px 7px",

              borderRadius:
                4,

              fontWeight:
                800,

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
              : "READY"}
          </span>
        </button>
      );
    };

  /* =========================================================
     PACKET HISTORY
     
     READY FIRST
     DISPATCHED SECOND
     
     3 COLUMNS
  ========================================================= */

  const renderPacketHistory =
    () => {
      const hasPackets =
        readyPackets.length >
          0 ||
        dispatchedPackets.length >
          0;

      if (!hasPackets) {
        return (
          <div
            style={{
              height:
                "100%",

              minHeight:
                180,

              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              textAlign:
                "center",

              color:
                "#6b7280",

              border:
                "1px dashed #d1d5db",

              borderRadius:
                10,
            }}
          >
            <div>
              <div
                style={{
                  fontSize:
                    30,

                  marginBottom:
                    6,
                }}
              >
                📦
              </div>

              <strong>
                No packet history yet
              </strong>

              <div
                style={{
                  fontSize:
                    11,

                  marginTop:
                    4,
                }}
              >
                Scan panels and
                close packets when
                ready.
              </div>
            </div>
          </div>
        );
      }

      return (
        <div
          style={{
            height:
              "100%",

            display:
              "flex",

            flexDirection:
              "column",

            minHeight:
              0,

            overflowY:
              "auto",

            paddingRight:
              2,
          }}
        >
          {/* PACKET SUMMARY */}

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(3, minmax(0, 1fr))",

              gap: 7,

              marginBottom:
                10,

              flexShrink:
                0,
            }}
          >
            <div
              style={{
                border:
                  "1px solid #e5e7eb",

                borderRadius:
                  7,

                padding:
                  "6px 8px",

                background:
                  "#fff",
              }}
            >
              <small
                style={{
                  color:
                    "#6b7280",

                  fontWeight:
                    700,

                  fontSize:
                    8,
                }}
              >
                TOTAL PACKETS
              </small>

              <strong
                style={{
                  display:
                    "block",

                  marginTop:
                    1,

                  fontSize:
                    18,
                }}
              >
                {
                  totalPackets
                }
              </strong>
            </div>

            <div
              style={{
                border:
                  "1px solid #bbf7d0",

                borderRadius:
                  7,

                padding:
                  "6px 8px",

                background:
                  "#f0fdf4",
              }}
            >
              <small
                style={{
                  color:
                    "#15803d",

                  fontWeight:
                    700,

                  fontSize:
                    8,
                }}
              >
                READY
              </small>

              <strong
                style={{
                  display:
                    "block",

                  marginTop:
                    1,

                  fontSize:
                    18,

                  color:
                    "#2563eb",
                }}
              >
                {
                  readyPacketCount
                }
              </strong>
            </div>

            <div
              style={{
                border:
                  "1px solid #bbf7d0",

                borderRadius:
                  7,

                padding:
                  "6px 8px",

                background:
                  "#f0fdf4",
              }}
            >
              <small
                style={{
                  color:
                    "#15803d",

                  fontWeight:
                    700,

                  fontSize:
                    8,
                }}
              >
                DISPATCHED
              </small>

              <strong
                style={{
                  display:
                    "block",

                  marginTop:
                    1,

                  fontSize:
                    18,

                  color:
                    "#16a34a",
                }}
              >
                {
                  dispatchedPacketCount
                }
              </strong>
            </div>
          </div>

          {/* READY */}

          {readyPackets.length >
            0 && (
            <div
              style={{
                marginBottom:
                  14,
              }}
            >
              <div
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  gap: 7,

                  marginBottom:
                    7,
                }}
              >
                <span
                  style={{
                    width: 7,

                    height: 7,

                    borderRadius:
                      "50%",

                    background:
                      "#2563eb",
                  }}
                />

                <strong
                  style={{
                    fontSize:
                      13,

                    color:
                      "#1d4ed8",
                  }}
                >
                  READY
                </strong>

                <span
                  style={{
                    fontSize:
                      10,

                    color:
                      "#6b7280",
                  }}
                >
                  {
                    readyPacketCount
                  }{" "}
                  packet
                  {readyPacketCount ===
                  1
                    ? ""
                    : "s"}
                </span>
              </div>

              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "repeat(3, minmax(0, 1fr))",

                  gap: 7,
                }}
              >
                {readyPackets.map(
                  renderPacketCard
                )}
              </div>
            </div>
          )}

          {/* DISPATCHED */}

          {dispatchedPackets.length >
            0 && (
            <div>
              <div
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  gap: 7,

                  marginBottom:
                    7,
                }}
              >
                <span
                  style={{
                    width: 7,

                    height: 7,

                    borderRadius:
                      "50%",

                    background:
                      "#16a34a",
                  }}
                />

                <strong
                  style={{
                    fontSize:
                      13,

                    color:
                      "#15803d",
                  }}
                >
                  DISPATCHED
                </strong>

                <span
                  style={{
                    fontSize:
                      10,

                    color:
                      "#6b7280",
                  }}
                >
                  {
                    dispatchedPacketCount
                  }{" "}
                  packet
                  {dispatchedPacketCount ===
                  1
                    ? ""
                    : "s"}
                </span>
              </div>

              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "repeat(3, minmax(0, 1fr))",

                  gap: 7,
                }}
              >
                {dispatchedPackets.map(
                  renderPacketCard
                )}
              </div>
            </div>
          )}
        </div>
      );
    };

  /* =========================================================
     SELECTED PACKET DETAILS
     
     QR IMAGE IS NOT SHOWN.
     PRINT BUTTON IS SHOWN.
  ========================================================= */

  const renderSelectedPacket =
    () => {
      if (!selectedPacket)
        return null;

      const packetPanels =
        getPacketPanels(
          selectedPacket
        );

      const dispatched =
        isPacketDispatched(
          selectedPacket
        );

      return (
        <div
          style={{
            height:
              "100%",

            display:
              "flex",

            flexDirection:
              "column",

            minHeight:
              0,
          }}
        >
          {/* HEADER */}

          <div
            style={{
              display:
                "flex",

              justifyContent:
                "space-between",

              alignItems:
                "center",

              gap: 8,

              marginBottom:
                8,

              flexShrink:
                0,
            }}
          >
            <button
              onClick={() => {
                setSelectedPacketId(
                  null
                );

                setSelectedPanelId(
                  null
                );
              }}
              style={{
                border:
                  "1px solid #d1d5db",

                background:
                  "#fff",

                color:
                  "#374151",

                borderRadius:
                  6,

                padding:
                  "7px 10px",

                cursor:
                  "pointer",

                fontWeight:
                  800,

                fontSize:
                  10,
              }}
            >
              ← Back
            </button>

            <div
              style={{
                flex: 1,

                minWidth:
                  0,

                textAlign:
                  "center",
              }}
            >
              <small
                style={{
                  color:
                    dispatched
                      ? "#16a34a"
                      : "#2563eb",

                  fontWeight:
                    800,

                  fontSize:
                    9,
                }}
              >
                {dispatched
                  ? "DISPATCHED PACKET"
                  : "READY PACKET"}
              </small>

              <h3
                style={{
                  margin:
                    "2px 0 0",

                  fontSize:
                    17,

                  overflow:
                    "hidden",

                  textOverflow:
                    "ellipsis",

                  whiteSpace:
                    "nowrap",
                }}
              >
                {selectedPacket.id}
              </h3>
            </div>

            {/* PRINT PACKET QR */}

            <button
              disabled={
                actionLoading
              }
              onClick={() =>
                printPacketLabel(
                  selectedPacket,
                  selectedSite
                )
              }
              style={{
                border:
                  "1px solid #2563eb",

                background:
                  "#eff6ff",

                color:
                  "#1d4ed8",

                borderRadius:
                  6,

                padding:
                  "7px 10px",

                cursor:
                  actionLoading
                    ? "not-allowed"
                    : "pointer",

                fontWeight:
                  800,

                fontSize:
                  10,

                whiteSpace:
                  "nowrap",
              }}
            >
              🖨 Print Packet QR
            </button>
          </div>

          {/* DISPATCH TIME */}

          {dispatched &&
            getDispatchTimestamp(
              selectedPacket
            ) && (
              <div
                style={{
                  marginBottom:
                    7,

                  padding:
                    "6px 8px",

                  border:
                    "1px solid #bbf7d0",

                  background:
                    "#f0fdf4",

                  borderRadius:
                    6,

                  color:
                    "#166534",

                  fontSize:
                    10,

                  fontWeight:
                    700,

                  flexShrink:
                    0,
                }}
              >
                ✓ Dispatched:{" "}
                {formatDateTime(
                  getDispatchTimestamp(
                    selectedPacket
                  )
                )}
              </div>
            )}

          {/* PACKET INFO */}

          <div
            style={{
              marginBottom:
                7,

              padding:
                "8px 10px",

              border:
                "1px solid #e5e7eb",

              background:
                "#f8fafc",

              borderRadius:
                7,

              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "space-between",

              gap: 10,

              flexShrink:
                0,
            }}
          >
            <div>
              <div
                style={{
                  fontSize:
                    8,

                  color:
                    "#6b7280",

                  fontWeight:
                    700,
                }}
              >
                PACKET
              </div>

              <strong
                style={{
                  fontSize:
                    13,
                }}
              >
                {
                  selectedPacket.id
                }
              </strong>
            </div>

            <div
              style={{
                textAlign:
                  "right",
              }}
            >
              <div
                style={{
                  fontSize:
                    8,

                  color:
                    "#6b7280",

                  fontWeight:
                    700,
                }}
              >
                PANELS
              </div>

              <strong
                style={{
                  fontSize:
                    16,

                  color:
                    "#2563eb",
                }}
              >
                {
                  packetPanels.length
                }
              </strong>
            </div>
          </div>

          {/* PANELS */}

          <div
            style={{
              flex: 1,

              minHeight:
                0,

              border:
                "1px solid #e5e7eb",

              borderRadius:
                9,

              background:
                "#fff",

              padding: 9,

              display:
                "flex",

              flexDirection:
                "column",
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
                  7,
              }}
            >
              <strong
                style={{
                  fontSize:
                    15,
                }}
              >
                Panels in Packet
              </strong>

              <span
                style={{
                  fontSize:
                    13,

                  fontWeight:
                    800,

                  color:
                    "#2563eb",
                }}
              >
                {
                  packetPanels.length
                }
              </span>
            </div>

            <div
              style={{
                flex: 1,

                minHeight:
                  0,

                overflowY:
                  "auto",

                display:
                  "grid",

                gridTemplateColumns:
                  "repeat(auto-fill, minmax(270px, 1fr))",

                gap: 7,

                alignContent:
                  "start",
              }}
            >
              {packetPanels.map(
                (
                  panel,
                  index
                ) => (
                  <div
                    key={
                      panel.id ||
                      `${selectedPacket.id}-${index}`
                    }
                    onClick={() =>
                      handleSelectPanel(
                        panel
                      )
                    }
                    style={{
                      border:
                        String(
                          selectedPanelId
                        ) ===
                        String(
                          panel.id
                        )
                          ? "2px solid #2563eb"
                          : "1px solid #e5e7eb",

                      background:
                        String(
                          selectedPanelId
                        ) ===
                        String(
                          panel.id
                        )
                          ? "#eff6ff"
                          : "#fff",

                      borderRadius:
                        8,

                      padding:
                        9,

                      cursor:
                        "pointer",
                    }}
                  >
                    <div
                      style={{
                        display:
                          "flex",

                        justifyContent:
                          "space-between",

                        gap: 7,
                      }}
                    >
                      <strong
                        style={{
                          fontSize:
                            13,
                        }}
                      >
                        {index +
                          1}
                        .{" "}
                        {getPanelNameForPrint(
                          panel
                        )}
                      </strong>

                      <span
                        style={{
                          fontSize:
                            9,

                          fontWeight:
                            700,

                          color:
                            "#6b7280",
                        }}
                      >
                        {getPanelLabelNumberForPrint(
                          panel
                        )}
                      </span>
                    </div>

                    <div
                      style={{
                        marginTop:
                          5,

                        fontSize:
                          10,

                        color:
                          "#6b7280",
                      }}
                    >
                      Section:{" "}
                      {getPanelSectionForPrint(
                        panel
                      )}
                    </div>

                    <div
                      style={{
                        marginTop:
                          6,

                        display:
                          "inline-block",

                        padding:
                          "4px 6px",

                        background:
                          "#f8fafc",

                        border:
                          "1px solid #e5e7eb",

                        borderRadius:
                          4,

                        fontSize:
                          10,

                        fontWeight:
                          800,

                        color:
                          "#374151",
                      }}
                    >
                      {getPanelDimensions(
                        panel
                      )}
                    </div>

                    {getPanelRemarks(
                      panel
                    ) && (
                      <div
                        style={{
                          marginTop:
                            5,

                          fontSize:
                            9,

                          color:
                            "#6b7280",
                        }}
                      >
                        Remarks:{" "}
                        {getPanelRemarks(
                          panel
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>

          {/* DELETE */}

          <div
            style={{
              marginTop:
                7,

              display:
                "flex",

              justifyContent:
                "flex-end",

              flexShrink:
                0,
            }}
          >
            <button
              disabled={
                actionLoading
              }
              onClick={() =>
                handleDeleteClosedPacket(
                  selectedPacket
                )
              }
              style={{
                border:
                  "1px solid #fecaca",

                background:
                  "#fff",

                color:
                  "#dc2626",

                borderRadius:
                  6,

                padding:
                  "6px 10px",

                cursor:
                  actionLoading
                    ? "not-allowed"
                    : "pointer",

                fontWeight:
                  700,

                fontSize:
                  10,
              }}
            >
              Delete Packet
            </button>
          </div>
        </div>
      );
    };

  /* =========================================================
     WORKSPACE
  ========================================================= */

  const renderWorkspace =
    () => {
      if (
        activeView ===
          "packets" &&
        selectedPacket
      ) {
        return renderSelectedPacket();
      }

      if (
        activeView ===
        "remaining"
      ) {
        return (
          <div
            style={{
              height:
                "100%",

              display:
                "flex",

              flexDirection:
                "column",

              minHeight:
                0,
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
                  7,

                flexShrink:
                  0,
              }}
            >
              <div>
                <strong
                  style={{
                    fontSize:
                      16,
                  }}
                >
                  Remaining Panels
                </strong>

                <div
                  style={{
                    fontSize:
                      10,

                    color:
                      "#6b7280",

                    marginTop:
                      2,
                  }}
                >
                  Panels waiting to
                  be packed
                </div>
              </div>

              <span
                style={{
                  fontWeight:
                    800,

                  color:
                    "#2563eb",

                  fontSize:
                    16,
                }}
              >
                {
                  remainingCount
                }
              </span>
            </div>

            {renderOpenPacketPanels()}

            <div
              style={{
                flex: 1,

                minHeight:
                  0,
              }}
            >
              {renderPanelList(
                remainingPanels,
                "All panels are packed."
              )}
            </div>
          </div>
        );
      }

      if (
        activeView ===
        "packed"
      ) {
        return (
          <div
            style={{
              height:
                "100%",

              display:
                "flex",

              flexDirection:
                "column",

              minHeight:
                0,
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
                  7,

                flexShrink:
                  0,
              }}
            >
              <div>
                <strong
                  style={{
                    fontSize:
                      16,
                  }}
                >
                  Packed Panels
                </strong>

                <div
                  style={{
                    fontSize:
                      10,

                    color:
                      "#6b7280",

                    marginTop:
                      2,
                  }}
                >
                  Panels already
                  packed
                </div>
              </div>

              <span
                style={{
                  fontWeight:
                    800,

                  color:
                    "#16a34a",

                  fontSize:
                    16,
                }}
              >
                {
                  packedCount
                }
              </span>
            </div>

            <div
              style={{
                flex: 1,

                minHeight:
                  0,
              }}
            >
              {renderPanelList(
                packedPanels
              )}
            </div>
          </div>
        );
      }

      return (
        <div
          style={{
            height:
              "100%",

            display:
              "flex",

            flexDirection:
              "column",

            minHeight:
              0,
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
                7,

              flexShrink:
                0,
            }}
          >
            <div>
              <strong
                style={{
                  fontSize:
                    16,
                }}
              >
                Packet History
              </strong>

              <div
                style={{
                  fontSize:
                    10,

                  color:
                    "#6b7280",

                  marginTop:
                    2,
                }}
              >
                Ready packets first •
                dispatched packets below
              </div>
            </div>

            <span
              style={{
                fontWeight:
                  800,

                color:
                  "#7c3aed",

                fontSize:
                  16,
              }}
            >
              {
                totalPackets
              }
            </span>
          </div>

          <div
            style={{
              flex: 1,

              minHeight:
                0,
            }}
          >
            {renderPacketHistory()}
          </div>
        </div>
      );
    };

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div
        style={{
          width:
            "100%",

          padding:
            50,

          textAlign:
            "center",
        }}
      >
        <div
          style={{
            fontSize:
              30,

            marginBottom:
              10,
          }}
        >
          ⟳
        </div>

        <strong>
          Loading QR Tracking...
        </strong>

        <p
          style={{
            color:
              "#6b7280",

            fontSize:
              13,
          }}
        >
          Reading sites,
          panels and packets
          from Supabase.
        </p>
      </div>
    );
  }

  /* =========================================================
     NO SITES
  ========================================================= */

  if (!sites.length) {
    return (
      <div
        style={{
          width:
            "100%",

          padding:
            30,

          boxSizing:
            "border-box",
        }}
      >
        <div
          style={{
            maxWidth:
              650,

            margin:
              "0 auto",

            background:
              "#fff",

            border:
              "1px solid #e5e7eb",

            borderRadius:
              14,

            padding:
              45,

            textAlign:
              "center",
          }}
        >
          <div
            style={{
              fontSize:
                40,

              marginBottom:
                10,
            }}
          >
            ▤
          </div>

          <h2
            style={{
              margin:
                "0 0 7px",
            }}
          >
            No sites available
          </h2>

          <p
            style={{
              margin: 0,

              color:
                "#6b7280",
            }}
          >
            Import a cutlist
            first to create a
            site and generate
            QR panels.
          </p>
        </div>
      </div>
    );
  }

  /* =========================================================
     MAIN SCREEN
  ========================================================= */

  return (
    <div
      style={{
        width:
          "100%",

        height:
          "calc(100vh - 90px)",

        minHeight:
          620,

        boxSizing:
          "border-box",

        overflow:
          "hidden",

        padding: 10,

        background:
          "#f8fafc",

        position:
          "relative",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          height:
            45,

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "space-between",

          gap: 12,

          marginBottom:
            8,
        }}
      >
        <div>
          <div
            style={{
              fontSize:
                9,

              fontWeight:
                800,

              color:
                "#2563eb",

              letterSpacing:
                "0.08em",
            }}
          >
            TRACKERZ
          </div>

          <h2
            style={{
              margin:
                "1px 0 0",

              fontSize:
                20,

              lineHeight:
                1,
            }}
          >
            QR Tracking
          </h2>
        </div>

        <div
          style={{
            width:
              310,
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
              width:
                "100%",

              height:
                38,

              padding:
                "0 11px",

              border:
                "1px solid #d1d5db",

              borderRadius:
                8,

              background:
                "#fff",

              fontWeight:
                700,

              cursor:
                "pointer",

              outline:
                "none",
            }}
          >
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
      </div>

      {selectedSite && (
        <div
          style={{
            height:
              "calc(100% - 53px)",

            display:
              "flex",

            flexDirection:
              "column",

            minHeight:
              0,
          }}
        >
          {/* =================================================
              TOP STAT CARDS
          ================================================= */}

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(4, minmax(0, 1fr))",

              gap: 7,

              height:
                61,

              flexShrink:
                0,

              marginBottom:
                7,
            }}
          >
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
                  display:
                    "block",

                  color:
                    "#6b7280",

                  fontWeight:
                    700,

                  fontSize:
                    8,
                }}
              >
                TOTAL PANELS
              </small>

              <strong
                style={{
                  display:
                    "block",

                  fontSize:
                    19,

                  marginTop:
                    2,
                }}
              >
                {
                  totalPanels
                }
              </strong>
            </button>

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
                  display:
                    "block",

                  color:
                    "#6b7280",

                  fontWeight:
                    700,

                  fontSize:
                    8,
                }}
              >
                PACKED PANELS
              </small>

              <strong
                style={{
                  display:
                    "block",

                  fontSize:
                    19,

                  marginTop:
                    2,
                }}
              >
                {
                  packedCount
                }
              </strong>
            </button>

            <button
              onClick={() => {
                setActiveView(
                  "packets"
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
                  display:
                    "block",

                  color:
                    "#6b7280",

                  fontWeight:
                    700,

                  fontSize:
                    8,
                }}
              >
                TOTAL PACKETS
              </small>

              <strong
                style={{
                  display:
                    "block",

                  fontSize:
                    19,

                  marginTop:
                    2,
                }}
              >
                {
                  totalPackets
                }
              </strong>
            </button>

            <div
              style={{
                border:
                  "1px solid #e5e7eb",

                background:
                  "#fff",

                borderRadius:
                  10,

                padding:
                  "8px 10px",
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
                }}
              >
                <small
                  style={{
                    color:
                      "#6b7280",

                    fontWeight:
                      700,

                    fontSize:
                      8,
                  }}
                >
                  PACKING PROGRESS
                </small>

                <strong>
                  {
                    progress
                  }
                  %
                </strong>
              </div>

              <div
                style={{
                  height:
                    6,

                  background:
                    "#e5e7eb",

                  borderRadius:
                    10,

                  overflow:
                    "hidden",

                  marginTop:
                    6,
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

                    transition:
                      "width 0.2s ease",
                  }}
                />
              </div>

              <div
                style={{
                  marginTop:
                    3,

                  fontSize:
                    8,

                  color:
                    "#6b7280",
                }}
              >
                {
                  packedCount
                }{" "}
                packed •{" "}
                {
                  remainingCount
                }{" "}
                remaining
              </div>
            </div>
          </div>

          {/* =================================================
              SCANNER
          ================================================= */}

          <div
            style={{
              display:
                "flex",

              justifyContent:
                "space-between",

              alignItems:
                "stretch",

              gap: 8,

              marginBottom:
                7,

              marginTop:
                10,

              flexShrink:
                0,
            }}
          >
            <div
              style={{
                width:
                  350,

                maxWidth:
                  "45%",

                minWidth:
                  290,

                border:
                  "1px solid #bfdbfe",

                background:
                  "#fff",

                borderRadius:
                  8,

                padding:
                  "6px 7px",

                boxSizing:
                  "border-box",
              }}
            >
              <div
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  gap: 6,

                  marginBottom:
                    4,
                }}
              >
                <span
                  style={{
                    width: 6,

                    height: 6,

                    borderRadius:
                      "50%",

                    background:
                      "#2563eb",

                    flexShrink:
                      0,
                  }}
                />

                <strong
                  style={{
                    fontSize:
                      10,
                  }}
                >
                  Scan Panel QR
                </strong>

                <span
                  style={{
                    marginLeft:
                      "auto",

                    fontSize:
                      8,

                    color:
                      "#6b7280",
                  }}
                >
                  Factory Scanner
                </span>
              </div>

              <div
                style={{
                  display:
                    "flex",

                  gap: 5,
                }}
              >
                <input
                  ref={
                    inputRef
                  }
                  autoFocus
                  value={
                    manualQR
                  }
                  onChange={(
                    event
                  ) =>
                    setManualQR(
                      event.target
                        .value
                    )
                  }
                  onKeyDown={
                    handleQRKeyDown
                  }
                  placeholder="Scan QR..."
                  style={{
                    flex: 1,

                    minWidth:
                      0,

                    height:
                      32,

                    boxSizing:
                      "border-box",

                    padding:
                      "0 8px",

                    border:
                      "1px solid #2563eb",

                    borderRadius:
                      6,

                    background:
                      "#fff",

                    outline:
                      "none",

                    fontSize:
                      11,
                  }}
                />

                <button
                  disabled={
                    actionLoading
                  }
                  onClick={
                    handleScanPanel
                  }
                  style={{
                    height:
                      32,

                    padding:
                      "0 12px",

                    border: 0,

                    borderRadius:
                      6,

                    background:
                      actionLoading
                        ? "#9ca3af"
                        : "#2563eb",

                    color:
                      "#fff",

                    fontWeight:
                      800,

                    cursor:
                      actionLoading
                        ? "not-allowed"
                        : "pointer",

                    fontSize:
                      10,
                  }}
                >
                  {actionLoading
                    ? "..."
                    : "SCAN"}
                </button>
              </div>
            </div>

            {/* CURRENT OPEN PACKET */}

            {openPacket && (
              <div
                style={{
                  flex: 1,

                  minWidth:
                    0,

                  border:
                    "1px solid #fed7aa",

                  background:
                    "#fff7ed",

                  borderRadius:
                    8,

                  padding:
                    "6px 8px",

                  display:
                    "flex",

                  alignItems:
                    "center",

                  gap: 7,
                }}
              >
                <div
                  style={{
                    flex: 1,

                    minWidth:
                      0,
                  }}
                >
                  <small
                    style={{
                      display:
                        "block",

                      color:
                        "#c2410c",

                      fontWeight:
                        700,

                      fontSize:
                        8,
                    }}
                  >
                    CURRENT OPEN
                    PACKET
                  </small>

                  <strong
                    style={{
                      display:
                        "block",

                      marginTop:
                        2,

                      fontSize:
                        12,

                      overflow:
                        "hidden",

                      textOverflow:
                        "ellipsis",

                      whiteSpace:
                        "nowrap",
                    }}
                  >
                    📦{" "}
                    {
                      openPacket.id
                    }
                  </strong>
                </div>

                <span
                  style={{
                    fontSize:
                      9,

                    color:
                      "#c2410c",

                    fontWeight:
                      700,

                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {
                    openPacket
                      .panelIds
                      ?.length ||
                    0
                  }{" "}
                  panels
                </span>

                <button
                  disabled={
                    actionLoading
                  }
                  onClick={
                    handleClosePacket
                  }
                  style={{
                    height:
                      32,

                    padding:
                      "0 10px",

                    border:
                      "1px solid #16a34a",

                    borderRadius:
                      6,

                    background:
                      "#f0fdf4",

                    color:
                      "#15803d",

                    fontWeight:
                      800,

                    cursor:
                      actionLoading
                        ? "not-allowed"
                        : "pointer",

                    fontSize:
                      9,
                  }}
                >
                  ✓ CLOSE &
                  PRINT
                </button>

                <button
                  disabled={
                    actionLoading
                  }
                  onClick={
                    handleDeleteOpenPacket
                  }
                  style={{
                    width:
                      30,

                    height:
                      30,

                    border:
                      "1px solid #fecaca",

                    borderRadius:
                      6,

                    background:
                      "#fff",

                    color:
                      "#dc2626",

                    fontWeight:
                      800,

                    cursor:
                      actionLoading
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* =================================================
              MESSAGE
          ================================================= */}

          {message && (
            <div
              style={{
                minHeight:
                  28,

                flexShrink:
                  0,

                boxSizing:
                  "border-box",

                display:
                  "flex",

                alignItems:
                  "center",

                padding:
                  "0 9px",

                borderRadius:
                  6,

                marginBottom:
                  6,

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
                  10,

                fontWeight:
                  700,
              }}
            >
              {
                message
              }
            </div>
          )}

          {/* =================================================
              MAIN WORKSPACE
          ================================================= */}

          <div
            style={{
              flex: 1,

              minHeight:
                0,

              display:
                "grid",

              gridTemplateColumns:
                "minmax(0, 1fr)",

              gap: 7,
            }}
          >
            <div
              style={{
                minWidth:
                  0,

                minHeight:
                  0,

                background:
                  "#fff",

                border:
                  "1px solid #e5e7eb",

                borderRadius:
                  10,

                padding:
                  10,

                boxSizing:
                  "border-box",

                overflow:
                  "hidden",
              }}
            >
              {
                renderWorkspace()
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QRTracking;