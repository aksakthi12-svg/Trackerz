import { useState } from "react";
import * as XLSX from "xlsx";

function CutlistImport() {
  const [siteName, setSiteName] = useState("");
  const [clientName, setClientName] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [site, setSite] = useState(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [isReleased, setIsReleased] = useState(false);

  // ---------------------------------------------------------
  // Utility
  // ---------------------------------------------------------

  const cleanText = (value) => {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value).trim();
  };

  const makeId = (prefix = "ID") => {
    return `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;
  };

  const getStorage = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  };

  const saveStorage = (key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  // ---------------------------------------------------------
  // Create safe customer name for QR
  // ---------------------------------------------------------

  const makeCustomerCode = (name) => {
    const cleaned = cleanText(name)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return cleaned || "CUSTOMER";
  };

  // ---------------------------------------------------------
  // Find likely panel number column
  // ---------------------------------------------------------

  const getPanelNumber = (row, index) => {
    const possibleColumns = [
      "Panel No",
      "Panel Number",
      "Panel",
      "Panel ID",
      "Part No",
      "Part Number",
      "Item",
      "Item No",
      "S.No",
      "S No",
      "Sl No",
      "Sl. No",
    ];

    for (const column of possibleColumns) {
      if (
        Object.prototype.hasOwnProperty.call(row, column) &&
        cleanText(row[column])
      ) {
        return cleanText(row[column]);
      }
    }

    return String(index + 1).padStart(4, "0");
  };

  // ---------------------------------------------------------
  // Check if row is usable
  // ---------------------------------------------------------

  const isValidRow = (row) => {
    if (!row || typeof row !== "object") {
      return false;
    }

    const values = Object.values(row);

    return values.some((value) => cleanText(value) !== "");
  };

  // ---------------------------------------------------------
  // Generate QR data
  // ---------------------------------------------------------

  const generateQRData = (customerCode, panelNumber) => {
    const number = String(panelNumber)
      .replace(/\s+/g, "-")
      .replace(/[^A-Z0-9-]/gi, "");

    return `TRK-${customerCode}-${number}`;
  };

  // ---------------------------------------------------------
  // Upload Excel
  // ---------------------------------------------------------

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];

    setError("");
    setMessage("");

    if (!file) {
      return;
    }

    if (!siteName.trim()) {
      setError("Please enter the Site Name before uploading the cutlist.");
      event.target.value = "";
      return;
    }

    if (!clientName.trim()) {
      setError("Please enter the Client Name before uploading the cutlist.");
      event.target.value = "";
      return;
    }

    setIsProcessing(true);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
      });

      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error("No worksheet was found in the Excel file.");
      }

      const worksheet = workbook.Sheets[firstSheetName];

      const importedRows = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
      });

      if (!importedRows.length) {
        throw new Error("The uploaded cutlist is empty.");
      }

      const validRows = importedRows.filter(isValidRow);

      if (!validRows.length) {
        throw new Error("No valid panel rows were found.");
      }

      const customerCode = makeCustomerCode(clientName);

      // -----------------------------------------------------
      // Create a unique site ID
      // -----------------------------------------------------

      const siteId = makeId("SITE");

      // -----------------------------------------------------
      // Existing data
      // -----------------------------------------------------

      const existingSites = getStorage("trackerzSites");
      const existingPanels = getStorage("trackerzPanels");

      // -----------------------------------------------------
      // Generate panel data
      // -----------------------------------------------------

      const newPanels = [];
      const usedQR = new Set();

      validRows.forEach((row, index) => {
        const panelNumber = getPanelNumber(row, index);

        let qrData = generateQRData(customerCode, panelNumber);

        // Ensure QR is unique inside this import
        if (usedQR.has(qrData)) {
          let counter = 2;

          while (usedQR.has(`${qrData}-${counter}`)) {
            counter++;
          }

          qrData = `${qrData}-${counter}`;
        }

        usedQR.add(qrData);

        const panel = {
          id: makeId("PANEL"),

          siteId,

          siteName: siteName.trim(),

          clientName: clientName.trim(),

          contact: contact.trim(),

          address: address.trim(),

          panelNo: panelNumber,

          qrData,

          status: "pending",

          packetId: null,

          packetName: null,

          packedAt: null,

          createdAt: new Date().toISOString(),

          // Keep the original Excel row
          data: {
            ...row,
          },
        };

        newPanels.push(panel);
      });

      // -----------------------------------------------------
      // Create site
      // -----------------------------------------------------

      const newSite = {
        id: siteId,

        siteName: siteName.trim(),

        clientName: clientName.trim(),

        contact: contact.trim(),

        address: address.trim(),

        panelCount: newPanels.length,

        packedCount: 0,

        balanceCount: newPanels.length,

        status: "QR Ready",

        released: false,

        createdAt: new Date().toISOString(),

        sourceFile: file.name,
      };

      // -----------------------------------------------------
      // Save site
      // -----------------------------------------------------

      saveStorage("trackerzSites", [
        ...existingSites,
        newSite,
      ]);

      // -----------------------------------------------------
      // Save panels
      // -----------------------------------------------------

      saveStorage("trackerzPanels", [
        ...existingPanels,
        ...newPanels,
      ]);

      // -----------------------------------------------------
      // Create preview rows
      // -----------------------------------------------------

      const previewRows = validRows.map((row, index) => {
        return {
          ...row,
          "QR Data": newPanels[index].qrData,
        };
      });

      setRows(previewRows);

      setSite(newSite);

      setIsReleased(false);

      setMessage(
        `${newPanels.length} panels imported successfully. QR data has been generated.`
      );
    } catch (err) {
      console.error("Cutlist import error:", err);

      setError(
        err?.message ||
          "Unable to import the cutlist. Please check the Excel file."
      );

      setRows([]);
      setSite(null);
    } finally {
      setIsProcessing(false);

      event.target.value = "";
    }
  };

  // ---------------------------------------------------------
  // Download modified Excel
  // ---------------------------------------------------------

  const handleDownload = () => {
    if (!rows.length) {
      setError("Please upload a cutlist first.");
      return;
    }

    try {
      const worksheet = XLSX.utils.json_to_sheet(rows);

      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Cutlist"
      );

      const safeSiteName = siteName
        .trim()
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .replace(/\s+/g, "_");

      const outputFileName =
        `${safeSiteName || "Trackerz"}_QR_Cutlist.xlsx`;

      XLSX.writeFile(workbook, outputFileName);

      setMessage(
        `Downloaded ${outputFileName}`
      );
    } catch (err) {
      console.error("Download error:", err);

      setError(
        "Unable to download the modified cutlist."
      );
    }
  };

  // ---------------------------------------------------------
  // Release to production
  // ---------------------------------------------------------

  const handleRelease = () => {
    if (!site) {
      setError("Please upload a cutlist first.");
      return;
    }

    try {
      const existingSites = getStorage("trackerzSites");

      const updatedSites = existingSites.map((item) => {
        if (item.id !== site.id) {
          return item;
        }

        return {
          ...item,
          released: true,
          status: "Released to Production",
          releasedAt: new Date().toISOString(),
        };
      });

      saveStorage("trackerzSites", updatedSites);

      const updatedSite = {
        ...site,
        released: true,
        status: "Released to Production",
        releasedAt: new Date().toISOString(),
      };

      setSite(updatedSite);

      setIsReleased(true);

      setMessage(
        `${site.siteName} has been released to production.`
      );
    } catch (err) {
      console.error("Release error:", err);

      setError(
        "Unable to release the site to production."
      );
    }
  };

  // ---------------------------------------------------------
  // Reset form
  // ---------------------------------------------------------

  const handleReset = () => {
    setSiteName("");
    setClientName("");
    setContact("");
    setAddress("");

    setFileName("");
    setRows([]);
    setSite(null);

    setMessage("");
    setError("");

    setIsReleased(false);
  };

  // ---------------------------------------------------------
  // UI
  // ---------------------------------------------------------

  return (
    <div
      style={{
        padding: "28px",
        maxWidth: "1400px",
        margin: "0 auto",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          marginBottom: "25px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            fontWeight: "700",
            letterSpacing: "1px",
            color: "#64748b",
          }}
        >
          TRACKERZ PRODUCTION
        </p>

        <h2
          style={{
            margin: "6px 0",
          }}
        >
          Cutlist Import
        </h2>

        <p
          style={{
            margin: 0,
            color: "#64748b",
          }}
        >
          Import the production cutlist, generate QR data and
          release the panels for packing tracking.
        </p>
      </div>

      {/* MESSAGES */}

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            padding: "12px 15px",
            borderRadius: "8px",
            marginBottom: "18px",
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#166534",
            padding: "12px 15px",
            borderRadius: "8px",
            marginBottom: "18px",
          }}
        >
          {message}
        </div>
      )}

      {/* SITE INFORMATION */}

      <section
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "22px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            marginBottom: "18px",
          }}
        >
          <h3
            style={{
              margin: 0,
            }}
          >
            Site Information
          </h3>

          <p
            style={{
              margin: "5px 0 0",
              color: "#64748b",
              fontSize: "14px",
            }}
          >
            Enter the site details before uploading the cutlist.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          {/* SITE NAME */}

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: "600",
              }}
            >
              Site Name *
            </label>

            <input
              type="text"
              value={siteName}
              onChange={(e) =>
                setSiteName(e.target.value)
              }
              placeholder="Example: Anna Nagar"
              disabled={!!site}
              style={inputStyle}
            />
          </div>

          {/* CLIENT */}

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: "600",
              }}
            >
              Client Name *
            </label>

            <input
              type="text"
              value={clientName}
              onChange={(e) =>
                setClientName(e.target.value)
              }
              placeholder="Example: ABC Interiors"
              disabled={!!site}
              style={inputStyle}
            />
          </div>

          {/* CONTACT */}

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: "600",
              }}
            >
              Contact
            </label>

            <input
              type="text"
              value={contact}
              onChange={(e) =>
                setContact(e.target.value)
              }
              placeholder="Phone number"
              disabled={!!site}
              style={inputStyle}
            />
          </div>

          {/* ADDRESS */}

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: "600",
              }}
            >
              Address
            </label>

            <input
              type="text"
              value={address}
              onChange={(e) =>
                setAddress(e.target.value)
              }
              placeholder="Site address"
              disabled={!!site}
              style={inputStyle}
            />
          </div>
        </div>
      </section>

      {/* UPLOAD */}

      {!site && (
        <section
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "25px",
            marginBottom: "20px",
          }}
        >
          <h3
            style={{
              marginTop: 0,
            }}
          >
            Upload Cutlist
          </h3>

          <p
            style={{
              color: "#64748b",
              fontSize: "14px",
            }}
          >
            Upload the Excel cutlist received from the
            cutting machine software.
          </p>

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 18px",
              borderRadius: "8px",
              background: "#111827",
              color: "white",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            ⇧ Upload Excel

            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              style={{
                display: "none",
              }}
            />
          </label>

          {isProcessing && (
            <span
              style={{
                marginLeft: "15px",
                color: "#64748b",
              }}
            >
              Processing cutlist...
            </span>
          )}

          {fileName && (
            <div
              style={{
                marginTop: "15px",
                color: "#475569",
              }}
            >
              File: <strong>{fileName}</strong>
            </div>
          )}
        </section>
      )}

      {/* SITE SUMMARY */}

      {site && (
        <section
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "22px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "20px",
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#64748b",
                  fontWeight: "700",
                  letterSpacing: "0.8px",
                }}
              >
                SITE
              </div>

              <h2
                style={{
                  margin: "5px 0",
                }}
              >
                {site.siteName}
              </h2>

              <div
                style={{
                  color: "#64748b",
                }}
              >
                Client: {site.clientName}
              </div>

              {site.contact && (
                <div
                  style={{
                    color: "#64748b",
                    marginTop: "3px",
                  }}
                >
                  Contact: {site.contact}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <div style={summaryCard}>
                <span>Panels</span>
                <strong>{site.panelCount}</strong>
              </div>

              <div style={summaryCard}>
                <span>QR Ready</span>
                <strong>{site.panelCount}</strong>
              </div>

              <div style={summaryCard}>
                <span>Status</span>
                <strong
                  style={{
                    fontSize: "13px",
                  }}
                >
                  {site.status}
                </strong>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ACTIONS */}

      {rows.length > 0 && (
        <section
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                }}
              >
                Production Actions
              </h3>

              <p
                style={{
                  margin: "5px 0 0",
                  color: "#64748b",
                  fontSize: "14px",
                }}
              >
                Download the QR-enabled cutlist and release
                this site for packing.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={handleDownload}
                style={secondaryButton}
              >
                ⇩ Download QR Cutlist
              </button>

              {!isReleased ? (
                <button
                  onClick={handleRelease}
                  style={primaryButton}
                >
                  ✓ Release to Production
                </button>
              ) : (
                <div
                  style={{
                    padding: "11px 16px",
                    background: "#f0fdf4",
                    color: "#166534",
                    border: "1px solid #bbf7d0",
                    borderRadius: "8px",
                    fontWeight: "700",
                  }}
                >
                  ✓ Released to Production
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* PREVIEW */}

      {rows.length > 0 && (
        <section
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "20px",
              borderBottom: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                margin: 0,
              }}
            >
              Cutlist Preview
            </h3>

            <p
              style={{
                margin: "5px 0 0",
                color: "#64748b",
                fontSize: "14px",
              }}
            >
              QR Data has been added as the final column.
            </p>
          </div>

          <div
            style={{
              overflowX: "auto",
              maxHeight: "500px",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr>
                  {Object.keys(rows[0]).map(
                    (column) => (
                      <th
                        key={column}
                        style={tableHeaderStyle}
                      >
                        {column}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody>
                {rows.slice(0, 100).map(
                  (row, rowIndex) => (
                    <tr key={rowIndex}>
                      {Object.keys(rows[0]).map(
                        (column) => (
                          <td
                            key={column}
                            style={{
                              padding: "10px",
                              borderBottom:
                                "1px solid #f1f5f9",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {cleanText(
                              row[column]
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

          {rows.length > 100 && (
            <div
              style={{
                padding: "12px 20px",
                color: "#64748b",
                fontSize: "13px",
                borderTop: "1px solid #e2e8f0",
              }}
            >
              Showing first 100 panels in preview.
              All {rows.length} panels are included in the
              downloaded Excel.
            </div>
          )}
        </section>
      )}

      {/* RESET */}

      {site && (
        <div
          style={{
            marginTop: "20px",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={handleReset}
            style={{
              padding: "10px 15px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "white",
              cursor: "pointer",
              fontWeight: "600",
              color: "#475569",
            }}
          >
            Import Another Site
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Styles
// ---------------------------------------------------------

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  outline: "none",
  fontSize: "14px",
};

const primaryButton = {
  padding: "11px 17px",
  border: "none",
  borderRadius: "8px",
  background: "#111827",
  color: "white",
  cursor: "pointer",
  fontWeight: "700",
};

const secondaryButton = {
  padding: "11px 17px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "white",
  color: "#334155",
  cursor: "pointer",
  fontWeight: "700",
};

const summaryCard = {
  minWidth: "100px",
  padding: "12px 15px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const tableHeaderStyle = {
  position: "sticky",
  top: 0,
  background: "#f8fafc",
  padding: "11px 10px",
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
  fontSize: "12px",
  color: "#475569",
  whiteSpace: "nowrap",
};

export default CutlistImport;