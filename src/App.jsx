import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { supabase } from "./supabaseClient";
import Login from "./Login";

import Projects from "./pages/Projects";
import QRTracking from "./QRTracking";
import Production from "./Production";

import "./App.css";

/*
=========================================================
TRACKERZ
FACTORY TRACKING APPLICATION
=========================================================

This App.jsx keeps:

- Supabase authentication
- Supabase sites table
- Supabase panels table
- RLS protected database access
- Dashboard
- Sites
- Site details
- Excel cutlist import
- QR Data
- Panel packing status
- Pack / Unpack
- Site deletion
- Progress tracking
- Delivered sites
- Existing Cutlist Import page
- Existing QR Tracking page
- Existing Production page
- Existing Projects page
- Reports
- Settings

IMPORTANT:
Supabase is the source of truth.
We are NOT using localStorage for production data.
=========================================================
*/

function App() {
  /* ======================================================
     AUTHENTICATION
  ====================================================== */

  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  /* ======================================================
     APP NAVIGATION
  ====================================================== */

  const [activePage, setActivePage] = useState("dashboard");

  const [selectedSite, setSelectedSite] = useState(null);

  const [dashboardView, setDashboardView] = useState("progress");

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
     IMPORT CUTLIST
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
     LOAD ALL TRACKERZ DATA
  ====================================================== */

  useEffect(() => {
    if (!session) return;

    loadAllData();
  }, [session]);

  async function loadAllData() {
    setLoadingData(true);
    setError("");

    try {
      /*
      -----------------------------------------------------
      LOAD SITES
      -----------------------------------------------------
      */

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

console.log("SUPABASE SITES:", sitesData);

      /*
      -----------------------------------------------------
      LOAD PANELS
      -----------------------------------------------------
      */

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

      /*
      -----------------------------------------------------
      KEEP SELECTED SITE UPDATED
      -----------------------------------------------------
      */

      if (selectedSite) {
        const updatedSelectedSite =
          (sitesData || []).find(
            (site) =>
              String(site.id) ===
              String(selectedSite.id)
          );

        if (updatedSelectedSite) {
          setSelectedSite(updatedSelectedSite);
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
     DASHBOARD STATISTICS
  ====================================================== */

  const totalSites = sites.length;

  const activeSites = sites.filter(
    (site) =>
      String(site.status || "")
        .trim()
        .toLowerCase() === "active"
  ).length;

  const totalPanels = panels.reduce(
    (sum, panel) => {
      const quantity = Number(
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

  const packedPanels = panels.reduce(
    (sum, panel) => {
      const quantity = Number(
        panel.quantity || 1
      );

      const packed =
        panel.packed === true ||
        String(panel.status || "")
          .trim()
          .toLowerCase() === "packed";

      return (
        sum +
        (packed
          ? Number.isFinite(quantity)
            ? quantity
            : 1
          : 0)
      );
    },
    0
  );

  const qrReadyPanels = panels.filter(
    (panel) =>
      panel.qr_data ||
      panel.qr_code ||
      panel.panel_code
  ).length;

  /* ======================================================
     PANEL HELPERS
  ====================================================== */

  function getSitePanels(site) {
    if (!site) {
      return [];
    }

    return panels.filter((panel) => {
      /*
      Prefer site_id.
      */

      if (
        panel.site_id !== undefined &&
        panel.site_id !== null
      ) {
        return (
          String(panel.site_id) ===
          String(site.id)
        );
      }

      /*
      Fallback to site_name for older imported data.
      */

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
          const quantity = Number(
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
              const quantity = Number(
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

          const quantity = Number(
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
     DELIVERED SITE CHECK
  ====================================================== */

  function isSiteDelivered(site) {
    const status = String(
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

  const progressSites = sites.filter(
    (site) =>
      !isSiteDelivered(site)
  );

  const deliveredSites = sites.filter(
    (site) =>
      isSiteDelivered(site)
  );

  /* ======================================================
     CREATE NEW SITE
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

      /*
      Open the newly created site.
      */

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
     EXCEL COLUMN HELPERS
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
     IMPORT CUTLIST INTO SUPABASE
  ====================================================== */

  async function importCutlist() {
    if (!selectedSite) {
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
      -----------------------------------------------------
      CREATE PANEL RECORDS
      -----------------------------------------------------
      */

      const rowsToInsert =
        importRows.map(
          (row, index) => {
            /*
            Exact Trackerz / Anna Nagar columns
            are supported first.
            */

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

            /*
            Use Assembly Label as the main panel name
            when available.
            */

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

            /*
            Preserve existing QR Data if the Excel
            already contains it.

            Otherwise create:
            TRK-SITENAME-0001
            */

            const cleanSiteName =
              String(
                selectedSite.site_name
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

            /*
            IMPORTANT:

            We only insert columns that belong to
            the Panels table we created.

            Extra Excel columns remain represented
            through panel_name / QR / site data.
            */

            return {
              site_id:
                selectedSite.id,

              site_name:
                selectedSite.site_name,

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

              /*
              These are included only if your current
              Panels table contains them.

              If your table does not contain these
              columns, remove them before importing.
              */

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

      /*
      -----------------------------------------------------
      IMPORTANT SAFETY CHECK
      -----------------------------------------------------

      The current Panels table was originally created
      around the core columns:

      site_id
      site_name
      panel_name
      length_num
      width_num
      thickness_num
      quantity
      status
      packed
      qr_data
      created_at

      Therefore we attempt the full record first.

      If Supabase rejects optional descriptive columns,
      we retry with the core structure.
      */

      let insertedTotal = 0;

      const batchSize = 100;

      console.log("TRACKERZ PANEL INSERT START");
      console.log("rowsToInsert count:", rowsToInsert.length);
      console.log("first row:", rowsToInsert[0]);

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
        Retry using the original core structure.
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

      qr_data:
        panel.qr_data,

      panel_name:
        panel.panel_name,

      length:
        panel.length_num,

      width:
        panel.width_num,

      thickness:
        panel.thickness_num,

      quantity:
        panel.quantity,

      status:
        panel.status,

      packed:
        panel.packed,
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

      /*
      -----------------------------------------------------
      UPDATE SITE PANEL COUNT
      -----------------------------------------------------
      */

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
          selectedSite
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
          selectedSite.id
        )
        .select()
        .single();

      if (siteUpdateError) {
        throw siteUpdateError;
      }

      /*
      -----------------------------------------------------
      UPDATE LOCAL STATE
      -----------------------------------------------------
      */

      setSites((previous) =>
        previous.map((site) =>
          String(site.id) ===
          String(selectedSite.id)
            ? updatedSite
            : site
        )
      );

      setSelectedSite(
        updatedSite
      );

      /*
      -----------------------------------------------------
      RESET IMPORT
      -----------------------------------------------------
      */

      setImportRows([]);
      setImportFile(null);
      setShowImport(false);

      await loadAllData();

     setMessage(
  String(insertedTotal) +
    " cutlist rows imported successfully."
);
    } catch (err) {
      console.error(
        "Import cutlist error:",
        err
      );

      setError(
        err.message ||
          "Unable to import the cutlist. Please check the Panels table columns."
      );
    } finally {
      setImporting(false);
    }
  }

  /* ======================================================
     PACK / UNPACK PANEL
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

    /*
    IMPORTANT:
    This is the corrected syntax that avoids the
    previous Vite error.
    */

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
      /*
      -----------------------------------------------------
      DELETE PANELS FIRST
      -----------------------------------------------------
      */

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

      /*
      -----------------------------------------------------
      DELETE SITE
      -----------------------------------------------------
      */

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

      /*
      -----------------------------------------------------
      UPDATE UI
      -----------------------------------------------------
      */

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

  function renderNavigation() {
    return (
      <aside className="sidebar">

        {/* BRAND */}

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

        {/* NAVIGATION */}

        <nav>

          {/* DASHBOARD */}

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

          {/* CUTLIST */}

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

          {/* QR TRACKING */}

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

          {/* PRODUCTION */}

          <button
            className={`nav-item ${
              activePage ===
              "production"
                ? "active"
                : ""
            }`}
            onClick={() =>
              navigateTo(
                "production"
              )
            }
          >
            <span>✓</span>
            Production
          </button>

          {/* REPORTS */}

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

          {/* SITES */}

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

        {/* BOTTOM */}

        <div className="sidebar-bottom">

          {/* SETTINGS */}

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

          {/* USER */}

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

          {/* SIGN OUT */}

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

  function renderDashboardEmptyState() {
    const isProgress =
      dashboardView ===
      "progress";

    return (
      <div
        className="empty-card"
        style={{
          padding:
            "50px 20px",
          textAlign:
            "center",
          width:
            "100%",
          boxSizing:
            "border-box",
        }}
      >

        <div
          className="empty-icon"
          style={{
            fontSize:
              "42px",
            marginBottom:
              "12px",
          }}
        >
          ▤
        </div>

        <h3>
          {isProgress
            ? "No progress sites"
            : "No delivered sites"}
        </h3>

        <p>
          {isProgress
            ? "Imported production sites will appear here."
            : "Sites marked as delivered will appear here."}
        </p>

      </div>
    );
  }

  /* ======================================================
     DASHBOARD SITE TABLE
  ====================================================== */

  function renderSiteTable(
    siteList
  ) {
    if (
      siteList.length === 0
    ) {
      return renderDashboardEmptyState();
    }

    const columns =
      "2fr 1.4fr 0.9fr 1.5fr 1.2fr 0.8fr";

    return (
      <div
        className="table"
        style={{
          width:
            "100%",
          minWidth:
            "900px",
        }}
      >

        {/* TABLE HEADER */}

        <div
          className="table-header"
          style={{
            display:
              "grid",
            gridTemplateColumns:
              columns,
            alignItems:
              "center",
            gap:
              "12px",
            width:
              "100%",
          }}
        >

          <span>
            SITE
          </span>

          <span>
            CLIENT
          </span>

          <span>
            PANELS
          </span>

          <span>
            PROGRESS
          </span>

          <span>
            STATUS
          </span>

          <span>
            DELETE
          </span>

        </div>

        {/* TABLE ROWS */}

        {siteList.map(
          (site) => {
            const progress =
              getSiteProgress(
                site
              );

            return (
              <div
                className="table-row"
                key={site.id}
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    columns,
                  alignItems:
                    "center",
                  gap:
                    "12px",
                  width:
                    "100%",
                  minHeight:
                    "70px",
                  boxSizing:
                    "border-box",
                }}
              >

                {/* SITE */}

                <div
                  style={{
                    minWidth:
                      0,
                  }}
                >

                  <strong
                    style={{
                      display:
                        "block",
                      whiteSpace:
                        "nowrap",
                      overflow:
                        "hidden",
                      textOverflow:
                        "ellipsis",
                    }}
                  >
                    {site.site_name ||
                      "Unnamed Site"}
                  </strong>

                  <small
                    style={{
                      display:
                        "block",
                      whiteSpace:
                        "nowrap",
                      overflow:
                        "hidden",
                      textOverflow:
                        "ellipsis",
                    }}
                  >
                    Trackerz Production Site
                  </small>

                </div>

                {/* CLIENT */}

                <span
                  style={{
                    whiteSpace:
                      "nowrap",
                    overflow:
                      "hidden",
                    textOverflow:
                      "ellipsis",
                  }}
                >
                  {site.client_name ||
                    "—"}
                </span>

                {/* PANELS */}

                <div
                  style={{
                    whiteSpace:
                      "nowrap",
                  }}
                >

                  <strong>
                    {progress.packed}{" "}
                    /{" "}
                    {progress.total}
                  </strong>

                  <small
                    style={{
                      display:
                        "block",
                    }}
                  >
                    {progress.balance}{" "}
                    balance
                  </small>

                </div>

                {/* PROGRESS */}

                <div
                  className="mini-progress"
                  style={{
                    minWidth:
                      "120px",
                  }}
                >

                  <div>
                    <div
                      className="mini-fill"
                      style={{
                        width:
                          `${progress.percentage}%`,
                      }}
                    />
                  </div>

                  <span>
                    {progress.percentage}%
                  </span>

                </div>

                {/* STATUS */}

                <span
                  className={`status ${
                    dashboardView ===
                    "delivered"
                      ? "completed-status"
                      : "active-status"
                  }`}
                  style={{
                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {dashboardView ===
                  "delivered"
                    ? "Delivered"
                    : progress.percentage ===
                      100
                    ? "Ready"
                    : "In Production"}
                </span>

                {/* DELETE */}

                <button
                  onClick={() =>
                    deleteSite(
                      site
                    )
                  }
                  style={{
                    padding:
                      "7px 10px",
                    border:
                      "1px solid #ef4444",
                    background:
                      "#ffffff",
                    color:
                      "#dc2626",
                    borderRadius:
                      "7px",
                    cursor:
                      "pointer",
                    fontWeight:
                      "600",
                    whiteSpace:
                      "nowrap",
                    width:
                      "fit-content",
                  }}
                >
                  🗑 Delete
                </button>

              </div>
            );
          }
        )}

      </div>
    );
  }

  /* ======================================================
     DASHBOARD
  ====================================================== */

  function renderDashboard() {
    const currentSites =
      dashboardView ===
      "progress"
        ? progressSites
        : deliveredSites;

    return (
      <>

        {/* DASHBOARD HEADER */}

        <header className="topbar">

          <div>

            <p className="eyebrow">
              TRACKERZ PRODUCTION
            </p>

            <h2>
              Production Dashboard
            </h2>

            <p className="subtitle">
              Track production progress
              and delivered sites.
            </p>

          </div>

          <div
            style={{
              display:
                "flex",
              gap:
                "10px",
            }}
          >

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

        </header>

        {/* STATISTICS */}

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
                {totalSites}
              </strong>
            </div>

          </div>

          <div className="stat-card">

            <div className="stat-icon">
              ●
            </div>

            <div>
              <span>
                Active Sites
              </span>

              <strong>
                {activeSites}
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
                {totalPanels}
              </strong>
            </div>

          </div>

          <div className="stat-card">

            <div className="stat-icon">
              ✓
            </div>

            <div>
              <span>
                Packed Panels
              </span>

              <strong>
                {packedPanels}
              </strong>
            </div>

          </div>

          <div className="stat-card">

            <div className="stat-icon">
              QR
            </div>

            <div>
              <span>
                QR Ready
              </span>

              <strong>
                {qrReadyPanels}
              </strong>
            </div>

          </div>

        </div>

        {/* FACTORY SITES */}

        <section className="panel projects-panel">

          <div
            className="panel-header"
            style={{
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "flex-start",
              gap:
                "25px",
              minHeight:
                "65px",
            }}
          >

            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                gap:
                  "6px",
              }}
            >

              {/* PROGRESS */}

              <button
                onClick={() =>
                  setDashboardView(
                    "progress"
                  )
                }
                style={{
                  border:
                    "none",
                  borderBottom:
                    dashboardView ===
                    "progress"
                      ? "3px solid #2563eb"
                      : "3px solid transparent",
                  background:
                    "transparent",
                  padding:
                    "12px 16px",
                  cursor:
                    "pointer",
                  fontWeight:
                    "700",
                  fontSize:
                    "15px",
                  color:
                    dashboardView ===
                    "progress"
                      ? "#2563eb"
                      : "#6b7280",
                  whiteSpace:
                    "nowrap",
                }}
              >
                ▤ Progress Sites{" "}
                <span>
                  ({progressSites.length})
                </span>
              </button>

              {/* DELIVERED */}

              <button
                onClick={() =>
                  setDashboardView(
                    "delivered"
                  )
                }
                style={{
                  border:
                    "none",
                  borderBottom:
                    dashboardView ===
                    "delivered"
                      ? "3px solid #16a34a"
                      : "3px solid transparent",
                  background:
                    "transparent",
                  padding:
                    "12px 16px",
                  cursor:
                    "pointer",
                  fontWeight:
                    "700",
                  fontSize:
                    "15px",
                  color:
                    dashboardView ===
                    "delivered"
                      ? "#16a34a"
                      : "#6b7280",
                  whiteSpace:
                    "nowrap",
                }}
              >
                ✓ Delivered{" "}
                <span>
                  ({deliveredSites.length})
                </span>
              </button>

            </div>

          </div>

          {renderSiteTable(
            currentSites
          )}

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
            <h2>
              All Sites
            </h2>

            <p>
              {sites.length} site
              {sites.length ===
              1
                ? ""
                : "s"}{" "}
              in Trackerz
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

        {/* HEADER */}

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

        {/* SITE INFORMATION */}

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

        {/* PANEL TRACKING */}

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
            {percentage}%
            {" "}
            packed
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
              cutlist to begin tracking
              panels.
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
                  <th>
                    Panel
                  </th>

                  <th>
                    Length
                  </th>

                  <th>
                    Width
                  </th>

                  <th>
                    Thickness
                  </th>

                  <th>
                    Qty
                  </th>

                  <th>
                    QR Data
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Action
                  </th>
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
     IMPORT CUTLIST MODAL
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

          {/* UPLOAD */}

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

          {/* SELECTED FILE */}

          {importFile && (
            <div className="selected-file">

              <strong>
                Selected file:
              </strong>{" "}
              {importFile.name}

            </div>
          )}

          {/* PREVIEW */}

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

          {/* ACTIONS */}

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
     OTHER APPLICATION PAGES
  ====================================================== */

  function renderPage() {
    /*
    DASHBOARD
    */

    if (
      activePage ===
      "dashboard"
    ) {
      return renderDashboard();
    }

    /*
    SITES
    */

    if (
      activePage ===
      "sites"
    ) {
      return renderSitesPage();
    }

    /*
    CURRENT SITE
    */

    if (
      activePage ===
      "site"
    ) {
      return renderSiteDetails();
    }

    /*
    INTEGRATED CUTLIST IMPORT PAGE

    IMPORTANT:
    Cutlist Import is handled here instead of a separate
    CutlistImport component so the "Release to Production"
    button uses the exact same Supabase insert function
    that writes to public.panels.
    */

    if (
      activePage ===
      "cutlist"
    ) {
      return (
        <CutlistImportPage
          sites={sites}
          selectedSite={selectedSite}
          setSelectedSite={setSelectedSite}
          setActivePage={setActivePage}
          importFile={importFile}
          importRows={importRows}
          importing={importing}
          handleFileSelect={handleFileSelect}
          importCutlist={importCutlist}
          openSite={openSite}
          setShowAddSite={setShowAddSite}
          setImportRows={setImportRows}
          setImportFile={setImportFile}
          setMessage={setMessage}
          setError={setError}
          panels={panels}
        />
      );
    }

    /*
    EXISTING QR TRACKING PAGE
    */

    if (
      activePage ===
      "qr"
    ) {
      return (
        <QRTracking />
      );
    }

    /*
    EXISTING PRODUCTION PAGE
    */

    if (
      activePage ===
      "production"
    ) {
      return (
        <Production />
      );
    }

    /*
    REPORTS

    Keep Reports as its own page. It reads the same Supabase
    state already loaded by App.jsx.
    */

    if (
      activePage ===
      "reports"
    ) {
      return (
        <ReportsPage
          sites={sites}
          panels={panels}
          getSiteProgress={getSiteProgress}
          isPanelPacked={isPanelPacked}
        />
      );
    }

    /*
    PROJECTS
    */

    if (
      activePage ===
      "projects"
    ) {
      return (
        <Projects />
      );
    }

    /*
    SETTINGS
    */

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
                {totalPanels}
              </strong>
            </div>

          </div>

        </div>
      );
    }

    /*
    DEFAULT
    */

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
          /*
          Login.jsx already uses Supabase authentication.

          Keep this callback so the existing Login component
          remains compatible.
          */

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
     MAIN TRACKERZ APPLICATION
  ====================================================== */

  return (
    <div className="app">

      {/* SIDEBAR */}

      {renderNavigation()}

      {/* MAIN CONTENT */}

      <main className="main">

        {/* TOP ERROR */}

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

        {/* TOP SUCCESS MESSAGE */}

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

        {/* DATABASE LOADING */}

        {loadingData && (
          <div className="loading-bar">
            Loading Trackerz data
            from Supabase...
          </div>
        )}

        {/* PAGE */}

        {renderPage()}

      </main>

      {/* CREATE SITE */}

      {renderCreateSiteModal()}

      {/* IMPORT CUTLIST */}

      {renderImportModal()}

    </div>
  );
}


/* =========================================================
   INTEGRATED CUTLIST IMPORT PAGE
========================================================= */

function CutlistImportPage({
  sites,
  selectedSite,
  setSelectedSite,
  setActivePage,
  importFile,
  importRows,
  importing,
  handleFileSelect,
  importCutlist,
  openSite,
  setShowAddSite,
  setImportRows,
  setImportFile,
  setMessage,
  setError,
  panels,
}) {
  const [siteName, setSiteName] = useState(
    selectedSite?.site_name || ""
  );
  const [clientName, setClientName] = useState(
    selectedSite?.client_name || ""
  );
  const [contact, setContact] = useState(
    selectedSite?.contact || ""
  );
  const [address, setAddress] = useState(
    selectedSite?.address || ""
  );

  useEffect(() => {
    setSiteName(selectedSite?.site_name || "");
    setClientName(selectedSite?.client_name || "");
    setContact(selectedSite?.contact || "");
    setAddress(selectedSite?.address || "");
  }, [selectedSite?.id]);

  const existingPanelCount = selectedSite
    ? panels.filter(
        (panel) =>
          String(panel.site_id) === String(selectedSite.id)
      ).length
    : 0;

  const selectExistingSite = (siteId) => {
    const site = sites.find(
      (item) => String(item.id) === String(siteId)
    );

    if (!site) {
      setSelectedSite(null);
      return;
    }

    setSelectedSite(site);
    setActivePage("cutlist");
    setMessage("");
    setError("");
  };

  const clearCutlist = () => {
    setImportRows([]);
    setImportFile(null);
    setMessage("");
    setError("");
  };

  const release = async () => {
    if (!selectedSite) {
      setError("Please select or create a site before releasing the cutlist.");
      return;
    }

    if (!importRows.length) {
      setError("Please upload an Excel cutlist first.");
      return;
    }

    if (existingPanelCount > 0) {
      const confirmed = window.confirm(
        `${selectedSite.site_name} already has ${existingPanelCount} panel records in Supabase.\n\n` +
        "Release this cutlist again and create another set of panels?\n\n" +
        "Choose Cancel if this is the same cutlist you already released."
      );

      if (!confirmed) return;
    }

    await importCutlist();
  };

  const downloadQrCutlist = () => {
    if (!importRows.length) {
      setError("Upload a cutlist before downloading the QR cutlist.");
      return;
    }

    const cleanSiteName = String(
      selectedSite?.site_name || siteName || "SITE"
    )
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase();

    const rows = importRows.map((row, index) => {
      const qrColumn = Object.keys(row).find(
        (key) =>
          ["qr data", "qr_data", "qr", "qr code", "qr_code"].includes(
            String(key).trim().toLowerCase()
          )
      );

      return {
        ...row,
        "QR Data":
          row[qrColumn] ||
          `TRK-${cleanSiteName}-${String(index + 1).padStart(4, "0")}`,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "QR Cutlist");

    XLSX.writeFile(
      workbook,
      `${cleanSiteName || "TRACKERZ"}_QR_Cutlist.xlsx`
    );

    setMessage("QR-enabled cutlist downloaded.");
  };

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">TRACKERZ PRODUCTION</p>
          <h2>Cutlist Import</h2>
          <p className="subtitle">
            Import the production cutlist, generate QR data and release the
            panels for packing tracking.
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={() => setActivePage("dashboard")}
        >
          ← Dashboard
        </button>
      </header>

      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Site Information</h2>
            <p>
              Select an existing site or create a new site before uploading
              the cutlist.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() => setShowAddSite(true)}
          >
            + New Site
          </button>
        </div>

        <div className="site-info-grid">
          <div className="info-card">
            <span>Existing Site</span>
            <select
              value={selectedSite?.id || ""}
              onChange={(event) =>
                selectExistingSite(event.target.value)
              }
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "10px",
                border: "1px solid #d1d5db",
                borderRadius: "7px",
                background: "#fff",
              }}
            >
              <option value="">Select site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.site_name}
                  {site.client_name
                    ? ` — ${site.client_name}`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="info-card">
            <span>Site Name</span>
            <strong>{selectedSite?.site_name || siteName || "—"}</strong>
          </div>

          <div className="info-card">
            <span>Client</span>
            <strong>
              {selectedSite?.client_name || clientName || "—"}
            </strong>
          </div>

          <div className="info-card">
            <span>Existing Panels</span>
            <strong>{existingPanelCount}</strong>
          </div>
        </div>

        {selectedSite && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              marginTop: "16px",
            }}
          >
            <label>
              Site Name
              <input
                value={siteName}
                readOnly
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </label>

            <label>
              Client Name
              <input
                value={clientName}
                readOnly
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </label>

            <label>
              Contact
              <input
                value={contact}
                readOnly
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </label>

            <label>
              Address
              <input
                value={address}
                readOnly
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </label>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Upload Cutlist</h2>
            <p>
              Excel rows are previewed first. Nothing is inserted into
              Supabase until you click Release to Production.
            </p>
          </div>
        </div>

        <div className="upload-area">
          <div className="upload-icon">XLS</div>

          <h3>Select Excel Cutlist</h3>

          <p>Supported formats: .xlsx, .xls, .csv</p>

          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            disabled={importing}
          />

          {importFile && (
            <div className="selected-file">
              <strong>Selected file:</strong> {importFile.name}
            </div>
          )}
        </div>

        {importRows.length > 0 && (
          <>
            <div
              className="section-header"
              style={{ marginTop: "20px" }}
            >
              <div>
                <h2>Cutlist Preview</h2>
                <p>
                  {importRows.length} rows loaded. QR data will use the
                  <strong> site name</strong>, not the client name.
                </p>
              </div>

              <span className="status active-status">
                {importRows.length} panels ready
              </span>
            </div>

            <div className="panel-table-wrapper">
              <table className="panel-table">
                <thead>
                  <tr>
                    {Object.keys(importRows[0])
                      .slice(0, 10)
                      .map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                    <th>QR Data</th>
                  </tr>
                </thead>

                <tbody>
                  {importRows.slice(0, 100).map((row, index) => {
                    const assembly =
                      row["Assembly Label"] ||
                      row.assembly_label ||
                      row["FB Name"] ||
                      row.fb_name ||
                      row["Panel Name"] ||
                      row.panel_name ||
                      `Panel-${index + 1}`;

                    const cleanSiteName = String(
                      selectedSite?.site_name || siteName || "SITE"
                    )
                      .trim()
                      .replace(/[^a-zA-Z0-9]+/g, "-")
                      .replace(/^-+|-+$/g, "")
                      .toUpperCase();

                    const qr =
                      row["QR Data"] ||
                      row.qr_data ||
                      row.QR ||
                      `TRK-${cleanSiteName}-${String(index + 1).padStart(
                        4,
                        "0"
                      )}`;

                    return (
                      <tr key={index}>
                        {Object.keys(importRows[0])
                          .slice(0, 10)
                          .map((key) => (
                            <td key={key}>{String(row[key] ?? "")}</td>
                          ))}
                        <td>
                          <code>{qr}</code>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {importRows.length > 100 && (
              <p className="preview-note">
                Showing first 100 rows. All {importRows.length} rows will be
                released.
              </p>
            )}
          </>
        )}

        <div className="modal-actions" style={{ marginTop: "20px" }}>
          <button
            type="button"
            className="secondary-button"
            disabled={importing || !importRows.length}
            onClick={downloadQrCutlist}
          >
            ↓ Download QR Cutlist
          </button>

          <button
            type="button"
            className="secondary-button"
            disabled={importing || !importRows.length}
            onClick={clearCutlist}
          >
            Clear
          </button>

          <button
            type="button"
            className="primary-button"
            disabled={
              importing ||
              !selectedSite ||
              importRows.length === 0
            }
            onClick={release}
          >
            {importing
              ? "Releasing..."
              : "✓ Release to Production"}
          </button>
        </div>

        {!selectedSite && importRows.length > 0 && (
          <div className="alert error-alert" style={{ marginTop: "14px" }}>
            Select a site before releasing the cutlist.
          </div>
        )}
      </section>
    </>
  );
}

/* =========================================================
   REPORTS PAGE
========================================================= */

function ReportsPage({
  sites,
  panels,
  getSiteProgress,
  isPanelPacked,
}) {
  const totalQuantity = panels.reduce(
    (sum, panel) => sum + Number(panel.quantity || 1),
    0
  );

  const packedQuantity = panels.reduce(
    (sum, panel) =>
      sum +
      (isPanelPacked(panel) ? Number(panel.quantity || 1) : 0),
    0
  );

  const pendingQuantity = Math.max(
    totalQuantity - packedQuantity,
    0
  );

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">TRACKERZ PRODUCTION</p>
          <h2>Reports</h2>
          <p className="subtitle">
            Production summary from the Supabase sites and panels tables.
          </p>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">⌂</div>
          <div>
            <span>Total Sites</span>
            <strong>{sites.length}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">▤</div>
          <div>
            <span>Total Panels</span>
            <strong>{totalQuantity}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">✓</div>
          <div>
            <span>Packed</span>
            <strong>{packedQuantity}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">!</div>
          <div>
            <span>Balance</span>
            <strong>{pendingQuantity}</strong>
          </div>
        </div>
      </div>

      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Site Production Report</h2>
            <p>Current panel progress for every site.</p>
          </div>
        </div>

        <div className="panel-table-wrapper">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Client</th>
                <th>Total</th>
                <th>Packed</th>
                <th>Balance</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const progress = getSiteProgress(site);

                return (
                  <tr key={site.id}>
                    <td>
                      <strong>{site.site_name}</strong>
                    </td>
                    <td>{site.client_name || "—"}</td>
                    <td>{progress.total}</td>
                    <td>{progress.packed}</td>
                    <td>{progress.balance}</td>
                    <td>{progress.percentage}%</td>
                  </tr>
                );
              })}
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
        onClick={onOpen}
      >
        Open Site →
      </button>

    </div>
  );
}

export default App;