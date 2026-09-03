import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";

import { supabase } from "./supabaseClient";
import Login from "./Login";

import Projects from "./pages/Projects";
import CutlistImport from "./CutlistImport";
import QRTracking from "./QRTracking";
import Production from "./Production";
import Dispatch from "./Dispatch";

import "./App.css";

/*
=========================================================
TRACKERZ
FACTORY TRACKING APPLICATION
=========================================================

PRESERVED:
- Supabase authentication
- Logged-in company
- Company separation
- RLS-compatible queries
- sites table
- panels table
- packets table
- packet_panels table
- Cutlist Import
- QR generation
- QR Tracking
- Production
- Dispatch
- Reports
- Sites
- Existing navigation
- Existing packet/scanner functionality

DASHBOARD:
1. Progress Sites
2. Packed Sites
3. Dispatched Sites

SITE STATUS:
- Progress:
    panels packed < total panels

- Packed:
    all panels packed
    AND not all packets dispatched

- Dispatched:
    total packets > 0
    AND all packets dispatched

IMPORTANT:
Dashboard packet information is READ ONLY.
No packet / packet_panels database structure
is changed by this file.
=========================================================
*/

function App() {
  /* ======================================================
     AUTHENTICATION
  ====================================================== */

  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  /* ======================================================
     COMPANY
  ====================================================== */

  const [companyName, setCompanyName] = useState("");

  /* ======================================================
     NAVIGATION
  ====================================================== */

  const [activePage, setActivePage] = useState("dashboard");
  const [selectedSite, setSelectedSite] = useState(null);

  /* ======================================================
     DASHBOARD TABS
  ====================================================== */

  const [dashboardTab, setDashboardTab] = useState("progress");

  /* ======================================================
     DATABASE DATA
  ====================================================== */

  const [sites, setSites] = useState([]);
  const [panels, setPanels] = useState([]);

  /*
   * READ ONLY packet data for dashboard reference.
   *
   * Existing packet creation / dispatch functionality
   * remains inside QRTracking / Dispatch.
   */
  const [packets, setPackets] = useState([]);
  const [packetPanels, setPacketPanels] = useState([]);

  const [loadingData, setLoadingData] = useState(false);

  /* ======================================================
     MESSAGES
  ====================================================== */

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /* ======================================================
     CREATE SITE
  ====================================================== */

  const [showAddSite, setShowAddSite] = useState(false);

  const [siteForm, setSiteForm] = useState({
    site_name: "",
    client_name: "",
    contact: "",
    address: "",
    status: "Active",
  });

  /* ======================================================
     CUTLIST IMPORT
  ====================================================== */

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importRows, setImportRows] = useState([]);
  const [importing, setImporting] = useState(false);

  /* ======================================================
     SUPABASE AUTH SESSION
  ====================================================== */

  useEffect(() => {
    let mounted = true;

    async function getSession() {
      try {
        const {
          data,
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (sessionError) {
          console.error(
            "Supabase session error:",
            sessionError
          );
        }

        setSession(data?.session || null);
        setLoadingAuth(false);
      } catch (err) {
        console.error(
          "Unable to get Supabase session:",
          err
        );

        if (mounted) {
          setSession(null);
          setLoadingAuth(false);
        }
      }
    }

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (mounted) {
          setSession(newSession);
          setLoadingAuth(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /* ======================================================
     LOAD DATA AFTER LOGIN
  ====================================================== */

  useEffect(() => {
    if (!session) return;

    loadAllData();
  }, [session]);

  /* ======================================================
     LOAD LOGGED-IN USER COMPANY
  ====================================================== */

  useEffect(() => {
    if (!session?.user?.id) {
      setCompanyName("");
      return;
    }

    loadCompanyName();
  }, [session]);

  async function loadCompanyName() {
    try {
      const userId = session?.user?.id;

      if (!userId) {
        setCompanyName("");
        return;
      }

      /*
       * Existing company membership logic.
       * RLS continues to determine what the user can see.
       */

      const {
        data: membership,
        error: membershipError,
      } = await supabase
        .from("company_users")
        .select("company_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (membershipError) {
        throw membershipError;
      }

      if (!membership?.company_id) {
        setCompanyName("");
        return;
      }

      const {
        data: company,
        error: companyError,
      } = await supabase
        .from("companies")
        .select("company_name")
        .eq("id", membership.company_id)
        .single();

      if (companyError) {
        throw companyError;
      }

      setCompanyName(
        company?.company_name || ""
      );
    } catch (err) {
      console.error(
        "Unable to load company name:",
        err
      );

      setCompanyName("");
    }
  }

  /* ======================================================
     LOAD SITES + PANELS + PACKETS
  ====================================================== */

  async function loadAllData() {
    setLoadingData(true);
    setError("");

    try {
      /* --------------------------------------------------
         SITES
      -------------------------------------------------- */

      const {
        data: sitesData,
        error: sitesError,
      } = await supabase
        .from("sites")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

      if (sitesError) {
        throw sitesError;
      }

      /* --------------------------------------------------
         PANELS
      -------------------------------------------------- */

      const {
        data: panelsData,
        error: panelsError,
      } = await supabase
        .from("panels")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

      if (panelsError) {
        throw panelsError;
      }

      setSites(sitesData || []);
      setPanels(panelsData || []);

      /* --------------------------------------------------
         PACKETS
         
         READ ONLY.
         
         If the existing RLS allows the logged-in company
         to read packets, dashboard will show packet data.

         If not, the rest of Trackerz continues to work
         and packet dashboard counts simply remain zero.
      -------------------------------------------------- */

      let packetsData = [];

      try {
        const {
          data,
          error: packetsError,
        } = await supabase
          .from("packets")
          .select("*")
          .order("created_at", {
            ascending: false,
          });

        if (packetsError) {
          console.warn(
            "Unable to load packets for dashboard:",
            packetsError
          );
        } else {
          packetsData = data || [];
        }
      } catch (packetReadError) {
        console.warn(
          "Packet dashboard read skipped:",
          packetReadError
        );
      }

      setPackets(packetsData);

      /* --------------------------------------------------
         PACKET PANELS
         
         READ ONLY.

         Used only as a fallback to determine which site
         a packet belongs to when packets.site_id is not
         available.
      -------------------------------------------------- */

      let packetPanelsData = [];

      try {
        const {
          data,
          error: packetPanelsError,
        } = await supabase
          .from("packet_panels")
          .select("*");

        if (packetPanelsError) {
          console.warn(
            "Unable to load packet_panels for dashboard:",
            packetPanelsError
          );
        } else {
          packetPanelsData = data || [];
        }
      } catch (packetPanelsReadError) {
        console.warn(
          "Packet-panels dashboard read skipped:",
          packetPanelsReadError
        );
      }

      setPacketPanels(
        packetPanelsData
      );

      /* --------------------------------------------------
         KEEP SELECTED SITE UPDATED
      -------------------------------------------------- */

      if (selectedSite) {
        const updatedSelectedSite =
          (sitesData || []).find(
            (site) =>
              String(site.id) ===
              String(selectedSite.id)
          );

        if (updatedSelectedSite) {
          setSelectedSite(
            updatedSelectedSite
          );
        }
      }
    } catch (err) {
      console.error(
        "Trackerz load data error:",
        err
      );

      setError(
        err.message ||
          "Unable to load Trackerz data."
      );
    } finally {
      setLoadingData(false);
    }
  }

  /* ======================================================
     LOGOUT
  ====================================================== */

  async function handleLogout() {
    setError("");
    setMessage("");

    try {
      const {
        error: logoutError,
      } = await supabase.auth.signOut();

      if (logoutError) {
        throw logoutError;
      }

      setSession(null);
      setSites([]);
      setPanels([]);
      setPackets([]);
      setPacketPanels([]);
      setSelectedSite(null);
      setCompanyName("");
      setActivePage("dashboard");
    } catch (err) {
      console.error(
        "Logout error:",
        err
      );

      setError(
        err.message ||
          "Unable to logout."
      );
    }
  }

  /* ======================================================
     PANEL HELPERS
  ====================================================== */

  function getSitePanels(site) {
    if (!site) {
      return [];
    }

    return panels.filter((panel) => {
      if (
        panel.site_id !== undefined &&
        panel.site_id !== null
      ) {
        return (
          String(panel.site_id) ===
          String(site.id)
        );
      }

      if (panel.site_name) {
        return (
          String(panel.site_name)
            .trim()
            .toLowerCase() ===
          String(site.site_name || "")
            .trim()
            .toLowerCase()
        );
      }

      return false;
    });
  }

  function getSitePanelCount(site) {
    const sitePanels =
      getSitePanels(site);

    if (sitePanels.length > 0) {
      return sitePanels.reduce(
        (sum, panel) => {
          const quantity =
            Number(
              panel.quantity || 1
            );

          return (
            sum +
            (Number.isFinite(quantity)
              ? quantity
              : 1)
          );
        },
        0
      );
    }

    return Number(
      site?.panel_count || 0
    );
  }

  function isPanelPacked(panel) {
    return (
      panel?.packed === true ||
      String(panel?.status || "")
        .trim()
        .toLowerCase() === "packed"
    );
  }

  function getSiteProgress(site) {
    const sitePanels =
      getSitePanels(site);

    const total =
      sitePanels.length > 0
        ? sitePanels.reduce(
            (sum, panel) => {
              const quantity =
                Number(
                  panel.quantity || 1
                );

              return (
                sum +
                (Number.isFinite(quantity)
                  ? quantity
                  : 1)
              );
            },
            0
          )
        : Number(
            site?.panel_count || 0
          );

    const packed =
      sitePanels.reduce(
        (sum, panel) => {
          if (!isPanelPacked(panel)) {
            return sum;
          }

          const quantity =
            Number(
              panel.quantity || 1
            );

          return (
            sum +
            (Number.isFinite(quantity)
              ? quantity
              : 1)
          );
        },
        0
      );

    const balance = Math.max(
      total - packed,
      0
    );

    const percentage =
      total > 0
        ? Math.min(
            100,
            Math.round(
              (packed / total) * 100
            )
          )
        : 0;

    return {
      total,
      packed,
      balance,
      percentage,
    };
  }

  /* ======================================================
     PACKET HELPERS
  ====================================================== */

  /*
   * Find packet ID from packet_panels.
   *
   * Different versions of Trackerz may use:
   * packet_id
   * packetId
   * id of the packet relation
   */
  function getPacketIdFromRelation(
    relation
  ) {
    if (!relation) {
      return null;
    }

    return (
      relation.packet_id ??
      relation.packetId ??
      relation.packetID ??
      null
    );
  }

  /*
   * Find panel ID from packet_panels.
   */
  function getPanelIdFromRelation(
    relation
  ) {
    if (!relation) {
      return null;
    }

    return (
      relation.panel_id ??
      relation.panelId ??
      relation.panelID ??
      null
    );
  }

  /*
   * Determine which site a packet belongs to.

   * Preferred:
     packets.site_id

   * Fallback:
     packet_panels -> panel_id -> panels.site_id
  */
  function getPacketSiteId(packet) {
    if (!packet) {
      return null;
    }

    if (
      packet.site_id !== undefined &&
      packet.site_id !== null
    ) {
      return packet.site_id;
    }

    if (
      packet.siteId !== undefined &&
      packet.siteId !== null
    ) {
      return packet.siteId;
    }

    const packetId =
      packet.id ??
      packet.packet_id ??
      packet.packetId;

    if (
      packetId === undefined ||
      packetId === null
    ) {
      return null;
    }

    const relations =
      packetPanels.filter(
        (relation) =>
          String(
            getPacketIdFromRelation(
              relation
            )
          ) ===
          String(packetId)
      );

    for (const relation of relations) {
      const panelId =
        getPanelIdFromRelation(
          relation
        );

      if (
        panelId === undefined ||
        panelId === null
      ) {
        continue;
      }

      const panel =
        panels.find(
          (item) =>
            String(item.id) ===
            String(panelId)
        );

      if (
        panel?.site_id !==
          undefined &&
        panel?.site_id !== null
      ) {
        return panel.site_id;
      }
    }

    return null;
  }

  /*
   * Determine whether a packet is dispatched.

   * Existing possible fields are handled without
   * changing the database:
   *
   * status = Dispatched
   * dispatched = true
   * dispatched_at exists
   * dispatch_timestamp exists
   */
  function isPacketDispatched(
    packet
  ) {
    if (!packet) {
      return false;
    }

    const status =
      String(
        packet.status || ""
      )
        .trim()
        .toLowerCase();

    if (
      status === "dispatched" ||
      status === "dispatch"
    ) {
      return true;
    }

    if (
      packet.dispatched === true ||
      packet.is_dispatched === true
    ) {
      return true;
    }

    if (
      packet.dispatched_at ||
      packet.dispatchedAt ||
      packet.dispatch_timestamp ||
      packet.dispatch_time
    ) {
      return true;
    }

    return false;
  }

  /*
   * Get all packets belonging to a site.
   */
  function getSitePackets(site) {
    if (!site) {
      return [];
    }

    return packets.filter(
      (packet) => {
        const packetSiteId =
          getPacketSiteId(
            packet
          );

        return (
          packetSiteId !==
            null &&
          String(
            packetSiteId
          ) ===
            String(site.id)
        );
      }
    );
  }

  /*
   * Packet summary for dashboard.
   */
  function getSitePacketSummary(
    site
  ) {
    const sitePackets =
      getSitePackets(site);

    const totalPackets =
      sitePackets.length;

    const dispatchedPackets =
      sitePackets.filter(
        isPacketDispatched
      ).length;

    return {
      totalPackets,
      dispatchedPackets,
    };
  }

  /*
   * A site is considered dispatched only when:

   * 1. It has at least one packet
   * 2. Every packet is dispatched
   *
   * This prevents a newly created site with zero packets
   * from incorrectly appearing in Dispatched Sites.
   */
  function isSiteDispatched(
    site
  ) {
    const {
      totalPackets,
      dispatchedPackets,
    } =
      getSitePacketSummary(
        site
      );

    return (
      totalPackets > 0 &&
      dispatchedPackets >=
        totalPackets
    );
  }

  /* ======================================================
     DASHBOARD DATA
  ====================================================== */

  const dashboardSiteData =
    useMemo(() => {
      return sites.map((site) => {
        const progress =
          getSiteProgress(site);

        const packetSummary =
          getSitePacketSummary(
            site
          );

        const dispatched =
          isSiteDispatched(
            site
          );

        return {
          ...site,

          progress,

          totalPackets:
            packetSummary.totalPackets,

          dispatchedPackets:
            packetSummary.dispatchedPackets,

          dispatched,
        };
      });
    }, [
      sites,
      panels,
      packets,
      packetPanels,
    ]);

  /*
   * IMPORTANT ORDER:
   *
   * Dispatched first.
   * Then Packed.
   * Then Progress.
   *
   * A dispatched site must not remain in Packed Sites.
   */

  const dispatchedSites =
    dashboardSiteData.filter(
      (site) =>
        site.dispatched
    );

  const packedSites =
    dashboardSiteData.filter(
      (site) =>
        !site.dispatched &&
        site.progress.percentage ===
          100
    );

  const progressSites =
    dashboardSiteData.filter(
      (site) =>
        !site.dispatched &&
        site.progress.percentage <
          100
    );

  const dashboardSites =
    dashboardTab === "packed"
      ? packedSites
      : dashboardTab ===
          "dispatched"
        ? dispatchedSites
        : progressSites;

  /* ======================================================
     CREATE SITE
  ====================================================== */

  async function createSite(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    const siteName =
      siteForm.site_name.trim();

    if (!siteName) {
      setError(
        "Please enter a site name."
      );
      return;
    }

    try {
      const {
        data,
        error: createError,
      } = await supabase
        .from("sites")
        .insert([
          {
            site_name: siteName,
            client_name:
              siteForm.client_name.trim(),
            contact:
              siteForm.contact.trim(),
            address:
              siteForm.address.trim(),
            panel_count: 0,
            status:
              siteForm.status ||
              "Active",
          },
        ])
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      setSites((previous) => [
        data,
        ...previous,
      ]);

      setSiteForm({
        site_name: "",
        client_name: "",
        contact: "",
        address: "",
        status: "Active",
      });

      setShowAddSite(false);

      setSelectedSite(data);
      setActivePage("site");

      setMessage(
        "Site created successfully."
      );
    } catch (err) {
      console.error(
        "Create site error:",
        err
      );

      setError(
        err.message ||
          "Unable to create site."
      );
    }
  }

  /* ======================================================
     CREATE SITE FROM CUTLIST WORKFLOW
  ====================================================== */

  async function createSiteRecord({
    site_name,
    client_name,
    contact,
    address,
  }) {
    const cleanSiteName =
      String(
        site_name || ""
      ).trim();

    if (!cleanSiteName) {
      throw new Error(
        "Please enter a site name."
      );
    }

    const {
      data: existingSite,
      error: existingSiteError,
    } = await supabase
      .from("sites")
      .select("id, site_name")
      .ilike(
        "site_name",
        cleanSiteName
      )
      .limit(1);

    if (existingSiteError) {
      throw existingSiteError;
    }

    if (
      existingSite &&
      existingSite.length > 0
    ) {
      throw new Error(
        `Site "${cleanSiteName}" already exists. Use the existing site from the Sites page instead of creating a duplicate.`
      );
    }

    const {
      data,
      error: createError,
    } = await supabase
      .from("sites")
      .insert([
        {
          site_name:
            cleanSiteName,

          client_name:
            String(
              client_name || ""
            ).trim(),

          contact:
            String(
              contact || ""
            ).trim(),

          address:
            String(
              address || ""
            ).trim(),

          panel_count: 0,

          status: "Active",
        },
      ])
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    setSites((previous) => [
      data,
      ...previous,
    ]);

    setSelectedSite(data);

    return data;
  }

  /* ======================================================
     EXCEL FILE SELECT
  ====================================================== */

  async function handleFileSelect(
    event
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    setImportFile(file);
    setImportRows([]);
    setError("");
    setMessage("");

    try {
      const buffer =
        await file.arrayBuffer();

      const workbook =
        XLSX.read(buffer, {
          type: "array",
        });

      if (
        !workbook.SheetNames ||
        workbook.SheetNames.length ===
          0
      ) {
        throw new Error(
          "No worksheet found."
        );
      }

      const firstSheet =
        workbook.Sheets[
          workbook.SheetNames[0]
        ];

      const rows =
        XLSX.utils.sheet_to_json(
          firstSheet,
          {
            defval: "",
          }
        );

      if (!rows.length) {
        setError(
          "The Excel file does not contain any data."
        );

        return;
      }

      setImportRows(rows);

      setMessage(
        `${rows.length} rows found in the cutlist.`
      );
    } catch (err) {
      console.error(
        "Excel read error:",
        err
      );

      setError(
        "Unable to read this Excel file."
      );

      setImportRows([]);
    }
  }

  /* ======================================================
     EXCEL HELPERS
  ====================================================== */

  function findColumn(
    row,
    possibleNames
  ) {
    const keys =
      Object.keys(row);

    for (
      const name of possibleNames
    ) {
      const found = keys.find(
        (key) =>
          String(key)
            .trim()
            .toLowerCase() ===
          String(name)
            .trim()
            .toLowerCase()
      );

      if (found) {
        return found;
      }
    }

    return null;
  }

  function valueFromRow(
    row,
    possibleNames
  ) {
    const column =
      findColumn(
        row,
        possibleNames
      );

    if (!column) {
      return "";
    }

    return row[column];
  }

  function numberFromRow(
    row,
    possibleNames
  ) {
    const value =
      valueFromRow(
        row,
        possibleNames
      );

    if (
      value === "" ||
      value === null ||
      value === undefined
    ) {
      return null;
    }

    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : null;
  }

  /* ======================================================
     IMPORT CUTLIST
  ====================================================== */

  async function importCutlist(
    siteOverride = null,
    options = {}
  ) {
    const activeSite =
      siteOverride ||
      selectedSite;

    const {
      keepPreview = false,
    } = options;

    if (!activeSite) {
      setError(
        "Please select a site first."
      );
      return;
    }

    if (!importRows.length) {
      setError(
        "Please select an Excel file containing the cutlist."
      );
      return;
    }

    setImporting(true);
    setError("");
    setMessage("");

    try {
      /*
       * IMPORTANT:
       * Quantity is now treated as the number of
       * physical panels.
       *
       * Example:
       * Quantity = 3
       * -> 3 separate rows in panels table
       * -> 3 unique QR codes
       * -> quantity = 1 on each physical panel
       *
       * No database structure is changed.
       */
      const rowsToInsert = [];

      let physicalIndex = 0;

      importRows.forEach(
        (row, index) => {
          const assemblyLabel =
            valueFromRow(row, [
              "Assembly Label",
              "assembly_label",
              "Assembly",
            ]);

          const sectionName =
            valueFromRow(row, [
              "Section Name",
              "section_name",
              "Section",
            ]);

          const cabinetName =
            valueFromRow(row, [
              "Cabinet Name",
              "cabinet_name",
              "Cabinet",
            ]);

          const roomName =
            valueFromRow(row, [
              "Room Name",
              "room_name",
              "Room",
            ]);

          const material =
            valueFromRow(row, [
              "Material",
              "material",
            ]);

          const fbName =
            valueFromRow(row, [
              "FB Name",
              "fb_name",
            ]);

          const customer =
            valueFromRow(row, [
              "Customer",
              "customer",
            ]);

          const remark =
            valueFromRow(row, [
              "Remark",
              "remark",
            ]);

          const panelName =
            assemblyLabel ||
            fbName ||
            sectionName ||
            valueFromRow(row, [
              "Panel",
              "Panel Name",
              "panel",
              "panel_name",
              "Part",
              "Part No",
              "Name",
              "Description",
            ]) ||
            `Panel-${index + 1}`;

          const length =
            numberFromRow(row, [
              "FB Length",
              "Length",
              "length",
              "Len",
              "L",
            ]);

          const width =
            numberFromRow(row, [
              "FB Width",
              "Width",
              "width",
              "Wid",
              "W",
            ]);

          const thickness =
            numberFromRow(row, [
              "Thickness",
              "thickness",
              "Thk",
              "T",
            ]);

          const quantityValue =
            numberFromRow(row, [
              "Quantity",
              "Qty",
              "quantity",
              "count",
            ]);

          const quantity =
            quantityValue === null
              ? 1
              : Math.max(
                  1,
                  Math.floor(
                    Number(
                      quantityValue
                    )
                  )
                );

          const cleanSiteName =
            String(
              activeSite.site_name
            )
              .trim()
              .replace(
                /[^a-zA-Z0-9]+/g,
                "-"
              )
              .replace(
                /^-+|-+$/g,
                ""
              )
              .toUpperCase();

          /*
           * Expand one Excel row into one database
           * record for every physical panel.
           */
          for (
            let copy = 1;
            copy <= quantity;
            copy++
          ) {
            physicalIndex += 1;

            const qrData =
              `TRK-${cleanSiteName}-${String(
                physicalIndex
              ).padStart(4, "0")}`;

            rowsToInsert.push({
              site_id:
                activeSite.id,

              site_name:
                activeSite.site_name,

              panel_name:
                String(panelName),

              length:
                length,

              width:
                width,

              thickness:
                thickness,

              /*
               * Each database row represents ONE
               * physical panel.
               */
              quantity:
                1,

              status:
                "Pending",

              packed:
                false,

              qr_data:
                String(qrData),
            });
          }
        }
      );

      let insertedTotal = 0;

      const batchSize = 100;

      /*
       * Existing panels columns only.
       *
       * No length_num.
       */

      for (
        let i = 0;
        i < rowsToInsert.length;
        i += batchSize
      ) {
        const batch =
          rowsToInsert.slice(
            i,
            i + batchSize
          );

        const {
          error: insertError,
        } = await supabase
          .from("panels")
          .insert(batch);

        if (insertError) {
          throw insertError;
        }

        insertedTotal +=
          batch.length;
      }

      /*
       * Because every inserted database row now
       * represents exactly ONE physical panel,
       * insertedTotal is also the physical panel count.
       */
      const importedQuantity =
        insertedTotal;

      const currentSitePanelCount =
        getSitePanelCount(
          activeSite
        );

      const newPanelCount =
        currentSitePanelCount +
        importedQuantity;

      const {
        data: updatedSite,
        error: siteUpdateError,
      } = await supabase
        .from("sites")
        .update({
          panel_count:
            newPanelCount,
        })
        .eq(
          "id",
          activeSite.id
        )
        .select()
        .single();

      if (siteUpdateError) {
        throw siteUpdateError;
      }

      setSites((previous) =>
        previous.map((site) =>
          String(site.id) ===
          String(activeSite.id)
            ? updatedSite
            : site
        )
      );

      setSelectedSite(
        updatedSite
      );

      if (!keepPreview) {
        setImportRows([]);
        setImportFile(null);
        setShowImport(false);
      }

      await loadAllData();

      setMessage(
        `${insertedTotal} physical panel${
          insertedTotal === 1
            ? ""
            : "s"
        } imported successfully.`
      );

      return {
        success: true,
        insertedTotal,
        site: updatedSite,
      };
    } catch (err) {
      console.error(
        "Import cutlist error:",
        err
      );

      setError(
        err.message ||
          "Unable to import the cutlist. Please check the Panels table columns."
      );

      throw err;
    } finally {
      setImporting(false);
    }
  }

  /* ======================================================
     PACK / UNPACK
  ====================================================== */

  async function togglePacked(
    panel
  ) {
    setError("");
    setMessage("");

    const currentlyPacked =
      isPanelPacked(panel);

    const newPacked =
      !currentlyPacked;

    const newStatus =
      newPacked
        ? "Packed"
        : "Pending";

    try {
      const {
        data,
        error: updateError,
      } = await supabase
        .from("panels")
        .update({
          packed:
            newPacked,

          status:
            newStatus,
        })
        .eq(
          "id",
          panel.id
        )
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      setPanels((previous) =>
        previous.map(
          (item) =>
            String(item.id) ===
            String(panel.id)
              ? data
              : item
        )
      );

      setMessage(
        newPacked
          ? "Panel marked as packed."
          : "Panel returned to pending."
      );
    } catch (err) {
      console.error(
        "Pack update error:",
        err
      );

      setError(
        err.message ||
          "Unable to update panel. Check the Panels UPDATE RLS policy."
      );
    }
  }

  /* ======================================================
     DELETE SITE
  ====================================================== */

  async function deleteSite(
    site
  ) {
    if (!site) {
      return;
    }

    const siteName =
      site.site_name ||
      "this site";

    const confirmed =
      window.confirm(
        `Delete "${siteName}"?\n\nThis will permanently delete the site and all panels belonging to it.`
      );

    if (!confirmed) {
      return;
    }

    setError("");
    setMessage("");

    try {
      const {
        error: panelDeleteError,
      } = await supabase
        .from("panels")
        .delete()
        .eq(
          "site_id",
          site.id
        );

      if (panelDeleteError) {
        throw panelDeleteError;
      }

      const {
        error: siteDeleteError,
      } = await supabase
        .from("sites")
        .delete()
        .eq(
          "id",
          site.id
        );

      if (siteDeleteError) {
        throw siteDeleteError;
      }

      setSites((previous) =>
        previous.filter(
          (item) =>
            String(item.id) !==
            String(site.id)
        )
      );

      setPanels((previous) =>
        previous.filter(
          (item) =>
            String(item.site_id) !==
            String(site.id)
        )
      );

      setSelectedSite(null);
      setActivePage("sites");

      setMessage(
        `${siteName} deleted successfully.`
      );
    } catch (err) {
      console.error(
        "Delete site error:",
        err
      );

      setError(
        err.message ||
          "Unable to delete the site. Check the Sites and Panels DELETE RLS policies."
      );
    }
  }

  /* ======================================================
     OPEN SITE
  ====================================================== */

  function openSite(site) {
    setSelectedSite(site);
    setActivePage("site");

    setError("");
    setMessage("");
  }

  /* ======================================================
     SELECTED SITE PANELS
  ====================================================== */

  const selectedSitePanels =
    useMemo(() => {
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

  const selectedSiteTotal =
    selectedSitePanels.reduce(
      (sum, panel) => {
        const quantity =
          Number(
            panel.quantity || 1
          );

        return (
          sum +
          (Number.isFinite(quantity)
            ? quantity
            : 1)
        );
      },
      0
    );

  const selectedSitePacked =
    selectedSitePanels.reduce(
      (sum, panel) => {
        if (
          !isPanelPacked(panel)
        ) {
          return sum;
        }

        const quantity =
          Number(
            panel.quantity || 1
          );

        return (
          sum +
          (Number.isFinite(quantity)
            ? quantity
            : 1)
        );
      },
      0
    );

  /* ======================================================
     NAVIGATION
  ====================================================== */

  function navigateTo(page) {
    setActivePage(page);

    if (
      page === "dashboard" ||
      page === "sites"
    ) {
      setSelectedSite(null);

      if (page === "sites") {
        setDashboardTab("active");
      }
    }

    setError("");
    setMessage("");
  }

  /* ======================================================
     SIDEBAR
  ====================================================== */

  function renderNavigation() {
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

            {companyName && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "#2563eb",
                  letterSpacing: "0.4px",
                }}
              >
                {companyName}
              </div>
            )}
          </div>

        </div>

        <nav>

          <button
            className={`nav-item ${
              activePage ===
              "dashboard"
                ? "active"
                : ""
            }`}
            onClick={() =>
              navigateTo(
                "dashboard"
              )
            }
          >
            <span>▦</span>
            Dashboard
          </button>

          <button
            className={`nav-item ${
              activePage ===
              "cutlist"
                ? "active"
                : ""
            }`}
            onClick={() =>
              navigateTo(
                "cutlist"
              )
            }
          >
            <span>▤</span>
            Cutlist Import
          </button>

          <button
            className={`nav-item ${
              activePage ===
              "qr"
                ? "active"
                : ""
            }`}
            onClick={() =>
              navigateTo("qr")
            }
          >
            <span>⌗</span>
            QR Tracking
          </button>

          <button
            className={`nav-item ${
              activePage ===
              "reports"
                ? "active"
                : ""
            }`}
            onClick={() =>
              navigateTo(
                "reports"
              )
            }
          >
            <span>▥</span>
            Reports
          </button>

          <button
            className={`nav-item ${
              activePage ===
              "dispatch"
                ? "active"
                : ""
            }`}
            onClick={() =>
              navigateTo(
                "dispatch"
              )
            }
          >
            <span>⇢</span>
            Dispatch
          </button>

          <button
            className={`nav-item ${
              activePage ===
              "sites"
                ? "active"
                : ""
            }`}
            onClick={() =>
              navigateTo(
                "sites"
              )
            }
          >
            <span>⌂</span>
            Sites
          </button>

        </nav>

        <div className="sidebar-bottom">

          <button
            className={`nav-item ${
              activePage ===
              "settings"
                ? "active"
                : ""
            }`}
            onClick={() =>
              navigateTo(
                "settings"
              )
            }
          >
            <span>⚙</span>
            Settings
          </button>

          <div className="user">

            <div className="avatar">
              {(
                session?.user
                  ?.email ||
                "A"
              )
                .charAt(0)
                .toUpperCase()}
            </div>

            <div>
              <strong>
                {session?.user
                  ?.email ||
                  "Admin"}
              </strong>

              <small>
                Factory Manager
              </small>
            </div>

          </div>

          <button
            onClick={
              handleLogout
            }
            style={{
              width: "100%",
              marginTop:
                "12px",
              padding:
                "9px 12px",
              border:
                "1px solid #d1d5db",
              background:
                "#ffffff",
              color:
                "#374151",
              borderRadius:
                "7px",
              cursor:
                "pointer",
              fontWeight:
                "600",
            }}
          >
            Sign Out
          </button>

        </div>

      </aside>
    );
  }

  /* ======================================================
     DASHBOARD EMPTY STATE
  ====================================================== */

  function renderDashboardSiteProgress() {
    if (
      dashboardSites.length ===
      0
    ) {
      return (
        <div
          style={{
            padding: "50px 20px",
            textAlign: "center",
            color: "#6b7280",
          }}
        >
          <div
            style={{
              fontSize: "38px",
              marginBottom: "10px",
            }}
          >
            {dashboardTab ===
            "progress"
              ? "▤"
              : dashboardTab ===
                  "packed"
                ? "✓"
                : "✓"}
          </div>

          <h3
            style={{
              margin:
                "0 0 8px",
              color:
                "#374151",
            }}
          >
            {dashboardTab ===
            "progress"
              ? "No progress sites"
              : dashboardTab ===
                  "packed"
                ? "No packed sites"
                : "No dispatched sites"}
          </h3>

          <p
            style={{
              margin: 0,
            }}
          >
            {dashboardTab ===
            "progress"
              ? "All current sites are either fully packed or dispatched."
              : dashboardTab ===
                  "packed"
                ? "No site is fully packed yet."
                : "No site has all packets dispatched yet."}
          </p>
        </div>
      );
    }

    return (
      <div
        style={{
          width: "100%",
          overflowX: "auto",
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: "1100px",
            borderCollapse:
              "collapse",
            background:
              "#ffffff",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom:
                  "1px solid #e5e7eb",
                background:
                  "#f8fafc",
              }}
            >
              <th className="dashboard-th">
                Site Name
              </th>

              <th className="dashboard-th">
                Client Name
              </th>

              <th className="dashboard-th center">
                Total Panels
              </th>

              <th className="dashboard-th center">
                Packed
              </th>

              <th className="dashboard-th center">
                Balance
              </th>

              <th className="dashboard-th center">
                Total Packets
              </th>

              <th className="dashboard-th center">
                Dispatched Packets
              </th>

              <th className="dashboard-th center">
                Production
              </th>
            </tr>
          </thead>

          <tbody>
            {dashboardSites.map(
              (site) => {
                const progress =
                  site.progress;

                return (
                  <tr
                    key={site.id}
                    style={{
                      borderBottom:
                        "1px solid #eef0f3",
                    }}
                  >
                    <td
                      style={{
                        padding:
                          "16px",
                        fontWeight:
                          "700",
                        fontSize:
                          "15px",
                        color:
                          "#111827",
                      }}
                    >
                      {site.site_name ||
                        "Unnamed Site"}
                    </td>

                    <td
                      style={{
                        padding:
                          "16px",
                        fontSize:
                          "14px",
                        color:
                          "#4b5563",
                      }}
                    >
                      {site.client_name ||
                        "—"}
                    </td>

                    <td
                      style={{
                        padding:
                          "16px",
                        textAlign:
                          "center",
                        fontWeight:
                          "700",
                      }}
                    >
                      {progress.total}
                    </td>

                    <td
                      style={{
                        padding:
                          "16px",
                        textAlign:
                          "center",
                        fontWeight:
                          "700",
                        color:
                          "#16a34a",
                      }}
                    >
                      {progress.packed}
                    </td>

                    <td
                      style={{
                        padding:
                          "16px",
                        textAlign:
                          "center",
                        fontWeight:
                          "700",
                        color:
                          progress.balance >
                          0
                            ? "#dc2626"
                            : "#16a34a",
                      }}
                    >
                      {progress.balance}
                    </td>

                    <td
                      style={{
                        padding:
                          "16px",
                        textAlign:
                          "center",
                        fontWeight:
                          "700",
                        color:
                          "#111827",
                      }}
                    >
                      {site.totalPackets}
                    </td>

                    <td
                      style={{
                        padding:
                          "16px",
                        textAlign:
                          "center",
                        fontWeight:
                          "700",
                        color:
                          site.dispatchedPackets >
                          0
                            ? "#16a34a"
                            : "#6b7280",
                      }}
                    >
                      {
                        site.dispatchedPackets
                      }
                    </td>

                    <td
                      style={{
                        padding:
                          "16px",
                        textAlign:
                          "center",
                        minWidth:
                          "180px",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap: "10px",
                        }}
                      >
                        <div
                          style={{
                            flex:
                              "1",
                            height:
                              "8px",
                            background:
                              "#e5e7eb",
                            borderRadius:
                              "999px",
                            overflow:
                              "hidden",
                          }}
                        >
                          <div
                            style={{
                              height:
                                "100%",
                              width: `${progress.percentage}%`,
                              background:
                                progress.percentage ===
                                100
                                  ? "#16a34a"
                                  : "#2563eb",
                              borderRadius:
                                "999px",
                            }}
                          />
                        </div>

                        <strong
                          style={{
                            minWidth:
                              "42px",
                            fontSize:
                              "14px",
                          }}
                        >
                          {
                            progress.percentage
                          }
                          %
                        </strong>
                      </div>
                    </td>
                  </tr>
                );
              }
            )}
          </tbody>
        </table>
      </div>
    );
  }

  /* ======================================================
     DASHBOARD
  ====================================================== */

  function renderDashboard() {
    const tabs = [
      {
        key: "progress",
        label:
          "Progress Sites",
        count:
          progressSites.length,
        icon: "▤",
      },
      {
        key: "packed",
        label:
          "Packed Sites",
        count:
          packedSites.length,
        icon: "✓",
      },
      {
        key: "dispatched",
        label:
          "Dispatched Sites",
        count:
          dispatchedSites.length,
        icon: "✓",
      },
    ];

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
          </div>

          <button
            className="secondary-button"
            onClick={
              loadAllData
            }
            disabled={
              loadingData
            }
          >
            {loadingData
              ? "Refreshing..."
              : "↻ Refresh"}
          </button>
        </header>

        <section className="panel">

          <div
            style={{
              width: "100%",
              boxSizing:
                "border-box",
              border:
                "1px solid #e5e7eb",
              borderRadius:
                "16px",
              background:
                "#ffffff",
              padding:
                "0 28px",
              marginBottom:
                "24px",
            }}
          >
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "stretch",
                overflowX:
                  "auto",
              }}
            >
              {tabs.map(
                (tab) => {
                  const active =
                    dashboardTab ===
                    tab.key;

                  return (
                    <button
                      key={
                        tab.key
                      }
                      type="button"
                      onClick={() =>
                        setDashboardTab(
                          tab.key
                        )
                      }
                      style={{
                        flex:
                          "0 0 auto",
                        minWidth:
                          "240px",
                        padding:
                          "22px 24px 18px",
                        border:
                          "none",
                        borderBottom:
                          active
                            ? "4px solid #2563eb"
                            : "4px solid transparent",
                        background:
                          "transparent",
                        color:
                          active
                            ? "#2563eb"
                            : "#6b7280",
                        fontSize:
                          "18px",
                        fontWeight:
                          active
                            ? "700"
                            : "600",
                        cursor:
                          "pointer",
                        textAlign:
                          "left",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      <span
                        style={{
                          marginRight:
                            "8px",
                        }}
                      >
                        {
                          tab.icon
                        }
                      </span>

                      {
                        tab.label
                      }{" "}
                      (
                      {
                        tab.count
                      }
                      )
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {renderDashboardSiteProgress()}

        </section>
      </>
    );
  }

  /* ======================================================
     SITES PAGE

     ACTIVE / COMPLETED:
     - Active = site is not fully packed and dispatched
     - Completed = all panels packed AND all packets dispatched
     - Status column removed; Trackerz determines the status
     - Open Site allows access to site details and downloads
  ====================================================== */

  function renderSitesPage() {
    const activeSites = sites.filter((site) => {
      const progress = getSiteProgress(site);
      const packetSummary = getSitePacketSummary(site);

      const completed =
        progress.total > 0 &&
        progress.percentage === 100 &&
        packetSummary.totalPackets > 0 &&
        packetSummary.dispatchedPackets >=
          packetSummary.totalPackets;

      return !completed;
    });

    const completedSites = sites.filter((site) => {
      const progress = getSiteProgress(site);
      const packetSummary = getSitePacketSummary(site);

      return (
        progress.total > 0 &&
        progress.percentage === 100 &&
        packetSummary.totalPackets > 0 &&
        packetSummary.dispatchedPackets >=
          packetSummary.totalPackets
      );
    });

    const displayedSites =
      dashboardTab === "completed"
        ? completedSites
        : activeSites;

    return (
      <section>

        <div className="section-header">

          <div>
            <p className="eyebrow">
              TRACKERZ
            </p>

            <h2>
              Sites
            </h2>

            <p>
              View current active sites and completed sites.
            </p>
          </div>

        </div>

        <div
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background: "#ffffff",
            padding: "0 18px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              overflowX: "auto",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setDashboardTab("active")
              }
              style={{
                flex: "0 0 auto",
                minWidth: "180px",
                padding: "17px 22px 14px",
                border: "none",
                borderBottom:
                  dashboardTab === "active"
                    ? "4px solid #2563eb"
                    : "4px solid transparent",
                background: "transparent",
                color:
                  dashboardTab === "active"
                    ? "#2563eb"
                    : "#6b7280",
                fontSize: "16px",
                fontWeight:
                  dashboardTab === "active"
                    ? "700"
                    : "600",
                cursor: "pointer",
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              ▤ Active Sites ({activeSites.length})
            </button>

            <button
              type="button"
              onClick={() =>
                setDashboardTab("completed")
              }
              style={{
                flex: "0 0 auto",
                minWidth: "190px",
                padding: "17px 22px 14px",
                border: "none",
                borderBottom:
                  dashboardTab === "completed"
                    ? "4px solid #16a34a"
                    : "4px solid transparent",
                background: "transparent",
                color:
                  dashboardTab === "completed"
                    ? "#16a34a"
                    : "#6b7280",
                fontSize: "16px",
                fontWeight:
                  dashboardTab === "completed"
                    ? "700"
                    : "600",
                cursor: "pointer",
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              ✓ Completed Sites ({completedSites.length})
            </button>
          </div>
        </div>

        {displayedSites.length === 0 ? (
          <div className="empty-card">

            <div className="empty-icon">
              {dashboardTab === "completed"
                ? "✓"
                : "⌂"}
            </div>

            <h3>
              {dashboardTab === "completed"
                ? "No completed sites"
                : "No active sites"}
            </h3>

            <p>
              {dashboardTab === "completed"
                ? "Sites will move here after all panels are packed and all packets are dispatched."
                : "Create your first factory site to begin tracking."}
            </p>

            {dashboardTab === "active" && (
              <button
                className="primary-button"
                onClick={() =>
                  setShowAddSite(true)
                }
              >
                + Create First Site
              </button>
            )}

          </div>
        ) : (
          <div
            className="panel"
            style={{
              padding: "0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "100%",
                overflowX: "auto",
              }}
            >
              <table
                style={{
                  width: "100%",
                  minWidth: "950px",
                  borderCollapse: "collapse",
                  background: "#ffffff",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#f8fafc",
                      borderBottom:
                        "1px solid #e5e7eb",
                    }}
                  >
                    <th
                      className="dashboard-th"
                      style={{ textAlign: "left" }}
                    >
                      Site Name
                    </th>

                    <th
                      className="dashboard-th"
                      style={{ textAlign: "left" }}
                    >
                      Client Name
                    </th>

                    <th
                      className="dashboard-th"
                      style={{ textAlign: "left" }}
                    >
                      Contact
                    </th>

                    <th
                      className="dashboard-th"
                      style={{ textAlign: "left" }}
                    >
                      Address
                    </th>

                    <th
                      className="dashboard-th center"
                    >
                      Panels
                    </th>

                    <th
                      className="dashboard-th center"
                    >
                      Progress
                    </th>

                    <th
                      className="dashboard-th center"
                    >
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {displayedSites.map((site) => {
                    const progress =
                      getSiteProgress(site);

                    return (
                      <tr
                        key={site.id}
                        style={{
                          borderBottom:
                            "1px solid #eef0f3",
                        }}
                      >
                        <td
                          style={{
                            padding: "15px 16px",
                            fontWeight: "700",
                            fontSize: "15px",
                            color: "#111827",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {site.site_name ||
                            "Unnamed Site"}
                        </td>

                        <td
                          style={{
                            padding: "15px 16px",
                            color: "#374151",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {site.client_name || "—"}
                        </td>

                        <td
                          style={{
                            padding: "15px 16px",
                            color: "#374151",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {site.contact || "—"}
                        </td>

                        <td
                          style={{
                            padding: "15px 16px",
                            color: "#4b5563",
                            maxWidth: "300px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={site.address || ""}
                        >
                          {site.address || "—"}
                        </td>

                        <td
                          style={{
                            padding: "15px 16px",
                            textAlign: "center",
                            fontWeight: "700",
                          }}
                        >
                          {progress.total}
                        </td>

                        <td
                          style={{
                            padding: "15px 16px",
                            textAlign: "center",
                            minWidth: "150px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <div
                              style={{
                                flex: "1",
                                height: "7px",
                                background: "#e5e7eb",
                                borderRadius: "999px",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${progress.percentage}%`,
                                  background:
                                    progress.percentage === 100
                                      ? "#16a34a"
                                      : "#2563eb",
                                  borderRadius: "999px",
                                }}
                              />
                            </div>

                            <strong
                              style={{
                                minWidth: "35px",
                                fontSize: "13px",
                              }}
                            >
                              {progress.percentage}%
                            </strong>
                          </div>
                        </td>

                        <td
                          style={{
                            padding: "15px 16px",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() =>
                              openSite(site)
                            }
                            style={{
                              marginRight: "7px",
                            }}
                          >
                            Open Site
                          </button>

                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              deleteSite(site)
                            }
                          >
                            Delete Site
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </section>
    );
  }

  /* ======================================================
     SITE DOWNLOADS

     Download the physical panel records already stored
     in Supabase for the selected site.
  ====================================================== */

  function getPanelQrData(panel) {
    return (
      panel?.qr_data ||
      panel?.qr_code ||
      panel?.panel_code ||
      ""
    );
  }

  function getPanelLabelNumber(panel, fallbackIndex) {
    const qrData = getPanelQrData(panel);
    const match = String(qrData).match(/(\d+)$/);

    if (match) {
      return match[1];
    }

    return String(fallbackIndex + 1).padStart(4, "0");
  }

  function getCleanText(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value).trim();
  }

  function getSitePanelsInQrOrder(site) {
    return getSitePanels(site)
      .slice()
      .sort((a, b) => {
        const aNo = Number(
          getPanelLabelNumber(a, 0)
        );
        const bNo = Number(
          getPanelLabelNumber(b, 0)
        );

        return aNo - bNo;
      });
  }

  function downloadSiteCutlist() {
    if (!selectedSite) {
      setError("Please select a site first.");
      return;
    }

    const sitePanels =
      getSitePanels(selectedSite);

    if (!sitePanels.length) {
      setError(
        "There are no panel records available for this site to download."
      );
      return;
    }

    const rows = sitePanels.map(
      (panel) => ({
        "Site Name":
          selectedSite.site_name || "",
        "Client Name":
          selectedSite.client_name || "",
        "Material":
          panel.material || "",
        "Panel":
          panel.panel_name || "",
        "Length":
          panel.length ?? "",
        "Width":
          panel.width ?? "",
        "Thickness":
          panel.thickness ?? "",
        "Quantity":
          1,
        "QR Data":
          getPanelQrData(panel),
        "Status":
          panel.status || "",
        "Packed":
          panel.packed === true
            ? "Yes"
            : "No",
      })
    );

    const worksheet =
      XLSX.utils.json_to_sheet(
        rows
      );

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Cutlist"
    );

    const cleanSiteName =
      String(
        selectedSite.site_name ||
          "SITE"
      )
        .trim()
        .replace(
          /[^a-zA-Z0-9]+/g,
          "-"
        )
        .replace(
          /^-+|-+$/g,
          ""
        )
        .toUpperCase();

    XLSX.writeFile(
      workbook,
      `${cleanSiteName}_Cutlist.xlsx`
    );

    setMessage(
      "Site cutlist downloaded successfully."
    );
  }

  async function downloadSiteManualQrPdf() {
    if (!selectedSite) {
      setError("Please select a site first.");
      return;
    }

    const sitePanels =
      getSitePanelsInQrOrder(
        selectedSite
      );

    if (!sitePanels.length) {
      setError(
        "There are no panel records available for this site."
      );
      return;
    }

    setError("");
    setMessage("");

    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [210, 297],
        compress: true,
      });

      const PAGE_W = 210;
      const PAGE_H = 297;
      const LABEL_W = 64;
      const LABEL_H = 34;
      const LEFT = 6;
      const TOP = 12;
      const COL_GAP = 3;
      const ROW_GAP = 0;
      const BORDER_INSET = 0.45;
      const QR = 14;

      for (
        let index = 0;
        index < sitePanels.length;
        index++
      ) {
        const panel =
          sitePanels[index];

        const indexOnPage =
          index % 24;

        const col =
          indexOnPage % 3;

        const row =
          Math.floor(
            indexOnPage / 3
          );

        if (
          index > 0 &&
          indexOnPage === 0
        ) {
          pdf.addPage(
            [PAGE_W, PAGE_H],
            "portrait"
          );
        }

        const x =
          LEFT +
          col *
            (LABEL_W +
              COL_GAP);

        const y =
          TOP +
          row *
            (LABEL_H +
              ROW_GAP);

        const qrData =
          getPanelQrData(panel);

        if (!qrData) {
          continue;
        }

        const qrImage =
          await QRCode.toDataURL(
            qrData,
            {
              errorCorrectionLevel:
                "M",
              margin: 1,
              width: 220,
            }
          );

        pdf.setLineWidth(0.25);

        pdf.roundedRect(
          x + BORDER_INSET,
          y + BORDER_INSET,
          LABEL_W -
            BORDER_INSET * 2,
          LABEL_H -
            BORDER_INSET * 2,
          1.2,
          1.2,
          "S"
        );

        pdf.addImage(
          qrImage,
          "PNG",
          x + 2.2,
          y + 9.2,
          QR,
          QR,
          undefined,
          "FAST"
        );

        const textX =
          x + 18.5;

        /* BRAND */
        pdf.setFont(
          "helvetica",
          "bold"
        );

        pdf.setFontSize(5.5);

        pdf.text(
          "TRACKERZ",
          textX,
          y + 5.5
        );

        /* LABEL NUMBER */
        pdf.setFontSize(8.5);

        pdf.text(
          getPanelLabelNumber(
            panel,
            index
          ),
          textX,
          y + 10
        );

        /* PANEL NAME */
        pdf.setFont(
          "helvetica",
          "normal"
        );

        pdf.setFontSize(5.2);

        const panelName =
          getCleanText(
            panel.panel_name
          ) || "Panel";

        pdf.text(
          pdf
            .splitTextToSize(
              panelName,
              42
            )
            .slice(0, 1),
          textX,
          y + 14.2
        );

        /* SITE / CLIENT SECTION */
        const section =
          getCleanText(
            panel.section_name ||
              panel.section ||
              panel.cabinet_name
          );

        if (section) {
          pdf.setFontSize(4.8);

          pdf.text(
            pdf
              .splitTextToSize(
                section,
                42
              )
              .slice(0, 1),
            textX,
            y + 18
          );
        }

        /* SIZE + THICKNESS */
        pdf.setFontSize(5.2);

        const sizeText =
          `L ${
            getCleanText(
              panel.length
            ) || "-"
          } × ` +
          `W ${
            getCleanText(
              panel.width
            ) || "-"
          } × ` +
          `T ${
            getCleanText(
              panel.thickness
            ) || "-"
          }`;

        pdf.text(
          pdf
            .splitTextToSize(
              sizeText,
              42
            )
            .slice(0, 1),
          textX,
          y + 22
        );

        /* MATERIAL */
        const material =
          getCleanText(
            panel.material
          );

        if (material) {
          pdf.setFontSize(4.8);

          pdf.text(
            pdf
              .splitTextToSize(
                material,
                42
              )
              .slice(0, 1),
            textX,
            y + 25.8
          );
        }

        /* QR ID */
        pdf.setFont(
          "courier",
          "normal"
        );

        pdf.setFontSize(4.2);

        pdf.text(
          qrData,
          x + 2.2,
          y + 30.8
        );
      }

      const safeSite =
        String(
          selectedSite.site_name ||
            "SITE"
        )
          .trim()
          .replace(
            /[^a-zA-Z0-9]+/g,
            "-"
          )
          .replace(
            /^-+|-+$/g,
            ""
          )
          .toUpperCase();

      pdf.save(
        `${safeSite}_Manual_QR_Labels_24L.pdf`
      );

      setMessage(
        "Manual QR label PDF downloaded successfully."
      );
    } catch (err) {
      console.error(
        "Site manual QR PDF error:",
        err
      );

      setError(
        err?.message ||
          "Unable to create the Manual QR label PDF."
      );
    }
  }

  /* ======================================================
     SITE DETAILS
  ====================================================== */

  function renderSiteDetails() {
    if (!selectedSite) {
      return renderSitesPage();
    }

    const percentage =
      selectedSiteTotal > 0
        ? Math.round(
            (selectedSitePacked /
              selectedSiteTotal) *
              100
          )
        : 0;

    return (
      <section>

        <div className="site-detail-header">

          <div>

            <button
              className="back-button"
              onClick={() => {
                setActivePage(
                  "sites"
                );
                setSelectedSite(
                  null
                );
              }}
            >
              ← Back to Sites
            </button>

            <h2>
              {selectedSite.site_name}
            </h2>

            <p>
              {selectedSite.client_name ||
                "No client name entered"}
            </p>

          </div>

          <div
            className="site-detail-actions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              justifyContent:
                "flex-end",
            }}
          >

            <button
              className="secondary-button"
              onClick={
                downloadSiteCutlist
              }
            >
              ↓ Download Cutlist
            </button>

            <button
              className="secondary-button"
              onClick={
                downloadSiteManualQrPdf
              }
            >
              ↓ Download Manual QR Labels PDF
            </button>

            <button
              className="danger-button"
              onClick={() =>
                deleteSite(
                  selectedSite
                )
              }
            >
              Delete Site
            </button>

          </div>

        </div>

        <div className="site-info-grid">

          <div className="info-card">
            <span>
              Client
            </span>

            <strong>
              {selectedSite.client_name ||
                "-"}
            </strong>
          </div>

          <div className="info-card">
            <span>
              Contact
            </span>

            <strong>
              {selectedSite.contact ||
                "-"}
            </strong>
          </div>

          <div className="info-card">
            <span>
              Panels
            </span>

            <strong>
              {selectedSiteTotal}
            </strong>
          </div>

          <div className="info-card">
            <span>
              Packed
            </span>

            <strong>
              {selectedSitePacked}{" "}
              /{" "}
              {selectedSiteTotal}
            </strong>
          </div>

        </div>

        <div
          style={{
            marginTop: "18px",
            padding: "18px",
            border:
              "1px solid #e5e7eb",
            borderRadius: "10px",
            background: "#ffffff",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: "6px",
            }}
          >
            Site Downloads
          </h3>

          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: "13px",
            }}
          >
            Download the production
            cutlist or regenerate the
            24-label A4 Manual QR
            Labels PDF for this site.
          </p>

          <div
            style={{
              marginTop: "12px",
              fontSize: "13px",
              color: "#475569",
            }}
          >
            Packing progress:{" "}
            <strong>
              {percentage}%
            </strong>
          </div>
        </div>

      </section>
    );
  }

  /* ======================================================
     IMPORT MODAL FOR SITE DETAILS
  ====================================================== */

  function renderImportModal() {
    if (
      !showImport ||
      !selectedSite
    ) {
      return null;
    }

    return (
      <div
        className="modal-overlay"
        onMouseDown={() => {
          if (!importing) {
            setShowImport(
              false
            );
          }
        }}
      >

        <div
          className="modal-card import-modal"
          onMouseDown={(
            event
          ) =>
            event.stopPropagation()
          }
        >

          <div className="modal-header">

            <div>

              <h2>
                Import Cutlist
              </h2>

              <p>
                Upload the Excel cutlist
                for{" "}
                <strong>
                  {selectedSite.site_name}
                </strong>
              </p>

            </div>

            <button
              className="modal-close"
              disabled={
                importing
              }
              onClick={() =>
                setShowImport(
                  false
                )
              }
            >
              ×
            </button>

          </div>

          <div className="upload-area">

            <div className="upload-icon">
              XLS
            </div>

            <h3>
              Select Excel Cutlist
            </h3>

            <p>
              Supported formats:
              .xlsx, .xls, .csv
            </p>

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={
                handleFileSelect
              }
            />

          </div>

          {importFile && (
            <div className="selected-file">

              <strong>
                Selected file:
              </strong>{" "}
              {importFile.name}

            </div>
          )}

          {importRows.length >
            0 && (
            <div className="import-preview">

              <div className="preview-header">

                <strong>
                  Preview
                </strong>

                <span>
                  {importRows.length} rows
                </span>

              </div>

              <div className="preview-table-wrapper">

                <table className="preview-table">

                  <thead>

                    <tr>

                      {Object.keys(
                        importRows[0]
                      )
                        .slice(
                          0,
                          8
                        )
                        .map(
                          (
                            key
                          ) => (
                            <th
                              key={
                                key
                              }
                            >
                              {key}
                            </th>
                          )
                        )}

                    </tr>

                  </thead>

                  <tbody>

                    {importRows
                      .slice(
                        0,
                        5
                      )
                      .map(
                        (
                          row,
                          index
                        ) => (
                          <tr
                            key={
                              index
                            }
                          >

                            {Object.keys(
                              importRows[0]
                            )
                              .slice(
                                0,
                                8
                              )
                              .map(
                                (
                                  key
                                ) => (
                                  <td
                                    key={
                                      key
                                    }
                                  >
                                    {String(
                                      row[
                                        key
                                      ]
                                    )}
                                  </td>
                                )
                              )}

                          </tr>
                        )
                      )}

                  </tbody>

                </table>

              </div>

              {importRows.length >
                5 && (
                <p className="preview-note">
                  Showing first 5 rows.
                  All{" "}
                  {importRows.length}{" "}
                  rows will be imported.
                </p>
              )}

            </div>
          )}

          <div className="modal-actions">

            <button
              type="button"
              className="secondary-button"
              disabled={
                importing
              }
              onClick={() =>
                setShowImport(
                  false
                )
              }
            >
              Cancel
            </button>

            <button
              type="button"
              className="primary-button"
              disabled={
                importing ||
                importRows.length ===
                  0
              }
              onClick={
                importCutlist
              }
            >
              {importing
                ? "Importing..."
                : "Import Cutlist"}
            </button>

          </div>

        </div>

      </div>
    );
  }

  /* ======================================================
     CREATE SITE MODAL
  ====================================================== */

  function renderCreateSiteModal() {
    if (!showAddSite) {
      return null;
    }

    return (
      <div
        className="modal-overlay"
        onMouseDown={() =>
          setShowAddSite(
            false
          )
        }
      >

        <div
          className="modal-card"
          onMouseDown={(
            event
          ) =>
            event.stopPropagation()
          }
        >

          <div className="modal-header">

            <div>

              <h2>
                Create New Site
              </h2>

              <p>
                Add a factory project
                to Trackerz.
              </p>

            </div>

            <button
              className="modal-close"
              onClick={() =>
                setShowAddSite(
                  false
                )
              }
            >
              ×
            </button>

          </div>

          <form
            onSubmit={
              createSite
            }
          >

            <label>
              Site Name *

              <input
                type="text"
                value={
                  siteForm.site_name
                }
                onChange={(
                  event
                ) =>
                  setSiteForm({
                    ...siteForm,
                    site_name:
                      event.target
                        .value,
                  })
                }
                placeholder="Example: Anna Nagar Site"
              />
            </label>

            <label>
              Client Name

              <input
                type="text"
                value={
                  siteForm.client_name
                }
                onChange={(
                  event
                ) =>
                  setSiteForm({
                    ...siteForm,
                    client_name:
                      event.target
                        .value,
                  })
                }
                placeholder="Client name"
              />
            </label>

            <label>
              Contact

              <input
                type="text"
                value={
                  siteForm.contact
                }
                onChange={(
                  event
                ) =>
                  setSiteForm({
                    ...siteForm,
                    contact:
                      event.target
                        .value,
                  })
                }
                placeholder="Phone number"
              />
            </label>

            <label>
              Address

              <textarea
                value={
                  siteForm.address
                }
                onChange={(
                  event
                ) =>
                  setSiteForm({
                    ...siteForm,
                    address:
                      event.target
                        .value,
                  })
                }
                placeholder="Site address"
                rows="3"
              />
            </label>

            <label>
              Status

              <select
                value={
                  siteForm.status
                }
                onChange={(
                  event
                ) =>
                  setSiteForm({
                    ...siteForm,
                    status:
                      event.target
                        .value,
                  })
                }
              >

                <option value="Active">
                  Active
                </option>

                <option value="Completed">
                  Completed
                </option>

                <option value="On Hold">
                  On Hold
                </option>

                <option value="Delivered">
                  Delivered
                </option>

              </select>

            </label>

            <div className="modal-actions">

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setShowAddSite(
                    false
                  )
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
              >
                Create Site
              </button>

            </div>

          </form>

        </div>

      </div>
    );
  }

  /* ======================================================
     PAGE ROUTING
  ====================================================== */

  function renderPage() {
    if (
      activePage ===
      "dashboard"
    ) {
      return renderDashboard();
    }

    if (
      activePage ===
      "sites"
    ) {
      return renderSitesPage();
    }

    if (
      activePage ===
      "site"
    ) {
      return renderSiteDetails();
    }

    if (
      activePage ===
      "cutlist"
    ) {
      return (
        <CutlistImport
          selectedSite={
            selectedSite
          }

          setSelectedSite={
            setSelectedSite
          }

          setActivePage={
            setActivePage
          }

          importFile={
            importFile
          }

          importRows={
            importRows
          }

          importing={
            importing
          }

          handleFileSelect={
            handleFileSelect
          }

          importCutlist={
            importCutlist
          }

          setImportRows={
            setImportRows
          }

          setImportFile={
            setImportFile
          }

          setMessage={
            setMessage
          }

          setError={
            setError
          }

          createSiteRecord={
            createSiteRecord
          }
        />
      );
    }

    if (
      activePage ===
      "qr"
    ) {
      return (
        <QRTracking />
      );
    }

    if (
      activePage ===
      "reports"
    ) {
      return (
        <Production />
      );
    }

    if (
      activePage ===
      "dispatch"
    ) {
      return (
        <Dispatch />
      );
    }

    if (
      activePage ===
      "projects"
    ) {
      return (
        <Projects />
      );
    }

    if (
      activePage ===
      "settings"
    ) {
      return (
        <div className="panel">

          <div className="section-header">

            <div>

              <p className="eyebrow">
                TRACKERZ
              </p>

              <h2>
                Settings
              </h2>

              <p>
                Trackerz settings will
                be connected here as the
                factory system develops.
              </p>

            </div>

          </div>

          <div className="site-info-grid">

            <div className="info-card">
              <span>
                Database
              </span>

              <strong>
                Supabase
              </strong>
            </div>

            <div className="info-card">
              <span>
                Authentication
              </span>

              <strong>
                Enabled
              </strong>
            </div>

            <div className="info-card">
              <span>
                Sites
              </span>

              <strong>
                {sites.length}
              </strong>
            </div>

            <div className="info-card">
              <span>
                Panels
              </span>

              <strong>
                {panels.length}
              </strong>
            </div>

          </div>

        </div>
      );
    }

    return renderDashboard();
  }

  /* ======================================================
     AUTH LOADING
  ====================================================== */

  if (loadingAuth) {
    return (
      <div className="app-loading">

        <div className="loading-card">

          <h2>
            Trackerz
          </h2>

          <p>
            Checking login...
          </p>

        </div>

      </div>
    );
  }

  /* ======================================================
     LOGIN
  ====================================================== */

  if (!session) {
    return (
      <Login
        onLogin={(user) => {
          if (user) {
            setSession({
              user,
            });
          }
        }}
      />
    );
  }

  /* ======================================================
     MAIN APPLICATION
  ====================================================== */

  return (
    <div className="app">

      {renderNavigation()}

      <main className="main">

        {error && (
          <div className="alert error-alert">

            <strong>
              Error:
            </strong>{" "}

            {error}

            <button
              onClick={() =>
                setError("")
              }
            >
              ×
            </button>

          </div>
        )}

        {message && (
          <div className="alert success-alert">

            <span>
              {message}
            </span>

            <button
              onClick={() =>
                setMessage("")
              }
            >
              ×
            </button>

          </div>
        )}

        {loadingData && (
          <div className="loading-bar">
            Loading Trackerz data
            from Supabase...
          </div>
        )}

        {renderPage()}

      </main>

      {renderCreateSiteModal()}

      {renderImportModal()}

    </div>
  );
}

/* =========================================================
   CUTLIST IMPORT PAGE
========================================================= */

function CutlistImportPage({
  selectedSite,
  setSelectedSite,
  setActivePage,
  importFile,
  importRows,
  importing,
  handleFileSelect,
  importCutlist,
  setImportRows,
  setImportFile,
  setMessage,
  setError,
  createSiteRecord,
}) {
  const [siteName, setSiteName] = useState("");
  const [clientName, setClientName] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [released, setReleased] = useState(false);
  const [releasedSite, setReleasedSite] =
    useState(null);

  const previewSiteName =
    releasedSite?.site_name ||
    siteName.trim();

  const cleanSiteName =
    String(
      previewSiteName || "SITE"
    )
      .trim()
      .replace(
        /[^a-zA-Z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .toUpperCase();

  function getQrForRow(
    row,
    index
  ) {
    const qrColumn =
      Object.keys(row).find(
        (key) =>
          [
            "qr data",
            "qr_data",
            "qr",
            "qr code",
            "qr_code",
          ].includes(
            String(key)
              .trim()
              .toLowerCase()
          )
      );

    return (
      row[qrColumn] ||
      `TRK-${cleanSiteName}-${String(
        index + 1
      ).padStart(4, "0")}`
    );
  }

  function clearCutlist() {
    setImportRows([]);
    setImportFile(null);
    setSiteName("");
    setClientName("");
    setContact("");
    setAddress("");
    setReleased(false);
    setReleasedSite(null);
    setMessage("");
    setError("");
  }

  function downloadQrCutlist() {
    if (!importRows.length) {
      setError(
        "Upload a cutlist before downloading the QR cutlist."
      );
      return;
    }

    if (!releasedSite) {
      setError(
        "Release the cutlist to production first."
      );
      return;
    }

    const rows =
      importRows.map(
        (row, index) => ({
          ...row,
          "QR Data":
            getQrForRow(
              row,
              index
            ),
        })
      );

    const worksheet =
      XLSX.utils.json_to_sheet(
        rows
      );

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "QR Cutlist"
    );

    XLSX.writeFile(
      workbook,
      `${cleanSiteName}_QR_Cutlist.xlsx`
    );

    setMessage(
      "QR-enabled cutlist downloaded successfully."
    );
  }

  async function releaseToProduction() {
    setError("");
    setMessage("");

    if (!siteName.trim()) {
      setError(
        "Please enter the new site name."
      );
      return;
    }

    if (!clientName.trim()) {
      setError(
        "Please enter the client name."
      );
      return;
    }

    if (!importRows.length) {
      setError(
        "Please upload the Excel cutlist first."
      );
      return;
    }

    if (!createSiteRecord) {
      setError(
        "Site creation function is not available. Please refresh Trackerz."
      );
      return;
    }

    try {
      const newSite =
        await createSiteRecord({
          site_name:
            siteName.trim(),

          client_name:
            clientName.trim(),

          contact:
            contact.trim(),

          address:
            address.trim(),
        });

      setSelectedSite(
        newSite
      );

      await importCutlist(
        newSite,
        {
          keepPreview: true,
        }
      );

      setReleasedSite(
        newSite
      );

      setReleased(true);

      setMessage(
        "Site created, released to production"
      );
    } catch (err) {
      console.error(
        "Release to production error:",
        err
      );

      setReleased(false);
      setReleasedSite(null);

      setError(
        err.message ||
          "Unable to release the cutlist to production."
      );
    }
  }

  const fieldStyle = {
    width: "100%",
    boxSizing:
      "border-box",
    height: "40px",
    padding:
      "8px 11px",
    border:
      "1px solid #d1d5db",
    borderRadius:
      "7px",
    fontSize:
      "14px",
    background:
      "#fff",
    outline:
      "none",
  };

  const labelStyle = {
    display:
      "block",
    marginBottom:
      "5px",
    fontSize:
      "12px",
    fontWeight:
      "700",
    color:
      "#374151",
  };

  const cardStyle = {
    background:
      "#fff",
    border:
      "1px solid #e5e7eb",
    borderRadius:
      "10px",
    padding:
      "14px",
  };

  return (
    <>
      <header
        className="topbar"
        style={{
          marginBottom:
            "12px",
        }}
      >
        <div>
          <p className="eyebrow">
            TRACKERZ PRODUCTION
          </p>

          <h2
            style={{
              marginBottom:
                "3px",
            }}
          >
            Cutlist Import
          </h2>

          <p className="subtitle">
            Create site → Upload cutlist → Release to production
          </p>
        </div>

        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap:
              "8px",
          }}
        >
          {released && (
            <span
              style={{
                padding:
                  "7px 11px",
                borderRadius:
                  "999px",
                background:
                  "#dcfce7",
                color:
                  "#166534",
                fontSize:
                  "12px",
                fontWeight:
                  "700",
              }}
            >
              ✓ Released
            </span>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setActivePage(
                "sites"
              )
            }
          >
            Sites
          </button>
        </div>
      </header>

      <section
        className="panel"
        style={{
          padding:
            "14px",
        }}
      >
        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "minmax(180px, 1.15fr) minmax(180px, 1fr) minmax(150px, .8fr) minmax(200px, 1.5fr)",
            gap:
              "10px",
            alignItems:
              "end",
          }}
        >
          <label>
            <span
              style={
                labelStyle
              }
            >
              Site Name *
            </span>

            <input
              type="text"
              value={
                siteName
              }
              onChange={(
                event
              ) => {
                setSiteName(
                  event.target
                    .value
                );

                setReleased(
                  false
                );

                setReleasedSite(
                  null
                );
              }}
              disabled={
                released ||
                importing
              }
              placeholder="Example: Siva Kitchen"
              style={
                fieldStyle
              }
            />
          </label>

          <label>
            <span
              style={
                labelStyle
              }
            >
              Client Name *
            </span>

            <input
              type="text"
              value={
                clientName
              }
              onChange={(
                event
              ) => {
                setClientName(
                  event.target
                    .value
                );

                setReleased(
                  false
                );

                setReleasedSite(
                  null
                );
              }}
              disabled={
                released ||
                importing
              }
              placeholder="Client"
              style={
                fieldStyle
              }
            />
          </label>

          <label>
            <span
              style={
                labelStyle
              }
            >
              Contact
            </span>

            <input
              type="text"
              value={
                contact
              }
              onChange={(
                event
              ) =>
                setContact(
                  event.target
                    .value
                )
              }
              disabled={
                released ||
                importing
              }
              placeholder="Phone"
              style={
                fieldStyle
              }
            />
          </label>

          <label>
            <span
              style={
                labelStyle
              }
            >
              Address
            </span>

            <input
              type="text"
              value={
                address
              }
              onChange={(
                event
              ) =>
                setAddress(
                  event.target
                    .value
                )
              }
              disabled={
                released ||
                importing
              }
              placeholder="Site address"
              style={
                fieldStyle
              }
            />
          </label>
        </div>

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "minmax(280px, 1fr) auto auto auto",
            gap:
              "10px",
            alignItems:
              "center",
            marginTop:
              "12px",
          }}
        >
          <label
            style={{
              ...cardStyle,
              padding:
                "10px 12px",
              cursor:
                released
                  ? "default"
                  : "pointer",
            }}
          >
            <span
              style={
                labelStyle
              }
            >
              Excel Cutlist
            </span>

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(
                event
              ) => {
                setReleased(
                  false
                );

                setReleasedSite(
                  null
                );

                handleFileSelect(
                  event
                );
              }}
              disabled={
                released ||
                importing
              }
              style={{
                width:
                  "100%",
                fontSize:
                  "13px",
              }}
            />

            {importFile && (
              <div
                style={{
                  marginTop:
                    "5px",
                  fontSize:
                    "11px",
                  color:
                    "#4b5563",
                  overflow:
                    "hidden",
                  textOverflow:
                    "ellipsis",
                  whiteSpace:
                    "nowrap",
                }}
              >
                📄{" "}
                {
                  importFile.name
                }
              </div>
            )}
          </label>

          <div
            style={{
              ...cardStyle,
              minWidth:
                "105px",
              textAlign:
                "center",
              padding:
                "10px 14px",
            }}
          >
            <div
              style={{
                fontSize:
                  "10px",
                color:
                  "#6b7280",
                fontWeight:
                  "700",
              }}
            >
              CUTLIST ROWS
            </div>

            <strong
              style={{
                fontSize:
                  "21px",
                lineHeight:
                  "1.2",
              }}
            >
              {
                importRows.length
              }
            </strong>
          </div>

          <div
            style={{
              ...cardStyle,
              minWidth:
                "105px",
              textAlign:
                "center",
              padding:
                "10px 14px",
            }}
          >
            <div
              style={{
                fontSize:
                  "10px",
                color:
                  "#6b7280",
                fontWeight:
                  "700",
              }}
            >
              QR READY
            </div>

            <strong
              style={{
                fontSize:
                  "21px",
                lineHeight:
                  "1.2",
                color:
                  importRows.length
                    ? "#16a34a"
                    : "#6b7280",
              }}
            >
              {
                importRows.length
              }
            </strong>
          </div>

          <div
            style={{
              ...cardStyle,
              minWidth:
                "130px",
              textAlign:
                "center",
              padding:
                "10px 14px",
            }}
          >
            <div
              style={{
                fontSize:
                  "10px",
                color:
                  "#6b7280",
                fontWeight:
                  "700",
              }}
            >
              STATUS
            </div>

            <strong
              style={{
                fontSize:
                  "13px",
                color:
                  released
                    ? "#15803d"
                    : importRows.length
                      ? "#1d4ed8"
                      : "#6b7280",
              }}
            >
              {released
                ? "RELEASED"
                : importRows.length
                  ? "READY"
                  : "WAITING"}
            </strong>
          </div>
        </div>

        {importRows.length >
          0 && (
          <div
            style={{
              marginTop:
                "12px",
              border:
                "1px solid #e5e7eb",
              borderRadius:
                "9px",
              overflow:
                "hidden",
            }}
          >
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                padding:
                  "9px 12px",
                background:
                  "#f8fafc",
                borderBottom:
                  "1px solid #e5e7eb",
              }}
            >
              <div>
                <strong
                  style={{
                    fontSize:
                      "13px",
                  }}
                >
                  Cutlist Preview
                </strong>

                <span
                  style={{
                    marginLeft:
                      "8px",
                    fontSize:
                      "11px",
                    color:
                      "#6b7280",
                  }}
                >
                  First 8 rows shown
                </span>
              </div>

              <span
                style={{
                  fontSize:
                    "11px",
                  fontWeight:
                    "700",
                  color:
                    "#1d4ed8",
                }}
              >
                {
                  importRows.length
                }{" "}
                rows loaded
              </span>
            </div>

            <div
              style={{
                overflowX:
                  "auto",
                maxHeight:
                  "285px",
                overflowY:
                  "auto",
              }}
            >
              <table
                style={{
                  width:
                    "100%",
                  minWidth:
                    "760px",
                  borderCollapse:
                    "collapse",
                  fontSize:
                    "11px",
                }}
              >
                <thead
                  style={{
                    position:
                      "sticky",
                    top:
                      0,
                    zIndex:
                      1,
                  }}
                >
                  <tr>
                    {Object.keys(
                      importRows[0]
                    )
                      .slice(
                        0,
                        8
                      )
                      .map(
                        (
                          key
                        ) => (
                          <th
                            key={
                              key
                            }
                            style={{
                              padding:
                                "7px 8px",
                              textAlign:
                                "left",
                              background:
                                "#f1f5f9",
                              borderBottom:
                                "1px solid #e5e7eb",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {
                              key
                            }
                          </th>
                        )
                      )}

                    <th
                      style={{
                        padding:
                          "7px 8px",
                        textAlign:
                          "left",
                        background:
                          "#f1f5f9",
                        borderBottom:
                          "1px solid #e5e7eb",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      QR Data
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {importRows
                    .slice(
                      0,
                      8
                    )
                    .map(
                      (
                        row,
                        index
                      ) => (
                        <tr
                          key={
                            index
                          }
                        >
                          {Object.keys(
                            importRows[0]
                          )
                            .slice(
                              0,
                              8
                            )
                            .map(
                              (
                                key
                              ) => (
                                <td
                                  key={
                                    key
                                  }
                                  style={{
                                    padding:
                                      "6px 8px",
                                    borderBottom:
                                      "1px solid #f1f5f9",
                                    whiteSpace:
                                      "nowrap",
                                    maxWidth:
                                      "180px",
                                    overflow:
                                      "hidden",
                                    textOverflow:
                                      "ellipsis",
                                  }}
                                >
                                  {String(
                                    row[
                                      key
                                    ] ??
                                      ""
                                  )}
                                </td>
                              )
                            )}

                          <td
                            style={{
                              padding:
                                "6px 8px",
                              borderBottom:
                                "1px solid #f1f5f9",
                              whiteSpace:
                                "nowrap",
                              fontWeight:
                                "600",
                              color:
                                "#374151",
                            }}
                          >
                            {getQrForRow(
                              row,
                              index
                            )}
                          </td>
                        </tr>
                      )
                    )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap:
              "9px",
            flexWrap:
              "wrap",
            marginTop:
              "12px",
            paddingTop:
              "12px",
            borderTop:
              "1px solid #eef0f3",
          }}
        >
          <button
            type="button"
            className="primary-button"
            disabled={
              importing ||
              released ||
              !siteName.trim() ||
              !clientName.trim() ||
              !importRows.length
            }
            onClick={
              releaseToProduction
            }
          >
            {importing
              ? "Releasing..."
              : released
                ? "✓ Released to Production"
                : "✓ Release to Production"}
          </button>

          <button
            type="button"
            className="secondary-button"
            disabled={
              importing ||
              !released ||
              !importRows.length
            }
            onClick={
              downloadQrCutlist
            }
          >
            ↓ Download QR Cutlist
          </button>

          <button
            type="button"
            className="secondary-button"
            disabled={
              importing
            }
            onClick={
              clearCutlist
            }
          >
            Clear
          </button>

          <div
            style={{
              marginLeft:
                "auto",
              fontSize:
                "11px",
              color:
                "#6b7280",
            }}
          >
            {released
              ? "✓ Site created, released to production"
              : "Enter site + client, upload cutlist, then release."}
          </div>
        </div>

        {released &&
          releasedSite && (
            <div
              style={{
                marginTop:
                  "10px",
                padding:
                  "10px 12px",
                borderRadius:
                  "8px",
                border:
                  "1px solid #bbf7d0",
                background:
                  "#f0fdf4",
                color:
                  "#166534",
                fontSize:
                  "13px",
                fontWeight:
                  "700",
              }}
            >
              ✓ Site created, released to production

              <span
                style={{
                  marginLeft:
                    "8px",
                  fontWeight:
                    "500",
                }}
              >
                —{" "}
                {
                  releasedSite.site_name
                }
              </span>
            </div>
          )}
      </section>
    </>
  );
}

/* =========================================================
   SITE CARD
========================================================= */

function SiteCard({
  site,
  panelCount,
  onOpen,
}) {
  // Kept for compatibility with the existing file.
  // The Sites page now uses the read-only table above.
  return null;
}

export default App;