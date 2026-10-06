import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";

/*
=========================================================
TRACKERZ - CUTLIST IMPORT
=========================================================

CONNECTED TO EXISTING App.jsx

App.jsx remains responsible for:
- Supabase authentication
- Supabase data loading
- Site creation
- Panel insertion
- RLS
- Dashboard
- QR Tracking
- Production
- Dispatch
- Reports

This component is only the Cutlist Import UI.

DATABASE WRITES:
- createSiteRecord() -> App.jsx
- importCutlist()     -> App.jsx

NO localStorage is used here.
=========================================================
*/

export default function CutlistImport({
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
  /* =====================================================
     LOCAL CUTLIST FORM
  ===================================================== */

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

  const [released, setReleased] = useState(false);

  const [releasedSite, setReleasedSite] = useState(
    selectedSite || null
  );

  const [manualQrLoading, setManualQrLoading] =
    useState(false);

  const [showManualPrint, setShowManualPrint] =
    useState(false);

  const [manualLabels, setManualLabels] =
    useState([]);

  /* =====================================================
     SAFE ROWS
  ===================================================== */

  const rows = Array.isArray(importRows)
    ? importRows
    : [];

  /* =====================================================
     TEXT HELPERS
  ===================================================== */

  function cleanText(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    return String(value).trim();
  }

  function normalizeKey(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[\s_\-./]+/g, " ")
      .replace(/[()]/g, "")
      .trim();
  }

  /* =====================================================
     FLEXIBLE COLUMN FINDER

     Supports different factory cutlist headings.
  ===================================================== */

  function findColumn(row, aliases) {
    if (
      !row ||
      typeof row !== "object"
    ) {
      return null;
    }

    const keys = Object.keys(row);

    const normalizedAliases =
      aliases.map(normalizeKey);

    /* Exact normalized match */

    const exact = keys.find(
      (key) =>
        normalizedAliases.includes(
          normalizeKey(key)
        )
    );

    if (exact) {
      return exact;
    }

    /* Partial match */

    const partial = keys.find((key) => {
      const normalized =
        normalizeKey(key);

      return normalizedAliases.some(
        (alias) =>
          normalized.includes(alias) ||
          alias.includes(normalized)
      );
    });

    return partial || null;
  }

  function getValue(
    row,
    aliases,
    fallback = ""
  ) {
    const column = findColumn(
      row,
      aliases
    );

    if (!column) {
      return fallback;
    }

    return cleanText(row[column]);
  }

  function getNumber(
    row,
    aliases,
    fallback = ""
  ) {
    const value = getValue(
      row,
      aliases,
      ""
    );

    if (value === "") {
      return fallback;
    }

    const number = Number(
      String(value).replace(
        /,/g,
        ""
      )
    );

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  /* =====================================================
     SITE NAME FOR QR

     QR MUST USE SITE NAME.
     CLIENT NAME IS NEVER USED FOR QR.
  ===================================================== */

  const activeSiteName = cleanText(
    releasedSite?.site_name ||
      selectedSite?.site_name ||
      siteName
  );

  const qrSiteName = String(
    activeSiteName || "SITE"
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

  function getQrData(number) {
    return `TRK-${qrSiteName}-${String(
      number
    ).padStart(4, "0")}`;
  }

  /* =====================================================
     CUTLIST FIELD MAPPING
  ===================================================== */

  /* =====================================================
     EXACT FACTORY FIELD MAPPING

     FB Name        = individual FB / panel number
     Assembly Label = cabinet number (#1, #2, #3...)
     Cabinet Name   = actual cabinet name
     Section Name   = actual section / panel name
     Room Name      = room
  ===================================================== */

  function getFbName(row, index) {
    const directFb = cleanText(
      getValue(
        row,
        [
          "FB Name",
          "FB_Name",
          "fb_name",
          "FB",
        ],
        ""
      )
    );

    if (/^\d+(?:\.\d+)?$/.test(directFb)) {
      return directFb;
    }

    const assembly = cleanText(
      getValue(
        row,
        [
          "Assembly Label",
          "assembly_label",
          "Assembly",
        ],
        ""
      )
    );

    if (/^\d+(?:\.\d+)?$/.test(assembly)) {
      return assembly;
    }

    return directFb || `FB ${index + 1}`;
  }

  function getCabinetNumber(row) {
    const cabinetName = cleanText(
      getValue(
        row,
        [
          "Cabinet Name",
          "cabinet_name",
          "Cabinet",
        ],
        ""
      )
    );

    const cabinetMatch =
      cabinetName.match(/(?:^|\D)(\d+)\s*$/);

    if (cabinetMatch?.[1]) {
      return `#${cabinetMatch[1]}`;
    }

    const assembly = cleanText(
      getValue(
        row,
        [
          "Assembly Label",
          "assembly_label",
          "Assembly",
        ],
        ""
      )
    );

    if (/^#\s*\d+$/.test(assembly)) {
      return assembly.replace(
        /#\s*/,
        "#"
      );
    }

    if (/^\d+$/.test(assembly)) {
      return `#${assembly}`;
    }

    return "";
  }

  function getCabinetName(row) {
    return getValue(
      row,
      [
        "Cabinet Name",
        "cabinet_name",
        "Cabinet",
      ],
      ""
    );
  }

  function getSectionName(row) {
    return getValue(
      row,
      [
        "Section Name",
        "section_name",
        "Section",
      ],
      ""
    );
  }

  function getRoomName(row) {
    return getValue(
      row,
      [
        "Room Name",
        "room_name",
        "Room",
      ],
      ""
    );
  }

  function getPanelName(row, index) {
    return (
      getSectionName(row) ||
      getValue(
        row,
        [
          "Panel Name",
          "Panel",
          "Part Name",
          "Part",
          "Part No",
          "Part Number",
          "Item Name",
          "Item",
          "Description",
          "Name",
        ],
        ""
      ) ||
      `Panel ${index + 1}`
    );
  }

  function getProductionFieldMapping(row, index) {
    return {
      fbName: getFbName(row, index),
      assemblyLabel: getCabinetNumber(row),
      cabinetName: getCabinetName(row),
      sectionName: getSectionName(row),
      roomName: getRoomName(row),
    };
  }

  function getThickness(row) {
    return getValue(
      row,
      [
        "Thickness",
        "Thk",
        "THK",
        "T",
      ],
      ""
    );
  }

  function getLength(row) {
    return getValue(
      row,
      [
        "FB Length",
        "Length",
        "Len",
        "L",
      ],
      ""
    );
  }

  function getWidth(row) {
    return getValue(
      row,
      [
        "FB Width",
        "Width",
        "Wid",
        "W",
      ],
      ""
    );
  }

  function getQuantity(row) {
    const quantity = getNumber(
      row,
      [
        "Quantity",
        "Qty",
        "Count",
      ],
      1
    );

    const number = Number(
      quantity
    );

    if (
      !Number.isFinite(number) ||
      number <= 0
    ) {
      return 1;
    }

    return Math.floor(number);
  }

  function getMaterial(row) {
    return getValue(
      row,
      [
        "Material",
        "Board",
        "Board Material",
      ],
      ""
    );
  }

  function getRemark(row) {
    return getValue(
      row,
      [
        "Remark",
        "Remarks",
        "Note",
        "Notes",
      ],
      ""
    );
  }

  /* =====================================================
     PHYSICAL PANEL ROWS

     Used for QR labels.

     If Quantity = 3,
     three physical labels are generated.
  ===================================================== */

  const physicalRows = useMemo(() => {
    const result = [];

    rows.forEach(
      (row, rowIndex) => {
        const quantity =
          getQuantity(row);

        for (
          let copy = 1;
          copy <= quantity;
          copy++
        ) {
          result.push({
            sourceRow: row,
            sourceRowIndex:
              rowIndex,

            quantityInstance:
              copy,
          });
        }
      }
    );

    return result;
  }, [rows]);

  const physicalPanelCount =
    physicalRows.length;

  /* =====================================================
     QR DATA FOR SOURCE ROW

     This is used by downloaded QR cutlist.

     One QR is assigned per physical panel,
     matching App.jsx database import.
  ===================================================== */

  function getRowQr(
    index
  ) {
    return getQrData(
      index + 1
    );
  }

  /* =====================================================
     FILE UPLOAD

     Uses App.jsx handler.
  ===================================================== */

  async function handleUpload(
    event
  ) {
    setError?.("");
    setMessage?.("");

    try {
      await handleFileSelect(
        event
      );
    } catch (err) {
      console.error(
        "Cutlist upload error:",
        err
      );

      setError?.(
        err?.message ||
          "Unable to read the Excel cutlist."
      );
    }
  }

  /* =====================================================
     CLEAR
  ===================================================== */

  function clearCutlist() {
    setImportRows?.([]);
    setImportFile?.(null);

    setSiteName("");
    setClientName("");
    setContact("");
    setAddress("");

    setReleased(false);
    setReleasedSite(null);

    setSelectedSite?.(null);

    setMessage?.("");
    setError?.("");
  }

  /* =====================================================
     RELEASE TO PRODUCTION

     IMPORTANT:

     This does NOT insert directly into Supabase.

     It calls the existing App.jsx functions.
  ===================================================== */

  async function releaseToProduction() {
    setError?.("");
    setMessage?.("");

    const cleanSite =
      siteName.trim();

    const cleanClient =
      clientName.trim();

    if (!cleanSite) {
      setError?.(
        "Please enter the site name."
      );
      return;
    }

    if (!cleanClient) {
      setError?.(
        "Please enter the client name."
      );
      return;
    }

    if (!rows.length) {
      setError?.(
        "Please upload the Excel cutlist first."
      );
      return;
    }

    if (
      typeof createSiteRecord !==
      "function"
    ) {
      setError?.(
        "Site connection is missing in App.jsx."
      );
      return;
    }

    if (
      typeof importCutlist !==
      "function"
    ) {
      setError?.(
        "Cutlist import connection is missing in App.jsx."
      );
      return;
    }

    try {
      /* -----------------------------------------------
         CREATE SITE USING App.jsx
      ------------------------------------------------ */

      const newSite =
        await createSiteRecord({
          site_name:
            cleanSite,

          client_name:
            cleanClient,

          contact:
            contact.trim(),

          address:
            address.trim(),
        });

      if (!newSite?.id) {
        throw new Error(
          "Site was not created correctly."
        );
      }

      /* -----------------------------------------------
         SELECT CREATED SITE
      ------------------------------------------------ */

      setSelectedSite?.(
        newSite
      );

      setReleasedSite(
        newSite
      );

      /* -----------------------------------------------
         EXACT CUTLIST FIELD MAPPING

         FB Name        -> individual FB / panel number
         Assembly Label -> cabinet number (#1, #2, #3...)
         Cabinet Name   -> cabinet name
         Section Name   -> section / panel name
         Room Name      -> room

         The existing App.jsx import workflow is preserved.
         Only the meanings of these fields are normalized.
      ------------------------------------------------ */

      rows.forEach(
        (row, index) => {
          const mapping =
            getProductionFieldMapping(
              row,
              index
            );

          /*
           * App.jsx reads these exact Excel-style aliases
           * first, so normalize them before the existing
           * importCutlist() function is called.
           */
          row["FB Name"] =
            mapping.fbName;

          row["fb_name"] =
            mapping.fbName;

          row["Assembly Label"] =
            mapping.assemblyLabel;

          row["assembly_label"] =
            mapping.assemblyLabel;

          row["Cabinet Name"] =
            mapping.cabinetName;

          row["cabinet_name"] =
            mapping.cabinetName;

          row["Section Name"] =
            mapping.sectionName;

          row["section_name"] =
            mapping.sectionName;

          row["Room Name"] =
            mapping.roomName;

          row["room_name"] =
            mapping.roomName;
        }
      );

      /* -----------------------------------------------
         INSERT PANELS USING EXISTING App.jsx WORKFLOW
      ------------------------------------------------ */

      await importCutlist(
        newSite,
        {
          keepPreview: true,
        }
      );

      setReleased(true);

      setMessage?.(
        `${physicalPanelCount} physical panel${
          physicalPanelCount === 1
            ? ""
            : "s"
        } released to production successfully.`
      );
    } catch (err) {
      console.error(
        "Release to production error:",
        err
      );

      setReleased(false);
      setReleasedSite(null);

      setError?.(
        err?.message ||
          "Unable to release the cutlist to production."
      );
    }
  }

  /* =====================================================
     DOWNLOAD QR CUTLIST
  ===================================================== */

  function downloadQrCutlist() {
    if (!rows.length) {
      setError?.(
        "Upload a cutlist first."
      );
      return;
    }

    if (!releasedSite) {
      setError?.(
        "Release the cutlist to production first."
      );
      return;
    }

    /*
     * IMPORTANT:
     * The downloaded QR cutlist must use the same
     * physical-panel logic as Supabase and the manual
     * labels.
     *
     * If Quantity = 3, this creates 3 output rows:
     *   row 1 -> QR 0001
     *   row 2 -> QR 0002
     *   row 3 -> QR 0003
     *
     * Each output row represents ONE physical panel.
     */
    const outputRows = [];

    let physicalIndex = 0;

    rows.forEach(
      (row) => {
        const quantity =
          getQuantity(row);

        for (
          let copy = 1;
          copy <= quantity;
          copy++
        ) {
          physicalIndex += 1;

          outputRows.push({
            ...row,

            Quantity: 1,

            "QR Data":
              getQrData(
                physicalIndex
              ),
          });
        }
      }
    );

    const worksheet =
      XLSX.utils.json_to_sheet(
        outputRows
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
      `${qrSiteName}_QR_Cutlist.xlsx`
    );

    setMessage?.(
      `${outputRows.length} physical QR panel${
        outputRows.length === 1
          ? ""
          : "s"
      } exported successfully.`
    );
  }

  /* =====================================================
     MANUAL QR LABEL DATA
  ===================================================== */

  function getManualLabelData(
    physicalRow,
    index
  ) {
    const row =
      physicalRow.sourceRow;

    const mapping =
      getProductionFieldMapping(
        row,
        physicalRow.sourceRowIndex
      );

    return {
      labelNumber:
        index + 1,

      qrData:
        getQrData(
          index + 1
        ),

      fbName:
        mapping.fbName,

      cabinetNumber:
        mapping.assemblyLabel,

      cabinetName:
        mapping.cabinetName,

      panelName:
        mapping.sectionName ||
        getPanelName(
          row,
          physicalRow.sourceRowIndex
        ),

      sectionName:
        mapping.sectionName,

      roomName:
        mapping.roomName,

      thickness:
        getThickness(
          row
        ),

      length:
        getLength(
          row
        ),

      width:
        getWidth(
          row
        ),

      material:
        getMaterial(
          row
        ),

      remark:
        getRemark(
          row
        ),

      quantityInstance:
        physicalRow.quantityInstance,

      originalQuantity:
        getQuantity(row),
    };
  }

  /* =====================================================
     GENERATE MANUAL QR LABELS

     NOVAJET MPL24L / A4 PORTRAIT

     Sheet:
     - 210mm × 297mm
     - 3 columns × 8 rows
     - Label: 64mm × 34mm
     - Left/right margins: 6mm
     - Column gap: 3mm
     - Top margin: 12mm
     - No row gap
     - Exactly 24 labels are grouped into each A4 page

     IMPORTANT:
     The physical label is only 64 × 34mm.
     QR/text/border are kept inside that peel area.
  ===================================================== */

  async function openManualQrPrint() {
    if (!physicalRows.length) {
      setError?.(
        "Upload a cutlist before printing QR labels."
      );
      return;
    }

    setManualQrLoading(true);
    setError?.("");
    setMessage?.("");

    try {
      const labels = await Promise.all(
        physicalRows.map(async (physicalRow, index) => {
          const data = getManualLabelData(
            physicalRow,
            index
          );

          const qrImage = await QRCode.toDataURL(
            data.qrData,
            {
              errorCorrectionLevel: "M",
              margin: 1,
              width: 220,
            }
          );

          return {
            ...data,
            qrImage,
          };
        })
      );

      setManualLabels(labels);
      setShowManualPrint(true);
    } catch (err) {
      console.error(
        "QR label generation error:",
        err
      );

      setError?.(
        "Unable to generate QR labels."
      );
    } finally {
      setManualQrLoading(false);
    }
  }

  /* =====================================================
     PRINT BROWSER VERSION

     Browser print must be:
     - A4
     - Portrait
     - Scale 100%
     - Margins None
     - Headers/footers Off
  ===================================================== */

  function printManualQrLabels() {
    window.print();
  }

  /* =====================================================
     DOWNLOAD PDF

     Creates a true A4 210 × 297mm PDF directly.
     This avoids browser print scaling completely.

     PDF geometry:
     Left = 6mm
     Label width = 64mm
     Column gap = 3mm
     Top = 12mm
     Label height = 34mm
     Row gap = 0mm

     NOTE:
     8 × 34 = 272mm, so with a 12mm top margin
     the physical 34mm labels finish at 284mm,
     leaving 13mm at the bottom. This 1mm difference
     is unavoidable if both the sheet and label sizes
     are kept exactly at 210 × 297 and 64 × 34mm.
  ===================================================== */

  function downloadManualQrPdf() {
    if (!manualLabels.length) {
      setError?.(
        "Generate the QR labels first."
      );
      return;
    }

    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [210, 297],
        compress: true,
      });

      /*
       * NOVAJET MPL24L / A4
       *
       * Physical sheet:
       * - A4: 210 × 297 mm
       * - 3 columns × 8 rows
       * - Each label: 64 × 34 mm
       *
       * Horizontal:
       * 6 + 64 + 3 + 64 + 3 + 64 + 6 = 210 mm
       *
       * Vertical:
       * 12 + (8 × 34) = 284 mm
       * Remaining bottom area = 13 mm
       *
       * IMPORTANT:
       * Every label is placed using fixed coordinates.
       * Nothing is allowed to flow into another label.
       */

      const PAGE_W = 210;
      const PAGE_H = 297;

      const LABEL_W = 64;
      const LABEL_H = 34;

      const LEFT = 6;
      const TOP = 12;

      const COL_GAP = 3;
      const ROW_GAP = 0;

      const BORDER_INSET = 0.45;

      /*
       * Helper for readable one-line fields.
       * Long names are shortened only when they physically
       * cannot fit inside the label.
       */
      function fitText(
        value,
        maxWidth,
        fontSize,
        fontName = "helvetica",
        fontStyle = "normal"
      ) {
        const clean = cleanText(value);

        if (!clean) {
          return "-";
        }

        pdf.setFont(
          fontName,
          fontStyle
        );
        pdf.setFontSize(
          fontSize
        );

        if (
          pdf.getTextWidth(clean) <=
          maxWidth
        ) {
          return clean;
        }

        let result = clean;

        while (
          result.length > 3 &&
          pdf.getTextWidth(
            `${result}…`
          ) > maxWidth
        ) {
          result =
            result.slice(
              0,
              -1
            );
        }

        return `${result}…`;
      }

      manualLabels.forEach(
        (label, index) => {
          /*
           * 24 labels per A4 page.
           */
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

          /*
           * Border stays completely INSIDE the
           * physical 64 × 34 mm label.
           */
          pdf.setDrawColor(
            100,
            100,
            100
          );

          pdf.setLineWidth(
            0.22
          );

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

          /*
           * -------------------------------------------------
           * QR CODE
           * -------------------------------------------------
           *
           * Reduced from 14 mm to 10.5 mm.
           * This deliberately gives more physical space to
           * Panel / Cabinet / Room / Size information.
           */
          const QR = 10.5;

          const qrX =
            x + 2.5;

          const qrY =
            y + 11.2;

          pdf.addImage(
            label.qrImage,
            "PNG",
            qrX,
            qrY,
            QR,
            QR,
            undefined,
            "FAST"
          );

          /*
           * -------------------------------------------------
           * TEXT AREA
           * -------------------------------------------------
           *
           * Everything important is on the right side.
           * The available width is approximately 46 mm.
           */
          const textX =
            x + 15.0;

          const textWidth =
            46.0;

          pdf.setTextColor(
            15,
            23,
            42
          );

          /*
           * BRAND + LABEL NUMBER
           */
          pdf.setFont(
            "helvetica",
            "bold"
          );

          pdf.setFontSize(
            5.4
          );

          pdf.text(
            "TRACKERZ",
            textX,
            y + 5.0
          );

          pdf.setFontSize(
            8.0
          );

          pdf.text(
            String(
              label.labelNumber
            ).padStart(4, "0"),
            x + LABEL_W - 2.5,
            y + 5.0,
            {
              align: "right",
            }
          );

          /*
           * PANEL NAME
           *
           * Larger and visually prominent.
           */
          const panelName =
            fitText(
              label.panelName,
              textWidth,
              6.6,
              "helvetica",
              "bold"
            );

          pdf.setFont(
            "helvetica",
            "bold"
          );

          pdf.setFontSize(
            6.6
          );

          pdf.text(
            `PANEL: ${panelName}`,
            textX,
            y + 9.2
          );

          /*
           * FB NUMBER
           */
          const fbName =
            fitText(
              label.fbName,
              textWidth,
              6.0,
              "helvetica",
              "bold"
            );

          pdf.setFontSize(
            6.0
          );

          pdf.text(
            `FB NO: ${fbName}`,
            textX,
            y + 13.2
          );

          /*
           * CABINET NUMBER + NAME
           */
          const cabinetNumber =
            fitText(
              label.cabinetNumber,
              12.0,
              5.8,
              "helvetica",
              "bold"
            );

          const cabinetName =
            fitText(
              label.cabinetName,
              textWidth - 13.0,
              5.8,
              "helvetica",
              "bold"
            );

          pdf.setFontSize(
            5.8
          );

          pdf.text(
            `CABINET: ${cabinetNumber}  ${cabinetName}`,
            textX,
            y + 17.0
          );

          /*
           * SECTION NAME
           */
          const sectionName =
            fitText(
              label.sectionName,
              textWidth,
              5.8,
              "helvetica",
              "bold"
            );

          pdf.setFontSize(
            5.8
          );

          pdf.text(
            `SECTION: ${sectionName}`,
            textX,
            y + 20.6
          );

          /*
           * ROOM NAME
           */
          const roomName =
            fitText(
              label.roomName,
              textWidth,
              6.0,
              "helvetica",
              "bold"
            );

          pdf.text(
            `ROOM: ${roomName}`,
            textX,
            y + 24.0
          );

          /*
           * -------------------------------------------------
           * DIMENSIONS
           * -------------------------------------------------
           *
           * This is intentionally one of the largest fields.
           * Example:
           *
           * SIZE: 600 × 462 × 18 mm
           *
           * L = Length
           * W = Width
           * T = Thickness / Depth
           */
          const length =
            cleanText(
              label.length
            ) || "-";

          const width =
            cleanText(
              label.width
            ) || "-";

          const thickness =
            cleanText(
              label.thickness
            ) || "-";

          const sizeText =
            `SIZE: ${length} × ${width} × ${thickness} mm`;

          pdf.setFont(
            "helvetica",
            "bold"
          );

          pdf.setFontSize(
            6.4
          );

          /*
           * If the dimensions are unusually long,
           * reduce only the dimension text slightly.
           */
          let sizeFontSize = 6.4;

          while (
            sizeFontSize > 5.3 &&
            pdf.getTextWidth(
              sizeText
            ) > textWidth
          ) {
            sizeFontSize -=
              0.2;

            pdf.setFontSize(
              sizeFontSize
            );
          }

          pdf.text(
            sizeText,
            textX,
            y + 27.5
          );

          /*
           * MATERIAL
           */
          const material =
            fitText(
              label.material,
              textWidth,
              5.7,
              "helvetica",
              "bold"
            );

          pdf.setFont(
            "helvetica",
            "bold"
          );

          pdf.setFontSize(
            5.7
          );

          pdf.text(
            `MAT: ${material}`,
            textX,
            y + 30.2
          );

          /*
           * QR ID
           *
           * Small enough not to compete with the
           * important panel information.
           */
          pdf.setFont(
            "courier",
            "bold"
          );

          pdf.setFontSize(
            4.2
          );

          pdf.text(
            label.qrData,
            x + 2.5,
            y + 33.0
          );

          /*
           * Small "physical panel" indicator.
           * Useful when Quantity > 1 without taking space.
           */
          if (
            Number(
              label.originalQuantity
            ) > 1
          ) {
            pdf.setFont(
              "helvetica",
              "normal"
            );

            pdf.setFontSize(
              3.8
            );

            pdf.text(
              `#${label.quantityInstance}/${label.originalQuantity}`,
              x + LABEL_W - 2.5,
              y + 31.2,
              {
                align: "right",
              }
            );
          }
        }
      );

      const safeSite =
        qrSiteName || "SITE";

      pdf.save(
        `${safeSite}_Manual_QR_Labels_24L.pdf`
      );

      setMessage?.(
        "Manual QR label PDF downloaded successfully."
      );
    } catch (err) {
      console.error(
        "Manual QR PDF error:",
        err
      );

      setError?.(
        err?.message ||
          "Unable to create the QR label PDF."
      );
    }
  }

  function closeManualQrPrint() {
    setShowManualPrint(false);
  }

  /* =====================================================
     STYLES
  ===================================================== */

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    height: "40px",
    padding:
      "8px 11px",
    border:
      "1px solid #d1d5db",
    borderRadius:
      "7px",
    fontSize: "14px",
    background:
      "#ffffff",
    outline: "none",
  };

  const labelStyle = {
    display: "block",
    marginBottom: "5px",
    fontSize: "12px",
    fontWeight: "700",
    color: "#374151",
  };

  const cardStyle = {
    background:
      "#ffffff",
    border:
      "1px solid #e5e7eb",
    borderRadius:
      "10px",
    padding: "14px",
  };

  /* =====================================================
     UI
  ===================================================== */

  return (
    <>
      {/* =================================================
          PRINT CSS
      ================================================= */}

      <style>
        {`
          /*
           * SCREEN PREVIEW
           *
           * The preview uses the real physical dimensions.
           * 1mm = 1mm in CSS.
           */

          .trackerz-label-sheet {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            break-after: page !important;
            page-break-after: always !important;
            box-sizing: border-box !important;

            display: grid !important;

            grid-template-columns:
              64mm 64mm 64mm !important;

            grid-template-rows:
              repeat(8, 34mm) !important;

            column-gap: 3mm !important;
            row-gap: 0mm !important;

            padding:
              12mm 6mm 13mm 6mm !important;

            margin: 0 auto !important;

            background: #ffffff !important;
          }

          .trackerz-label-sheet:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .trackerz-manual-label {
            width: 64mm !important;
            height: 34mm !important;
            min-width: 64mm !important;
            min-height: 34mm !important;

            box-sizing: border-box !important;

            /*
             * Border is INSIDE the label.
             */
            border:
              0.25mm solid #111827 !important;

            border-radius: 1.2mm !important;

            padding: 1.8mm !important;

            overflow: hidden !important;

            background: #ffffff !important;

            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          @media print {

            @page {
              size: A4 portrait;
              margin: 0 !important;
            }

            html,
            body {
              width: 210mm !important;
              height: 297mm !important;

              margin: 0 !important;
              padding: 0 !important;

              background: #ffffff !important;
            }

            body * {
              visibility: hidden !important;
            }

            .trackerz-manual-print,
            .trackerz-manual-print * {
              visibility: visible !important;
            }

            .trackerz-manual-print {
              position: absolute !important;

              left: 0 !important;
              top: 0 !important;

              width: 210mm !important;
              height: 297mm !important;

              margin: 0 !important;
              padding: 0 !important;

              overflow-y: visible !important;
              overflow-x: hidden !important;

              background: #ffffff !important;
            }

            .trackerz-print-controls {
              display: none !important;
            }

            .trackerz-label-sheet {
              position: relative !important;

              width: 210mm !important;
              height: 297mm !important;

              min-height: 297mm !important;

              display: grid !important;

              grid-template-columns:
                64mm 64mm 64mm !important;

              grid-template-rows:
                repeat(8, 34mm) !important;

              column-gap: 3mm !important;
              row-gap: 0mm !important;

              /*
               * Exact horizontal geometry:
               * 6 + 64 + 3 + 64 + 3 + 64 + 6 = 210mm
               *
               * Vertical:
               * 12 + (8 × 34) = 284mm
               * Remaining bottom = 13mm.
               */
              padding:
                12mm 6mm 13mm 6mm !important;

              margin: 0 !important;

              box-sizing: border-box !important;

              justify-content: start !important;
              align-content: start !important;

              gap: 0 3mm !important;

              background: #ffffff !important;
            }

            .trackerz-manual-label {
              width: 64mm !important;
              height: 34mm !important;

              box-sizing: border-box !important;

              /*
               * Keep every visible mark inside the
               * physical 64 × 34mm peel area.
               */
              border:
                0.25mm solid #111827 !important;

              border-radius: 1.2mm !important;

              padding: 1.8mm !important;

              overflow: hidden !important;

              break-inside: avoid !important;
              page-break-inside: avoid !important;

              background: #ffffff !important;
            }
          }
        `}
      </style>

      {/* =================================================
          TOP BAR
      ================================================= */}

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
            gap: "8px",
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
              setActivePage?.(
                "sites"
              )
            }
          >
            Sites
          </button>
        </div>
      </header>

      {/* =================================================
          SITE INFORMATION
      ================================================= */}

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
              "minmax(180px, 1.2fr) minmax(180px, 1fr) minmax(150px, .8fr) minmax(200px, 1.5fr)",
            gap:
              "10px",
            alignItems:
              "end",
          }}
        >
          {/* SITE */}

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
                inputStyle
              }
            />
          </label>

          {/* CLIENT */}

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
              placeholder="Client name"
              style={
                inputStyle
              }
            />
          </label>

          {/* CONTACT */}

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
                inputStyle
              }
            />
          </label>

          {/* ADDRESS */}

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
                inputStyle
              }
            />
          </label>
        </div>

        {/* =================================================
            UPLOAD + SUMMARY
        ================================================= */}

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
          {/* FILE */}

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

                handleUpload(
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

          {/* ROWS */}

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
              }}
            >
              {
                rows.length
              }
            </strong>
          </div>

          {/* PHYSICAL PANELS */}

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
                color:
                  rows.length
                    ? "#16a34a"
                    : "#6b7280",
              }}
            >
              {
                physicalPanelCount
              }
            </strong>
          </div>

          {/* STATUS */}

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
                    : rows.length
                      ? "#1d4ed8"
                      : "#6b7280",
              }}
            >
              {released
                ? "RELEASED"
                : rows.length
                  ? "READY"
                  : "WAITING"}
            </strong>
          </div>
        </div>

        {/* =================================================
            PREVIEW
        ================================================= */}

        {rows.length > 0 && (
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
                  rows.length
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
                    "800px",
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
                      rows[0]
                    )
                      .slice(
                        0,
                        8
                      )
                      .map(
                        (
                          column
                        ) => (
                          <th
                            key={
                              column
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
                              column
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
                  {rows
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
                            rows[0]
                          )
                            .slice(
                              0,
                              8
                            )
                            .map(
                              (
                                column
                              ) => (
                                <td
                                  key={
                                    column
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
                                  {cleanText(
                                    row[
                                      column
                                    ]
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
                              fontFamily:
                                "monospace",
                              fontWeight:
                                "600",
                            }}
                          >
                            {
                              getRowQr(
                                index
                              )
                            }
                          </td>
                        </tr>
                      )
                    )}
                </tbody>
              </table>
            </div>

            {rows.length > 8 && (
              <div
                style={{
                  padding:
                    "8px 12px",
                  fontSize:
                    "11px",
                  color:
                    "#64748b",
                  borderTop:
                    "1px solid #e5e7eb",
                }}
              >
                Showing first 8 rows.
                All{" "}
                {
                  rows.length
                }{" "}
                rows will be imported.
              </div>
            )}
          </div>
        )}

        {/* =================================================
            ACTIONS
        ================================================= */}

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
          {/* RELEASE */}

          <button
            type="button"
            className="primary-button"
            disabled={
              importing ||
              released ||
              !siteName.trim() ||
              !clientName.trim() ||
              !rows.length
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

          {/* DOWNLOAD */}

          <button
            type="button"
            className="secondary-button"
            disabled={
              importing ||
              !released ||
              !rows.length
            }
            onClick={
              downloadQrCutlist
            }
            style={{
              border:
                released
                  ? "1px solid #16a34a"
                  : undefined,

              color:
                released
                  ? "#15803d"
                  : undefined,

              fontWeight:
                released
                  ? "700"
                  : undefined,
            }}
          >
            ↓ Download QR Cutlist
          </button>

          {/* MANUAL LABELS */}

          <button
            type="button"
            className="secondary-button"
            disabled={
              importing ||
              !rows.length ||
              manualQrLoading
            }
            onClick={
              openManualQrPrint
            }
          >
            {manualQrLoading
              ? "Generating..."
              : "▣ Manual QR Labels"}
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
              ? "✓ Site created and released to production"
              : "Enter site + client → upload cutlist → release"}
          </div>
        </div>

        {/* =================================================
            RELEASE SUCCESS
        ================================================= */}

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
                —
                {
                  releasedSite.site_name
                }
              </span>
            </div>
          )}
      </section>

      {/* =================================================
          MANUAL QR PRINT SCREEN
      ================================================= */}

      {showManualPrint && (
        <div
          className="trackerz-manual-print"
          style={{
            position:
              "fixed",
            inset: 0,
            zIndex:
              99999,
            background:
              "#ffffff",
            overflowY:
              "auto",
            padding:
              "18px",
          }}
        >
          {/* PRINT CONTROLS */}

          <div
            className="trackerz-print-controls"
            style={{
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "space-between",
              gap:
                "12px",
              marginBottom:
                "16px",
              paddingBottom:
                "10px",
              borderBottom:
                "1px solid #e5e7eb",
              position:
                "sticky",
              top: 0,
              background:
                "#ffffff",
              zIndex:
                10,
            }}
          >
            <div>
              <strong
                style={{
                  fontSize:
                    "16px",
                }}
              >
                Manual QR Labels
              </strong>

              <div
                style={{
                  marginTop:
                    "3px",
                  fontSize:
                    "12px",
                  color:
                    "#64748b",
                }}
              >
                A4 • 24 labels per sheet •
                64 × 34 mm • 3 × 8
              </div>
            </div>

            <div
              style={{
                display:
                  "flex",
                gap:
                  "8px",
              }}
            >
              <button
                type="button"
                className="primary-button"
                onClick={
                  downloadManualQrPdf
                }
              >
                ↓ Download PDF
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={
                  printManualQrLabels
                }
              >
                🖨 Print Labels
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={
                  closeManualQrPrint
                }
              >
                Close
              </button>
            </div>
          </div>

          {/* LABEL SHEET */}

          {Array.from(
            {
              length: Math.ceil(
                manualLabels.length / 24
              ),
            },
            (_, pageIndex) => {
              const pageLabels =
                manualLabels.slice(
                  pageIndex * 24,
                  pageIndex * 24 + 24
                );

              return (
                <div
                  key={`manual-qr-page-${pageIndex}`}
                  className="trackerz-label-sheet"
                >
                  {pageLabels.map(
(label) => (
                <div
                  key={label.qrData}
                  className="trackerz-manual-label"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "2mm",
                  }}
                >
                  {/* SMALL QR - safely inside peel area */}
                  <div
                    style={{
                      width: "14mm",
                      height: "14mm",
                      flex: "0 0 14mm",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={label.qrImage}
                      alt={label.qrData}
                      style={{
                        width: "14mm",
                        height: "14mm",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  </div>

                  {/* COMPACT DETAILS */}
                  <div
                    style={{
                      minWidth: 0,
                      flex: 1,
                      height: "100%",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      lineHeight: 1.05,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "6.2px",
                        fontWeight: 900,
                        letterSpacing: "0.3px",
                        color: "#111827",
                      }}
                    >
                      TRACKERZ
                    </div>

                    <div
                      style={{
                        fontSize: "10px",
                        fontWeight: 900,
                        marginTop: "0.25mm",
                        color: "#111827",
                      }}
                    >
                      {String(
                        label.labelNumber
                      ).padStart(4, "0")}
                    </div>

                    <div
                      style={{
                        fontSize: "5.6px",
                        fontWeight: 800,
                        marginTop: "0.45mm",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "#111827",
                      }}
                    >
                      FB NO: {label.fbName || "-"}  •  {label.panelName || "Panel"}
                    </div>

                    <div
                      style={{
                        fontSize: "5.2px",
                        fontWeight: 700,
                        marginTop: "0.35mm",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "#111827",
                      }}
                    >
                      CABINET: {label.cabinetNumber || "-"}  •  {label.cabinetName || "-"}
                    </div>

                    <div
                      style={{
                        fontSize: "5.2px",
                        fontWeight: 700,
                        marginTop: "0.35mm",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "#111827",
                      }}
                    >
                      SECTION: {label.sectionName || "-"}
                    </div>

                    <div
                      style={{
                        fontSize: "5.2px",
                        fontWeight: 700,
                        marginTop: "0.35mm",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "#111827",
                      }}
                    >
                      ROOM: {label.roomName || "-"}
                    </div>

                    <div
                      style={{
                        fontSize: "5.4px",
                        fontWeight: 800,
                        marginTop: "0.35mm",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "#111827",
                      }}
                    >
                      SIZE: L {label.length || "-"} ×
                      W {label.width || "-"} ×
                      T {label.thickness || "-"}
                    </div>

                    <div
                      style={{
                        fontSize: "5.1px",
                        fontWeight: 700,
                        marginTop: "0.35mm",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "#111827",
                      }}
                    >
                      MAT: {label.material || "-"}
                    </div>

                    <div
                      style={{
                        fontSize: "4.5px",
                        marginTop: "0.3mm",
                        fontFamily: "monospace",
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "#111827",
                      }}
                    >
                      {label.qrData}
                    </div>
                  </div>
                </div>
              )
                  )}
                </div>
              );
            }
          )}
        </div>
      )}
    </>
  );
}