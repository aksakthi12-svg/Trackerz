import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/*
 * TRACKERZ - OFFICE / MANAGEMENT WORKSPACE
 *
 * Uses existing tables:
 *   factory_bills
 *   factory_bill_payments
 *   factory_payables
 *   factory_payable_payments
 *   factory_expenses
 *
 * Uses tables created by Trackerz_Management_Additions.sql:
 *   company_profiles
 *   factory_vendors
 *   purchase_orders
 *   purchase_order_items
 *
 * This component is independent of Production, Sites and Panels.
 * It receives companyId from App.jsx and relies on Supabase RLS
 * as the final company-isolation boundary.
 */

const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const num = (value) => Number(value || 0);
const text = (value) => String(value ?? "").trim();
const monthOf = (value) => String(value || "").slice(0, 7);
const money = (value) =>
  `₹${num(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const dateLabel = (value) => {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-IN");
};

const invoiceBlank = () => ({
  bill_date: today(),
  due_date: "",
  reference: "",
  customer_name: "",
  work_description: "",
  amount: "",
  gst_amount: "0",
  tds_amount: "0",
  notes: "",
});

const receiptBlank = () => ({
  payment_date: today(),
  amount: "",
  payment_mode: "Bank Transfer",
  reference: "",
  notes: "",
});

const payableBlank = () => ({
  bill_date: today(),
  due_date: "",
  supplier_name: "",
  reference: "",
  category: "Materials",
  description: "",
  amount: "",
  notes: "",
});

const payablePaymentBlank = () => ({
  payment_date: today(),
  amount: "",
  payment_mode: "Bank Transfer",
  reference: "",
  notes: "",
});

const expenseBlank = () => ({
  expense_date: today(),
  category: "Office",
  description: "",
  amount: "",
  payment_mode: "Bank Transfer",
  reference: "",
  notes: "",
  vendor_name: "",
  expense_type: "General",
  gst_applicable: false,
});

const vendorBlank = () => ({
  vendor_name: "",
  contact_person: "",
  email: "",
  phone: "",
  gstin: "",
  billing_address: "",
  shipping_address: "",
  state: "",
  state_code: "",
  payment_terms: "",
  opening_balance: "0",
  is_active: true,
});

const profileBlank = () => ({
  legal_name: "",
  trade_name: "",
  gstin: "",
  address: "",
  state: "",
  state_code: "",
  phone: "",
  email: "",
});

const itemBlank = () => ({
  description: "",
  hsn_sac: "",
  quantity: "1",
  unit: "Nos",
  rate: "",
  gst_rate: "18",
});

const poBlank = () => ({
  vendor_id: "",
  po_date: today(),
  reference: "",
  delivery_address: "",
  place_of_supply: "",
  notes: "",
  status: "Draft",
  gst_type: "auto",
  items: [itemBlank()],
});

const styles = {
  page: { display: "flex", flexDirection: "column", gap: 16, width: "100%", color: "#172033" },
  card: { background: "#fff", border: "1px solid #e5eaf0", borderRadius: 12, padding: 18, boxShadow: "0 2px 8px rgba(15,23,42,.035)" },
  title: { margin: 0, fontSize: 23, fontWeight: 750, color: "#172033" },
  muted: { margin: "5px 0 0", color: "#718096", fontSize: 12, lineHeight: 1.5 },
  primary: { border: "1px solid #2563eb", background: "#2563eb", color: "#fff", borderRadius: 8, padding: "10px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  secondary: { border: "1px solid #d7dee8", background: "#fff", color: "#344054", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontWeight: 650, cursor: "pointer" },
  danger: { border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", borderRadius: 8, padding: "7px 10px", fontSize: 11, cursor: "pointer" },
  label: { display: "flex", flexDirection: "column", gap: 6, color: "#475467", fontSize: 11, fontWeight: 700, minWidth: 0 },
  input: { width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "1px solid #d7dee8", borderRadius: 7, fontSize: 12, background: "#fff", color: "#172033" },
  th: { padding: "11px 12px", textAlign: "left", background: "#f5f7fa", color: "#667085", fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: "1px solid #e8edf3" },
  td: { padding: "11px 12px", borderBottom: "1px solid #edf0f4", color: "#344054", fontSize: 12, verticalAlign: "middle" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 12 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 },
  metricValue: { fontSize: 23, fontWeight: 800, marginTop: 12, color: "#172033" },
};

function Field({ label, value, onChange, type = "text", required = false, step, min, placeholder, disabled }) {
  return (
    <label style={styles.label}>
      {label}
      <input
        style={styles.input}
        type={type}
        value={value ?? ""}
        required={required}
        step={step}
        min={min}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Select({ label, value, onChange, options, disabled }) {
  return (
    <label style={styles.label}>
      {label}
      <select style={styles.input} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const item = typeof option === "object" ? option : { value: option, label: option };
          return <option key={item.value} value={item.value}>{item.label}</option>;
        })}
      </select>
    </label>
  );
}

function StatusPill({ children, tone = "neutral" }) {
  const palette = {
    green: { background: "#eaf7ee", color: "#267344" },
    amber: { background: "#fff4df", color: "#966516" },
    red: { background: "#fff0ee", color: "#a53c32" },
    neutral: { background: "#eef2f7", color: "#526071" },
  };
  return <span style={{ display: "inline-block", padding: "4px 8px", borderRadius: 20, fontSize: 10, fontWeight: 750, whiteSpace: "nowrap", ...palette[tone] }}>{children}</span>;
}

function Metric({ label, value, note }) {
  return (
    <div style={styles.card}>
      <div style={{ color: "#718096", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px" }}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
      {note && <div style={styles.muted}>{note}</div>}
    </div>
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function printPurchaseOrder(company, vendor, po, items, totals, taxMode) {
  const rows = items.map((item, index) => `
    <tr>
      <td>${index + 1}</td><td>${escapeHtml(item.description)}</td>
      <td>${escapeHtml(item.hsn_sac || "—")}</td>
      <td class="right">${num(item.quantity)}</td><td>${escapeHtml(item.unit || "Nos")}</td>
      <td class="right">${money(item.rate)}</td><td class="right">${money(item.taxable)}</td>
      <td class="right">${num(item.gst_rate)}%</td><td class="right">${money(item.gst)}</td>
      <td class="right">${money(item.total)}</td>
    </tr>`).join("");

  const taxRows = taxMode === "igst"
    ? `<div><span>IGST</span><b>${money(totals.gst)}</b></div>`
    : `<div><span>CGST</span><b>${money(totals.gst / 2)}</b></div><div><span>SGST</span><b>${money(totals.gst / 2)}</b></div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(po.po_number || "Purchase Order")}</title>
  <style>
  *{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#182230;margin:26px}
  .top{display:flex;justify-content:space-between;border-bottom:2px solid #1d4ed8;padding-bottom:15px;gap:20px}
  h1{color:#1d4ed8;font-size:24px;margin:0}.muted{color:#667085;line-height:1.6}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}
  .box{border:1px solid #dfe5ed;padding:11px;border-radius:5px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .cap{font-size:10px;color:#667085;font-weight:bold;margin-bottom:7px}
  table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f1f5f9;text-align:left;font-size:9px}
  th,td{padding:8px 6px;border:1px solid #e2e8f0}.right{text-align:right;white-space:nowrap}
  .bottom{display:flex;justify-content:space-between;gap:20px;margin-top:18px}.totals{width:260px}
  .totals div{display:flex;justify-content:space-between;padding:5px 0}
  .grand{border-top:2px solid #182230;padding-top:9px!important;font-size:15px}
  .sign{text-align:right;margin-top:55px}.sign span{display:inline-block;border-top:1px solid #475467;padding-top:8px;min-width:190px;text-align:center}
  @page{size:A4;margin:12mm}@media print{body{margin:0}}
  </style></head><body>
  <div class="top"><div><h2 style="margin:0 0 7px">${escapeHtml(company.trade_name || company.legal_name || "Company")}</h2>
  <div class="muted">${escapeHtml(company.address || "")}<br>${company.phone ? `Phone: ${escapeHtml(company.phone)}<br>` : ""}
  ${company.email ? `Email: ${escapeHtml(company.email)}<br>` : ""}${company.gstin ? `GSTIN: ${escapeHtml(company.gstin)}` : ""}</div></div>
  <div style="text-align:right"><h1>PURCHASE ORDER</h1><div class="muted">TRACKERZ · PROCUREMENT</div></div></div>
  <div class="grid">
  ${[["PO NUMBER", po.po_number || "—"], ["PO DATE", po.po_date], ["REFERENCE", po.reference || "—"], ["PLACE OF SUPPLY", po.place_of_supply || "—"]]
    .map(([label, value]) => `<div class="box"><span class="muted">${label}</span><br><b>${escapeHtml(value)}</b></div>`).join("")}
  </div>
  <div class="parties">
  <div class="box"><div class="cap">VENDOR / BILL FROM</div><b>${escapeHtml(vendor.vendor_name)}</b><br>
  ${escapeHtml(vendor.billing_address || "")}<br>${escapeHtml(vendor.state || "")}
  ${vendor.gstin ? `<br>GSTIN: ${escapeHtml(vendor.gstin)}` : ""}${vendor.phone ? `<br>Phone: ${escapeHtml(vendor.phone)}` : ""}</div>
  <div class="box"><div class="cap">DELIVER TO</div>${escapeHtml(po.delivery_address || company.address || "")}</div>
  </div>
  <table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Taxable</th><th>GST</th><th>Tax</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="bottom"><div style="max-width:55%"><b>Notes / Terms</b><p>${escapeHtml(po.notes || "Please supply items as specified in this purchase order.")}</p></div>
  <div class="totals"><div><span>Subtotal</span><b>${money(totals.subtotal)}</b></div>${taxRows}
  <div class="grand"><b>Grand Total</b><b>${money(totals.grand)}</b></div></div></div>
  <div class="sign"><span>For ${escapeHtml(company.trade_name || company.legal_name || "Company")}<br><br>Authorized Signatory</span></div>
  <script>window.onload=()=>window.print()</script></body></html>`;

  const printWindow = window.open("", "_blank", "width=1100,height=800");
  if (!printWindow) throw new Error("Allow pop-ups for Trackerz to print or save the PO as PDF.");
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export default function OfficeManagement({
  supabase,
  companyId,
  section = "overview",
  setSection,
  permissions = {},
  isCompanyOwner = false,
}) {
  const [bills, setBills] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [payables, setPayables] = useState([]);
  const [payablePayments, setPayablePayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [profile, setProfile] = useState(profileBlank());

  const [month, setMonth] = useState(currentMonth());
  const [dashboardVendor, setDashboardVendor] = useState("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showInvoice, setShowInvoice] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showPayable, setShowPayable] = useState(false);
  const [showPayablePayment, setShowPayablePayment] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showVendor, setShowVendor] = useState(false);
  const [showPO, setShowPO] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const [invoice, setInvoice] = useState(invoiceBlank());
  const [receipt, setReceipt] = useState({ ...receiptBlank(), proofFile: null });
  const [payable, setPayable] = useState(payableBlank());
  const [payablePayment, setPayablePayment] = useState({ ...payablePaymentBlank(), proofFile: null });
  const [expense, setExpense] = useState(expenseBlank());
  const [vendor, setVendor] = useState(vendorBlank());
  const [po, setPO] = useState(poBlank());
  const [companyForm, setCompanyForm] = useState(profileBlank());
  const [receiptTarget, setReceiptTarget] = useState(null);
  const [payablePaymentTarget, setPayablePaymentTarget] = useState(null);
  const [editingVendor, setEditingVendor] = useState(null);
  const [editingPO, setEditingPO] = useState(null);
  const [search, setSearch] = useState("");

  const can = useCallback((permission) => {
    return isCompanyOwner || permissions?.["*"] === true || permissions?.[permission] === true;
  }, [isCompanyOwner, permissions]);

  const canView = (key) => can(`management.${key}.view`) || can(`management.${key}.create`);
  const canCreate = (key) => can(`management.${key}.create`) || isCompanyOwner || permissions?.["*"] === true;
  const canEdit = (key) => can(`management.${key}.edit`) || canCreate(key);
  const canDelete = (key) => can(`management.${key}.delete`) || canEdit(key);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      const requests = await Promise.all([
        supabase.from("factory_bills").select("*").eq("company_id", companyId).order("bill_date", { ascending: false }),
        supabase.from("factory_bill_payments").select("*").eq("company_id", companyId).order("payment_date", { ascending: false }),
        supabase.from("factory_payables").select("*").eq("company_id", companyId).order("bill_date", { ascending: false }),
        supabase.from("factory_payable_payments").select("*").eq("company_id", companyId).order("payment_date", { ascending: false }),
        supabase.from("factory_expenses").select("*").eq("company_id", companyId).order("expense_date", { ascending: false }),
        supabase.from("factory_vendors").select("*").eq("company_id", companyId).order("vendor_name"),
        supabase.from("purchase_orders").select("*, purchase_order_items(*)").eq("company_id", companyId).order("po_date", { ascending: false }),
        supabase.from("company_profiles").select("*").eq("company_id", companyId).maybeSingle(),
      ]);

      const labels = ["customer invoices", "customer receipts", "vendor payables", "vendor payments", "expenses", "vendors", "purchase orders", "company profile"];
      const criticalIndexes = [0, 1, 2, 3, 4];
      const criticalError = criticalIndexes.find((index) => requests[index].error);
      if (criticalError !== undefined) {
        throw new Error(`Unable to load ${labels[criticalError]}: ${requests[criticalError].error.message}`);
      }

      setBills(requests[0].data || []);
      setReceipts(requests[1].data || []);
      setPayables(requests[2].data || []);
      setPayablePayments(requests[3].data || []);
      setExpenses(requests[4].data || []);

      const optionalError = requests.slice(5).find((result) => result.error);
      if (optionalError) {
        setVendors([]);
        setPurchaseOrders([]);
        setError(`Accounting data loaded. Vendor / Purchase Order tables could not be read: ${optionalError.error.message}`);
      } else {
        setVendors(requests[5].data || []);
        setPurchaseOrders(requests[6].data || []);
        const savedProfile = requests[7].data || profileBlank();
        setProfile({ ...profileBlank(), ...savedProfile });
        setCompanyForm({ ...profileBlank(), ...savedProfile });
      }
    } catch (loadError) {
      console.error("Trackerz Management load error:", loadError);
      setError(loadError.message || "Unable to load Management data.");
    } finally {
      setLoading(false);
    }
  }, [supabase, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const receivedFor = useCallback((billId) =>
    receipts.filter((row) => String(row.bill_id) === String(billId))
      .reduce((sum, row) => sum + num(row.amount), 0), [receipts]);

  const invoiceTotal = (bill) =>
    num(bill.amount) + num(bill.gst_amount) - num(bill.tds_amount);

  const invoiceBalance = (bill) =>
    Math.max(0, invoiceTotal(bill) - receivedFor(bill.id));

  const paidForPayable = useCallback((payableId) =>
    payablePayments.filter((row) => String(row.payable_id) === String(payableId))
      .reduce((sum, row) => sum + num(row.amount), 0), [payablePayments]);

  const payableBalance = (row) =>
    Math.max(0, num(row.amount) - paidForPayable(row.id));

  const selectedMonthBills = bills.filter((row) => monthOf(row.bill_date) === month);
  const selectedMonthReceipts = receipts.filter((row) => monthOf(row.payment_date) === month);
  const selectedMonthPayables = payables.filter((row) => monthOf(row.bill_date) === month);
  const selectedMonthVendorPayments = payablePayments.filter((row) => monthOf(row.payment_date) === month);
  const selectedMonthExpenses = expenses.filter((row) => monthOf(row.expense_date) === month);
  const selectedMonthPOs = purchaseOrders.filter((row) => monthOf(row.po_date) === month);

  const dashboardMonths = useMemo(() => {
    const monthValues = new Set([currentMonth(), month]);
    [...bills, ...purchaseOrders].forEach((row) => {
      const value = monthOf(row.bill_date || row.po_date);
      if (value) monthValues.add(value);
    });
    return [...monthValues].sort((a, b) => b.localeCompare(a)).map((value) => {
      const [year, monthNumber] = value.split("-").map(Number);
      const label = new Date(year, monthNumber - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      return { value, label };
    });
  }, [bills, purchaseOrders, month]);

  const vendorMatches = (row, vendorId) => {
    if (vendorId === "all") return true;
    const selected = vendors.find((item) => String(item.id) === String(vendorId));
    return Boolean(selected) && String(row.vendor_id || "") === String(vendorId);
  };

  const totals = useMemo(() => {
    const receivableTotal = bills.reduce((sum, row) => sum + invoiceBalance(row), 0);
    const receivableOverdue = bills
      .filter((row) => row.due_date && row.due_date < today() && invoiceBalance(row) > 0)
      .reduce((sum, row) => sum + invoiceBalance(row), 0);
    const payableTotal = payables.reduce((sum, row) => sum + payableBalance(row), 0);
    const payableOverdue = payables
      .filter((row) => row.due_date && row.due_date < today() && payableBalance(row) > 0)
      .reduce((sum, row) => sum + payableBalance(row), 0);

    return {
      receivableTotal,
      receivableOverdue,
      payableTotal,
      payableOverdue,
      monthBilled: selectedMonthBills.reduce((sum, row) => sum + invoiceTotal(row), 0),
      monthReceived: selectedMonthReceipts.reduce((sum, row) => sum + num(row.amount), 0),
      monthPayables: selectedMonthPayables.reduce((sum, row) => sum + num(row.amount), 0),
      monthVendorPaid: selectedMonthVendorPayments.reduce((sum, row) => sum + num(row.amount), 0),
      monthExpenses: selectedMonthExpenses.reduce((sum, row) => sum + num(row.amount), 0),
      monthPOValue: selectedMonthPOs.reduce((sum, row) => sum + num(row.grand_total), 0),
    };
  }, [bills, receipts, payables, payablePayments, selectedMonthBills, selectedMonthReceipts, selectedMonthPayables, selectedMonthVendorPayments, selectedMonthExpenses, selectedMonthPOs]);

  const notify = (successMessage) => {
    setError("");
    setMessage(successMessage);
  };

  const runSave = async (callback, successMessage) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await callback();
      setMessage(successMessage);
      await load();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError.message || "Unable to save this record.");
    } finally {
      setSaving(false);
    }
  };

  const saveInvoice = async (event) => {
    event.preventDefault();
    await runSave(async () => {
      const payload = {
        company_id: companyId,
        bill_date: invoice.bill_date,
        due_date: invoice.due_date || null,
        reference: text(invoice.reference) || null,
        customer_name: text(invoice.customer_name) || null,
        work_description: text(invoice.work_description),
        board_count: 0,
        amount: num(invoice.amount),
        gst_amount: num(invoice.gst_amount),
        tds_amount: num(invoice.tds_amount),
        notes: text(invoice.notes) || null,
      };
      if (!payload.work_description || payload.amount <= 0) throw new Error("Enter customer / invoice description and a valid taxable amount.");
      const { error: insertError } = await supabase.from("factory_bills").insert(payload);
      if (insertError) throw insertError;
      setInvoice(invoiceBlank());
      setShowInvoice(false);
    }, "Customer invoice saved.");
  };

  const uploadPaymentProof = async (file, folder) => {
    if (!file) return null;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) throw new Error("Payment proof must be a JPG, PNG, WEBP or PDF file.");
    if (file.size > 10 * 1024 * 1024) throw new Error("Payment proof must be 10 MB or smaller.");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${companyId}/${folder}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("management-payment-proofs").upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (uploadError) throw new Error(`Payment saved proof upload failed: ${uploadError.message}`);
    return path;
  };

  const proofUrl = async (path) => {
    if (!path) return null;
    const { data, error: urlError } = await supabase.storage
      .from("management-payment-proofs")
      .createSignedUrl(path, 60 * 10);
    if (urlError) throw urlError;
    return data?.signedUrl || null;
  };

  const saveReceipt = async (event) => {
    event.preventDefault();
    await runSave(async () => {
      if (!receiptTarget?.id) throw new Error("Select an invoice first.");
      const remaining = invoiceBalance(receiptTarget);
      const amount = num(receipt.amount);
      if (amount <= 0) throw new Error("Enter a valid receipt amount.");
      if (amount > remaining + 0.005) throw new Error("Receipt cannot exceed the remaining invoice balance.");
      const proofPath = await uploadPaymentProof(receipt.proofFile, "customer-receipts");
      const payload = {
        company_id: companyId,
        bill_id: receiptTarget.id,
        payment_date: receipt.payment_date,
        amount,
        payment_mode: receipt.payment_mode || null,
        reference: text(receipt.reference) || null,
        notes: text(receipt.notes) || null,
        proof_path: proofPath,
        status: "closed",
        closed_at: new Date().toISOString(),
      };
      const { error: insertError } = await supabase.from("factory_bill_payments").insert(payload);
      if (insertError) throw insertError;
      setReceipt(receiptBlank());
      setReceiptTarget(null);
      setShowReceipt(false);
    }, "Customer receipt recorded.");
  };

  const savePayable = async (event) => {
    event.preventDefault();
    await runSave(async () => {
      const payload = {
        company_id: companyId,
        bill_date: payable.bill_date,
        due_date: payable.due_date || null,
        supplier_name: text(payable.supplier_name) || null,
        reference: text(payable.reference) || null,
        category: text(payable.category) || "Other",
        description: text(payable.description),
        amount: num(payable.amount),
        notes: text(payable.notes) || null,
      };
      if (!payload.description || payload.amount <= 0) throw new Error("Enter vendor bill description and a valid amount.");
      const { error: insertError } = await supabase.from("factory_payables").insert(payload);
      if (insertError) throw insertError;
      setPayable(payableBlank());
      setShowPayable(false);
    }, "Vendor payable saved.");
  };

  const savePayablePayment = async (event) => {
    event.preventDefault();
    await runSave(async () => {
      if (!payablePaymentTarget?.id) throw new Error("Select a vendor payable first.");
      const remaining = payableBalance(payablePaymentTarget);
      const amount = num(payablePayment.amount);
      if (amount <= 0) throw new Error("Enter a valid vendor payment amount.");
      if (amount > remaining + 0.005) throw new Error("Payment cannot exceed the remaining payable balance.");
      const proofPath = await uploadPaymentProof(payablePayment.proofFile, "vendor-payments");
      const payload = {
        company_id: companyId,
        payable_id: payablePaymentTarget.id,
        payment_date: payablePayment.payment_date,
        amount,
        payment_mode: payablePayment.payment_mode || null,
        reference: text(payablePayment.reference) || null,
        notes: text(payablePayment.notes) || null,
        proof_path: proofPath,
        status: "closed",
        closed_at: new Date().toISOString(),
      };
      const { error: insertError } = await supabase.from("factory_payable_payments").insert(payload);
      if (insertError) throw insertError;
      setPayablePayment(payablePaymentBlank());
      setPayablePaymentTarget(null);
      setShowPayablePayment(false);
    }, "Vendor payment recorded.");
  };

  const saveExpense = async (event) => {
    event.preventDefault();
    await runSave(async () => {
      const payload = {
        company_id: companyId,
        expense_date: expense.expense_date,
        category: text(expense.category) || "Other",
        description: text(expense.description) || null,
        amount: num(expense.amount),
        payment_mode: expense.payment_mode || null,
        reference: text(expense.reference) || null,
        notes: text(expense.notes) || null,
        vendor_name: text(expense.vendor_name) || null,
        expense_type: expense.expense_type || "General",
        gst_applicable: Boolean(expense.gst_applicable),
      };
      if (payload.amount <= 0) throw new Error("Enter a valid expense amount.");
      const { error: insertError } = await supabase.from("factory_expenses").insert(payload);
      if (insertError) throw insertError;
      setExpense(expenseBlank());
      setShowExpense(false);
    }, "Expense saved.");
  };

  const saveVendor = async (event) => {
    event.preventDefault();
    await runSave(async () => {
      const payload = {
        ...vendor,
        company_id: companyId,
        vendor_name: text(vendor.vendor_name),
        contact_person: text(vendor.contact_person) || null,
        email: text(vendor.email) || null,
        phone: text(vendor.phone) || null,
        gstin: text(vendor.gstin).toUpperCase() || null,
        billing_address: text(vendor.billing_address) || null,
        shipping_address: text(vendor.shipping_address) || null,
        state: text(vendor.state) || null,
        state_code: text(vendor.state_code) || null,
        payment_terms: text(vendor.payment_terms) || null,
        opening_balance: num(vendor.opening_balance),
      };
      if (!payload.vendor_name) throw new Error("Vendor name is required.");
      if (payload.gstin && !/^[0-9A-Z]{15}$/.test(payload.gstin)) throw new Error("GSTIN must contain 15 letters / numbers.");
      const query = editingVendor
        ? supabase.from("factory_vendors").update(payload).eq("id", editingVendor.id).eq("company_id", companyId)
        : supabase.from("factory_vendors").insert(payload);
      const { error: saveError } = await query;
      if (saveError) throw saveError;
      setVendor(vendorBlank());
      setEditingVendor(null);
      setShowVendor(false);
    }, "Vendor details saved.");
  };

  const deleteVendor = async (row) => {
    if (!window.confirm(`Delete vendor "${row.vendor_name}"? Vendors already used in Purchase Orders cannot be deleted.`)) return;
    await runSave(async () => {
      const { error: deleteError } = await supabase.from("factory_vendors").delete().eq("id", row.id).eq("company_id", companyId);
      if (deleteError) throw deleteError;
    }, "Vendor deleted.");
  };

  const calcItems = (items) => items.map((item) => {
    const taxable = num(item.quantity) * num(item.rate);
    const gst = taxable * num(item.gst_rate) / 100;
    return { ...item, taxable, gst, total: taxable + gst };
  });

  const poTotals = (items) => {
    const calculated = calcItems(items);
    const subtotal = calculated.reduce((sum, item) => sum + item.taxable, 0);
    const gst = calculated.reduce((sum, item) => sum + item.gst, 0);
    return { subtotal, gst, grand: subtotal + gst };
  };

  const selectedVendor = vendors.find((row) => String(row.id) === String(po.vendor_id));
  const companyStateCode = text(profile.state_code);
  const vendorStateCode = text(selectedVendor?.state_code);
  const derivedGstType = po.gst_type === "auto"
    ? (companyStateCode && vendorStateCode && companyStateCode !== vendorStateCode ? "igst" : "cgst_sgst")
    : po.gst_type;
  const currentPOTotals = poTotals(po.items);

  const changePOItem = (index, key, value) => {
    setPO((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  };

  const savePO = async (event) => {
    event.preventDefault();
    await runSave(async () => {
      if (!po.vendor_id) throw new Error("Select a vendor.");
      if (!po.items.length || po.items.some((item) => !text(item.description) || num(item.quantity) <= 0 || num(item.rate) < 0)) {
        throw new Error("Add at least one valid Purchase Order item.");
      }
      const totalsForPO = poTotals(po.items);
      const headerPayload = {
        company_id: companyId,
        vendor_id: po.vendor_id,
        po_date: po.po_date,
        reference: text(po.reference) || null,
        delivery_address: text(po.delivery_address) || null,
        place_of_supply: text(po.place_of_supply) || null,
        notes: text(po.notes) || null,
        status: po.status,
        gst_type: derivedGstType,
        subtotal: Number(totalsForPO.subtotal.toFixed(2)),
        tax_total: Number(totalsForPO.gst.toFixed(2)),
        grand_total: Number(totalsForPO.grand.toFixed(2)),
      };

      const { data: poRow, error: poError } = await supabase
        .from("purchase_orders")
        .insert(headerPayload)
        .select("*")
        .single();
      if (poError) throw poError;

      const itemRows = calcItems(po.items).map((item, index) => ({
        purchase_order_id: poRow.id,
        description: text(item.description),
        hsn_sac: text(item.hsn_sac) || null,
        quantity: num(item.quantity),
        unit: text(item.unit) || "Nos",
        rate: num(item.rate),
        gst_rate: num(item.gst_rate),
        taxable_amount: Number(item.taxable.toFixed(2)),
        gst_amount: Number(item.gst.toFixed(2)),
        total_amount: Number(item.total.toFixed(2)),
        sort_order: index + 1,
      }));

      const { error: itemsError } = await supabase.from("purchase_order_items").insert(itemRows);
      if (itemsError) {
        await supabase.from("purchase_orders").delete().eq("id", poRow.id).eq("company_id", companyId);
        throw new Error(`Purchase Order header saved but items failed. The incomplete order was rolled back where permitted: ${itemsError.message}`);
      }

      setPO(poBlank());
      setShowPO(false);
      setEditingPO(null);
    }, "Purchase Order created.");
  };

  const updatePOStatus = async (row, status) => {
    await runSave(async () => {
      const { error: updateError } = await supabase.from("purchase_orders")
        .update({ status }).eq("id", row.id).eq("company_id", companyId);
      if (updateError) throw updateError;
    }, `Purchase Order marked ${status.toLowerCase()}.`);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    await runSave(async () => {
      const payload = {
        company_id: companyId,
        legal_name: text(companyForm.legal_name) || null,
        trade_name: text(companyForm.trade_name) || null,
        gstin: text(companyForm.gstin).toUpperCase() || null,
        address: text(companyForm.address) || null,
        state: text(companyForm.state) || null,
        state_code: text(companyForm.state_code) || null,
        phone: text(companyForm.phone) || null,
        email: text(companyForm.email) || null,
      };
      if (payload.gstin && !/^[0-9A-Z]{15}$/.test(payload.gstin)) throw new Error("Company GSTIN must contain 15 letters / numbers.");
      const { error: upsertError } = await supabase.from("company_profiles").upsert(payload, { onConflict: "company_id" });
      if (upsertError) throw upsertError;
      setShowProfile(false);
    }, "Company profile saved.");
  };

  const printPO = (row) => {
    try {
      const vendorRow = vendors.find((item) => String(item.id) === String(row.vendor_id));
      if (!vendorRow) throw new Error("The vendor record for this Purchase Order could not be found.");
      const items = (row.purchase_order_items || []).map((item) => ({
        description: item.description,
        hsn_sac: item.hsn_sac,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        gst_rate: item.gst_rate,
        taxable: item.taxable_amount,
        gst: item.gst_amount,
        total: item.total_amount,
      }));
      const poTaxMode = row.gst_type === "igst" ? "igst" : "cgst_sgst";
      printPurchaseOrder(profile, vendorRow, row, items, {
        subtotal: row.subtotal,
        gst: row.tax_total,
        grand: row.grand_total,
      }, poTaxMode);
    } catch (printError) {
      setError(printError.message);
    }
  };

  const downloadMonthlyReport = () => {
    const invoiceRows = selectedMonthBills.map((row) => ({
      Type: "Customer Invoice",
      Date: row.bill_date,
      DueDate: row.due_date || "",
      Customer: row.customer_name || "",
      Reference: row.reference || "",
      Description: row.work_description,
      Total: invoiceTotal(row),
      Received: receivedFor(row.id),
      Balance: invoiceBalance(row),
    }));

    const receiptRows = selectedMonthReceipts.map((row) => ({
      Date: row.payment_date,
      InvoiceId: row.bill_id,
      Amount: num(row.amount),
      Mode: row.payment_mode || "",
      Reference: row.reference || "",
    }));

    const payableRows = selectedMonthPayables.map((row) => ({
      Date: row.bill_date,
      DueDate: row.due_date || "",
      Supplier: row.supplier_name || "",
      Reference: row.reference || "",
      Category: row.category,
      Description: row.description,
      Amount: num(row.amount),
      Paid: paidForPayable(row.id),
      Balance: payableBalance(row),
    }));

    const vendorPaymentRows = selectedMonthVendorPayments.map((row) => ({
      Date: row.payment_date,
      PayableId: row.payable_id,
      Amount: num(row.amount),
      Mode: row.payment_mode || "",
      Reference: row.reference || "",
    }));

    const expenseRows = selectedMonthExpenses.map((row) => ({
      Date: row.expense_date,
      Category: row.category,
      Description: row.description || "",
      Vendor: row.vendor_name || "",
      Amount: num(row.amount),
      Mode: row.payment_mode || "",
      Reference: row.reference || "",
    }));

    const poRows = selectedMonthPOs.map((row) => ({
      PODate: row.po_date,
      PONumber: row.po_number,
      Vendor: vendors.find((vendorRow) => String(vendorRow.id) === String(row.vendor_id))?.vendor_name || "",
      Status: row.status,
      Subtotal: num(row.subtotal),
      GST: num(row.tax_total),
      Total: num(row.grand_total),
    }));

    const workbook = XLSX.utils.book_new();
    const addSheet = (name, rows) => {
      const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No records for selected month" }]);
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };
    addSheet("Invoices", invoiceRows);
    addSheet("Receipts", receiptRows);
    addSheet("Vendor Payables", payableRows);
    addSheet("Vendor Payments", vendorPaymentRows);
    addSheet("Expenses", expenseRows);
    addSheet("Purchase Orders", poRows);
    XLSX.writeFile(workbook, `Trackerz_Management_${month}.xlsx`);
  };

  const table = (headings, rows, emptyText, minWidth = 720) => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth, borderCollapse: "collapse" }}>
        <thead><tr>{headings.map((heading) => <th key={heading} style={styles.th}>{heading}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows : (
            <tr><td colSpan={headings.length} style={{ ...styles.td, textAlign: "center", padding: 28, color: "#8792a2" }}>{emptyText}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const header = (title, subtitle, actions = null) => (
    <section style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#2563eb", fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 7 }}>TRACKERZ / MANAGEMENT</div>
          <h2 style={styles.title}>{title}</h2>
          <p style={styles.muted}>{subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {actions}
          <button type="button" style={styles.secondary} onClick={load} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
        </div>
      </div>
    </section>
  );

  const notice = (
    <>
      {error && <div role="alert" style={{ ...styles.card, color: "#a52b25", borderColor: "#fecaca", background: "#fffafa" }}>{error}</div>}
      {message && <div role="status" style={{ ...styles.card, color: "#166534", borderColor: "#bbf7d0", background: "#f7fff9" }}>{message}</div>}
    </>
  );

  const invoiceForm = showInvoice && (
    <section style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Create customer invoice</h3>
      <form onSubmit={saveInvoice} style={styles.grid}>
        <Field label="Invoice date" type="date" value={invoice.bill_date} onChange={(value) => setInvoice({ ...invoice, bill_date: value })} required />
        <Field label="Due date" type="date" value={invoice.due_date} onChange={(value) => setInvoice({ ...invoice, due_date: value })} />
        <Field label="Customer name" value={invoice.customer_name} onChange={(value) => setInvoice({ ...invoice, customer_name: value })} />
        <Field label="Invoice number / reference" value={invoice.reference} onChange={(value) => setInvoice({ ...invoice, reference: value })} />
        <Field label="Invoice description" value={invoice.work_description} onChange={(value) => setInvoice({ ...invoice, work_description: value })} required />
        <Field label="Taxable amount (₹)" type="number" min="0.01" step="0.01" value={invoice.amount} onChange={(value) => setInvoice({ ...invoice, amount: value })} required />
        <Field label="GST amount (₹)" type="number" min="0" step="0.01" value={invoice.gst_amount} onChange={(value) => setInvoice({ ...invoice, gst_amount: value })} />
        <Field label="TDS amount (₹)" type="number" min="0" step="0.01" value={invoice.tds_amount} onChange={(value) => setInvoice({ ...invoice, tds_amount: value })} />
        <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Notes<textarea style={styles.input} rows={2} value={invoice.notes} onChange={(event) => setInvoice({ ...invoice, notes: event.target.value })} /></label>
        <div><button style={styles.primary} disabled={saving}>Save invoice</button> <button type="button" style={styles.secondary} onClick={() => setShowInvoice(false)}>Cancel</button></div>
      </form>
    </section>
  );

  const receiptForm = showReceipt && receiptTarget && (
    <section style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Record customer receipt</h3>
      <p style={styles.muted}>{receiptTarget.customer_name || receiptTarget.work_description} · Remaining {money(invoiceBalance(receiptTarget))}</p>
      <form onSubmit={saveReceipt} style={{ ...styles.grid, marginTop: 12 }}>
        <Field label="Payment date" type="date" value={receipt.payment_date} onChange={(value) => setReceipt({ ...receipt, payment_date: value })} />
        <Field label="Amount (₹)" type="number" min="0.01" step="0.01" value={receipt.amount} onChange={(value) => setReceipt({ ...receipt, amount: value })} required />
        <Select label="Payment mode" value={receipt.payment_mode} onChange={(value) => setReceipt({ ...receipt, payment_mode: value })} options={["Bank Transfer", "UPI", "Cash", "Cheque", "Other"]} />
        <Field label="Reference" value={receipt.reference} onChange={(value) => setReceipt({ ...receipt, reference: value })} />
        <label style={styles.label}>Payment proof (image / PDF, max 10 MB)<input style={styles.input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setReceipt({ ...receipt, proofFile: event.target.files?.[0] || null })} /></label>
        <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Notes<textarea style={styles.input} rows={2} value={receipt.notes} onChange={(event) => setReceipt({ ...receipt, notes: event.target.value })} /></label>
        <div><button style={styles.primary} disabled={saving}>Save receipt</button> <button type="button" style={styles.secondary} onClick={() => { setShowReceipt(false); setReceiptTarget(null); }}>Cancel</button></div>
      </form>
    </section>
  );

  const payableForm = showPayable && (
    <section style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Add vendor payable</h3>
      <form onSubmit={savePayable} style={styles.grid}>
        <Field label="Bill date" type="date" value={payable.bill_date} onChange={(value) => setPayable({ ...payable, bill_date: value })} />
        <Field label="Due date" type="date" value={payable.due_date} onChange={(value) => setPayable({ ...payable, due_date: value })} />
        <Field label="Supplier / vendor name" value={payable.supplier_name} onChange={(value) => setPayable({ ...payable, supplier_name: value })} />
        <Field label="Supplier bill reference" value={payable.reference} onChange={(value) => setPayable({ ...payable, reference: value })} />
        <Select label="Category" value={payable.category} onChange={(value) => setPayable({ ...payable, category: value })} options={["Materials", "Hardware", "Boards / Plywood", "Transport", "Labour", "Services", "Rent", "Other"]} />
        <Field label="Bill amount (₹)" type="number" min="0.01" step="0.01" value={payable.amount} onChange={(value) => setPayable({ ...payable, amount: value })} required />
        <Field label="Description" value={payable.description} onChange={(value) => setPayable({ ...payable, description: value })} required />
        <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Notes<textarea style={styles.input} rows={2} value={payable.notes} onChange={(event) => setPayable({ ...payable, notes: event.target.value })} /></label>
        <div><button style={styles.primary} disabled={saving}>Save payable</button> <button type="button" style={styles.secondary} onClick={() => setShowPayable(false)}>Cancel</button></div>
      </form>
    </section>
  );

  const payablePaymentForm = showPayablePayment && payablePaymentTarget && (
    <section style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Record vendor payment</h3>
      <p style={styles.muted}>{payablePaymentTarget.supplier_name || payablePaymentTarget.description} · Remaining {money(payableBalance(payablePaymentTarget))}</p>
      <form onSubmit={savePayablePayment} style={{ ...styles.grid, marginTop: 12 }}>
        <Field label="Payment date" type="date" value={payablePayment.payment_date} onChange={(value) => setPayablePayment({ ...payablePayment, payment_date: value })} />
        <Field label="Amount (₹)" type="number" min="0.01" step="0.01" value={payablePayment.amount} onChange={(value) => setPayablePayment({ ...payablePayment, amount: value })} required />
        <Select label="Payment mode" value={payablePayment.payment_mode} onChange={(value) => setPayablePayment({ ...payablePayment, payment_mode: value })} options={["Bank Transfer", "UPI", "Cash", "Cheque", "Other"]} />
        <Field label="Reference" value={payablePayment.reference} onChange={(value) => setPayablePayment({ ...payablePayment, reference: value })} />
        <label style={styles.label}>Payment proof (image / PDF, max 10 MB)<input style={styles.input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setPayablePayment({ ...payablePayment, proofFile: event.target.files?.[0] || null })} /></label>
        <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Notes<textarea style={styles.input} rows={2} value={payablePayment.notes} onChange={(event) => setPayablePayment({ ...payablePayment, notes: event.target.value })} /></label>
        <div><button style={styles.primary} disabled={saving}>Save vendor payment</button> <button type="button" style={styles.secondary} onClick={() => { setShowPayablePayment(false); setPayablePaymentTarget(null); }}>Cancel</button></div>
      </form>
    </section>
  );

  const expenseForm = showExpense && (
    <section style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Add business expense</h3>
      <form onSubmit={saveExpense} style={styles.grid}>
        <Field label="Expense date" type="date" value={expense.expense_date} onChange={(value) => setExpense({ ...expense, expense_date: value })} />
        <Select label="Category" value={expense.category} onChange={(value) => setExpense({ ...expense, category: value })} options={["Office", "Rent", "Salary", "Utilities", "Travel", "Bank charges", "Professional fees", "Transport", "Materials", "Other"]} />
        <Field label="Description" value={expense.description} onChange={(value) => setExpense({ ...expense, description: value })} />
        <Field label="Amount (₹)" type="number" min="0.01" step="0.01" value={expense.amount} onChange={(value) => setExpense({ ...expense, amount: value })} required />
        <Select label="Payment mode" value={expense.payment_mode} onChange={(value) => setExpense({ ...expense, payment_mode: value })} options={["Bank Transfer", "UPI", "Cash", "Cheque", "Other"]} />
        <Field label="Vendor name (optional)" value={expense.vendor_name} onChange={(value) => setExpense({ ...expense, vendor_name: value })} />
        <Field label="Reference" value={expense.reference} onChange={(value) => setExpense({ ...expense, reference: value })} />
        <Select label="Expense type" value={expense.expense_type} onChange={(value) => setExpense({ ...expense, expense_type: value })} options={["General", "Recurring", "One-time"]} />
        <label style={{ ...styles.label, flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={expense.gst_applicable} onChange={(event) => setExpense({ ...expense, gst_applicable: event.target.checked })} /> GST applicable</label>
        <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Notes<textarea style={styles.input} rows={2} value={expense.notes} onChange={(event) => setExpense({ ...expense, notes: event.target.value })} /></label>
        <div><button style={styles.primary} disabled={saving}>Save expense</button> <button type="button" style={styles.secondary} onClick={() => setShowExpense(false)}>Cancel</button></div>
      </form>
    </section>
  );

  const vendorForm = showVendor && (
    <section style={styles.card}>
      <h3 style={{ marginTop: 0 }}>{editingVendor ? "Edit vendor" : "Register vendor"}</h3>
      <form onSubmit={saveVendor} style={styles.grid}>
        <Field label="Vendor / registered company name" value={vendor.vendor_name} onChange={(value) => setVendor({ ...vendor, vendor_name: value })} required />
        <Field label="Contact person" value={vendor.contact_person} onChange={(value) => setVendor({ ...vendor, contact_person: value })} />
        <Field label="GSTIN" value={vendor.gstin} onChange={(value) => setVendor({ ...vendor, gstin: value.toUpperCase() })} />
        <Field label="Phone" value={vendor.phone} onChange={(value) => setVendor({ ...vendor, phone: value })} />
        <Field label="Email" type="email" value={vendor.email} onChange={(value) => setVendor({ ...vendor, email: value })} />
        <Field label="State" value={vendor.state} onChange={(value) => setVendor({ ...vendor, state: value })} />
        <Field label="State code" value={vendor.state_code} onChange={(value) => setVendor({ ...vendor, state_code: value })} />
        <Field label="Payment terms" value={vendor.payment_terms} onChange={(value) => setVendor({ ...vendor, payment_terms: value })} />
        <Field label="Opening balance (₹)" type="number" step="0.01" value={vendor.opening_balance} onChange={(value) => setVendor({ ...vendor, opening_balance: value })} />
        <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Billing address<textarea style={styles.input} rows={2} value={vendor.billing_address} onChange={(event) => setVendor({ ...vendor, billing_address: event.target.value })} /></label>
        <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Shipping address<textarea style={styles.input} rows={2} value={vendor.shipping_address} onChange={(event) => setVendor({ ...vendor, shipping_address: event.target.value })} /></label>
        <label style={{ ...styles.label, flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={vendor.is_active} onChange={(event) => setVendor({ ...vendor, is_active: event.target.checked })} /> Active vendor</label>
        <div><button style={styles.primary} disabled={saving}>Save vendor</button> <button type="button" style={styles.secondary} onClick={() => { setShowVendor(false); setEditingVendor(null); }}>Cancel</button></div>
      </form>
    </section>
  );

  const profileForm = showProfile && (
    <section style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Company details for Purchase Orders</h3>
      <form onSubmit={saveProfile} style={styles.grid}>
        <Field label="Registered legal name" value={companyForm.legal_name} onChange={(value) => setCompanyForm({ ...companyForm, legal_name: value })} />
        <Field label="Trade name" value={companyForm.trade_name} onChange={(value) => setCompanyForm({ ...companyForm, trade_name: value })} />
        <Field label="GSTIN" value={companyForm.gstin} onChange={(value) => setCompanyForm({ ...companyForm, gstin: value.toUpperCase() })} />
        <Field label="Phone" value={companyForm.phone} onChange={(value) => setCompanyForm({ ...companyForm, phone: value })} />
        <Field label="Email" type="email" value={companyForm.email} onChange={(value) => setCompanyForm({ ...companyForm, email: value })} />
        <Field label="State" value={companyForm.state} onChange={(value) => setCompanyForm({ ...companyForm, state: value })} />
        <Field label="State code" value={companyForm.state_code} onChange={(value) => setCompanyForm({ ...companyForm, state_code: value })} />
        <label style={{ ...styles.label, gridColumn: "1 / -1" }}>Registered address<textarea style={styles.input} rows={2} value={companyForm.address} onChange={(event) => setCompanyForm({ ...companyForm, address: event.target.value })} /></label>
        <div><button style={styles.primary} disabled={saving}>Save company profile</button> <button type="button" style={styles.secondary} onClick={() => setShowProfile(false)}>Cancel</button></div>
      </form>
    </section>
  );

  const purchaseOrderForm = showPO && (
    <section style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div><h3 style={{ margin: 0 }}>Create Purchase Order</h3><p style={styles.muted}>PO number is assigned automatically by the database.</p></div>
        <button type="button" style={styles.secondary} onClick={() => setShowPO(false)}>Close</button>
      </div>
      <form onSubmit={savePO} style={{ display: "flex", flexDirection: "column", gap: 15, marginTop: 15 }}>
        <div style={styles.grid}>
          <Select label="Vendor" value={po.vendor_id} onChange={(value) => setPO({ ...po, vendor_id: value })} options={[{ value: "", label: "Select vendor" }, ...vendors.filter((row) => row.is_active !== false).map((row) => ({ value: row.id, label: row.vendor_name }))]} />
          <Field label="PO date" type="date" value={po.po_date} onChange={(value) => setPO({ ...po, po_date: value })} />
          <Field label="Reference (project / quotation)" value={po.reference} onChange={(value) => setPO({ ...po, reference: value })} />
          <Field label="Place of supply" value={po.place_of_supply} onChange={(value) => setPO({ ...po, place_of_supply: value })} />
          <Select label="GST treatment" value={po.gst_type} onChange={(value) => setPO({ ...po, gst_type: value })} options={[{ value: "auto", label: "Auto based on state codes" }, { value: "cgst_sgst", label: "CGST + SGST" }, { value: "igst", label: "IGST" }]} />
        </div>
        {selectedVendor && (
          <div style={{ ...styles.card, background: "#f8fafc" }}>
            <b>Selected vendor details (auto-filled)</b>
            <div style={{ ...styles.grid, marginTop: 10 }}>
              <div><small>GSTIN</small><div>{selectedVendor.gstin || "—"}</div></div>
              <div><small>Contact</small><div>{selectedVendor.contact_person || "—"}</div></div>
              <div><small>Phone</small><div>{selectedVendor.phone || "—"}</div></div>
              <div><small>Email</small><div>{selectedVendor.email || "—"}</div></div>
              <div><small>Payment terms</small><div>{selectedVendor.payment_terms || "—"}</div></div>
              <div><small>State</small><div>{selectedVendor.state || "—"}</div></div>
              <div style={{ gridColumn: "1 / -1" }}><small>Billing address</small><div>{selectedVendor.billing_address || "—"}</div></div>
            </div>
          </div>
        )}
        <label style={styles.label}>Delivery address<textarea style={styles.input} rows={2} value={po.delivery_address || selectedVendor?.shipping_address || ""} onChange={(event) => setPO({ ...po, delivery_address: event.target.value })} /></label>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <b>Items and GST</b>
            <button type="button" style={styles.secondary} onClick={() => setPO({ ...po, items: [...po.items, itemBlank()] })}>＋ Add item</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 950, borderCollapse: "collapse" }}>
              <thead><tr>{["Description", "HSN/SAC", "Qty", "Unit", "Rate (₹)", "GST %", "Taxable", "GST", "Total", ""].map((label) => <th key={label} style={styles.th}>{label}</th>)}</tr></thead>
              <tbody>
                {po.items.map((item, index) => {
                  const calc = calcItems([item])[0];
                  return (
                    <tr key={index}>
                      <td style={styles.td}><input required style={{ ...styles.input, minWidth: 145 }} value={item.description} onChange={(event) => changePOItem(index, "description", event.target.value)} /></td>
                      <td style={styles.td}><input style={{ ...styles.input, width: 85 }} value={item.hsn_sac} onChange={(event) => changePOItem(index, "hsn_sac", event.target.value)} /></td>
                      <td style={styles.td}><input required type="number" min="0.001" step="0.001" style={{ ...styles.input, width: 75 }} value={item.quantity} onChange={(event) => changePOItem(index, "quantity", event.target.value)} /></td>
                      <td style={styles.td}><input style={{ ...styles.input, width: 65 }} value={item.unit} onChange={(event) => changePOItem(index, "unit", event.target.value)} /></td>
                      <td style={styles.td}><input required type="number" min="0" step="0.01" style={{ ...styles.input, width: 90 }} value={item.rate} onChange={(event) => changePOItem(index, "rate", event.target.value)} /></td>
                      <td style={styles.td}><select style={{ ...styles.input, width: 75 }} value={item.gst_rate} onChange={(event) => changePOItem(index, "gst_rate", event.target.value)}>{["0", "5", "12", "18", "28"].map((rate) => <option key={rate} value={rate}>{rate}</option>)}</select></td>
                      <td style={styles.td}>{money(calc.taxable)}</td>
                      <td style={styles.td}>{money(calc.gst)}</td>
                      <td style={styles.td}><b>{money(calc.total)}</b></td>
                      <td style={styles.td}><button type="button" style={styles.danger} disabled={po.items.length === 1} onClick={() => setPO({ ...po, items: po.items.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <label style={styles.label}>Notes / terms<textarea style={styles.input} rows={2} value={po.notes} onChange={(event) => setPO({ ...po, notes: event.target.value })} /></label>
        <div style={{ marginLeft: "auto", width: "min(100%,330px)", background: "#f8fafc", padding: 14, borderRadius: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 5 }}>Subtotal <b>{money(currentPOTotals.subtotal)}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 5 }}>{derivedGstType === "igst" ? "IGST" : "CGST + SGST"} <b>{money(currentPOTotals.gst)}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #dbe2ea", paddingTop: 10, fontSize: 16 }}>Grand total <b>{money(currentPOTotals.grand)}</b></div>
        </div>
        <div><button style={styles.primary} disabled={saving}>{saving ? "Saving…" : "Create Purchase Order"}</button> <button type="button" style={styles.secondary} onClick={() => setShowPO(false)}>Cancel</button></div>
      </form>
    </section>
  );

  const invoiceRows = bills.filter((row) => {
    const q = text(search).toLowerCase();
    return !q || [row.customer_name, row.reference, row.work_description].some((value) => String(value || "").toLowerCase().includes(q));
  }).map((row) => {
    const balance = invoiceBalance(row);
    const paid = receivedFor(row.id);
    return (
      <tr key={row.id}>
        <td style={styles.td}><b>{row.invoice_number || row.reference || "—"}</b><div style={styles.muted}>{row.customer_name || row.work_description}</div></td>
        <td style={styles.td}>{dateLabel(row.bill_date)}<div style={styles.muted}>Due: {dateLabel(row.due_date)}</div></td>
        <td style={styles.td}>{money(invoiceTotal(row))}</td>
        <td style={styles.td}>{money(paid)}</td>
        <td style={styles.td}><b>{money(balance)}</b></td>
        <td style={styles.td}><StatusPill tone={balance <= 0 ? "green" : row.due_date && row.due_date < today() ? "red" : "amber"}>{balance <= 0 ? "Paid" : row.due_date && row.due_date < today() ? "Overdue" : "Due"}</StatusPill></td>
        <td style={styles.td}>{balance > 0 && canCreate("payments") && <button style={styles.secondary} onClick={() => { setReceiptTarget(row); setReceipt(receiptBlank()); setShowReceipt(true); }}>Record receipt</button>}</td>
      </tr>
    );
  });

  const payableRows = payables.filter((row) => {
    const q = text(search).toLowerCase();
    return !q || [row.supplier_name, row.reference, row.description, row.category].some((value) => String(value || "").toLowerCase().includes(q));
  }).map((row) => {
    const paid = paidForPayable(row.id);
    const balance = payableBalance(row);
    return (
      <tr key={row.id}>
        <td style={styles.td}><b>{row.supplier_name || "Supplier"}</b><div style={styles.muted}>{row.reference || row.description}</div></td>
        <td style={styles.td}>{dateLabel(row.bill_date)}<div style={styles.muted}>Due: {dateLabel(row.due_date)}</div></td>
        <td style={styles.td}>{row.category}</td>
        <td style={styles.td}>{money(row.amount)}</td>
        <td style={styles.td}>{money(paid)}</td>
        <td style={styles.td}><b>{money(balance)}</b></td>
        <td style={styles.td}><StatusPill tone={balance <= 0 ? "green" : row.due_date && row.due_date < today() ? "red" : "amber"}>{balance <= 0 ? "Paid" : row.due_date && row.due_date < today() ? "Overdue" : "Due"}</StatusPill></td>
        <td style={styles.td}>{balance > 0 && canCreate("payments") && <button style={styles.secondary} onClick={() => { setPayablePaymentTarget(row); setPayablePayment(payablePaymentBlank()); setShowPayablePayment(true); }}>Record payment</button>}</td>
      </tr>
    );
  });

  const vendorRows = vendors.filter((row) => {
    const q = text(search).toLowerCase();
    return !q || [row.vendor_name, row.contact_person, row.gstin, row.phone, row.email].some((value) => String(value || "").toLowerCase().includes(q));
  }).map((row) => (
    <tr key={row.id}>
      <td style={styles.td}><b>{row.vendor_name}</b><div style={styles.muted}>{row.contact_person || "—"}</div></td>
      <td style={styles.td}>{row.gstin || "—"}</td>
      <td style={styles.td}>{row.phone || "—"}</td>
      <td style={styles.td}>{row.email || "—"}</td>
      <td style={styles.td}>{row.state || "—"}</td>
      <td style={styles.td}><StatusPill tone={row.is_active === false ? "red" : "green"}>{row.is_active === false ? "Inactive" : "Active"}</StatusPill></td>
      <td style={styles.td}>
        {canEdit("vendors") && <button style={styles.secondary} onClick={() => { setEditingVendor(row); setVendor({ ...vendorBlank(), ...row }); setShowVendor(true); }}>Edit</button>}
        {canDelete("vendors") && <button style={{ ...styles.danger, marginLeft: 5 }} onClick={() => deleteVendor(row)}>Delete</button>}
      </td>
    </tr>
  ));

  const poRows = purchaseOrders.filter((row) => {
    const vendorName = vendors.find((vendorRow) => String(vendorRow.id) === String(row.vendor_id))?.vendor_name || "";
    const q = text(search).toLowerCase();
    return !q || [row.po_number, row.reference, vendorName].some((value) => String(value || "").toLowerCase().includes(q));
  }).map((row) => {
    const vendorName = vendors.find((vendorRow) => String(vendorRow.id) === String(row.vendor_id))?.vendor_name || "Vendor";
    return (
      <tr key={row.id}>
        <td style={styles.td}><b>{row.po_number || "PO"}</b><div style={styles.muted}>{row.reference || "—"}</div></td>
        <td style={styles.td}>{dateLabel(row.po_date)}</td>
        <td style={styles.td}>{vendorName}</td>
        <td style={styles.td}>{money(row.grand_total)}</td>
        <td style={styles.td}><StatusPill tone={row.status === "Issued" ? "green" : row.status === "Cancelled" ? "red" : "amber"}>{row.status}</StatusPill></td>
        <td style={styles.td}>
          <button style={styles.secondary} onClick={() => printPO(row)}>Print / PDF</button>
          {row.status === "Draft" && canEdit("payables") && <button style={{ ...styles.secondary, marginLeft: 5 }} onClick={() => updatePOStatus(row, "Issued")}>Issue</button>}
          {row.status === "Issued" && canEdit("payables") && <button style={{ ...styles.secondary, marginLeft: 5 }} onClick={() => updatePOStatus(row, "Closed")}>Close</button>}
        </td>
      </tr>
    );
  });

  const expenseRows = selectedMonthExpenses.map((row) => (
    <tr key={row.id}>
      <td style={styles.td}>{dateLabel(row.expense_date)}</td>
      <td style={styles.td}>{row.category}</td>
      <td style={styles.td}>{row.description || "—"}</td>
      <td style={styles.td}>{row.vendor_name || "—"}</td>
      <td style={styles.td}>{row.payment_mode || "—"}</td>
      <td style={styles.td}>{money(row.amount)}</td>
    </tr>
  ));

  const openProof = async (path) => {
    try {
      const url = await proofUrl(path);
      if (!url) throw new Error("No payment proof is attached.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (proofError) {
      setError(proofError.message || "Unable to open payment proof.");
    }
  };

  const paymentRows = (rows, relatedField) => rows.map((row) => (
    <tr key={row.id}>
      <td style={styles.td}>{dateLabel(row.payment_date)}</td>
      <td style={styles.td}>{row[relatedField] || "—"}</td>
      <td style={styles.td}>{row.payment_mode || "—"}</td>
      <td style={styles.td}>{row.reference || "—"}</td>
      <td style={styles.td}>{money(row.amount)}</td>
      <td style={styles.td}><StatusPill tone="green">{row.status || "Closed"}</StatusPill></td>
      <td style={styles.td}>{row.proof_path ? <button style={styles.secondary} onClick={() => openProof(row.proof_path)}>View proof</button> : "—"}</td>
    </tr>
  ));

  const activeSection = section === "receivables" ? "invoices" : section === "vendor-payments" ? "vendor-payments" : section === "payments-received" ? "receipts" : section;
  const actions = {
    overview: null,
    invoices: canCreate("bills") ? <button key="invoice" style={styles.primary} onClick={() => { setInvoice(invoiceBlank()); setShowInvoice(true); }}>＋ Create invoice</button> : null,
    receipts: null,
    "vendor-payments": null,
    payables: canCreate("payables") ? <button key="payable" style={styles.primary} onClick={() => { setPayable(payableBlank()); setShowPayable(true); }}>＋ Add vendor bill</button> : null,
    vendors: canCreate("vendors") ? <button key="vendor" style={styles.primary} onClick={() => { setEditingVendor(null); setVendor(vendorBlank()); setShowVendor(true); }}>＋ Add vendor</button> : null,
    "purchase-orders": canCreate("payables") ? <button key="po" style={styles.primary} onClick={() => { setPO(poBlank()); setShowPO(true); }}>＋ Create Purchase Order</button> : null,
    expenses: canCreate("expenses") ? <button key="expense" style={styles.primary} onClick={() => { setExpense(expenseBlank()); setShowExpense(true); }}>＋ Add expense</button> : null,
    reports: <button key="export" style={styles.primary} onClick={downloadMonthlyReport}>↓ Download Excel</button>,
  };

  if (!companyId) {
    return <div style={styles.card}>Management cannot load because this login has no company account linked.</div>;
  }

  if (!["overview", "reports", "receipts", "vendor-payments", "employees", "settings"].includes(activeSection) && !canView(
    activeSection === "invoices" ? "bills" :
      activeSection === "payables" || activeSection === "purchase-orders" ? "payables" :
        activeSection === "vendors" ? "vendors" : activeSection
  )) {
    return <div style={styles.card}>You do not have permission to view this Management section. Contact your company owner.</div>;
  }

  return (
    <main style={{ ...styles.page, minWidth: 0, width: "100%" }}>
      {header(
        activeSection === "overview" ? "Management Dashboard" :
          activeSection === "invoices" ? "Customer Invoices & Receipts" :
            activeSection === "payables" ? "Vendor Payables" :
              activeSection === "vendors" ? "Vendor Master" :
                activeSection === "purchase-orders" ? "Purchase Orders" :
                  activeSection === "expenses" ? "Expenses" : "Monthly Reports",
        activeSection === "overview"
          ? "Monthly business overview of billing, collections, vendor payments and expenses."
          : "Manage your company's financial records. This workspace is independent of Production sites and panels.",
        actions[activeSection]
      )}
      {notice}

      {activeSection === "overview" && (
        <>
          <section style={{ ...styles.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <b>Financial Dashboard</b>
              <p style={styles.muted}>Select a month and vendor to review receivables and purchase commitments.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <select
                aria-label="Dashboard month"
                style={{ ...styles.input, width: 170 }}
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              >
                {dashboardMonths.map((monthOption) => (
                  <option key={monthOption.value} value={monthOption.value}>{monthOption.label}</option>
                ))}
              </select>
              <select
                aria-label="Vendor filter"
                style={{ ...styles.input, width: 190 }}
                value={dashboardVendor}
                onChange={(event) => setDashboardVendor(event.target.value)}
              >
                <option value="all">All vendors</option>
                {vendors.map((item) => <option key={item.id} value={item.id}>{item.vendor_name}</option>)}
              </select>
            </div>
          </section>

          <section style={styles.metrics}>
            <Metric
              label="Total Receivable"
              value={money(bills.filter((row) => monthOf(row.bill_date) === month).reduce((sum, row) => sum + invoiceTotal(row), 0))}
              note="Total customer invoices created in selected month"
            />
            <Metric
              label="Total Payable"
              value={money(purchaseOrders.filter((row) => monthOf(row.po_date) === month && vendorMatches(row, dashboardVendor)).reduce((sum, row) => sum + num(row.grand_total), 0))}
              note="Total purchase orders created in selected month"
            />
            <Metric
              label="Outstanding Receivables"
              value={money(bills.filter((row) => monthOf(row.bill_date) === month).reduce((sum, row) => sum + invoiceBalance(row), 0))}
              note="Unpaid balances on invoices created in selected month"
            />
            <Metric
              label="Outstanding Payable"
              value={money(purchaseOrders.filter((row) => monthOf(row.po_date) === month && vendorMatches(row, dashboardVendor) && !["Closed", "Cancelled"].includes(row.status)).reduce((sum, row) => sum + num(row.grand_total), 0))}
              note="Open purchase orders created in selected month"
            />
          </section>
        </>
      )}

      {activeSection === "invoices" && (
        <>
          <input style={{ ...styles.input, maxWidth: 320 }} placeholder="Search customer, invoice or description..." value={search} onChange={(event) => setSearch(event.target.value)} />
          {invoiceForm}{receiptForm}
          <section style={styles.card}>
            {table(["Invoice / customer", "Dates", "Invoice total", "Received", "Balance", "Status", "Action"], invoiceRows, "No customer invoices have been entered.", 1000)}
          </section>
        </>
      )}

      {activeSection === "receipts" && (
        <section style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Payments Received</h3>
          {table(["Payment date", "Invoice ID", "Mode", "Reference", "Amount", "Status", "Proof"], paymentRows(receipts, "bill_id"), "No customer receipts recorded.", 950)}
        </section>
      )}

      {activeSection === "payables" && (
        <>
          <section style={styles.metrics}>
            <Metric label="Total Vendor Bills" value={money(payables.reduce((sum, row) => sum + num(row.amount), 0))} />
            <Metric label="Total Paid" value={money(payablePayments.reduce((sum, row) => sum + num(row.amount), 0))} />
            <Metric label="Outstanding" value={money(totals.payableTotal)} />
            <Metric label="Overdue" value={money(totals.payableOverdue)} />
          </section>
          <input style={{ ...styles.input, maxWidth: 320 }} placeholder="Search supplier, bill or category..." value={search} onChange={(event) => setSearch(event.target.value)} />
          {payableForm}{payablePaymentForm}
          <section style={styles.card}>
            {table(["Supplier / reference", "Bill / due date", "Category", "Bill amount", "Paid", "Balance", "Status", "Action"], payableRows, "No vendor payables have been entered.", 1100)}
          </section>
          <section style={styles.card}>
            <h3 style={{ marginTop: 0 }}>Recent vendor payment history</h3>
            {table(["Payment date", "Payable ID", "Payment mode", "Reference", "Amount", "Status", "Proof"], payablePayments.slice(0, 30).map((row) => (
              <tr key={row.id}>
                <td style={styles.td}>{dateLabel(row.payment_date)}</td>
                <td style={styles.td}>{row.payable_id}</td>
                <td style={styles.td}>{row.payment_mode || "—"}</td>
                <td style={styles.td}>{row.reference || "—"}</td>
                <td style={styles.td}>{money(row.amount)}</td>
                <td style={styles.td}><StatusPill tone="green">{row.status || "Closed"}</StatusPill></td>
                <td style={styles.td}>{row.proof_path ? <button style={styles.secondary} onClick={() => openProof(row.proof_path)}>View proof</button> : "—"}</td>
              </tr>
            )), "No vendor payments recorded.")}
          </section>
        </>
      )}

      {activeSection === "vendor-payments" && (
        <section style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Payments to Vendors</h3>
          {table(["Payment date", "Payable ID", "Mode", "Reference", "Amount", "Status", "Proof"], paymentRows(payablePayments, "payable_id"), "No vendor payments recorded.", 950)}
        </section>
      )}

      {activeSection === "vendors" && (
        <>
          <input style={{ ...styles.input, maxWidth: 320 }} placeholder="Search vendor name, GSTIN or phone..." value={search} onChange={(event) => setSearch(event.target.value)} />
          {vendorForm}
          <section style={styles.card}>
            {table(["Vendor / contact", "GSTIN", "Phone", "Email", "State", "Status", "Actions"], vendorRows, "No vendors registered. Add a vendor before creating Purchase Orders.", 1100)}
          </section>
        </>
      )}

      {activeSection === "purchase-orders" && (
        <>
          <section style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div><b>Purchase Order Register</b><p style={styles.muted}>{purchaseOrders.length} orders · Total value {money(purchaseOrders.reduce((sum, row) => sum + num(row.grand_total), 0))}</p></div>
              <button style={styles.secondary} onClick={() => { setCompanyForm({ ...profileBlank(), ...profile }); setShowProfile(true); }}>Company GST / Profile</button>
            </div>
          </section>
          <input style={{ ...styles.input, maxWidth: 320 }} placeholder="Search PO number or vendor..." value={search} onChange={(event) => setSearch(event.target.value)} />
          {purchaseOrderForm}{profileForm}
          <section style={styles.card}>
            {table(["PO number / reference", "Date", "Vendor", "Subtotal", "GST", "Grand total", "Status", "Actions"], poRows, "No Purchase Orders yet. Add a vendor and create your first PO.", 1150)}
          </section>
        </>
      )}

      {activeSection === "expenses" && (
        <>
          <section style={{ ...styles.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div><b>Expense Register</b><p style={styles.muted}>Expenses shown for the selected month.</p></div>
            <input type="month" style={{ ...styles.input, maxWidth: 190 }} value={month} onChange={(event) => setMonth(event.target.value)} />
          </section>
          {expenseForm}
          <section style={styles.card}>
            {table(["Date", "Category", "Description", "Vendor", "Payment mode", "Amount"], expenseRows, "No expenses recorded for this month.", 950)}
          </section>
        </>
      )}

      {activeSection === "employees" && (
        <section style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Employees & Access</h3>
          <p style={styles.muted}>Employee invitations, module access and detailed permissions are managed by the Trackerz Employee Access workspace. Use the existing Employee Access page in the application to invite users and set Management permissions.</p>
          <button style={styles.primary} onClick={() => setSection?.("employee-access")}>Open Employee Access</button>
        </section>
      )}

      {activeSection === "settings" && (
        <section style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Management Settings</h3>
          <p style={styles.muted}>Maintain the legal name, GSTIN, address and contact details printed on Purchase Orders.</p>
          <button style={styles.primary} onClick={() => { setCompanyForm({ ...profileBlank(), ...profile }); setShowProfile(true); }}>Company / GST Profile</button>
          {profileForm}
          <div style={{ marginTop: 18 }}>
            <b>Payment proof storage</b>
            <p style={styles.muted}>Payment attachments use the private Supabase Storage bucket named management-payment-proofs. Access is through time-limited signed links.</p>
          </div>
        </section>
      )}

      {activeSection === "reports" && (
        <>
          <section style={{ ...styles.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div><b>Monthly Management Report</b><p style={styles.muted}>Export invoices, receipts, vendor bills, vendor payments, expenses and purchase orders into one Excel workbook.</p></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input type="month" style={{ ...styles.input, maxWidth: 180 }} value={month} onChange={(event) => setMonth(event.target.value)} />
              <button style={styles.primary} onClick={downloadMonthlyReport}>↓ Download Excel</button>
            </div>
          </section>
          <section style={styles.metrics}>
            <Metric label="Invoices Raised" value={money(totals.monthBilled)} />
            <Metric label="Customer Receipts" value={money(totals.monthReceived)} />
            <Metric label="Vendor Bills" value={money(totals.monthPayables)} />
            <Metric label="Vendor Payments" value={money(totals.monthVendorPaid)} />
            <Metric label="Purchase Orders" value={money(totals.monthPOValue)} />
            <Metric label="Expenses" value={money(totals.monthExpenses)} />
          </section>
        </>
      )}

      {loading && <div style={styles.muted}>Loading / refreshing Management records…</div>}
    </main>
  );
}
