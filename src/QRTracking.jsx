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

  // Current OPEN packet
  const [openPacket, setOpenPacket] = useState(null);

  // CLOSED packets
  const [closedPackets, setClosedPackets] = useState([]);

  const [selectedPacketId, setSelectedPacketId] = useState(null);
  const [selectedPanelId, setSelectedPanelId] = useState(null);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const inputRef = useRef(null);

  // =========================================================
  // LOCAL STORAGE KEY
  // =========================================================

  const getPacketStorageKey = (siteId) => {
    return `trackerz_qr_packets_site_${siteId}`;
  };

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
  // LOAD DATA FROM SUPABASE
  // =========================================================

  const loadData = async () => {
    try {
      setLoading(true);

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

      const safeSites = Array.isArray(sitesData)
        ? sitesData
        : [];

      const safePanels = Array.isArray(panelsData)
        ? panelsData
        : [];

      console.log(
        "TRACKERZ QR - SUPABASE SITES:",
        safeSites
      );

      console.log(
        "TRACKERZ QR - SUPABASE PANELS:",
        safePanels
      );

      setSites(safeSites);
      setPanels(safePanels);

      // -----------------------------------------------------
      // KEEP CURRENT SITE IF IT STILL EXISTS
      // -----------------------------------------------------

      if (selectedSiteId) {
        const exists = safeSites.some(
          (site) =>
            String(site.id) ===
            String(selectedSiteId)
        );

        if (!exists) {
          setSelectedSiteId("");
        }
      }

      // -----------------------------------------------------
      // FIRST SITE
      // -----------------------------------------------------

      if (
        !selectedSiteId &&
        safeSites.length > 0
      ) {
        setSelectedSiteId(
          String(safeSites[0].id)
        );
      }
    } catch (error) {
      console.error(
        "Trackerz QR Tracking load error:",
        error
      );

      setSites([]);
      setPanels([]);

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
    loadData();
  }, []);

  // =========================================================
  // LOAD PACKETS FROM LOCAL STORAGE
  // =========================================================

  const loadLocalPackets = (siteId) => {
    if (!siteId) {
      setClosedPackets([]);
      setOpenPacket(null);
      return;
    }

    try {
      const key =
        getPacketStorageKey(siteId);

      const saved =
        localStorage.getItem(key);

      if (!saved) {
        setClosedPackets([]);
        setOpenPacket(null);
        return;
      }

      const parsed =
        JSON.parse(saved);

      setClosedPackets(
        Array.isArray(parsed.closedPackets)
          ? parsed.closedPackets
          : []
      );

      setOpenPacket(
        parsed.openPacket || null
      );
    } catch (error) {
      console.error(
        "Packet local storage error:",
        error
      );

      setClosedPackets([]);
      setOpenPacket(null);
    }
  };

  // =========================================================
  // SAVE PACKETS TO LOCAL STORAGE
  // =========================================================

  const savePacketsToLocalStorage = (
    siteId,
    openPacketValue,
    closedPacketsValue
  ) => {
    if (!siteId) {
      return;
    }

    try {
      const key =
        getPacketStorageKey(siteId);

      localStorage.setItem(
        key,
        JSON.stringify({
          openPacket:
            openPacketValue || null,
          closedPackets:
            closedPacketsValue || [],
        })
      );
    } catch (error) {
      console.error(
        "Unable to save packet data:",
        error
      );
    }
  };

  // =========================================================
  // WHEN SITE CHANGES
  // =========================================================

  useEffect(() => {
    if (!selectedSiteId) {
      return;
    }

    loadLocalPackets(
      selectedSiteId
    );

    setActiveView("remaining");
    setSelectedPacketId(null);
    setSelectedPanelId(null);
    setManualQR("");
  }, [selectedSiteId]);

  // =========================================================
  // WINDOW FOCUS REFRESH
  // =========================================================

  useEffect(() => {
    const refresh = () => {
      loadData();
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
  }, []);

  // =========================================================
  // VISIBILITY REFRESH
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

        // Primary match
        if (
          panelSiteId &&
          panelSiteId === siteId
        ) {
          return true;
        }

        // Fallback
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
  // REMAINING / PACKED
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
  // CREATE PACKET
  // =========================================================

  const createPacket = () => {
    if (!selectedSite) {
      return null;
    }

    const now =
      new Date();

    const timestamp =
      now
        .getTime()
        .toString()
        .slice(-8);

    return {
      id: `PKT-${timestamp}`,
      siteId:
        selectedSite.id,
      siteName:
        getSiteName(selectedSite),
      openedAt:
        now.toISOString(),
      panelIds: [],
      panelQRs: [],
    };
  };

  // =========================================================
  // ADD PANEL TO PACKET
  // =========================================================

  const addPanelToOpenPacket = (
    packet,
    panel
  ) => {
    return {
      ...packet,
      panelIds: [
        ...(packet.panelIds || []),
        panel.id,
      ],
      panelQRs: [
        ...(packet.panelQRs || []),
        getPanelLabel(panel),
      ],
    };
  };

  // =========================================================
  // UPDATE ONE PANEL IN SUPABASE
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
      // IF THERE IS NO OPEN PACKET
      // CREATE ONE
      // -----------------------------------------------------

      let packet =
        openPacket;

      if (!packet) {
        packet =
          createPacket();

        if (!packet) {
          throw new Error(
            "Unable to create packet."
          );
        }
      }

      // -----------------------------------------------------
      // UPDATE SUPABASE
      //
      // IMPORTANT:
      // Only use columns confirmed in your current table.
      //
      // status
      // packed
      // -----------------------------------------------------

      const updatedPanel =
        await updatePanelInSupabase(
          panel.id,
          {
            status:
              "packed",
            packed:
              true,
          }
        );

      // -----------------------------------------------------
      // ADD PANEL TO PACKET
      // -----------------------------------------------------

      const updatedPacket =
        addPanelToOpenPacket(
          packet,
          updatedPanel || panel
        );

      // -----------------------------------------------------
      // SAVE OPEN PACKET LOCALLY
      // -----------------------------------------------------

      setOpenPacket(
        updatedPacket
      );

      savePacketsToLocalStorage(
        selectedSite.id,
        updatedPacket,
        closedPackets
      );

      // -----------------------------------------------------
      // UPDATE REACT PANEL STATE
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
        )} added to ${updatedPacket.id}`
      );

      // Keep scanner ready
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
  // CLOSE CURRENT PACKET
  // =========================================================

  const handleClosePacket = () => {
    if (!openPacket) {
      showMessage(
        "No packet is currently open.",
        "error"
      );

      return;
    }

    const panelCount =
      openPacket.panelIds?.length ||
      0;

    if (panelCount === 0) {
      showMessage(
        "Cannot close an empty packet.",
        "error"
      );

      return;
    }

    const closedPacket = {
      ...openPacket,
      closedAt:
        new Date().toISOString(),
      panelCount,
      status:
        "closed",
    };

    const updatedClosedPackets = [
      ...closedPackets,
      closedPacket,
    ];

    setClosedPackets(
      updatedClosedPackets
    );

    setOpenPacket(null);

    setSelectedPacketId(
      closedPacket.id
    );

    setSelectedPanelId(
      null
    );

    setActiveView(
      "packets"
    );

    savePacketsToLocalStorage(
      selectedSite.id,
      null,
      updatedClosedPackets
    );

    showMessage(
      `${closedPacket.id} closed with ${panelCount} panel${
        panelCount === 1
          ? ""
          : "s"
      }.`
    );

    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
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

        await updatePanelInSupabase(
          panel.id,
          {
            status:
              "pending",
            packed:
              false,
          }
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

        savePacketsToLocalStorage(
          selectedSite.id,
          updatedPacket,
          closedPackets
        );

        setPanels(
          (current) =>
            current.map(
              (item) =>
                String(item.id) ===
                String(panel.id)
                  ? {
                      ...item,
                      status:
                        "pending",
                      packed:
                        false,
                    }
                  : item
            )
        );

        setSelectedPanelId(
          null
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
  // DELETE OPEN PACKET
  // =========================================================

  const handleDeleteOpenPacket =
    async () => {
      if (!openPacket) {
        return;
      }

      const panelIds =
        openPacket.panelIds ||
        [];

      const confirmed =
        window.confirm(
          `Delete ${openPacket.id} and return ${panelIds.length} panel${
            panelIds.length === 1
              ? ""
              : "s"
          } to Remaining?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(true);

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

        const updatedPanels =
          panels.map(
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
          );

        setPanels(
          updatedPanels
        );

        setOpenPacket(null);
        setSelectedPacketId(null);
        setSelectedPanelId(null);
        setActiveView(
          "remaining"
        );

        savePacketsToLocalStorage(
          selectedSite.id,
          null,
          closedPackets
        );

        showMessage(
          `${openPacket.id} deleted. Panels returned to Remaining.`
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

      const panelIds =
        packet.panelIds ||
        [];

      const confirmed =
        window.confirm(
          `Delete ${packet.id} and return ${panelIds.length} panel${
            panelIds.length === 1
              ? ""
              : "s"
          } to Remaining?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(true);

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

        const updatedClosedPackets =
          closedPackets.filter(
            (item) =>
              String(item.id) !==
              String(packet.id)
          );

        setClosedPackets(
          updatedClosedPackets
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

        savePacketsToLocalStorage(
          selectedSite.id,
          openPacket,
          updatedClosedPackets
        );

        showMessage(
          `${packet.id} deleted and panels returned to Remaining.`
        );
      } catch (error) {
        console.error(
          "Delete closed packet error:",
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

  // =========================================================
  // SITE CHANGE
  // =========================================================

  const handleSiteChange = (
    event
  ) => {
    const newSiteId =
      event.target.value;

    // Don't accidentally abandon an open packet
    if (
      openPacket &&
      openPacket.panelIds?.length > 0
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
          String(packet.id) ===
          String(selectedPacketId)
      );
    }, [
      closedPackets,
      selectedPacketId,
    ]);

  // =========================================================
  // GET PACKET PANELS FROM SUPABASE
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
  // CURRENT OPEN PACKET PANEL LIST
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

                  <button
                    disabled={
                      actionLoading
                    }
                    onClick={() =>
                      handleDeleteClosedPacket(
                        packet
                      )
                    }
                    style={{
                      marginTop:
                        "9px",
                      width:
                        "100%",
                      border:
                        "1px solid #fecaca",
                      background:
                        "#ffffff",
                      color:
                        "#dc2626",
                      borderRadius:
                        "7px",
                      padding:
                        "6px",
                      cursor:
                        actionLoading
                          ? "not-allowed"
                          : "pointer",
                      fontWeight:
                        "700",
                    }}
                  >
                    Delete Packet
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
        getPacketPanels(
          selectedPacket
        );

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
                  fontSize:
                    "18px",
                }}
              >
                📦{" "}
                {
                  selectedPacket.id
                }
              </h3>
            </div>

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
                  "#ffffff",
                color:
                  "#dc2626",
                borderRadius:
                  "7px",
                padding:
                  "7px 10px",
                cursor:
                  actionLoading
                    ? "not-allowed"
                    : "pointer",
                fontWeight:
                  "700",
              }}
            >
              Delete Packet
            </button>
          </div>

          <div
            style={{
              fontSize:
                "12px",
              color:
                "#6b7280",
                marginBottom:
                "9px",
            }}
          >
            {
              packetPanels.length
            }{" "}
            panels inside packet
          </div>

          <div
            style={{
              flex:
                "1",
              minHeight:
                "0",
            }}
          >
            {renderPanelList(
              packetPanels,
              "No panel data found"
            )}
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
          Reading sites and panels
          from Supabase.
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
      }}
    >
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
              borderRadius: "8px",
              background: "#ffffff",
              fontWeight: "700",
              cursor: "pointer",
              outline: "none",
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
            ) : (
              <div
                style={{
                  height:
                    "40px",
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
                  flexShrink:
                    "0",
                }}
              >
                Scan first panel →
                packet opens
                automatically
              </div>
            )}
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
                "minmax(0, 1fr) 290px",
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

            {/* RIGHT */}

            <div
              style={{
                minWidth:
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
                  {getSiteName(
                    selectedSite
                  )}
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
                  {getClientName(
                    selectedSite
                  )}
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
                    {
                      openPacket
                        .panelIds
                        ?.length || 0
                    }{" "}
                    panels • Scan more
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
                String(
                  selectedSite.status ||
                    ""
                ).toLowerCase() !==
                  "delivered" && (
                  <button
                    disabled={
                      actionLoading
                    }
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
                        actionLoading
                          ? "#9ca3af"
                          : "#16a34a",
                      color:
                        "#ffffff",
                      fontWeight:
                        "800",
                      cursor:
                        actionLoading
                          ? "not-allowed"
                          : "pointer",
                      marginBottom:
                        "10px",
                    }}
                  >
                    ✓ Mark Site Delivered
                  </button>
                )}

              {String(
                selectedSite.status ||
                  ""
              ).toLowerCase() ===
                "delivered" && (
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

              {/* DATABASE */}

              <div
                style={{
                  marginTop:
                    "auto",
                  paddingTop:
                    "10px",
                  borderTop:
                    "1px solid #e5e7eb",
                  fontSize:
                    "10px",
                  color:
                    "#6b7280",
                  textAlign:
                    "center",
                }}
              >
                ✓ Connected to
                Supabase
                <br />
                {
                  sitePanels.length
                }{" "}
                panels loaded
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QRTracking;