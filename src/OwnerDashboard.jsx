import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const number = (value) =>
  Number(value || 0).toLocaleString("en-IN");

const currency = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

const dateText = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("en-IN");
};

const normalized = (value) => String(value || "").trim().toLowerCase();

const isPaid = (payment) =>
  ["paid", "completed", "success"].includes(normalized(payment.status));

const isOverdue = (payment) =>
  !isPaid(payment) &&
  Boolean(payment.due_date) &&
  new Date(payment.due_date) < new Date();

const TABS = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "companies", label: "Companies", icon: "▤" },
  { id: "subscriptions", label: "Subscriptions", icon: "▣" },
  { id: "payments", label: "Payments", icon: "₹" },
  { id: "users", label: "User Access", icon: "♙" },
  { id: "checkpoint", label: "System Checkpoint", icon: "◉" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export default function OwnerDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [companies, setCompanies] = useState([]);
  const [modules, setModules] = useState([]);
  const [payments, setPayments] = useState([]);
  const [userAccess, setUserAccess] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showAddCompany, setShowAddCompany] = useState(false);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [companySearch, setCompanySearch] = useState("");

  const [companyForm, setCompanyForm] = useState({
    companyName: "",
    factoryName: "",
    email: "",
    password: "",
    contact: "",
    plan: "Monthly",
    paymentAmount: "",
    paymentDueDate: "",
    status: "Active",
  });

  async function loadDashboardData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const [companiesResult, modulesResult, paymentsResult, accessResult] =
        await Promise.all([
          supabase.from("companies").select("*").order("id"),
          supabase.from("company_modules").select("*"),
          supabase
            .from("company_payments")
            .select("*")
            .order("payment_date", { ascending: false }),
          supabase.from("company_user_access").select("*"),
        ]);

      if (companiesResult.error) throw companiesResult.error;
      setCompanies(companiesResult.data || []);

      // These tables may not be installed in every Trackerz environment yet.
      if (modulesResult.error) {
        console.warn("Subscription module data is unavailable:", modulesResult.error.message);
        setModules([]);
      } else {
        setModules(modulesResult.data || []);
      }

      if (paymentsResult.error) {
        console.warn("Company payment data is unavailable:", paymentsResult.error.message);
        setPayments([]);
      } else {
        setPayments(paymentsResult.data || []);
      }

      if (accessResult.error) {
        console.warn("Company user access data is unavailable:", accessResult.error.message);
        setUserAccess([]);
      } else {
        setUserAccess(accessResult.data || []);
      }
    } catch (err) {
      console.error("Owner Dashboard load error:", err);
      setError(
        err?.message ||
          "Unable to load dashboard data. Check your Supabase permissions and database connection."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  const moduleByCompany = useMemo(() => {
    const map = new Map();
    modules.forEach((item) => map.set(String(item.company_id), item));
    return map;
  }, [modules]);

  const companyById = useMemo(() => {
    const map = new Map();
    companies.forEach((item) => map.set(String(item.id), item));
    return map;
  }, [companies]);

  const paymentSummary = useMemo(() => {
    let paid = 0;
    let due = 0;
    let overdue = 0;

    payments.forEach((payment) => {
      const amount = Number(payment.amount || 0);
      if (isPaid(payment)) paid += amount;
      else if (isOverdue(payment)) overdue += amount;
      else due += amount;
    });

    return { paid, due, overdue, total: paid + due + overdue };
  }, [payments]);

  const activeSubscriptions = useMemo(
    () =>
      companies.filter((company) => {
        const module = moduleByCompany.get(String(company.id));
        return (
          module?.production_enabled === true ||
          module?.management_enabled === true
        );
      }).length,
    [companies, moduleByCompany]
  );

  const filteredPayments = useMemo(() => {
    if (paymentFilter === "all") return payments;
    if (paymentFilter === "paid") return payments.filter(isPaid);
    if (paymentFilter === "overdue") return payments.filter(isOverdue);
    return payments.filter((payment) => !isPaid(payment) && !isOverdue(payment));
  }, [payments, paymentFilter]);

  const filteredCompanies = useMemo(() => {
    const query = normalized(companySearch);
    if (!query) return companies;
    return companies.filter((company) =>
      [
        company.company_name,
        company.factory_name,
        company.factoryName,
        company.email,
        company.login_email,
      ]
        .map(normalized)
        .some((value) => value.includes(query))
    );
  }, [companies, companySearch]);

  const overview = {
    totalCompanies: companies.length,
    activeSubscriptions,
    monthlyRevenue: paymentSummary.paid,
    pendingPayments: paymentSummary.due + paymentSummary.overdue,
  };

  function updateCompanyForm(event) {
    const { name, value } = event.target;
    setCompanyForm((current) => ({ ...current, [name]: value }));
  }

  function resetCompanyForm() {
    setCompanyForm({
      companyName: "",
      factoryName: "",
      email: "",
      password: "",
      contact: "",
      plan: "Monthly",
      paymentAmount: "",
      paymentDueDate: "",
      status: "Active",
    });
  }

  async function handleCreateCompany(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const companyName = companyForm.companyName.trim();
    const factoryName = companyForm.factoryName.trim();
    const email = companyForm.email.trim().toLowerCase();
    const password = companyForm.password;

    if (!companyName || !factoryName || !email || !password) {
      setError("Please complete all required company and login fields.");
      return;
    }

    if (password.length < 6) {
      setError("The temporary password must contain at least 6 characters.");
      return;
    }

    setCreatingCompany(true);
    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        "create-company",
        {
          body: {
            company_name: companyName,
            factory_name: factoryName,
            email,
            password,
            contact: companyForm.contact.trim(),
            status: companyForm.status,
            plan: companyForm.plan,
            payment_amount: companyForm.paymentAmount
              ? Number(companyForm.paymentAmount)
              : 0,
            payment_due_date: companyForm.paymentDueDate || null,
          },
        }
      );

      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);

      setMessage(`${companyName} was created successfully.`);
      setShowAddCompany(false);
      resetCompanyForm();
      await loadDashboardData(true);
    } catch (err) {
      console.error("Create company error:", err);
      setError(
        err?.message ||
          "Company creation failed. Confirm that the create-company Edge Function is deployed and authorizes the owner."
      );
    } finally {
      setCreatingCompany(false);
    }
  }

  async function handleLogout() {
    setError("");
    const { error: logoutError } = await supabase.auth.signOut();
    if (logoutError) setError(logoutError.message || "Unable to sign out.");
  }

  const companyNameForPayment = (payment) =>
    companyById.get(String(payment.company_id))?.company_name ||
    `Company #${payment.company_id || "-"}`;

  return (
    <main className="owner-page">
      <style>{`
        .owner-page{min-height:100vh;background:#f4f6f9;color:#172033;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .owner-layout{display:grid;grid-template-columns:245px minmax(0,1fr);min-height:100vh}
        .owner-sidebar{background:#172033;color:#fff;padding:24px 15px;display:flex;flex-direction:column;gap:24px}
        .owner-brand{display:flex;align-items:center;gap:11px;padding:0 8px}
        .owner-logo{width:42px;height:42px;border-radius:10px;background:#fff;color:#172033;display:grid;place-items:center;font-weight:900;font-size:20px}
        .owner-brand strong{font-size:18px;letter-spacing:2px}.owner-brand small{display:block;color:#aab5c7;font-size:11px;margin-top:3px}
        .owner-nav-label{font-size:10px;color:#8995a9;font-weight:800;letter-spacing:1px;padding:0 10px;margin-bottom:8px}
        .owner-nav{display:grid;gap:5px}
        .owner-nav button{width:100%;border:0;background:transparent;color:#c7cfdb;padding:11px 12px;border-radius:8px;text-align:left;display:flex;align-items:center;gap:11px;font-size:13px;font-weight:600;cursor:pointer}
        .owner-nav button:hover{background:#25334b;color:#fff}.owner-nav button.active{background:#2c4262;color:#fff}
        .owner-nav-icon{width:19px;text-align:center;font-size:16px}
        .owner-sidebar-bottom{margin-top:auto;border-top:1px solid #344056;padding:16px 8px 0;color:#aab5c7;font-size:11px;line-height:1.6}
        .owner-main{min-width:0;padding:26px 30px}
        .owner-topbar{display:flex;justify-content:space-between;align-items:center;gap:14px;padding-bottom:20px;border-bottom:1px solid #e2e7ee;flex-wrap:wrap}
        .owner-topbar h1{font-size:21px;margin:0}.owner-topbar p{margin:5px 0 0;color:#8791a1;font-size:12px}
        .owner-actions{display:flex;gap:8px;align-items:center}
        .owner-button,.owner-select,.owner-search{border:1px solid #d8dfe8;border-radius:8px;background:#fff;color:#344054;padding:9px 12px;font-size:12px;font-weight:650}
        .owner-button{cursor:pointer}.owner-button.primary{background:#172033;color:#fff;border-color:#172033}
        .owner-button:disabled{opacity:.55;cursor:not-allowed}
        .owner-content{max-width:1500px;margin:0 auto}
        .owner-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:25px 0 17px}
        .owner-heading h2{margin:0;font-size:22px}.owner-heading p{margin:5px 0 0;color:#8791a1;font-size:12px}
        .owner-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
        .owner-card,.owner-panel{background:#fff;border:1px solid #e2e7ee;border-radius:11px}
        .owner-card{padding:19px;min-height:125px}.owner-card-label{font-size:10px;color:#7d8797;font-weight:800;letter-spacing:.6px;text-transform:uppercase}
        .owner-card-value{font-size:28px;font-weight:800;margin-top:14px}.owner-card-note{font-size:11px;color:#929baa;margin-top:5px}
        .owner-panel{margin-top:17px;overflow:hidden}.owner-panel-head{padding:16px 18px;border-bottom:1px solid #edf0f4;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .owner-panel-head h3{margin:0;font-size:14px}.owner-table-wrap{overflow-x:auto}
        .owner-table{width:100%;border-collapse:collapse;min-width:680px}
        .owner-table th{background:#fafbfd;color:#778194;font-size:10px;text-transform:uppercase;letter-spacing:.5px;text-align:left;padding:12px;white-space:nowrap}
        .owner-table td{padding:13px 12px;border-top:1px solid #f0f2f5;font-size:12px;vertical-align:middle}
        .owner-table td strong{color:#172033}.owner-muted{color:#8791a1;font-size:11px}
        .owner-pill{display:inline-flex;padding:4px 8px;border-radius:20px;background:#eef2f7;color:#526071;font-size:10px;font-weight:750;white-space:nowrap}
        .owner-pill.success{background:#eaf7ee;color:#267344}.owner-pill.warning{background:#fff4df;color:#966516}.owner-pill.danger{background:#fff0ee;color:#a53c32}
        .owner-empty,.owner-loading{padding:28px;text-align:center;color:#8993a3;font-size:12px}
        .owner-alert{padding:12px 14px;border-radius:8px;font-size:12px;margin:15px 0;line-height:1.5}
        .owner-alert.success{background:#f0faf3;color:#23613a;border:1px solid #cfe7d5}.owner-alert.error{background:#fff5f4;color:#9f2d25;border:1px solid #f0c9c4}
        .owner-alert.info{background:#f2f6fc;color:#415a7c;border:1px solid #d8e3f2}
        .owner-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:17px}
        .owner-kpi{background:#fff;border:1px solid #e2e7ee;border-radius:10px;padding:15px}.owner-kpi span{display:block;color:#7d8797;font-size:10px;font-weight:800;text-transform:uppercase}.owner-kpi strong{display:block;font-size:20px;margin-top:9px}
        .owner-two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}
        .owner-detail-list{padding:5px 18px 14px}.owner-detail-row{display:flex;justify-content:space-between;gap:15px;padding:11px 0;border-bottom:1px solid #f0f2f5;font-size:12px}.owner-detail-row:last-child{border-bottom:0}
        .owner-check-list{display:grid;gap:10px;padding:16px 18px}.owner-check-row{display:flex;align-items:flex-start;gap:10px;font-size:12px;line-height:1.5}.owner-check-dot{width:8px;height:8px;border-radius:50%;background:#d99b32;margin-top:4px;flex:none}
        .owner-modal-backdrop{position:fixed;inset:0;z-index:1000;padding:20px;display:grid;place-items:center;background:#0f172a70}
        .owner-modal{width:min(650px,100%);max-height:calc(100vh - 40px);overflow-y:auto;background:#fff;border-radius:12px;box-shadow:0 25px 70px #0f172a33}
        .owner-modal-header{padding:20px;border-bottom:1px solid #edf0f4}.owner-modal-header h3{margin:0}.owner-form{padding:20px}
        .owner-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.owner-field label{display:block;margin-bottom:6px;font-size:11px;font-weight:800}
        .owner-field input,.owner-field select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d5dce5;border-radius:8px;font-size:12px}
        .owner-form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
        .owner-footer{margin-top:30px;padding:16px 0;border-top:1px solid #e2e7ee;text-align:center;color:#98a1af;font-size:10px}
        @media(max-width:1000px){.owner-layout{grid-template-columns:205px minmax(0,1fr)}.owner-main{padding:22px 18px}.owner-metrics,.owner-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:700px){.owner-layout{grid-template-columns:1fr}.owner-sidebar{padding:13px;gap:13px}.owner-sidebar-bottom{display:none}.owner-nav{display:flex;overflow-x:auto}.owner-nav-label{display:none}.owner-nav button{width:auto;white-space:nowrap;padding:9px 11px}.owner-main{padding:17px 13px}.owner-two-col{grid-template-columns:1fr}}
        @media(max-width:480px){.owner-metrics,.owner-kpi-grid,.owner-form-grid{grid-template-columns:1fr}.owner-card{min-height:100px}.owner-card-value{font-size:25px}}
      `}</style>

      <div className="owner-layout">
        <aside className="owner-sidebar">
          <div className="owner-brand">
            <div className="owner-logo">T</div>
            <div><strong>TRACKERZ</strong><small>Owner Console</small></div>
          </div>

          <div>
            <div className="owner-nav-label">WORKSPACE</div>
            <nav className="owner-nav">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={activeTab === tab.id ? "active" : ""}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="owner-nav-icon">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="owner-sidebar-bottom">
            <strong>Trackerz Platform</strong><br />
            Platform administration and account oversight.
          </div>
        </aside>

        <section className="owner-main">
          <header className="owner-topbar">
            <div>
              <h1>{TABS.find((tab) => tab.id === activeTab)?.label || "Overview"}</h1>
              <p>Trackerz platform administration</p>
            </div>
            <div className="owner-actions">
              <span className="owner-pill">Platform Owner</span>
              <button className="owner-button" onClick={() => loadDashboardData(true)} disabled={refreshing}>
                {refreshing ? "Refreshing..." : "↻ Refresh"}
              </button>
              <button className="owner-button" onClick={handleLogout}>Logout</button>
            </div>
          </header>

          <div className="owner-content">
            {message && <div className="owner-alert success">{message}</div>}
            {error && <div className="owner-alert error">{error}</div>}

            {loading ? (
              <div className="owner-loading">Loading live Trackerz data...</div>
            ) : (
              <>
                {activeTab === "overview" && (
                  <>
                    <div className="owner-heading">
                      <div><h2>Platform Overview</h2><p>High-level summary of Trackerz accounts and collections.</p></div>
                    </div>
                    <section className="owner-metrics">
                      <Metric label="Total Companies" value={number(overview.totalCompanies)} note="Registered company accounts" />
                      <Metric label="Active Subscriptions" value={number(overview.activeSubscriptions)} note="At least one module enabled" />
                      <Metric label="Recorded Collections" value={currency(overview.monthlyRevenue)} note="Paid records available in payment history" />
                      <Metric label="Pending Payments" value={currency(overview.pendingPayments)} note="Due and overdue recorded amounts" />
                    </section>
                    <section className="owner-panel">
                      <div className="owner-panel-head"><h3>Recently Registered Companies</h3><button className="owner-button" onClick={() => setActiveTab("companies")}>View Companies</button></div>
                      <div className="owner-table-wrap">
                        <table className="owner-table">
                          <thead><tr><th>Company</th><th>Company ID</th><th>Created Date</th><th>Subscription</th></tr></thead>
                          <tbody>
                            {[...companies].slice(-5).reverse().map((company) => {
                              const module = moduleByCompany.get(String(company.id));
                              return <tr key={company.id}>
                                <td><strong>{company.company_name || `Company ${company.id}`}</strong></td>
                                <td>{company.id}</td><td>{dateText(company.created_at)}</td>
                                <td><Pill success={module?.production_enabled || module?.management_enabled}>{module?.production_enabled || module?.management_enabled ? "Enabled" : "Not enabled"}</Pill></td>
                              </tr>;
                            })}
                            {companies.length === 0 && <EmptyRow columns={4} text="No companies found." />}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}

                {activeTab === "companies" && (
                  <>
                    <div className="owner-heading">
                      <div><h2>Companies</h2><p>Create and review Trackerz company accounts.</p></div>
                      <button className="owner-button primary" onClick={() => { setError(""); setMessage(""); resetCompanyForm(); setShowAddCompany(true); }}>+ Add Company</button>
                    </div>
                    <section className="owner-panel">
                      <div className="owner-panel-head">
                        <h3>Company Directory ({companies.length})</h3>
                        <input className="owner-search" placeholder="Search companies..." value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} />
                      </div>
                      <div className="owner-table-wrap">
                        <table className="owner-table">
                          <thead><tr><th>Company</th><th>Factory / Business</th><th>Login Email</th><th>Created</th><th>Status</th></tr></thead>
                          <tbody>
                            {filteredCompanies.map((company) => (
                              <tr key={company.id}>
                                <td><strong>{company.company_name || `Company ${company.id}`}</strong><div className="owner-muted">ID: {company.id}</div></td>
                                <td>{company.factory_name || company.factoryName || "-"}</td>
                                <td>{company.login_email || company.email || "-"}</td>
                                <td>{dateText(company.created_at)}</td>
                                <td><Pill success={normalized(company.status || "active") === "active"}>{company.status || "Registered"}</Pill></td>
                              </tr>
                            ))}
                            {filteredCompanies.length === 0 && <EmptyRow columns={5} text="No matching companies found." />}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}

                {activeTab === "subscriptions" && (
                  <>
                    <div className="owner-heading"><div><h2>Subscriptions</h2><p>Review Production and Management module activation by company.</p></div></div>
                    <div className="owner-alert info">This view reads module activation from <strong>company_modules</strong>. Commercial plan names, fees, start dates and expiry dates are not assumed unless those fields are stored in your database.</div>
                    <section className="owner-panel">
                      <div className="owner-table-wrap">
                        <table className="owner-table">
                          <thead><tr><th>Company</th><th>Company ID</th><th>Production</th><th>Management</th><th>Last Updated</th></tr></thead>
                          <tbody>
                            {companies.map((company) => {
                              const module = moduleByCompany.get(String(company.id));
                              return <tr key={company.id}>
                                <td><strong>{company.company_name || `Company ${company.id}`}</strong></td><td>{company.id}</td>
                                <td><Pill success={module?.production_enabled === true}>{module?.production_enabled === true ? "Enabled" : "Disabled / Unknown"}</Pill></td>
                                <td><Pill success={module?.management_enabled === true}>{module?.management_enabled === true ? "Enabled" : "Disabled / Unknown"}</Pill></td>
                                <td>{dateText(module?.updated_at)}</td>
                              </tr>;
                            })}
                            {companies.length === 0 && <EmptyRow columns={5} text="No companies found." />}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}

                {activeTab === "payments" && (
                  <>
                    <div className="owner-heading">
                      <div><h2>Payments</h2><p>Company-wise payment records and outstanding amounts.</p></div>
                      <select className="owner-select" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
                        <option value="all">All Payments</option><option value="paid">Paid</option><option value="due">Due</option><option value="overdue">Overdue</option>
                      </select>
                    </div>
                    <section className="owner-kpi-grid">
                      <Kpi label="Total Recorded" value={currency(paymentSummary.total)} />
                      <Kpi label="Paid" value={currency(paymentSummary.paid)} />
                      <Kpi label="Due" value={currency(paymentSummary.due)} />
                      <Kpi label="Overdue" value={currency(paymentSummary.overdue)} />
                    </section>
                    <section className="owner-panel">
                      <div className="owner-panel-head"><h3>Payment History</h3><span className="owner-muted">{payments.length} records</span></div>
                      {payments.length === 0 ? (
                        <div className="owner-empty">No payment records found. This tab currently reads from the <strong>company_payments</strong> table.</div>
                      ) : (
                        <div className="owner-table-wrap">
                          <table className="owner-table">
                            <thead><tr><th>Company</th><th>Plan</th><th>Amount</th><th>Payment Date</th><th>Due Date</th><th>Status</th><th>Method</th></tr></thead>
                            <tbody>
                              {filteredPayments.map((payment) => (
                                <tr key={payment.id}>
                                  <td><strong>{companyNameForPayment(payment)}</strong></td>
                                  <td>{payment.plan || "-"}</td><td>{currency(payment.amount)}</td>
                                  <td>{dateText(payment.payment_date)}</td><td>{dateText(payment.due_date)}</td>
                                  <td><Pill success={isPaid(payment)} warning={isOverdue(payment)}>{payment.status || (isOverdue(payment) ? "Overdue" : "Due")}</Pill></td>
                                  <td>{payment.payment_method || "-"}</td>
                                </tr>
                              ))}
                              {filteredPayments.length === 0 && <EmptyRow columns={7} text="No payments match this filter." />}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </>
                )}

                {activeTab === "users" && (
                  <>
                    <div className="owner-heading"><div><h2>User Access</h2><p>Company login accounts, employee roles and module permissions.</p></div></div>
                    <section className="owner-panel">
                      <div className="owner-panel-head"><h3>Company User Access</h3><span className="owner-muted">{userAccess.length} records</span></div>
                      {userAccess.length === 0 ? <div className="owner-empty">No user access records are available. Check that <strong>company_user_access</strong> exists and the platform owner has permission to read it.</div> :
                        <div className="owner-table-wrap"><table className="owner-table">
                          <thead><tr><th>Company</th><th>User</th><th>Email</th><th>Role</th><th>Production</th><th>Management</th><th>Status</th></tr></thead>
                          <tbody>{userAccess.map((user) => (
                            <tr key={user.id || `${user.company_id}-${user.user_id}`}>
                              <td><strong>{companyById.get(String(user.company_id))?.company_name || `Company #${user.company_id}`}</strong></td>
                              <td>{user.display_name || "-"}</td><td>{user.email || "-"}</td><td>{user.role || "-"}</td>
                              <td><Pill success={user.production_access === true}>{user.production_access ? "Yes" : "No"}</Pill></td>
                              <td><Pill success={user.management_access === true}>{user.management_access ? "Yes" : "No"}</Pill></td>
                              <td><Pill success={normalized(user.status) === "active"}>{user.status || "-"}</Pill></td>
                            </tr>
                          ))}</tbody>
                        </table></div>}
                    </section>
                  </>
                )}

                {activeTab === "checkpoint" && (
                  <>
                    <div className="owner-heading"><div><h2>System Checkpoint</h2><p>Central place to inspect Trackerz database and application configuration.</p></div><span className="owner-pill warning">Diagnostics not connected</span></div>
                    <div className="owner-alert info">The checkpoint interface is prepared, but a secure server-side diagnostic function has not yet been connected. No database health result is being claimed here. The browser must not receive a Supabase service-role key or be allowed to execute arbitrary SQL.</div>
                    <div className="owner-two-col">
                      <section className="owner-panel">
                        <div className="owner-panel-head"><h3>Diagnostic Sections</h3></div>
                        <div className="owner-check-list">
                          {["Database connection and project details","Tables, columns and foreign-key relationships","Row Level Security status and policies","SQL functions and database triggers","Production / Management module configuration","Employee roles and permission mappings","Migration version and execution history"].map((item) => <div className="owner-check-row" key={item}><span className="owner-check-dot" /><span>{item}<div className="owner-muted">Awaiting secure diagnostic integration</div></span></div>)}
                        </div>
                      </section>
                      <section className="owner-panel">
                        <div className="owner-panel-head"><h3>Checkpoint Run</h3></div>
                        <div className="owner-detail-list">
                          <div className="owner-detail-row"><span>Diagnostic endpoint</span><Pill warning>Not configured</Pill></div>
                          <div className="owner-detail-row"><span>Last successful check</span><strong>-</strong></div>
                          <div className="owner-detail-row"><span>Saved check history</span><strong>Not configured</strong></div>
                          <div className="owner-detail-row"><span>Execution mode</span><strong>Read-only (planned)</strong></div>
                        </div>
                        <div style={{ padding: "0 18px 18px" }} className="owner-muted">Next development step: deploy a restricted Edge Function that verifies the authenticated platform owner and returns safe metadata only. Migration execution will remain a separate reviewed process.</div>
                      </section>
                    </div>
                  </>
                )}

                {activeTab === "settings" && (
                  <>
                    <div className="owner-heading"><div><h2>Platform Settings</h2><p>Administrative information for the Trackerz platform.</p></div></div>
                    <section className="owner-panel">
                      <div className="owner-panel-head"><h3>Platform Configuration</h3></div>
                      <div className="owner-detail-list">
                        <div className="owner-detail-row"><span>Application</span><strong>Trackerz</strong></div>
                        <div className="owner-detail-row"><span>Administrative access</span><strong>Platform Owner</strong></div>
                        <div className="owner-detail-row"><span>Company records source</span><strong>Supabase · companies</strong></div>
                        <div className="owner-detail-row"><span>Subscription modules source</span><strong>Supabase · company_modules</strong></div>
                        <div className="owner-detail-row"><span>Payment records source</span><strong>Supabase · company_payments</strong></div>
                        <div className="owner-detail-row"><span>User access source</span><strong>Supabase · company_user_access</strong></div>
                      </div>
                    </section>
                  </>
                )}
              </>
            )}

            <footer className="owner-footer">Trackerz Owner Management Console</footer>
          </div>
        </section>
      </div>

      {showAddCompany && (
        <div className="owner-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !creatingCompany) setShowAddCompany(false);
        }}>
          <section className="owner-modal" role="dialog" aria-modal="true" aria-labelledby="add-company-title">
            <div className="owner-modal-header">
              <h3 id="add-company-title">Add Company</h3>
              <p className="owner-muted">Create one company, one factory / business and one login.</p>
            </div>
            <form className="owner-form" onSubmit={handleCreateCompany}>
              <div className="owner-form-grid">
                <Field label="Company Name *"><input name="companyName" value={companyForm.companyName} onChange={updateCompanyForm} required /></Field>
                <Field label="Factory / Business Name *"><input name="factoryName" value={companyForm.factoryName} onChange={updateCompanyForm} required /></Field>
                <Field label="Login Email *"><input type="email" name="email" value={companyForm.email} onChange={updateCompanyForm} required /></Field>
                <Field label="Temporary Password *"><input type="password" name="password" value={companyForm.password} onChange={updateCompanyForm} minLength={6} required /></Field>
                <Field label="Contact Number"><input name="contact" value={companyForm.contact} onChange={updateCompanyForm} /></Field>
                <Field label="Account Status"><select name="status" value={companyForm.status} onChange={updateCompanyForm}><option value="Active">Active</option><option value="Suspended">Suspended</option></select></Field>
                <Field label="Subscription Plan"><select name="plan" value={companyForm.plan} onChange={updateCompanyForm}><option value="Monthly">Monthly</option><option value="Quarterly">Quarterly</option><option value="Yearly">Yearly</option></select></Field>
                <Field label="Initial Payment Amount (₹)"><input type="number" min="0" name="paymentAmount" value={companyForm.paymentAmount} onChange={updateCompanyForm} /></Field>
                <Field label="Payment Due Date"><input type="date" name="paymentDueDate" value={companyForm.paymentDueDate} onChange={updateCompanyForm} /></Field>
              </div>
              <p className="owner-muted" style={{ marginTop: 16 }}>Company creation uses the secure Supabase <strong>create-company</strong> Edge Function. Do not put an Admin or service-role key in this file.</p>
              <div className="owner-form-actions">
                <button type="button" className="owner-button" disabled={creatingCompany} onClick={() => setShowAddCompany(false)}>Cancel</button>
                <button type="submit" className="owner-button primary" disabled={creatingCompany}>{creatingCompany ? "Creating..." : "Create Company"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value, note }) {
  return <div className="owner-card"><div className="owner-card-label">{label}</div><div className="owner-card-value">{value}</div><div className="owner-card-note">{note}</div></div>;
}

function Kpi({ label, value }) {
  return <div className="owner-kpi"><span>{label}</span><strong>{value}</strong></div>;
}

function Pill({ children, success = false, warning = false }) {
  return <span className={`owner-pill ${success ? "success" : warning ? "warning" : ""}`}>{children}</span>;
}

function EmptyRow({ columns, text }) {
  return <tr><td colSpan={columns} className="owner-empty">{text}</td></tr>;
}

function Field({ label, children }) {
  return <div className="owner-field"><label>{label}</label>{children}</div>;
}
