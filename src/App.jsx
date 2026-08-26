import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { supabase } from "./supabaseClient";
import Login from "./Login";

import Projects from "./pages/Projects";
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
- Supabase sites table
- Supabase panels table
- RLS-compatible queries
- Dashboard data loading
- Cutlist Import
- Site-name QR generation
- QR Tracking
- Production
- Reports
- Sites
- Existing navigation
- Existing packet/scanner functionality through QRTracking.jsx

CUTLIST WORKFLOW:
1. New Site
2. Upload Cutlist
3. Preview
4. Release to Production
5. Download QR Cutlist

IMPORTANT:
Supabase remains the source of truth.
=========================================================
*/

function App() {
  /* ======================================================
     AUTHENTICATION
  ====================================================== */

  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

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
     LOAD SITES + PANELS
  ====================================================== */

  useEffect(() => {
    if (!session) return;

    loadAllData();
  }, [session]);

  async function loadAllData() {
    setLoadingData(true);
    setError("");

    try {
      /* LOAD SITES */

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

      /* LOAD PANELS */

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

      /* KEEP SELECTED SITE UPDATED */

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
      setSelectedSite(null);
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

  function isSiteDelivered(site) {
    const status =
      String(
        site?.status || ""
      )
        .trim()
        .toLowerCase();

    return (
      status === "delivered" ||
      site?.delivered === true ||
      site?.isDelivered === true
    );
  }

  /* ======================================================
     DASHBOARD DATA
  ====================================================== */

  const dashboardSiteData = useMemo(() => {
    return sites.map((site) => {
      const progress =
        getSiteProgress(site);

      return {
        ...site,
        progress,
        delivered:
          isSiteDelivered(site),
      };
    });
  }, [sites, panels]);

  const progressSites =
    dashboardSiteData.filter(
      (site) =>
        !site.delivered &&
        site.progress.percentage < 100
    );

  const packedSites =
    dashboardSiteData.filter(
      (site) =>
        !site.delivered &&
        site.progress.percentage === 100
    );

  const dispatchedSites =
    dashboardSiteData.filter(
      (site) => site.delivered
    );

  const dashboardSites =
    dashboardTab === "packed"
      ? packedSites
      : dashboardTab === "dispatched"
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
      String(site_name || "").trim();

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
          site_name: cleanSiteName,
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

  async function handleFileSelect(event) {
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
        workbook.SheetNames.length === 0
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
      /* PREPARE PANEL ROWS */

      const rowsToInsert =
        importRows.map(
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
                "length_num",
                "Len",
                "L",
              ]);

            const width =
              numberFromRow(row, [
                "FB Width",
                "Width",
                "width_num",
                "Wid",
                "W",
              ]);

            const thickness =
              numberFromRow(row, [
                "Thickness",
                "thickness_num",
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
                : quantityValue;

            /* QR DATA */

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

            const qrData =
              `TRK-${cleanSiteName}-${String(
                index + 1
              ).padStart(4, "0")}`;

            return {
              site_id:
                activeSite.id,

              site_name:
                activeSite.site_name,

              panel_name:
                String(panelName),

              length_num:
                length,

              width_num:
                width,

              thickness_num:
                thickness,

              quantity:
                quantity,

              status:
                "Pending",

              packed:
                false,

              qr_data:
                String(qrData),

              assembly_label:
                assemblyLabel || null,

              cabinet_name:
                cabinetName || null,

              section_name:
                sectionName || null,

              room_name:
                roomName || null,

              material:
                material || null,

              customer:
                customer || null,

              remark:
                remark || null,
            };
          }
        );

      let insertedTotal = 0;

      const batchSize = 100;

      /* FULL ROW INSERT */

      try {
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
      } catch (fullInsertError) {
        /*
        FALLBACK TO CORE PANELS STRUCTURE
        */

        console.warn(
          "Optional panel columns were rejected. Retrying with core Panels structure.",
          fullInsertError
        );

        insertedTotal = 0;

        const coreRows =
          rowsToInsert.map(
            (panel) => ({
              site_id:
                panel.site_id,

              site_name:
                panel.site_name,

              panel_name:
                panel.panel_name,

              length_num:
                panel.length_num,

              width_num:
                panel.width_num,

              thickness_num:
                panel.thickness_num,

              quantity:
                panel.quantity,

              status:
                panel.status,

              packed:
                panel.packed,

              qr_data:
                panel.qr_data,
            })
          );

        for (
          let i = 0;
          i < coreRows.length;
          i += batchSize
        ) {
          const batch =
            coreRows.slice(
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
      }

      /* UPDATE SITE PANEL COUNT */

      const importedQuantity =
        rowsToInsert.reduce(
          (sum, panel) =>
            sum +
            Number(
              panel.quantity || 1
            ),
          0
        );

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

      /* UPDATE LOCAL STATE */

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

      /* RESET ONLY WHEN NOT KEEPING PREVIEW */

      if (!keepPreview) {
        setImportRows([]);
        setImportFile(null);
        setShowImport(false);
      }

      await loadAllData();

      setMessage(
        `${insertedTotal} cutlist rows imported successfully.`
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

  async function togglePacked(panel) {
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

  async function deleteSite(site) {
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
     DASHBOARD
  ====================================================== */

  function renderDashboardSiteProgress() {
    if (dashboardSites.length === 0) {
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
                : "No site has been marked as dispatched yet."}
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
            minWidth: "850px",
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

  function renderDashboard() {
    const tabs = [
      {
        key: "progress",
        label: "Progress Sites",
        count:
          progressSites.length,
        icon: "▤",
      },
      {
        key: "packed",
        label: "Packed Sites",
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
  ====================================================== */

  function renderSitesPage() {
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
              Manage factory projects
              and site information.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() =>
              setShowAddSite(
                true
              )
            }
          >
            + New Site
          </button>

        </div>

        {sites.length ===
        0 ? (
          <div className="empty-card">

            <div className="empty-icon">
              ⌂
            </div>

            <h3>
              No sites created
            </h3>

            <p>
              Create your first factory
              site to begin tracking.
            </p>

            <button
              className="primary-button"
              onClick={() =>
                setShowAddSite(
                  true
                )
              }
            >
              + Create First Site
            </button>

          </div>
        ) : (
          <div className="site-grid">

            {sites.map(
              (site) => (
                <SiteCard
                  key={site.id}
                  site={site}
                  panelCount={getSitePanelCount(
                    site
                  )}
                  onOpen={() =>
                    openSite(
                      site
                    )
                  }
                />
              )
            )}

          </div>
        )}

      </section>
    );
  }

  /* ======================================================
     SITE DETAILS
  ====================================================== */

  function renderSiteDetails() {
    if (!selectedSite) {
      return renderSitesPage();
    }

    const percentage =
      selectedSiteTotal >
      0
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

          <div className="site-detail-actions">

            <button
              className="secondary-button"
              onClick={() =>
                setShowImport(
                  true
                )
              }
            >
              Import Cutlist
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

        <div className="section-header">

          <div>
            <h2>
              Panel Tracking
            </h2>

            <p>
              Track every panel belonging
              to this site.
            </p>
          </div>

          <div className="packing-progress">
            {percentage}% packed
          </div>

        </div>

        {selectedSitePanels.length ===
        0 ? (
          <div className="empty-card">

            <div className="empty-icon">
              ▤
            </div>

            <h3>
              No panels uploaded
            </h3>

            <p>
              Upload the site's Excel
              cutlist to begin tracking.
            </p>

            <button
              className="primary-button"
              onClick={() =>
                setShowImport(
                  true
                )
              }
            >
              Import Cutlist
            </button>

          </div>
        ) : (
          <div className="panel-table-wrapper">

            <table className="panel-table">

              <thead>
                <tr>
                  <th>Panel</th>
                  <th>Length</th>
                  <th>Width</th>
                  <th>Thickness</th>
                  <th>Qty</th>
                  <th>QR Data</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>

                {selectedSitePanels.map(
                  (panel) => {
                    const packed =
                      isPanelPacked(
                        panel
                      );

                    return (
                      <tr
                        key={
                          panel.id
                        }
                      >

                        <td>
                          <strong>
                            {panel.panel_name ||
                              panel.panel_no ||
                              panel.name ||
                              `Panel ${panel.id}`}
                          </strong>
                        </td>

                        <td>
                          {panel.length_num ??
                            "-"}
                        </td>

                        <td>
                          {panel.width_num ??
                            "-"}
                        </td>

                        <td>
                          {panel.thickness_num ??
                            "-"}
                        </td>

                        <td>
                          {panel.quantity ??
                            1}
                        </td>

                        <td>
                          <code>
                            {panel.qr_data ||
                              panel.qr_code ||
                              panel.panel_code ||
                              "-"}
                          </code>
                        </td>

                        <td>
                          <span
                            className={
                              packed
                                ? "status-badge packed"
                                : "status-badge pending"
                            }
                          >
                            {packed
                              ? "Packed"
                              : "Pending"}
                          </span>
                        </td>

                        <td>
                          <button
                            className={
                              packed
                                ? "small-button"
                                : "small-button pack"
                            }
                            onClick={() =>
                              togglePacked(
                                panel
                              )
                            }
                          >
                            {packed
                              ? "Unpack"
                              : "Mark Packed"}
                          </button>
                        </td>

                      </tr>
                    );
                  }
                )}

              </tbody>

            </table>

          </div>
        )}

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
        <CutlistImportPage
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
  const [siteName, setSiteName] =
    useState("");

  const [clientName, setClientName] =
    useState("");

  const [contact, setContact] =
    useState("");

  const [address, setAddress] =
    useState("");

  const [released, setReleased] =
    useState(false);

  const [releasedSite, setReleasedSite] =
    useState(null);

  /* ======================================================
     CLEAN CUTLIST PAGE RESET
  ====================================================== */

  useEffect(() => {
    setSiteName("");
    setClientName("");
    setContact("");
    setAddress("");
    setReleased(false);
    setReleasedSite(null);
  }, []);

  /* ======================================================
     QR SITE NAME
  ====================================================== */

  const previewSiteName =
    releasedSite?.site_name ||
    siteName.trim();

  const cleanSiteName =
    String(
      previewSiteName ||
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

  /* ======================================================
     RESET CUTLIST
  ====================================================== */

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

  /* ======================================================
     QR DATA
  ====================================================== */

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

  /* ======================================================
     DOWNLOAD QR CUTLIST
  ====================================================== */

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

  /* ======================================================
     RELEASE TO PRODUCTION
  ====================================================== */

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
      /*
      ------------------------------------------------------
      STEP 1
      CREATE SITE
      ------------------------------------------------------
      */

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

      /*
      ------------------------------------------------------
      STEP 2
      SELECT CREATED SITE
      ------------------------------------------------------
      */

      setSelectedSite(
        newSite
      );

      /*
      ------------------------------------------------------
      STEP 3
      IMPORT PANELS
      ------------------------------------------------------
      */

      await importCutlist(
        newSite,
        {
          keepPreview: true,
        }
      );

      /*
      ------------------------------------------------------
      STEP 4
      MARK RELEASED
      ------------------------------------------------------
      */

      setReleasedSite(
        newSite
      );

      setReleased(
        true
      );

      setMessage(
        `Released ${importRows.length} cutlist rows to production for ${newSite.site_name}.`
      );
    } catch (err) {
      console.error(
        "Release to production error:",
        err
      );

      setReleased(
        false
      );

      setReleasedSite(
        null
      );

      setError(
        err.message ||
          "Unable to release the cutlist to production."
      );
    }
  }

  /* ======================================================
     INPUT STYLE
  ====================================================== */

  const inputStyle = {
    width: "100%",
    boxSizing:
      "border-box",
    padding:
      "12px 13px",
    border:
      "1px solid #d1d5db",
    borderRadius:
      "8px",
    fontSize:
      "15px",
    background:
      "#ffffff",
  };

  /* ======================================================
     PAGE
  ====================================================== */

  return (
    <>
      {/* ==================================================
          PAGE HEADER
      ================================================== */}

      <header className="topbar">

        <div>

          <p className="eyebrow">
            TRACKERZ PRODUCTION
          </p>

          <h2>
            Cutlist Import
          </h2>

          <p className="subtitle">
            Create a new site, upload the
            cutlist and release the panels
            to production.
          </p>

        </div>

        {/* NO DASHBOARD BUTTON HERE */}

      </header>

      {/* ==================================================
          1. NEW SITE
      ================================================== */}

      <section className="panel">

        <div className="section-header">

          <div>

            <h2>
              1. New Site
            </h2>

            <p>
              Enter the site information
              for this production order.
            </p>

          </div>

        </div>

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(2, minmax(240px, 1fr))",
            gap:
              "18px",
          }}
        >

          {/* SITE NAME */}

          <label>

            <span
              style={{
                display:
                  "block",
                marginBottom:
                  "7px",
                fontWeight:
                  "700",
                color:
                  "#374151",
              }}
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
                released
              }
              placeholder="Example: Siva kitchen"
              style={
                inputStyle
              }
            />

          </label>

          {/* CLIENT NAME */}

          <label>

            <span
              style={{
                display:
                  "block",
                marginBottom:
                  "7px",
                fontWeight:
                  "700",
                color:
                  "#374151",
              }}
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
                released
              }
              placeholder="Example: Agna Ventures"
              style={
                inputStyle
              }
            />

          </label>

          {/* CONTACT */}

          <label>

            <span
              style={{
                display:
                  "block",
                marginBottom:
                  "7px",
                fontWeight:
                  "700",
                color:
                  "#374151",
              }}
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
                released
              }
              placeholder="Phone number"
              style={
                inputStyle
              }
            />

          </label>

          {/* ADDRESS */}

          <label>

            <span
              style={{
                display:
                  "block",
                marginBottom:
                  "7px",
                fontWeight:
                  "700",
                color:
                  "#374151",
              }}
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
                released
              }
              placeholder="Site address"
              style={
                inputStyle
              }
            />

          </label>

        </div>

        {/* RELEASED STATUS */}

        {releasedSite && (
          <div
            style={{
              marginTop:
                "18px",
              padding:
                "13px 15px",
              border:
                "1px solid #bbf7d0",
              background:
                "#f0fdf4",
              borderRadius:
                "9px",
              color:
                "#166534",
              fontWeight:
                "600",
            }}
          >
            ✓ Site created and
            released:
            {" "}
            {
              releasedSite.site_name
            }
            {" — "}
            {
              releasedSite.client_name
            }
          </div>
        )}

      </section>

      {/* ==================================================
          2. UPLOAD CUTLIST
      ================================================== */}

      <section className="panel">

        <div className="section-header">

          <div>

            <h2>
              2. Upload Cutlist
            </h2>

            <p>
              Select the Excel cutlist
              and preview it before
              releasing to production.
            </p>

          </div>

        </div>

        <div
          className="upload-area"
        >

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
              importing
            }
          />

          {importFile && (
            <div className="selected-file">

              <strong>
                Selected file:
              </strong>{" "}

              {
                importFile.name
              }

            </div>
          )}

        </div>

      </section>

      {/* ==================================================
          3. CUTLIST PREVIEW
      ================================================== */}

      {importRows.length >
        0 && (
        <section className="panel">

          <div className="section-header">

            <div>

              <h2>
                3. Cutlist Preview
              </h2>

              <p>
                Review the imported rows
                before releasing them.
              </p>

            </div>

            <span
              style={{
                padding:
                  "8px 12px",
                borderRadius:
                  "8px",
                background:
                  "#eff6ff",
                color:
                  "#1d4ed8",
                fontWeight:
                  "700",
                fontSize:
                  "13px",
              }}
            >
              {
                importRows.length
              }{" "}
              Rows Loaded
            </span>

          </div>

          <div
            className="panel-table-wrapper"
          >

            <table
              className="panel-table"
            >

              <thead>

                <tr>

                  {Object.keys(
                    importRows[0]
                  )
                    .slice(
                      0,
                      10
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

                  <th>
                    QR Data
                  </th>

                </tr>

              </thead>

              <tbody>

                {importRows
                  .slice(
                    0,
                    10
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
                            10
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
                                  ] ??
                                    ""
                                )}
                              </td>
                            )
                          )}

                        <td>

                          <code>
                            {
                              getQrForRow(
                                row,
                                index
                              )
                            }
                          </code>

                        </td>

                      </tr>
                    )
                  )}

              </tbody>

            </table>

          </div>

          {importRows.length >
            10 && (
            <p
              className="preview-note"
            >
              Showing first 10 rows.
              All{" "}
              {
                importRows.length
              }{" "}
              rows will be imported.
            </p>
          )}

        </section>
      )}

      {/* ==================================================
          4. PRODUCTION ACTIONS
      ================================================== */}

      <section className="panel">

        <div className="section-header">

          <div>

            <h2>
              4. Production Actions
            </h2>

            <p>
              Release the site and
              create its panel records
              in Supabase.
            </p>

          </div>

          {released && (
            <span
              style={{
                padding:
                  "8px 13px",
                borderRadius:
                  "999px",
                background:
                  "#dcfce7",
                color:
                  "#166534",
                fontWeight:
                  "700",
                fontSize:
                  "13px",
              }}
            >
              ✓ Released
            </span>
          )}

        </div>

        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap:
              "12px",
            flexWrap:
              "wrap",
          }}
        >

          {/* RELEASE TO PRODUCTION */}

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

          {/* DOWNLOAD QR CUTLIST */}

          <button
            type="button"
            className={
              released
                ? "primary-button"
                : "secondary-button"
            }
            disabled={
              importing ||
              !importRows.length ||
              !released
            }
            onClick={
              downloadQrCutlist
            }
            style={
              released
                ? {
                    boxShadow:
                      "0 0 0 3px rgba(37, 99, 235, 0.12)",
                  }
                : undefined
            }
          >
            ↓ Download QR Cutlist
          </button>

          {/* CLEAR */}

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

        </div>

        {/* VALIDATION MESSAGE */}

        {!siteName.trim() && (
          <p
            style={{
              margin:
                "13px 0 0",
              color:
                "#b45309",
              fontSize:
                "13px",
            }}
          >
            Enter the new site name
            first.
          </p>
        )}

        {siteName.trim() &&
          !clientName.trim() && (
            <p
              style={{
                margin:
                  "13px 0 0",
                color:
                  "#b45309",
                fontSize:
                  "13px",
              }}
            >
              Enter the client name
              before releasing.
            </p>
          )}

        {clientName.trim() &&
          !importRows.length && (
            <p
              style={{
                margin:
                  "13px 0 0",
                color:
                  "#b45309",
                fontSize:
                  "13px",
              }}
            >
              Upload the Excel cutlist
              before releasing.
            </p>
          )}

        {/* AFTER RELEASE */}

        {released && (
          <div
            style={{
              marginTop:
                "15px",
              padding:
                "13px 15px",
              border:
                "1px solid #bfdbfe",
              background:
                "#eff6ff",
              borderRadius:
                "8px",
              color:
                "#1e40af",
              fontSize:
                "13px",
            }}
          >
            <strong>
              Production released.
            </strong>{" "}
            The site and panels are now
            available in the Dashboard
            and QR Tracking.
          </div>
        )}

      </section>

      {/* ==================================================
          5. EXISTING SITE
      ================================================== */}

      <section
        style={{
          marginTop:
            "18px",
          padding:
            "14px 16px",
          color:
            "#6b7280",
          fontSize:
            "13px",
          textAlign:
            "center",
        }}
      >
        Need to work with an existing
        project?{" "}

        <button
          type="button"
          onClick={() =>
            setActivePage(
              "sites"
            )
          }
          style={{
            border:
              "none",
            background:
              "transparent",
            color:
              "#2563eb",
            fontWeight:
              "700",
            cursor:
              "pointer",
          }}
        >
          Open Sites
        </button>

      </section>
    </>
  );
}

/* =========================================================
   REPORTS
========================================================= */

function ReportsPage({
  sites,
  panels,
  getSiteProgress,
  isPanelPacked,
}) {
  const totalQuantity =
    panels.reduce(
      (sum, panel) =>
        sum +
        Number(
          panel.quantity || 1
        ),
      0
    );

  const packedQuantity =
    panels.reduce(
      (sum, panel) =>
        sum +
        (isPanelPacked(
          panel
        )
          ? Number(
              panel.quantity ||
                1
            )
          : 0),
      0
    );

  const pendingQuantity =
    Math.max(
      totalQuantity -
        packedQuantity,
      0
    );

  return (
    <>

      <header className="topbar">

        <div>

          <p className="eyebrow">
            TRACKERZ PRODUCTION
          </p>

          <h2>
            Reports
          </h2>

          <p className="subtitle">
            Production summary from
            Supabase sites and panels.
          </p>

        </div>

      </header>

      <div className="stats-grid">

        <div className="stat-card">

          <div className="stat-icon">
            ⌂
          </div>

          <div>

            <span>
              Total Sites
            </span>

            <strong>
              {sites.length}
            </strong>

          </div>

        </div>

        <div className="stat-card">

          <div className="stat-icon">
            ▤
          </div>

          <div>

            <span>
              Total Panels
            </span>

            <strong>
              {totalQuantity}
            </strong>

          </div>

        </div>

        <div className="stat-card">

          <div className="stat-icon">
            ✓
          </div>

          <div>

            <span>
              Packed
            </span>

            <strong>
              {packedQuantity}
            </strong>

          </div>

        </div>

        <div className="stat-card">

          <div className="stat-icon">
            !
          </div>

          <div>

            <span>
              Balance
            </span>

            <strong>
              {pendingQuantity}
            </strong>

          </div>

        </div>

      </div>

      <section className="panel">

        <div className="section-header">

          <div>

            <h2>
              Site Production Report
            </h2>

            <p>
              Current panel progress
              for every site.
            </p>

          </div>

        </div>

        <div className="panel-table-wrapper">

          <table className="panel-table">

            <thead>

              <tr>

                <th>
                  Site
                </th>

                <th>
                  Client
                </th>

                <th>
                  Total
                </th>

                <th>
                  Packed
                </th>

                <th>
                  Balance
                </th>

                <th>
                  Progress
                </th>

              </tr>

            </thead>

            <tbody>

              {sites.map(
                (site) => {
                  const progress =
                    getSiteProgress(
                      site
                    );

                  return (
                    <tr
                      key={
                        site.id
                      }
                    >

                      <td>
                        <strong>
                          {
                            site.site_name
                          }
                        </strong>
                      </td>

                      <td>
                        {
                          site.client_name ||
                          "—"
                        }
                      </td>

                      <td>
                        {
                          progress.total
                        }
                      </td>

                      <td>
                        {
                          progress.packed
                        }
                      </td>

                      <td>
                        {
                          progress.balance
                        }
                      </td>

                      <td>
                        {
                          progress.percentage
                        }%
                      </td>

                    </tr>
                  );
                }
              )}

            </tbody>

          </table>

        </div>

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
  const status =
    String(
      site.status ||
        "Active"
    ).toLowerCase();

  return (
    <div className="site-card">

      <div className="site-card-top">

        <div className="site-icon">
          ⌂
        </div>

        <span
          className={
            status === "active"
              ? "site-status active"
              : "site-status"
          }
        >
          {site.status ||
            "Active"}
        </span>

      </div>

      <h3>
        {site.site_name}
      </h3>

      <p>
        {site.client_name ||
          "No client assigned"}
      </p>

      <div className="site-card-info">

        <div>

          <span>
            Panels
          </span>

          <strong>
            {panelCount}
          </strong>

        </div>

        <div>

          <span>
            Contact
          </span>

          <strong>
            {site.contact ||
              "-"}
          </strong>

        </div>

      </div>

      <button
        className="site-open-button"
        onClick={
          onOpen
        }
      >
        Open Site →
      </button>

    </div>
  );
}

export default App;