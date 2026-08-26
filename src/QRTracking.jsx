import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

function QRTracking() {
  // =========================================================
  // STATE
  // =========================================================

  const [sites, setSites] = useState([]);
  const [panels, setPanels] = useState([]);

  const [selectedSiteId, setSelectedSiteId] = useState("");

  const [activeView, setActiveView] = useState("remaining");

  const [manualQR, setManualQR] = useState("");

  // Current OPEN packet from Supabase
  const [openPacket, setOpenPacket] = useState(null);

  // CLOSED packets from Supabase
  const [closedPackets, setClosedPackets] = useState([]);

  const [selectedPacketId, setSelectedPacketId] = useState(null);
  const [selectedPanelId, setSelectedPanelId] = useState(null);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Packet label data shown immediately after a packet is closed.
  const [packetPrintData, setPacketPrintData] = useState(null);

  const inputRef = useRef(null);

  // =========================================================
  // MESSAGE
  // =========================================================

  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);

    window.clearTimeout(window.__trackerzMessageTimer);

    window.__trackerzMessageTimer = window.setTimeout(() => {
      setMessage("");
    }, 3000);
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
  // PANEL STATUS
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
  // PACKED CHECK
  // =========================================================

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

  // =========================================================
  // PANEL LABEL
  // =========================================================

  const getPanelLabel = (panel, index = 0) => {
    return (
      panel?.qr_data ||
      panel?.qrData ||
      panel?.qr_code ||
      panel?.qrCode ||
      panel?.panel_name ||
      panel?.panelName ||
      panel?.panel_id ||
      panel?.panelId ||
      panel?.id ||
      `Panel ${index + 1}`
    );
  };

  // =========================================================
  // PANEL DESCRIPTION
  // =========================================================

  const getPanelDescription = (panel) => {
    const parts = [];

    if (panel?.material) {
      parts.push(panel.material);
    }

    if (
      panel?.length !== undefined &&
      panel?.length !== null &&
      panel?.length !== ""
    ) {
      parts.push(`${panel.length} mm`);
    }

    if (
      panel?.width !== undefined &&
      panel?.width !== null &&
      panel?.width !== ""
    ) {
      parts.push(`${panel.width} mm`);
    }

    if (
      panel?.thickness !== undefined &&
      panel?.thickness !== null &&
      panel?.thickness !== ""
    ) {
      parts.push(`${panel.thickness} mm`);
    }

    if (panel?.description) {
      parts.push(panel.description);
    }

    return parts.join(" • ");
  };

  // =========================================================
  // PACKET PANEL PRINT DETAILS
  // =========================================================

  const getPanelNameForPrint = (panel) => {
    return (
      panel?.fb_name ||
      panel?.panel_name ||
      panel?.panelName ||
      panel?.name ||
      getPanelLabel(panel) ||
      "Panel"
    );
  };

  const getPanelSectionForPrint = (panel) => {
    return (
      panel?.section_name ||
      panel?.sectionName ||
      panel?.section ||
      "-"
    );
  };

  const getPanelLabelNumberForPrint = (panel) => {
    return (
      panel?.assembly_label ||
      panel?.assemblyLabel ||
      panel?.label_number ||
      panel?.labelNumber ||
      panel?.barcode ||
      "-"
    );
  };

  const getPanelLengthForPrint = (panel) => {
    return (
      panel?.length_num ??
      panel?.length ??
      panel?.fb_length ??
      panel?.fbLength ??
      "-"
    );
  };

  const getPanelWidthForPrint = (panel) => {
    return (
      panel?.width_num ??
      panel?.width ??
      panel?.fb_width ??
      panel?.fbWidth ??
      "-"
    );
  };

  const getPanelThicknessForPrint = (panel) => {
    return (
      panel?.thickness_num ??
      panel?.thickness ??
      panel?.thk ??
      "-"
    );
  };

  // =========================================================
  // GENERATE PACKET CODE
  //
  // IMPORTANT:
  // Packet numbering is now INDEPENDENT FOR EACH SITE.
  //
  // Examples:
  //
  // Siva kitchen:
  // PKT-SIVA-KITCHEN-0001
  // PKT-SIVA-KITCHEN-0002
  //
  // EA Units:
  // PKT-EA-UNITS-0001
  // PKT-EA-UNITS-0002
  //
  // AG 2:
  // PKT-AG-2-0001
  // PKT-AG-2-0002
  //
  // Existing random packet numbers are ignored.
  // =========================================================

  const getNextPacketCode = async (siteId) => {
    if (!siteId) {
      throw new Error(
        "Site ID is required to create a packet."
      );
    }

    // -------------------------------------------------------
    // GET SITE NAME
    // -------------------------------------------------------

    const {
      data: site,
      error: siteError,
    } = await supabase
      .from("sites")
      .select("site_name")
      .eq("id", siteId)
      .single();

    if (siteError) {
      console.error(
        "Get site name for packet error:",
        siteError
      );

      throw siteError;
    }

    // -------------------------------------------------------
    // CREATE SAFE SITE PREFIX
    // -------------------------------------------------------

    const sitePrefix = String(
      site?.site_name || "SITE"
    )
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // -------------------------------------------------------
    // GET PACKETS FOR THIS SITE ONLY
    // -------------------------------------------------------

    const {
      data,
      error,
    } = await supabase
      .from("packets")
      .select("packet_code")
      .eq("site_id", siteId);

    if (error) {
      console.error(
        "Get next packet number error:",
        error
      );

      throw error;
    }

    // -------------------------------------------------------
    // FIND HIGHEST NUMBER FOR THIS SITE
    // -------------------------------------------------------

    let highestNumber = 0;

    (Array.isArray(data) ? data : []).forEach(
      (row) => {
        const code = String(
          row?.packet_code || ""
        ).trim();

        const escapedPrefix =
          sitePrefix.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );

        const regex = new RegExp(
          `^PKT-${escapedPrefix}-(\\d{4})$`
        );

        const match = code.match(regex);

        if (match) {
          const number = Number(
            match[1]
          );

          if (
            Number.isFinite(number) &&
            number > highestNumber
          ) {
            highestNumber = number;
          }
        }
      }
    );

    // -------------------------------------------------------
    // CREATE NEXT PACKET NUMBER
    // -------------------------------------------------------

    const nextNumber =
      highestNumber + 1;

    return `PKT-${sitePrefix}-${String(
      nextNumber
    ).padStart(4, "0")}`;
  };

  // =========================================================
  // LOAD SITES + PANELS
  // =========================================================

  const loadBaseData = async () => {
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

    return {
      sites: Array.isArray(sitesData)
        ? sitesData
        : [],

      panels: Array.isArray(panelsData)
        ? panelsData
        : [],
    };
  };

  // =========================================================
  // LOAD PACKETS FOR SELECTED SITE
  // =========================================================

  const loadPacketsForSite = async (siteId) => {
    if (!siteId) {
      setOpenPacket(null);
      setClosedPackets([]);
      return;
    }

    // -------------------------------------------------------
    // LOAD PACKETS
    // -------------------------------------------------------

    const {
      data: packetRows,
      error: packetError,
    } = await supabase
      .from("packets")
      .select("*")
      .eq("site_id", siteId)
      .order("id", {
        ascending: false,
      });

    if (packetError) {
      throw packetError;
    }

    const safePackets = Array.isArray(packetRows)
      ? packetRows
      : [];

    // -------------------------------------------------------
    // LOAD PACKET/PANEL RELATIONSHIPS
    // -------------------------------------------------------

    let packetPanelRows = [];

    if (safePackets.length > 0) {
      const packetIds = safePackets.map(
        (packet) => packet.id
      );

      const {
        data: relationRows,
        error: relationError,
      } = await supabase
        .from("packet_panels")
        .select("*")
        .in("packet_id", packetIds);

      if (relationError) {
        throw relationError;
      }

      packetPanelRows = Array.isArray(relationRows)
        ? relationRows
        : [];
    }

    // -------------------------------------------------------
    // BUILD PACKET OBJECTS
    // -------------------------------------------------------

    const packetObjects = safePackets.map(
      (packet) => {
        const relations = packetPanelRows.filter(
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
            .map(
              (row) =>
                row.qr_data
            )
            .filter(Boolean),
        };
      }
    );

    const open = packetObjects.find(
      (packet) =>
        String(packet.status || "")
          .trim()
          .toLowerCase() === "open"
    );

    const closed = packetObjects.filter(
      (packet) =>
        String(packet.status || "")
          .trim()
          .toLowerCase() === "closed"
    );

    setOpenPacket(open || null);
    setClosedPackets(closed);
  };

  // =========================================================
  // FULL LOAD
  // =========================================================

  const loadData = async (
    keepSelectedSite = true
  ) => {
    try {
      setLoading(true);

      const {
        sites: sitesData,
        panels: panelsData,
      } = await loadBaseData();

      console.log(
        "TRACKERZ QR - SUPABASE SITES:",
        sitesData
      );

      console.log(
        "TRACKERZ QR - SUPABASE PANELS:",
        panelsData
      );

      setSites(sitesData);
      setPanels(panelsData);

      let siteToUse = selectedSiteId;

      if (keepSelectedSite && siteToUse) {
        const stillExists = sitesData.some(
          (site) =>
            String(site.id) ===
            String(siteToUse)
        );

        if (!stillExists) {
          siteToUse =
            sitesData.length > 0
              ? String(sitesData[0].id)
              : "";
        }
      }

      if (!siteToUse && sitesData.length > 0) {
        siteToUse = String(sitesData[0].id);
      }

      if (!siteToUse) {
        setSelectedSiteId("");
        setOpenPacket(null);
        setClosedPackets([]);
        return;
      }

      if (
        String(siteToUse) !==
        String(selectedSiteId)
      ) {
        setSelectedSiteId(siteToUse);
      }

      await loadPacketsForSite(siteToUse);
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

  // =========================================================
  // INITIAL LOAD
  // =========================================================

  useEffect(() => {
    loadData(false);
  }, []);

  // =========================================================
  // RELOAD PACKETS WHEN SITE CHANGES
  // =========================================================

  useEffect(() => {
    if (!selectedSiteId) {
      return;
    }

    const reloadSitePackets = async () => {
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

    reloadSitePackets();
  }, [selectedSiteId]);

  // =========================================================
  // WINDOW FOCUS REFRESH
  // =========================================================

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
          "Window refresh error:",
          error
        );
      }
    };

    window.addEventListener(
      "focus",
      refresh
    );

    return () => {
      window.removeEventListener(
        "focus",
        refresh
      );
    };
  }, [selectedSiteId]);

  // =========================================================
  // VISIBILITY REFRESH
  // =========================================================

  useEffect(() => {
    const handleVisibility = async () => {
      if (
        document.visibilityState !==
        "visible"
      ) {
        return;
      }

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
          "Visibility refresh error:",
          error
        );
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
  }, [selectedSiteId]);

  // =========================================================
  // SELECTED SITE
  // =========================================================

  const selectedSite = useMemo(() => {
    return sites.find(
      (site) =>
        String(site.id) ===
        String(selectedSiteId)
    );
  }, [
    sites,
    selectedSiteId,
  ]);

  // =========================================================
  // SITE PANELS
  // =========================================================

  const sitePanels = useMemo(() => {
    if (!selectedSite) {
      return [];
    }

    const siteId =
      String(selectedSite.id);

    const siteName =
      getSiteName(selectedSite)
        .trim()
        .toLowerCase();

    return panels.filter(
      (panel) => {
        const panelSiteId =
          String(
            panel?.site_id ||
              panel?.siteId ||
              ""
          );

        const panelSiteName =
          String(
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

        if (
          !panelSiteId &&
          panelSiteName &&
          panelSiteName === siteName
        ) {
          return true;
        }

        return false;
      }
    );
  }, [
    panels,
    selectedSite,
  ]);

  // =========================================================
  // PACKED / REMAINING
  // =========================================================

  const packedPanels = useMemo(() => {
    return sitePanels.filter(
      (panel) =>
        isPanelPacked(panel)
    );
  }, [sitePanels]);

  const remainingPanels = useMemo(() => {
    return sitePanels.filter(
      (panel) =>
        !isPanelPacked(panel)
    );
  }, [sitePanels]);

  // =========================================================
  // PROGRESS
  // =========================================================

  const totalPanels =
    sitePanels.length;

  const packedCount =
    packedPanels.length;

  const remainingCount =
    remainingPanels.length;

  const progress =
    totalPanels > 0
      ? Math.min(
          100,
          Math.round(
            (packedCount /
              totalPanels) *
              100
          )
        )
      : 0;

  // =========================================================
  // FIND PANEL BY QR
  // =========================================================

  const findPanelByQR = (
    qrValue
  ) => {
    const value =
      String(
        qrValue || ""
      )
        .trim()
        .toLowerCase();

    if (!value) {
      return null;
    }

    return sitePanels.find(
      (panel) => {
        const values = [
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
        ];

        return values.some(
          (item) =>
            String(item || "")
              .trim()
              .toLowerCase() ===
            value
        );
      }
    );
  };

  // =========================================================
  // CREATE OPEN PACKET IN SUPABASE
  // =========================================================

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

          // The packet QR value is the same unique packet code.
          packet_qr:
            packetCode,

          status:
            "open",

          opened_at:
            new Date().toISOString(),

          closed_at:
            null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(
        "Create packet error:",
        error
      );

      throw error;
    }

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

  // =========================================================
  // ADD PANEL TO SUPABASE PACKET
  // =========================================================

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

    if (error) {
      console.error(
        "Add panel to packet error:",
        error
      );

      throw error;
    }

    return data;
  };

  // =========================================================
  // UPDATE PANEL IN SUPABASE
  // =========================================================

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

    if (error) {
      console.error(
        "Panel update error:",
        error
      );

      throw error;
    }

    return data;
  };

  // =========================================================
  // LOAD ONE PACKET RELATIONSHIPS
  // =========================================================

  const loadPacketPanelIds = async (
    packetDbId
  ) => {
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

    if (error) {
      throw error;
    }

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

  // =========================================================
  // SCAN PANEL
  // =========================================================

  const handleScanPanel = async () => {
    const qrValue =
      manualQR.trim();

    if (!qrValue) {
      showMessage(
        "Scan or enter a QR value.",
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

    if (actionLoading) {
      return;
    }

    // -------------------------------------------------------
    // FIND PANEL ONLY INSIDE SELECTED SITE
    // -------------------------------------------------------

    const panel =
      findPanelByQR(qrValue);

    if (!panel) {
      showMessage(
        "Panel not found in the selected site.",
        "error"
      );

      setManualQR("");

      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      return;
    }

    // -------------------------------------------------------
    // ALREADY PACKED
    // -------------------------------------------------------

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

      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      return;
    }

    try {
      setActionLoading(true);

      // -----------------------------------------------------
      // MAKE SURE WE HAVE THE LATEST OPEN PACKET
      // -----------------------------------------------------

      let packet =
        openPacket;

      if (!packet) {
        packet =
          await createOpenPacket();

        setOpenPacket(packet);
      }

      // -----------------------------------------------------
      // DOUBLE-CHECK PANEL IS NOT ALREADY IN THIS PACKET
      // -----------------------------------------------------

      const currentPacketPanelIds =
        await loadPacketPanelIds(
          packet.dbId ||
            packet.packetId ||
            packet.id
        );

      const alreadyInPacket =
        currentPacketPanelIds.some(
          (id) =>
            String(id) ===
            String(panel.id)
        );

      if (alreadyInPacket) {
        showMessage(
          `${getPanelLabel(
            panel
          )} is already inside ${packet.id}.`,
          "error"
        );

        setManualQR("");

        return;
      }

      // -----------------------------------------------------
      // ADD PANEL TO PACKET
      // -----------------------------------------------------

      await addPanelToPacket(
        packet.dbId ||
          packet.packetId,
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
      } catch (panelError) {
        // ---------------------------------------------------
        // CLEANUP IF PANEL UPDATE FAILS
        // ---------------------------------------------------

        try {
          await supabase
            .from("packet_panels")
            .delete()
            .eq(
              "packet_id",
              packet.dbId ||
                packet.packetId
            )
            .eq(
              "panel_id",
              panel.id
            );
        } catch (cleanupError) {
          console.error(
            "Packet relation cleanup failed:",
            cleanupError
          );
        }

        throw panelError;
      }

      // -----------------------------------------------------
      // UPDATE LOCAL REACT PANEL STATE
      // -----------------------------------------------------

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

      // -----------------------------------------------------
      // UPDATE OPEN PACKET STATE
      // -----------------------------------------------------

      const updatedPacket = {
        ...packet,

        panelIds: [
          ...(packet.panelIds ||
            []),
          panel.id,
        ],

        panelQRs: [
          ...(packet.panelQRs ||
            []),
          getPanelLabel(panel),
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

      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
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

  // =========================================================
  // ENTER KEY
  // =========================================================

  const handleQRKeyDown = (
    event
  ) => {
    if (
      event.key ===
      "Enter"
    ) {
      event.preventDefault();

      handleScanPanel();
    }
  };

  // =========================================================
  // PACKET QR LABEL PRINTING
  // =========================================================

  const getPacketQRValue = (packet) => {
    return String(
      packet?.packet_qr ||
        packet?.packet_code ||
        packet?.id ||
        ""
    ).trim();
  };

  const escapePrintHtml = (value) => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const getPacketQRImageUrl = (qrValue) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=10&data=${encodeURIComponent(
      qrValue
    )}`;
  };

  const printPacketLabel = (packet, site) => {
    const qrValue = getPacketQRValue(packet);

    if (!qrValue) {
      showMessage(
        "Packet QR data is missing. The packet was closed, but no QR label could be printed.",
        "error"
      );
      return;
    }

    const siteName = getSiteName(site);
    const clientName = getClientName(site);
    const qrImageUrl = getPacketQRImageUrl(qrValue);
    const packetPanels = getPacketPanels(packet);

    // The physical label is exactly 100mm x 100mm.
    // If a packet contains many panels, the print job automatically
    // creates continuation 100mm x 100mm labels so the panel details
    // remain readable instead of shrinking into an unusable label.
    const firstPagePanels = packetPanels.slice(0, 4);
    const remainingPanels = packetPanels.slice(4);
    const continuationChunks = [];

    for (let i = 0; i < remainingPanels.length; i += 8) {
      continuationChunks.push(
        remainingPanels.slice(i, i + 8)
      );
    }

    const renderPanelRows = (rows, startIndex = 0) => {
      if (!rows.length) {
        return `
          <div class="empty-panels">No panel details available</div>
        `;
      }

      return rows
        .map(
          (panel, index) => `
            <div class="panel-row">
              <div class="panel-no">${startIndex + index + 1}</div>
              <div class="panel-main">
                <div class="panel-name">${escapePrintHtml(
                  getPanelNameForPrint(panel)
                )}</div>
                <div class="panel-section">${escapePrintHtml(
                  getPanelSectionForPrint(panel)
                )}</div>
              </div>
              <div class="panel-label">${escapePrintHtml(
                getPanelLabelNumberForPrint(panel)
              )}</div>
              <div class="panel-size">
                <span>T ${escapePrintHtml(
                  getPanelThicknessForPrint(panel)
                )}</span>
                <span>L ${escapePrintHtml(
                  getPanelLengthForPrint(panel)
                )}</span>
                <span>W ${escapePrintHtml(
                  getPanelWidthForPrint(panel)
                )}</span>
              </div>
            </div>
          `
        )
        .join("");
    };

    const buildLabel = ({
      title,
      rows,
      startIndex,
      includeQR,
    }) => `
      <section class="label-page">
        <div class="brand">TRACKERZ</div>
        <div class="title">${escapePrintHtml(title)}</div>

        ${
          includeQR
            ? `
              <img id="packet-qr-image" class="qr" alt="Packet QR" />
              <div class="packet-code">${escapePrintHtml(qrValue)}</div>
              <div class="site">${escapePrintHtml(siteName)}</div>
              <div class="client">${escapePrintHtml(clientName)}</div>
            `
            : `
              <div class="continuation-code">${escapePrintHtml(
                qrValue
              )}</div>
            `
        }

        <div class="panel-summary">
          ${escapePrintHtml(packetPanels.length)} panel${
            packetPanels.length === 1 ? "" : "s"
          }
        </div>

        <div class="panel-header">
          <span>#</span>
          <span>Panel / Section</span>
          <span>Label</span>
          <span>T / L / W</span>
        </div>

        <div class="panel-list">
          ${renderPanelRows(rows, startIndex)}
        </div>

        <div class="footer-code">
          PACKET QR: ${escapePrintHtml(qrValue)}
        </div>
      </section>
    `;

    const labels = [
      buildLabel({
        title: "PACKET QR + PANEL DETAILS",
        rows: firstPagePanels,
        startIndex: 0,
        includeQR: true,
      }),
    ];

    continuationChunks.forEach((chunk, index) => {
      labels.push(
        buildLabel({
          title: `PACKET PANELS — CONT. ${index + 1}`,
          rows: chunk,
          startIndex: 4 + index * 8,
          includeQR: false,
        })
      );
    });

    const iframe = document.createElement("iframe");

    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.setAttribute("aria-hidden", "true");

    document.body.appendChild(iframe);

    const printDocument = iframe.contentWindow?.document;

    if (!printDocument) {
      document.body.removeChild(iframe);
      showMessage(
        "Unable to open the print window. Use Print Packet QR again.",
        "error"
      );
      return;
    }

    printDocument.open();
    printDocument.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapePrintHtml(qrValue)}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
              background: #ffffff;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
            }

            .label-page {
              width: 100mm;
              height: 100mm;
              padding: 4mm;
              overflow: hidden;
              page-break-after: always;
              background: #ffffff;
            }

            .label-page:last-child {
              page-break-after: auto;
            }

            .brand {
              font-size: 9px;
              font-weight: 900;
              letter-spacing: 1.4px;
              color: #2563eb;
              text-align: center;
            }

            .title {
              margin-top: 1mm;
              font-size: 7px;
              font-weight: 800;
              color: #6b7280;
              text-align: center;
            }

            .qr {
              width: 27mm;
              height: 27mm;
              object-fit: contain;
              display: block;
              margin: 2mm auto 1mm;
            }

            .packet-code {
              font-size: 10px;
              line-height: 1.05;
              font-weight: 900;
              text-align: center;
              word-break: break-word;
            }

            .site {
              margin-top: 1mm;
              font-size: 7px;
              font-weight: 800;
              text-align: center;
              word-break: break-word;
            }

            .client {
              font-size: 6.5px;
              color: #6b7280;
              text-align: center;
              word-break: break-word;
            }

            .continuation-code {
              margin: 2mm 0 1mm;
              text-align: center;
              font-size: 9px;
              font-weight: 900;
              word-break: break-word;
            }

            .panel-summary {
              margin: 1.5mm 0 1mm;
              font-size: 7px;
              font-weight: 800;
              color: #374151;
            }

            .panel-header,
            .panel-row {
              display: grid;
              grid-template-columns: 4mm 1fr 18mm 27mm;
              column-gap: 1.2mm;
              align-items: center;
            }

            .panel-header {
              min-height: 4mm;
              padding: 1mm;
              background: #f3f4f6;
              border-top: 0.2mm solid #d1d5db;
              border-bottom: 0.2mm solid #d1d5db;
              font-size: 5px;
              font-weight: 900;
              color: #4b5563;
            }

            .panel-row {
              min-height: 6.4mm;
              padding: 0.9mm 1mm;
              border-bottom: 0.2mm solid #e5e7eb;
              font-size: 5.3px;
            }

            .panel-no {
              font-weight: 900;
              text-align: center;
            }

            .panel-main {
              min-width: 0;
            }

            .panel-name {
              font-size: 5.5px;
              font-weight: 900;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .panel-section {
              margin-top: 0.4mm;
              color: #6b7280;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .panel-label {
              font-weight: 800;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .panel-size {
              display: flex;
              gap: 1.2mm;
              white-space: nowrap;
              font-weight: 700;
            }

            .footer-code {
              margin-top: 1.5mm;
              font-size: 4.8px;
              color: #9ca3af;
              word-break: break-all;
            }

            .empty-panels {
              padding: 4mm 1mm;
              font-size: 6px;
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

    const qrImage = printDocument.getElementById("packet-qr-image");

    let printed = false;

    const cleanup = () => {
      window.setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1000);
    };

    const doPrint = () => {
      if (printed) return;
      printed = true;

      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (printError) {
        console.error(
          "Packet label print error:",
          printError
        );
      }

      cleanup();
    };

    if (qrImage) {
      qrImage.onload = () => {
        window.setTimeout(doPrint, 150);
      };

      qrImage.onerror = () => {
        showMessage(
          "Packet label opened, but the QR image could not be loaded. Check the factory internet connection and use Print Packet QR again.",
          "error"
        );
        window.setTimeout(doPrint, 150);
      };

      qrImage.src = qrImageUrl;
    } else {
      window.setTimeout(doPrint, 150);
    }
  };

  // =========================================================
  // CLOSE CURRENT PACKET
  // =========================================================

  const handleClosePacket = async () => {
    if (!openPacket) {
      showMessage(
        "No packet is currently open.",
        "error"
      );

      return;
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

      if (panelIds.length === 0) {
        showMessage(
          "Cannot close an empty packet.",
          "error"
        );

        return;
      }

      const {
        data,
        error,
      } = await supabase
        .from("packets")
        .update({
          status:
            "closed",

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

      if (error) {
        throw error;
      }

      const closedPacket = {
        ...openPacket,

        ...data,

        dbId:
          data.id,

        packetId:
          data.id,

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

      const packetQRValue = getPacketQRValue(closedPacket);

      setPacketPrintData({
        packet: {
          ...closedPacket,
          packet_qr: packetQRValue,
        },
        site: selectedSite,
        panelCount: panelIds.length,
      });

      // Automatically open the browser print dialog for the packet sticker.
      printPacketLabel(
        {
          ...closedPacket,
          packet_qr: packetQRValue,
        },
        selectedSite
      );

      setOpenPacket(
        null
      );

      setClosedPackets(
        (current) => [
          closedPacket,
          ...current.filter(
            (item) =>
              String(
                item.packetId ||
                  item.dbId
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

      setActiveView(
        "packets"
      );

      showMessage(
        `${closedPacket.id} closed with ${panelIds.length} panel${
          panelIds.length ===
          1
            ? ""
            : "s"
        }.`
      );

      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
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

  // =========================================================
  // DELETE PANEL FROM OPEN PACKET
  // =========================================================

  const handleDeletePanelFromOpenPacket =
    async (panel) => {
      if (!panel || !openPacket) {
        return;
      }

      const confirmed =
        window.confirm(
          `Remove ${getPanelLabel(
            panel
          )} from the current packet?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(true);

        const packetDbId =
          openPacket.dbId ||
          openPacket.packetId;

        const {
          error:
            relationError,
        } = await supabase
          .from("packet_panels")
          .delete()
          .eq(
            "packet_id",
            packetDbId
          )
          .eq(
            "panel_id",
            panel.id
          );

        if (relationError) {
          throw relationError;
        }

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

        const updatedPacket = {
          ...openPacket,

          panelIds:
            (
              openPacket.panelIds ||
              []
            ).filter(
              (id) =>
                String(id) !==
                String(panel.id)
            ),

          panelQRs:
            (
              openPacket.panelQRs ||
              []
            ).filter(
              (qr) =>
                String(qr) !==
                String(
                  getPanelLabel(
                    panel
                  )
                )
            ),
        };

        setOpenPacket(
          updatedPacket
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

        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }
    };

  // =========================================================
  // DELETE PACKET
  // =========================================================

  const deletePacketAndReturnPanels =
    async (packet) => {
      if (!packet) {
        return;
      }

      const packetDbId =
        packet.dbId ||
        packet.packetId;

      try {
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
          .from("packet_panels")
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

        if (packetDeleteError) {
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

        const packetWasOpen =
          openPacket &&
          String(
            openPacket.dbId ||
              openPacket.packetId
          ) ===
            String(
              packetDbId
            );

        if (packetWasOpen) {
          setOpenPacket(
            null
          );
        }

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
          `${packet.id} deleted and ${panelIds.length} panel${
            panelIds.length ===
            1
              ? ""
              : "s"
          } returned to Remaining.`
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
      }
    };

  // =========================================================
  // DELETE OPEN PACKET
  // =========================================================

  const handleDeleteOpenPacket =
    async () => {
      if (!openPacket) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete ${openPacket.id} and return its panels to Remaining?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(true);

        await deletePacketAndReturnPanels(
          openPacket
        );
      } finally {
        setActionLoading(false);

        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }
    };

  // =========================================================
  // DELETE CLOSED PACKET
  // =========================================================

  const handleDeleteClosedPacket =
    async (packet) => {
      if (!packet) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete ${packet.id} and return its panels to Remaining?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(true);

        await deletePacketAndReturnPanels(
          packet
        );
      } finally {
        setActionLoading(false);
      }
    };

  // =========================================================
  // SITE CHANGE
  // =========================================================

  const handleSiteChange = (
    event
  ) => {
    const newSiteId =
      event.target.value;

    if (
      openPacket &&
      openPacket.panelIds?.length >
        0
    ) {
      const confirmed =
        window.confirm(
          `Packet ${openPacket.id} is still open. Change site anyway?`
        );

      if (!confirmed) {
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
    setSelectedPacketId(null);
    setSelectedPanelId(null);
    setManualQR("");
    setMessage("");
  };

  // =========================================================
  // SELECTED PACKET
  // =========================================================

  const selectedPacket =
    useMemo(() => {
      return closedPackets.find(
        (packet) =>
          String(
            packet.id
          ) ===
          String(
            selectedPacketId
          )
      );
    }, [
      closedPackets,
      selectedPacketId,
    ]);

  // =========================================================
  // GET PACKET PANELS
  // =========================================================

  const getPacketPanels = (
    packet
  ) => {
    if (!packet) {
      return [];
    }

    return (
      packet.panelIds || []
    )
      .map((id) =>
        sitePanels.find(
          (panel) =>
            String(panel.id) ===
            String(id)
        )
      )
      .filter(Boolean);
  };

  // =========================================================
  // SELECTED PANEL
  // =========================================================

  const selectedPanel =
    useMemo(() => {
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
  // MARK SITE DELIVERED
  // =========================================================

  const handleMarkDelivered =
    async () => {
      if (!selectedSite) {
        return;
      }

      if (
        remainingCount >
        0
      ) {
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
          `Mark "${getSiteName(
            selectedSite
          )}" as Delivered?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(true);

        const {
          data,
          error,
        } = await supabase
          .from("sites")
          .update({
            status:
              "Delivered",
          })
          .eq(
            "id",
            selectedSite.id
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        setSites(
          (current) =>
            current.map(
              (site) =>
                String(site.id) ===
                String(
                  selectedSite.id
                )
                  ? {
                      ...site,
                      ...data,
                    }
                  : site
            )
        );

        showMessage(
          `${getSiteName(
            selectedSite
          )} marked as Delivered.`
        );
      } catch (error) {
        console.error(
          "Mark delivered error:",
          error
        );

        showMessage(
          error?.message ||
            "Unable to update site.",
          "error"
        );
      } finally {
        setActionLoading(false);
      }
    };

  // =========================================================
  // SELECT PANEL
  // =========================================================

  const handleSelectPanel = (
    panel
  ) => {
    setSelectedPanelId(
      panel.id
    );
  };

  // =========================================================
  // BUTTON STYLE
  // =========================================================

  const topButtonStyle = (
    active,
    type = "blue"
  ) => {
    const colors = {
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
      colors[type];

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
    };
  };

  // =========================================================
  // PANEL CARD
  // =========================================================

  const renderPanelCard = (
    panel,
    index
  ) => {
    const active =
      String(panel.id) ===
      String(selectedPanelId);

    const isInOpenPacket =
      openPacket?.panelIds?.some(
        (id) =>
          String(id) ===
          String(panel.id)
      );

    return (
      <div
        key={
          panel.id ||
          `${index}-${getPanelLabel(
            panel
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

        {isInOpenPacket && (
          <span
            style={{
              fontSize: "10px",
              background: "#fff7ed",
              color: "#c2410c",
              padding: "4px 6px",
              borderRadius: "5px",
              fontWeight: "700",
            }}
          >
            OPEN
          </span>
        )}
      </div>
    );
  };

  // =========================================================
  // PANEL LIST
  // =========================================================

  const renderPanelList = (
    list,
    emptyText = "No panels"
  ) => {
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
            border: "1px dashed #d1d5db",
            borderRadius: "10px",
            padding: "20px",
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
              index
            )
        )}
      </div>
    );
  };

  // =========================================================
  // CURRENT OPEN PACKET
  // =========================================================

  const renderOpenPacketPanels =
    () => {
      if (!openPacket) {
        return null;
      }

      const packetPanels =
        getPacketPanels(
          openPacket
        );

      return (
        <div
          style={{
            marginBottom: "10px",
            border: "1px solid #fed7aa",
            background: "#fff7ed",
            borderRadius: "10px",
            padding: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <div>
              <strong
                style={{
                  color: "#c2410c",
                }}
              >
                📦 {openPacket.id}
              </strong>

              <div
                style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  marginTop: "2px",
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
                in current packet
              </div>
            </div>

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
                  "7px",
                padding:
                  "7px 11px",
                fontWeight:
                  "800",
                cursor:
                  actionLoading
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              ✓ Close Packet
            </button>
          </div>

          <div
            style={{
              maxHeight: "150px",
              overflowY: "auto",
              display: "grid",
              gap: "5px",
            }}
          >
            {packetPanels.map(
              (panel, index) => (
                <div
                  key={
                    panel.id
                  }
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "center",
                    gap: "8px",
                    background:
                      "#ffffff",
                    border:
                      "1px solid #e5e7eb",
                    borderRadius:
                      "6px",
                    padding:
                      "6px 8px",
                  }}
                >
                  <div
                    style={{
                      minWidth:
                        "0",
                    }}
                  >
                    <strong
                      style={{
                        fontSize:
                          "11px",
                      }}
                    >
                      {index +
                        1}
                      .{" "}
                      {getPanelLabel(
                        panel
                      )}
                    </strong>
                  </div>

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
                      flexShrink:
                        0,
                      border:
                        "1px solid #fecaca",
                      background:
                        "#ffffff",
                      color:
                        "#dc2626",
                      borderRadius:
                        "5px",
                      padding:
                        "3px 7px",
                      cursor:
                        actionLoading
                          ? "not-allowed"
                          : "pointer",
                      fontWeight:
                        "700",
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

  // =========================================================
  // PACKET LIST
  // =========================================================

  const renderPacketList =
    () => {
      if (
        closedPackets.length ===
        0
      ) {
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
              border: "1px dashed #d1d5db",
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
                Scan panels and close
                the packet when ready.
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
          {closedPackets.map(
            (packet) => {
              const active =
                String(
                  selectedPacketId
                ) ===
                String(packet.id);

              return (
                <div
                  key={
                    packet.dbId ||
                    packet.packetId ||
                    packet.id
                  }
                  style={{
                    border:
                      active
                        ? "1px solid #7c3aed"
                        : "1px solid #e5e7eb",
                    background:
                      active
                        ? "#f5f3ff"
                        : "#ffffff",
                    borderRadius:
                      "10px",
                    padding:
                      "13px",
                  }}
                >
                  <button
                    onClick={() => {
                      setSelectedPacketId(
                        packet.id
                      );

                      setSelectedPanelId(
                        null
                      );
                    }}
                    style={{
                      width:
                        "100%",
                      border:
                        "none",
                      background:
                        "transparent",
                      cursor:
                        "pointer",
                      textAlign:
                        "left",
                    }}
                  >
                    <strong>
                      📦{" "}
                      {
                        packet.id
                      }
                    </strong>

                    <small
                      style={{
                        display:
                          "block",
                        marginTop:
                          "6px",
                        color:
                          "#6b7280",
                      }}
                    >
                      {
                        packet
                          .panelIds
                          ?.length ||
                        0
                      }{" "}
                      panels
                    </small>

                    <small
                      style={{
                        display:
                          "block",
                        marginTop:
                          "4px",
                        color:
                          "#16a34a",
                        fontWeight:
                          "700",
                      }}
                    >
                      ✓ Closed
                    </small>
                  </button>

                </div>
              );
            }
          )}
        </div>
      );
    };

  // =========================================================
  // SELECTED CLOSED PACKET
  // =========================================================

  const renderSelectedPacket =
    () => {
      if (!selectedPacket) {
        return null;
      }

      const packetPanels =
        getPacketPanels(selectedPacket);

      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            minHeight: "0",
          }}
        >
          {/* PACKET HEADER */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "10px",
              marginBottom: "10px",
            }}
          >
            <button
              onClick={() => {
                setSelectedPacketId(null);
                setSelectedPanelId(null);
              }}
              style={{
                border: "1px solid #d1d5db",
                background: "#ffffff",
                color: "#374151",
                borderRadius: "7px",
                padding: "7px 11px",
                cursor: "pointer",
                fontWeight: "800",
              }}
            >
              ← Back
            </button>

            <div
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "center",
              }}
            >
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
                  margin: "2px 0 0",
                  fontSize: "18px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                📦 {selectedPacket.id}
              </h3>
            </div>

            <button
              disabled={actionLoading}
              onClick={() =>
                handleDeleteClosedPacket(selectedPacket)
              }
              style={{
                border: "1px solid #fecaca",
                background: "#ffffff",
                color: "#dc2626",
                borderRadius: "7px",
                padding: "7px 10px",
                cursor: actionLoading
                  ? "not-allowed"
                  : "pointer",
                fontWeight: "700",
              }}
            >
              Delete Packet
            </button>
          </div>

          {/* QR + PANEL DETAILS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "190px minmax(0, 1fr)",
              gap: "12px",
              flex: "1",
              minHeight: "0",
            }}
          >
            {/* QR CARD */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                background: "#ffffff",
                padding: "10px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: "800",
                  letterSpacing: "0.08em",
                  color: "#2563eb",
                }}
              >
                PACKET QR
              </div>

              <img
                src={getPacketQRImageUrl(
                  getPacketQRValue(selectedPacket)
                )}
                alt={`QR for ${selectedPacket.id}`}
                style={{
                  width: "145px",
                  height: "145px",
                  maxWidth: "100%",
                  objectFit: "contain",
                  display: "block",
                  margin: "8px auto 6px",
                }}
              />

              <strong
                style={{
                  display: "block",
                  fontSize: "12px",
                  wordBreak: "break-word",
                }}
              >
                {getPacketQRValue(selectedPacket) ||
                  selectedPacket.id}
              </strong>

              <div
                style={{
                  marginTop: "4px",
                  fontSize: "10px",
                  color: "#6b7280",
                }}
              >
                {packetPanels.length} panel
                {packetPanels.length === 1 ? "" : "s"}
              </div>

              <button
                disabled={!getPacketQRValue(selectedPacket)}
                onClick={() =>
                  printPacketLabel(
                    selectedPacket,
                    selectedSite
                  )
                }
                style={{
                  width: "100%",
                  marginTop: "10px",
                  minHeight: "38px",
                  border: "none",
                  borderRadius: "7px",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: "800",
                  cursor: getPacketQRValue(selectedPacket)
                    ? "pointer"
                    : "not-allowed",
                  opacity: getPacketQRValue(selectedPacket)
                    ? 1
                    : 0.5,
                }}
              >
                🖨 Print Packet QR
              </button>

              <div
                style={{
                  marginTop: "8px",
                  fontSize: "9px",
                  lineHeight: 1.4,
                  color: "#9ca3af",
                }}
              >
                100 × 100 mm label
                <br />
                QR + panel details
              </div>
            </div>

            {/* PANEL DETAILS */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                background: "#ffffff",
                padding: "10px",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <div>
                  <strong
                    style={{
                      fontSize: "14px",
                    }}
                  >
                    Panels in Packet
                  </strong>

                  <div
                    style={{
                      marginTop: "2px",
                      fontSize: "10px",
                      color: "#6b7280",
                    }}
                  >
                    Panel name / section / label / dimensions
                  </div>
                </div>

                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "800",
                    color: "#2563eb",
                  }}
                >
                  {packetPanels.length}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(150px, 1.4fr) minmax(100px, 1fr) minmax(70px, .7fr) 105px",
                  gap: "6px",
                  padding: "7px 8px",
                  background: "#f8fafc",
                  border: "1px solid #e5e7eb",
                  borderRadius: "7px 7px 0 0",
                  fontSize: "9px",
                  fontWeight: "800",
                  color: "#6b7280",
                }}
              >
                <span>Panel / Section</span>
                <span>Label Number</span>
                <span>Panel QR</span>
                <span>T / L / W</span>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: "0",
                  overflowY: "auto",
                  border: "1px solid #e5e7eb",
                  borderTop: "none",
                  borderRadius: "0 0 7px 7px",
                }}
              >
                {packetPanels.length === 0 ? (
                  <div
                    style={{
                      padding: "30px",
                      textAlign: "center",
                      color: "#9ca3af",
                      fontSize: "12px",
                    }}
                  >
                    No panel details found.
                  </div>
                ) : (
                  packetPanels.map((panel, index) => (
                    <div
                      key={
                        panel.id ||
                        `${selectedPacket.id}-${index}`
                      }
                      onClick={() =>
                        handleSelectPanel(panel)
                      }
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(150px, 1.4fr) minmax(100px, 1fr) minmax(70px, .7fr) 105px",
                        gap: "6px",
                        alignItems: "center",
                        padding: "8px",
                        borderBottom:
                          "1px solid #f1f5f9",
                        background:
                          String(selectedPanelId) ===
                          String(panel.id)
                            ? "#eff6ff"
                            : "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          minWidth: 0,
                        }}
                      >
                        <strong
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#111827",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {getPanelNameForPrint(panel)}
                        </strong>
                        <span
                          style={{
                            display: "block",
                            marginTop: "2px",
                            fontSize: "9px",
                            color: "#6b7280",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {getPanelSectionForPrint(panel)}
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {getPanelLabelNumberForPrint(panel)}
                      </span>

                      <span
                        style={{
                          fontSize: "9px",
                          color: "#374151",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {getPanelLabel(panel, index)}
                      </span>

                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: "700",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {getPanelThicknessForPrint(panel)} × {getPanelLengthForPrint(panel)} × {getPanelWidthForPrint(panel)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      );
    };

  // =========================================================
  // MAIN WORKSPACE
  // =========================================================

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
                "0",
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
                  "9px",
              }}
            >
              <div>
                <strong
                  style={{
                    fontSize:
                      "16px",
                  }}
                >
                  Remaining Panels
                </strong>

                <div
                  style={{
                    fontSize:
                      "11px",
                    color:
                      "#6b7280",
                    marginTop:
                      "2px",
                  }}
                >
                  Panels waiting to
                  be packed
                </div>
              </div>

              <span
                style={{
                  fontWeight:
                    "700",
                  color:
                    "#2563eb",
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
                flex:
                  "1",
                minHeight:
                  "0",
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
                "0",
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
                  "9px",
              }}
            >
              <div>
                <strong
                  style={{
                    fontSize:
                      "16px",
                  }}
                >
                  Packed Panels
                </strong>

                <div
                  style={{
                    fontSize:
                      "11px",
                    color:
                      "#6b7280",
                    marginTop:
                      "2px",
                  }}
                >
                  Panels already packed
                </div>
              </div>

              <span
                style={{
                  fontWeight:
                    "700",
                  color:
                    "#16a34a",
                }}
              >
                {
                  packedCount
                }
              </span>
            </div>

            {renderPanelList(
              packedPanels
            )}
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
              "0",
          }}
        >
          <div
            style={{
              marginBottom:
                "9px",
            }}
          >
            <strong
              style={{
                fontSize:
                  "16px",
              }}
            >
              Closed Packets
            </strong>

            <div
              style={{
                fontSize:
                  "11px",
                color:
                  "#6b7280",
                marginTop:
                  "2px",
              }}
            >
              Select a packet to see
              its panels
            </div>
          </div>

          <div
            style={{
              flex:
                "1",
              minHeight:
                "0",
            }}
          >
            {renderPacketList()}
          </div>
        </div>
      );
    };

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          padding: "50px",
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
          Loading QR Tracking...
        </strong>

        <p
          style={{
            color: "#6b7280",
            fontSize: "13px",
          }}
        >
          Reading sites, panels and
          packets from Supabase.
        </p>
      </div>
    );
  }

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
            border: "1px solid #e5e7eb",
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
        position: "relative",
      }}
    >
      {/* PACKET QR LABEL PREVIEW */}
      {packetPrintData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "min(390px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: "14px",
              border: "1px solid #e5e7eb",
              padding: "20px",
              boxSizing: "border-box",
              textAlign: "center",
              boxShadow: "0 20px 50px rgba(0,0,0,0.20)",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: "800",
                letterSpacing: "0.08em",
                color: "#2563eb",
              }}
            >
              TRACKERZ
            </div>

            <h3
              style={{
                margin: "5px 0 2px",
                fontSize: "20px",
              }}
            >
              Packet QR Label
            </h3>

            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginBottom: "12px",
              }}
            >
              Print this QR and place it on the physical packet.
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                padding: "12px",
                background: "#ffffff",
              }}
            >
              <img
                src={getPacketQRImageUrl(
                  getPacketQRValue(packetPrintData.packet)
                )}
                alt="Packet QR code"
                style={{
                  width: "170px",
                  height: "170px",
                  maxWidth: "100%",
                  objectFit: "contain",
                  display: "block",
                  margin: "0 auto 8px",
                }}
              />

              <strong
                style={{
                  display: "block",
                  fontSize: "15px",
                  wordBreak: "break-word",
                }}
              >
                {getPacketQRValue(
                  packetPrintData.packet
                )}
              </strong>

              <div
                style={{
                  marginTop: "4px",
                  fontSize: "11px",
                  fontWeight: "700",
                }}
              >
                {getSiteName(
                  packetPrintData.site
                )}
              </div>

              <div
                style={{
                  marginTop: "2px",
                  fontSize: "10px",
                  color: "#6b7280",
                }}
              >
                {getClientName(
                  packetPrintData.site
                )}
                {" • "}
                {packetPrintData.panelCount} panel
                {packetPrintData.panelCount === 1 ? "" : "s"}
              </div>

              <div
                style={{
                  marginTop: "10px",
                  borderTop: "1px solid #e5e7eb",
                  paddingTop: "8px",
                  textAlign: "left",
                }}
              >
                <strong
                  style={{
                    fontSize: "11px",
                  }}
                >
                  Panels to be printed
                </strong>

                <div
                  style={{
                    marginTop: "5px",
                    maxHeight: "150px",
                    overflowY: "auto",
                  }}
                >
                  {getPacketPanels(
                    packetPrintData.packet
                  ).map((panel, index) => (
                    <div
                      key={panel.id || index}
                      style={{
                        padding: "5px 0",
                        borderBottom: "1px solid #f1f5f9",
                        fontSize: "9px",
                      }}
                    >
                      <strong>
                        {getPanelNameForPrint(panel)}
                      </strong>
                      <span style={{ color: "#6b7280" }}>
                        {" • "}
                        {getPanelSectionForPrint(panel)}
                        {" • "}
                        {getPanelLabelNumberForPrint(panel)}
                        {" • T "}
                        {getPanelThicknessForPrint(panel)}
                        {" / L "}
                        {getPanelLengthForPrint(panel)}
                        {" / W "}
                        {getPanelWidthForPrint(panel)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                marginTop: "13px",
              }}
            >
              <button
                onClick={() =>
                  printPacketLabel(
                    packetPrintData.packet,
                    packetPrintData.site
                  )
                }
                style={{
                  flex: 1,
                  height: "42px",
                  border: "none",
                  borderRadius: "8px",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: "800",
                  cursor: "pointer",
                }}
              >
                🖨 Print Label
              </button>

              <button
                onClick={() =>
                  setPacketPrintData(null)
                }
                style={{
                  height: "42px",
                  padding: "0 14px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  background: "#ffffff",
                  color: "#374151",
                  fontWeight: "800",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                marginTop: "9px",
                fontSize: "10px",
                color: "#6b7280",
              }}
            >
              The physical print format is 100 × 100 mm. The label contains the packet QR and panel details.
            </div>
          </div>
        </div>
      )}
      {/* HEADER */}

      <div
        style={{
          height: "50px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
              letterSpacing: "0.08em",
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
              padding: "0 12px",
              border:
                "1px solid #d1d5db",
              borderRadius:
                "8px",
              background:
                "#ffffff",
              fontWeight:
                "700",
              cursor:
                "pointer",
              outline:
                "none",
            }}
          >
            {sites.map(
              (site) => (
                <option
                  key={site.id}
                  value={site.id}
                >
                  {getSiteName(
                    site
                  )}

                  {getClientName(
                    site
                  ) &&
                  getClientName(
                    site
                  ) !== "Client"
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
              "calc(100% - 60px)",
            display:
              "flex",
            flexDirection:
              "column",
            minHeight:
              "0",
          }}
        >
          {/* TOP STATUS */}

          <div
            style={{
              display:
                "flex",
              gap:
                "8px",
              height:
                "65px",
              flexShrink:
                "0",
              marginBottom:
                "10px",
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
                  display:
                    "block",
                  color:
                    "#6b7280",
                  fontWeight:
                    "700",
                  fontSize:
                    "10px",
                }}
              >
                REMAINING
              </small>

              <strong
                style={{
                  display:
                    "block",
                  fontSize:
                    "21px",
                  marginTop:
                    "2px",
                }}
              >
                {
                  remainingCount
                }
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
                  display:
                    "block",
                  color:
                    "#6b7280",
                  fontWeight:
                    "700",
                  fontSize:
                    "10px",
                }}
              >
                PACKED
              </small>

              <strong
                style={{
                  display:
                    "block",
                  fontSize:
                    "21px",
                  marginTop:
                    "2px",
                }}
              >
                {
                  packedCount
                }
              </strong>
            </button>

            {/* PACKETS */}

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
                    "700",
                  fontSize:
                    "10px",
                }}
              >
                PACKETS
              </small>

              <strong
                style={{
                  display:
                    "block",
                  fontSize:
                    "21px",
                  marginTop:
                    "2px",
                }}
              >
                {
                  closedPackets.length
                }
              </strong>
            </button>

            {/* PROGRESS */}

            <div
              style={{
                flex:
                  "1 1 0",
                minWidth:
                  "0",
                border:
                  "1px solid #e5e7eb",
                background:
                  "#ffffff",
                borderRadius:
                  "10px",
                padding:
                  "9px 12px",
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
                  height:
                    "6px",
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
                    transition:
                      "width 0.2s ease",
                  }}
                />
              </div>
            </div>
          </div>

          {/* SCANNER BAR */}

          <div
            style={{
              height:
                "54px",
              flexShrink:
                "0",
              display:
                "flex",
              alignItems:
                "center",
              gap:
                "8px",
              marginBottom:
                "10px",
            }}
          >
            <div
              style={{
                flex:
                  "1",
                display:
                  "flex",
                gap:
                  "7px",
                minWidth:
                  "0",
              }}
            >
              <input
                ref={inputRef}
                autoFocus
                value={
                  manualQR
                }
                onChange={(
                  event
                ) =>
                  setManualQR(
                    event.target.value
                  )
                }
                onKeyDown={
                  handleQRKeyDown
                }
                placeholder="Scan QR code here..."
                style={{
                  flex:
                    "1",
                  minWidth:
                    "0",
                  height:
                    "42px",
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
                disabled={
                  actionLoading
                }
                onClick={
                  handleScanPanel
                }
                style={{
                  height:
                    "42px",
                  padding:
                    "0 20px",
                  border:
                    "none",
                  borderRadius:
                    "8px",
                  background:
                    actionLoading
                      ? "#9ca3af"
                      : "#2563eb",
                  color:
                    "#ffffff",
                  fontWeight:
                    "800",
                  cursor:
                    actionLoading
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {actionLoading
                  ? "Saving..."
                  : "Scan"}
              </button>
            </div>

            {/* CURRENT PACKET */}

            {openPacket ? (
              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap:
                    "6px",
                  flexShrink:
                    "0",
                }}
              >
                <span
                  style={{
                    height:
                      "40px",
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
                  {
                    openPacket.id
                  }
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
                      "40px",
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
                      actionLoading
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Close Packet
                </button>

                <button
                  disabled={
                    actionLoading
                  }
                  onClick={
                    handleDeleteOpenPacket
                  }
                  title="Delete open packet"
                  style={{
                    width:
                      "40px",
                    height:
                      "40px",
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
                      actionLoading
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            ) : null}
          </div>

          {/* MESSAGE */}

          {message && (
            <div
              style={{
                minHeight:
                  "34px",
                flexShrink:
                  "0",
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

          {/* MAIN WORKSPACE */}

          <div
            style={{
              flex:
                "1",
              minHeight:
                "0",
              display:
                "grid",
              gridTemplateColumns:
                "minmax(0, 1fr)",
              gap:
                "10px",
            }}
          >
            {/* LEFT */}

            <div
              style={{
                minWidth:
                  "0",
                minHeight:
                  "0",
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

          </div>
        </div>
      )}
    </div>
  );
}

export default QRTracking;