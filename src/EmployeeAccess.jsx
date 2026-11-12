import { useCallback, useEffect, useMemo, useState } from "react";

const MANAGEMENT_PERMISSIONS = [
  { key: "management.bills.view", label: "View customer bills" },
  { key: "management.bills.create", label: "Create customer bills" },
  { key: "management.bills.edit", label: "Edit customer bills" },
  { key: "management.bills.delete", label: "Delete customer bills" },
  { key: "management.payments.view", label: "View receipts and payments" },
  { key: "management.payments.record", label: "Record receipts and payments" },
  { key: "management.payments.edit", label: "Edit receipts and payments" },
  { key: "management.payments.delete", label: "Delete receipts and payments" },
  { key: "management.payables.view", label: "View supplier payables" },
  { key: "management.payables.create", label: "Create supplier payables" },
  { key: "management.payables.edit", label: "Edit supplier payables" },
  { key: "management.payables.delete", label: "Delete supplier payables" },
  { key: "management.expenses.view", label: "View expenses" },
  { key: "management.expenses.create", label: "Create expenses" },
  { key: "management.expenses.edit", label: "Edit expenses" },
  { key: "management.expenses.delete", label: "Delete expenses" },
  { key: "management.reports.view", label: "View reports" },
  { key: "management.reports.export", label: "Export reports" },
];

const ROLE_DEFAULTS = {
  factory_manager: {
    production_access: true,
    management_access: false,
    permissions: {},
  },
  accounts_manager: {
    production_access: false,
    management_access: true,
    permissions: { "*": true },
  },
  accounts_assistant: {
    production_access: false,
    management_access: true,
    permissions: {
      "management.bills.view": true,
      "management.bills.create": true,
      "management.payments.view": true,
      "management.payments.record": true,
      "management.payables.view": true,
      "management.expenses.view": true,
      "management.expenses.create": true,
      "management.reports.view": true,
    },
  },
  viewer: {
    production_access: false,
    management_access: false,
    permissions: {},
  },
  custom: {
    production_access: false,
    management_access: true,
    permissions: {},
  },
};

const styles = {
  page: { display: "flex", flexDirection: "column", gap: 18, width: "100%", color: "#172033" },
  card: { background: "#fff", border: "1px solid #e5eaf0", borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(15,23,42,.035)" },
  title: { margin: 0, fontSize: 22, fontWeight: 750, letterSpacing: "-.4px" },
  muted: { margin: "6px 0 0", color: "#718096", fontSize: 13, lineHeight: 1.5 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 650, color: "#475467" },
  input: { width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "1px solid #d7dee8", borderRadius: 7, background: "#fff", fontSize: 13 },
  primary: { border: "1px solid #2563eb", background: "#2563eb", color: "#fff", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  secondary: { border: "1px solid #d7dee8", background: "#fff", color: "#344054", borderRadius: 8, padding: "9px 13px", fontSize: 13, fontWeight: 650, cursor: "pointer" },
  danger: { border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", borderRadius: 8, padding: "8px 11px", fontSize: 12, fontWeight: 650, cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 680 },
  th: { padding: "11px 12px", textAlign: "left", background: "#f5f7fa", color: "#667085", fontSize: 11, textTransform: "uppercase", letterSpacing: ".4px", whiteSpace: "nowrap" },
  td: { padding: "12px", borderTop: "1px solid #edf0f4", fontSize: 13, verticalAlign: "middle" },
};

function moduleLabel(employee) {
  const modules = [];
  if (employee.production_access) modules.push("Production");
  if (employee.management_access) modules.push("Management");
  return modules.length ? modules.join(" + ") : "No modules";
}

export default function EmployeeAccess({ supabase, isCompanyOwner, onAccessChanged }) {
  const [employees, setEmployees] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [myInvitations, setMyInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingUserId, setEditingUserId] = useState(null);
  const [form, setForm] = useState({
    email: "",
    display_name: "",
    role: "accounts_assistant",
    production_access: false,
    management_access: true,
    permissions: { ...ROLE_DEFAULTS.accounts_assistant.permissions },
  });

  const invoke = useCallback(async (action, payload = {}) => {
    const { data, error: invokeError } = await supabase.functions.invoke(
      "trackerz-employee-access",
      { body: { action, ...payload } },
    );
    if (invokeError) throw new Error(invokeError.message || "Employee service request failed.");
    if (data?.error) throw new Error(data.error);
    return data || {};
  }, [supabase]);

  const loadOwnerData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await invoke("list");
      setEmployees(data.employees || []);
      setInvitations(data.invitations || []);
    } catch (err) {
      setError(err.message || "Unable to load employee access.");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  const loadMyInvitations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await invoke("my-invitations");
      setMyInvitations(data.invitations || []);
    } catch (err) {
      setError(err.message || "Unable to check invitations.");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    if (isCompanyOwner) loadOwnerData();
    else loadMyInvitations();
  }, [isCompanyOwner, loadOwnerData, loadMyInvitations]);

  const resetForm = () => {
    setEditingUserId(null);
    setForm({
      email: "",
      display_name: "",
      role: "accounts_assistant",
      production_access: false,
      management_access: true,
      permissions: { ...ROLE_DEFAULTS.accounts_assistant.permissions },
    });
  };

  const applyRole = (role) => {
    const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.custom;
    setForm((current) => ({
      ...current,
      role,
      production_access: defaults.production_access,
      management_access: defaults.management_access,
      permissions: { ...defaults.permissions },
    }));
  };

  const togglePermission = (key) => {
    setForm((current) => ({
      ...current,
      permissions: { ...current.permissions, [key]: !current.permissions[key] },
    }));
  };

  const submitEmployee = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (!form.production_access && !form.management_access) {
        throw new Error("Select at least one module for this employee.");
      }
      const payload = {
        role: form.role,
        production_access: form.production_access,
        management_access: form.management_access,
        permissions: form.management_access ? form.permissions : {},
      };
      if (editingUserId) {
        const result = await invoke("update-employee", { user_id: editingUserId, ...payload });
        setMessage(result.message || "Employee access updated.");
      } else {
        if (!form.email.trim()) throw new Error("Enter the employee email address.");
        const result = await invoke("invite", {
          email: form.email.trim(),
          display_name: form.display_name.trim(),
          ...payload,
        });
        setMessage(result.message || "Invitation created.");
      }
      resetForm();
      await loadOwnerData();
    } catch (err) {
      setError(err.message || "Unable to save employee access.");
    } finally {
      setSaving(false);
    }
  };

  const editEmployee = (employee) => {
    setEditingUserId(employee.user_id);
    setForm({
      email: employee.email || "",
      display_name: employee.display_name || "",
      role: employee.role || "custom",
      production_access: !!employee.production_access,
      management_access: !!employee.management_access,
      permissions: employee.permissions || {},
    });
    setMessage("");
    setError("");
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  const revokeEmployee = async (employee) => {
    const label = employee.display_name || employee.email || employee.user_id;
    if (!window.confirm(`Revoke Trackerz access for ${label}? They will lose access to this company's modules.`)) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await invoke("revoke-employee", { user_id: employee.user_id });
      setMessage(result.message || "Employee access revoked.");
      if (editingUserId === employee.user_id) resetForm();
      await loadOwnerData();
    } catch (err) {
      setError(err.message || "Unable to revoke employee access.");
    } finally {
      setSaving(false);
    }
  };

  const cancelInvitation = async (invitation) => {
    if (!window.confirm(`Cancel the invitation sent to ${invitation.email}?`)) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await invoke("cancel-invitation", { invitation_id: invitation.id });
      setMessage(result.message || "Invitation cancelled.");
      await loadOwnerData();
    } catch (err) {
      setError(err.message || "Unable to cancel invitation.");
    } finally {
      setSaving(false);
    }
  };

  const acceptInvitation = async (invitation) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await invoke("accept", { invitation_id: invitation.id });
      setMessage(result.message || "Invitation accepted. Loading your workspace…");
      await onAccessChanged?.();
    } catch (err) {
      setError(err.message || "Unable to accept invitation.");
    } finally {
      setSaving(false);
    }
  };

  const activeEmployees = useMemo(() => employees.filter((item) => item.status === "active"), [employees]);

  if (!isCompanyOwner) {
    return (
      <div style={styles.page}>
        <section style={styles.card}>
          <div style={{ color: "#2563eb", fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>TRACKERZ / COMPANY ACCESS</div>
          <h2 style={{ ...styles.title, marginTop: 8 }}>Your invitations</h2>
          <p style={styles.muted}>Accept an invitation from a Trackerz company to activate your assigned workspace.</p>
        </section>
        {error && <div role="alert" style={{ ...styles.card, borderColor: "#fecaca", color: "#b91c1c" }}>{error}</div>}
        {message && <div role="status" style={{ ...styles.card, borderColor: "#bbf7d0", color: "#166534" }}>{message}</div>}
        <section style={styles.card}>
          {loading ? <p style={styles.muted}>Checking invitations…</p> : myInvitations.length === 0 ? (
            <p style={styles.muted}>There are no pending invitations for {" "}<strong>{"your signed-in email"}</strong>.</p>
          ) : myInvitations.map((invitation) => (
            <div key={invitation.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "12px 0", borderBottom: "1px solid #edf0f4" }}>
              <div>
                <strong>{invitation.company_name}</strong>
                <p style={styles.muted}>{invitation.email} · {invitation.role.replaceAll("_", " ")} · {moduleLabel(invitation)}</p>
                <p style={styles.muted}>Expires {new Date(invitation.expires_at).toLocaleString()}</p>
              </div>
              <button type="button" style={styles.primary} disabled={saving} onClick={() => acceptInvitation(invitation)}>Accept invitation</button>
            </div>
          ))}
          <button type="button" style={{ ...styles.secondary, marginTop: 14 }} onClick={loadMyInvitations} disabled={loading}>Refresh invitations</button>
        </section>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <section style={styles.card}>
        <div style={{ color: "#2563eb", fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>TRACKERZ / COMPANY ADMINISTRATION</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <div>
            <h2 style={styles.title}>Employees & access</h2>
            <p style={styles.muted}>Invite employees and control exactly which Trackerz modules and accounts actions they can use.</p>
          </div>
          <button type="button" style={styles.secondary} onClick={loadOwnerData} disabled={loading || saving}>↻ Refresh</button>
        </div>
      </section>

      {error && <div role="alert" style={{ ...styles.card, borderColor: "#fecaca", color: "#b91c1c" }}>{error}</div>}
      {message && <div role="status" style={{ ...styles.card, borderColor: "#bbf7d0", color: "#166534" }}>{message}</div>}

      <section style={styles.card}>
        <h3 style={{ margin: "0 0 5px", fontSize: 17 }}>{editingUserId ? "Edit employee access" : "Invite an employee"}</h3>
        <p style={styles.muted}>{editingUserId ? "Update this employee's modules, role and Management permissions." : "The employee will receive a secure sign-in invitation at this email address."}</p>
        <form onSubmit={submitEmployee} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 13, marginTop: 17 }}>
          {!editingUserId && <label style={styles.label}>Employee email<input required type="email" style={styles.input} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="employee@company.com" /></label>}
          {!editingUserId && <label style={styles.label}>Employee name<input style={styles.input} value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} placeholder="Employee name" /></label>}
          <label style={styles.label}>Role<select style={styles.input} value={form.role} onChange={(event) => applyRole(event.target.value)}>
            <option value="factory_manager">Factory manager</option>
            <option value="accounts_manager">Accounts manager</option>
            <option value="accounts_assistant">Accounts assistant</option>
            <option value="viewer">Viewer</option>
            <option value="custom">Custom permissions</option>
          </select></label>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 18, flexWrap: "wrap", padding: "12px 0", borderTop: "1px solid #edf0f4", borderBottom: "1px solid #edf0f4" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 650 }}><input type="checkbox" checked={form.production_access} onChange={(event) => setForm({ ...form, production_access: event.target.checked })} /> Production access</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 650 }}><input type="checkbox" checked={form.management_access} onChange={(event) => setForm({ ...form, management_access: event.target.checked })} /> Management access</label>
          </div>
          {form.management_access && <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 9 }}>Management permissions</div>
            {form.permissions["*"] ? <p style={styles.muted}>Full Management access is enabled for this role. Choose Custom permissions to assign individual actions.</p> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 9 }}>
              {MANAGEMENT_PERMISSIONS.map((permission) => <label key={permission.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#475467" }}><input type="checkbox" checked={!!form.permissions[permission.key]} onChange={() => togglePermission(permission.key)} />{permission.label}</label>)}
            </div>}
          </div>}
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 9, flexWrap: "wrap" }}>
            <button type="submit" style={styles.primary} disabled={saving}>{saving ? "Saving…" : editingUserId ? "Save permissions" : "Send invitation"}</button>
            {editingUserId && <button type="button" style={styles.secondary} onClick={resetForm}>Cancel edit</button>}
          </div>
        </form>
      </section>

      <section style={styles.card}>
        <h3 style={{ margin: "0 0 5px", fontSize: 17 }}>Company employees ({activeEmployees.length})</h3>
        <p style={styles.muted}>The company owner always retains full access. Employee access is enforced by Supabase policies.</p>
        {loading ? <p style={styles.muted}>Loading employees…</p> : employees.length === 0 ? <p style={styles.muted}>No employee records found.</p> : <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={styles.table}><thead><tr><th style={styles.th}>Employee</th><th style={styles.th}>Role</th><th style={styles.th}>Modules</th><th style={styles.th}>Status</th><th style={styles.th}>Actions</th></tr></thead><tbody>
            {employees.map((employee) => <tr key={employee.user_id}>
              <td style={styles.td}><strong>{employee.display_name || employee.email || "Employee"}</strong><div style={{ color: "#8792a2", fontSize: 11, marginTop: 3 }}>{employee.email || employee.user_id}</div></td>
              <td style={{ ...styles.td, textTransform: "capitalize" }}>{employee.role.replaceAll("_", " ")}</td>
              <td style={styles.td}>{moduleLabel(employee)}</td>
              <td style={styles.td}><span style={{ display: "inline-block", padding: "4px 8px", borderRadius: 20, background: employee.status === "active" ? "#e9f8ef" : "#fff1f2", color: employee.status === "active" ? "#087443" : "#be123c", fontSize: 11, fontWeight: 700 }}>{employee.status}</span></td>
              <td style={styles.td}>{employee.role === "owner" ? <span style={{ color: "#8792a2", fontSize: 12 }}>Company owner</span> : <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button type="button" style={styles.secondary} onClick={() => editEmployee(employee)}>Edit</button>{employee.status === "active" && <button type="button" style={styles.danger} disabled={saving} onClick={() => revokeEmployee(employee)}>Revoke</button>}</div>}</td>
            </tr>)}
          </tbody></table>
        </div>}
      </section>

      <section style={styles.card}>
        <h3 style={{ margin: "0 0 5px", fontSize: 17 }}>Invitations</h3>
        <p style={styles.muted}>Pending invitations expire after seven days.</p>
        {invitations.length === 0 ? <p style={styles.muted}>No invitations have been sent.</p> : invitations.map((invitation) => <div key={invitation.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "11px 0", borderBottom: "1px solid #edf0f4" }}>
          <div><strong>{invitation.email}</strong><p style={styles.muted}>{invitation.role.replaceAll("_", " ")} · {moduleLabel(invitation)} · {invitation.status}</p></div>
          {invitation.status === "pending" && <button type="button" style={styles.danger} disabled={saving} onClick={() => cancelInvitation(invitation)}>Cancel invitation</button>}
        </div>)}
      </section>
    </div>
  );
}
