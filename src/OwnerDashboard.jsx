import React, { useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

/*
=========================================================
TRACKERZ OWNER DASHBOARD
=========================================================

This is the Owner-only management view.

Design goal:
- Simple
- Clean
- Management-focused
- Only the information an owner needs at a glance
- No changes to the factory application

Current dashboard data is prototype/demo data.
Step 1 includes the Add Company UI only; backend company creation is intentionally not connected yet.
=========================================================
*/

const demoData = {
  companies: 12,
  factories: 18,
  activeSites: 24,
  panels: 24680,

  production: {
    pending: 4820,
    inProduction: 7340,
    packed: 8920,
    dispatched: 3600,
  },

  factoriesList: [
    {
      company: "SMART SPACE",
      factory: "Main Factory",
      sites: 8,
      panels: 8640,
      status: "Active",
    },
    {
      company: "SMART SPACE",
      factory: "Production Unit 2",
      sites: 6,
      panels: 5920,
      status: "Active",
    },
    {
      company: "Client Company",
      factory: "Factory 01",
      sites: 5,
      panels: 4860,
      status: "Active",
    },
    {
      company: "Client Company",
      factory: "Factory 02",
      sites: 5,
      panels: 5260,
      status: "Active",
    },
  ],
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function OwnerDashboard() {
  const [companyFilter, setCompanyFilter] =
    useState("All Companies");

  const [factoryFilter, setFactoryFilter] =
    useState("All Factories");

  const [signingOut, setSigningOut] =
    useState(false);

  const [showAddCompany, setShowAddCompany] =
    useState(false);

  const [companyForm, setCompanyForm] =
    useState({
      companyName: "",
      email: "",
      password: "",
      contact: "",
      status: "Active",
    });

  const [companyCreatedMessage, setCompanyCreatedMessage] =
    useState("");

  const companies = useMemo(() => {
    return [
      "All Companies",
      ...Array.from(
        new Set(
          demoData.factoriesList.map(
            (item) => item.company
          )
        )
      ),
    ];
  }, []);

  const factories = useMemo(() => {
    const source =
      companyFilter === "All Companies"
        ? demoData.factoriesList
        : demoData.factoriesList.filter(
            (item) =>
              item.company ===
              companyFilter
          );

    return [
      "All Factories",
      ...Array.from(
        new Set(
          source.map(
            (item) => item.factory
          )
        )
      ),
    ];
  }, [companyFilter]);

  const filteredFactories =
    demoData.factoriesList.filter(
      (item) => {
        const companyMatches =
          companyFilter ===
            "All Companies" ||
          item.company ===
            companyFilter;

        const factoryMatches =
          factoryFilter ===
            "All Factories" ||
          item.factory ===
            factoryFilter;

        return (
          companyMatches &&
          factoryMatches
        );
      }
    );

  async function handleLogout() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      const {
        error,
      } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } catch (err) {
      console.error(
        "Owner logout error:",
        err
      );

      setSigningOut(false);
      window.alert(
        err?.message ||
          "Unable to sign out."
      );
    }
  }

  function resetCompanyForm() {
    setCompanyForm({
      companyName: "",
      email: "",
      password: "",
      contact: "",
      status: "Active",
    });
  }

  function closeAddCompany() {
    setShowAddCompany(false);
    resetCompanyForm();
  }

  function handleCompanyFormChange(event) {
    const { name, value } = event.target;

    setCompanyForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleCreateCompanyDemo(event) {
    event.preventDefault();

    if (
      !companyForm.companyName.trim() ||
      !companyForm.email.trim() ||
      !companyForm.password.trim()
    ) {
      return;
    }

    setCompanyCreatedMessage(
      `${companyForm.companyName.trim()} is ready in the Add Company prototype. Backend account creation will be connected in the next step.`
    );

    closeAddCompany();
  }

  function handleCompanyChange(
    event
  ) {
    setCompanyFilter(
      event.target.value
    );

    setFactoryFilter(
      "All Factories"
    );
  }

  const productionTotal =
    demoData.production.pending +
    demoData.production.inProduction +
    demoData.production.packed +
    demoData.production.dispatched;

  return (
    <div className="trackerz-owner-page">
      <style>{`
        .trackerz-owner-page {
          min-height: 100vh;
          box-sizing: border-box;
          background: #f6f8fb;
          color: #172033;
          padding: 28px 34px 42px;
          font-family: Inter, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }

        .trackerz-owner-shell {
          width: min(1180px, 100%);
          margin: 0 auto;
        }

        .trackerz-owner-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 4px 0 24px;
          border-bottom: 1px solid #e5e9ef;
        }

        .trackerz-owner-brand {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .trackerz-owner-logo {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: #172033;
          color: #ffffff;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: .5px;
        }

        .trackerz-owner-brand-name {
          margin: 0;
          font-size: 20px;
          line-height: 1;
          letter-spacing: 2px;
          font-weight: 800;
        }

        .trackerz-owner-brand-subtitle {
          margin: 5px 0 0;
          color: #7a8495;
          font-size: 11px;
          letter-spacing: 1.1px;
          text-transform: uppercase;
        }

        .trackerz-owner-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .trackerz-owner-badge {
          border: 1px solid #dbe2ea;
          background: #ffffff;
          color: #4b5565;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 700;
        }

        .trackerz-owner-logout {
          border: 1px solid #d7dde6;
          background: #ffffff;
          color: #374151;
          border-radius: 8px;
          padding: 9px 14px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .trackerz-owner-logout:hover {
          background: #f8fafc;
        }

        .trackerz-owner-add-company {
          border: none;
          background: #172033;
          color: #ffffff;
          border-radius: 8px;
          padding: 10px 15px;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
          white-space: nowrap;
        }

        .trackerz-owner-add-company:hover {
          background: #263247;
        }

        .trackerz-owner-company-message {
          margin: 0 0 16px;
          padding: 11px 13px;
          border: 1px solid #d9e8dd;
          border-radius: 8px;
          background: #f6fbf7;
          color: #25613a;
          font-size: 12px;
          line-height: 1.45;
        }

        .trackerz-owner-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 22px;
          background: rgba(15, 23, 42, .38);
        }

        .trackerz-owner-modal {
          width: min(520px, 100%);
          max-height: calc(100vh - 44px);
          overflow-y: auto;
          background: #ffffff;
          border: 1px solid #e2e7ee;
          border-radius: 12px;
          box-shadow: 0 18px 50px rgba(15, 23, 42, .16);
        }

        .trackerz-owner-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 20px 21px 16px;
          border-bottom: 1px solid #edf0f4;
        }

        .trackerz-owner-modal-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 750;
          color: #172033;
        }

        .trackerz-owner-modal-header p {
          margin: 5px 0 0;
          color: #7a8495;
          font-size: 12px;
          line-height: 1.45;
        }

        .trackerz-owner-modal-close {
          width: 32px;
          height: 32px;
          flex: 0 0 32px;
          border: 1px solid #dbe2ea;
          border-radius: 7px;
          background: #ffffff;
          color: #5f6b7a;
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
        }

        .trackerz-owner-modal-form {
          padding: 18px 21px 21px;
        }

        .trackerz-owner-form-field {
          margin-bottom: 14px;
        }

        .trackerz-owner-form-field:last-child {
          margin-bottom: 0;
        }

        .trackerz-owner-form-field label {
          display: block;
          margin-bottom: 6px;
          color: #3f4a5a;
          font-size: 12px;
          font-weight: 750;
        }

        .trackerz-owner-form-required {
          color: #b42318;
        }

        .trackerz-owner-form-input,
        .trackerz-owner-form-select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #d6dde7;
          border-radius: 8px;
          background: #ffffff;
          color: #172033;
          padding: 10px 11px;
          font-size: 13px;
          outline: none;
        }

        .trackerz-owner-form-input:focus,
        .trackerz-owner-form-select:focus {
          border-color: #9aa7b8;
          box-shadow: 0 0 0 3px rgba(100, 116, 139, .10);
        }

        .trackerz-owner-form-help {
          margin: 5px 0 0;
          color: #8a94a5;
          font-size: 11px;
          line-height: 1.4;
        }

        .trackerz-owner-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
          padding-top: 18px;
          margin-top: 18px;
          border-top: 1px solid #edf0f4;
        }

        .trackerz-owner-modal-cancel,
        .trackerz-owner-modal-submit {
          border-radius: 8px;
          padding: 10px 15px;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
        }

        .trackerz-owner-modal-cancel {
          border: 1px solid #d7dde6;
          background: #ffffff;
          color: #374151;
        }

        .trackerz-owner-modal-submit {
          border: 1px solid #172033;
          background: #172033;
          color: #ffffff;
        }

        .trackerz-owner-modal-submit:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .trackerz-owner-title-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin: 28px 0 18px;
        }

        .trackerz-owner-kicker {
          margin: 0 0 7px;
          color: #64748b;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.4px;
          text-transform: uppercase;
        }

        .trackerz-owner-title {
          margin: 0;
          font-size: 30px;
          line-height: 1.15;
          font-weight: 750;
          letter-spacing: -.6px;
        }

        .trackerz-owner-description {
          margin: 7px 0 0;
          color: #6b7280;
          font-size: 14px;
        }

        .trackerz-owner-filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .trackerz-owner-select {
          min-width: 155px;
          border: 1px solid #dbe2ea;
          border-radius: 8px;
          background: #ffffff;
          color: #374151;
          padding: 9px 30px 9px 11px;
          font-size: 13px;
          outline: none;
        }

        .trackerz-owner-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }

        .trackerz-owner-card {
          background: #ffffff;
          border: 1px solid #e2e7ee;
          border-radius: 11px;
          padding: 17px 18px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, .03);
        }

        .trackerz-owner-card-label {
          color: #718096;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .9px;
          text-transform: uppercase;
        }

        .trackerz-owner-card-value {
          margin-top: 8px;
          font-size: 26px;
          line-height: 1;
          font-weight: 750;
          color: #172033;
        }

        .trackerz-owner-card-note {
          margin-top: 6px;
          color: #8a94a5;
          font-size: 11px;
        }

        .trackerz-owner-main-grid {
          display: grid;
          grid-template-columns: 1fr 1.35fr;
          gap: 16px;
        }

        .trackerz-owner-section {
          background: #ffffff;
          border: 1px solid #e2e7ee;
          border-radius: 11px;
          overflow: hidden;
          box-shadow: 0 1px 2px rgba(15, 23, 42, .03);
        }

        .trackerz-owner-section-header {
          padding: 16px 18px;
          border-bottom: 1px solid #edf0f4;
        }

        .trackerz-owner-section-header h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 750;
        }

        .trackerz-owner-section-header p {
          margin: 4px 0 0;
          color: #8a94a5;
          font-size: 11px;
        }

        .trackerz-owner-production-total {
          padding: 18px 18px 9px;
        }

        .trackerz-owner-production-total strong {
          font-size: 28px;
          font-weight: 750;
        }

        .trackerz-owner-production-total span {
          margin-left: 7px;
          color: #7a8495;
          font-size: 12px;
        }

        .trackerz-owner-status-list {
          padding: 4px 18px 17px;
        }

        .trackerz-owner-status-row {
          display: grid;
          grid-template-columns: 96px 1fr 54px;
          align-items: center;
          gap: 10px;
          margin-top: 13px;
        }

        .trackerz-owner-status-name {
          color: #596579;
          font-size: 12px;
        }

        .trackerz-owner-status-bar {
          height: 7px;
          border-radius: 999px;
          background: #edf1f5;
          overflow: hidden;
        }

        .trackerz-owner-status-fill {
          height: 100%;
          border-radius: inherit;
          background: #64748b;
        }

        .trackerz-owner-status-value {
          text-align: right;
          color: #273244;
          font-size: 12px;
          font-weight: 750;
        }

        .trackerz-owner-table-wrap {
          overflow-x: auto;
        }

        .trackerz-owner-table {
          width: 100%;
          border-collapse: collapse;
        }

        .trackerz-owner-table th {
          padding: 11px 15px;
          background: #fafbfc;
          color: #7a8495;
          border-bottom: 1px solid #edf0f4;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .7px;
          text-align: left;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .trackerz-owner-table td {
          padding: 13px 15px;
          border-bottom: 1px solid #f0f2f5;
          color: #475467;
          font-size: 12px;
          white-space: nowrap;
        }

        .trackerz-owner-table tr:last-child td {
          border-bottom: none;
        }

        .trackerz-owner-table strong {
          color: #1f2937;
          font-weight: 700;
        }

        .trackerz-owner-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #15803d;
          font-weight: 700;
        }

        .trackerz-owner-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
        }

        .trackerz-owner-footer-note {
          margin-top: 14px;
          color: #9aa3b1;
          font-size: 11px;
          text-align: right;
        }

        @media (max-width: 900px) {
          .trackerz-owner-metrics {
            grid-template-columns: repeat(2, 1fr);
          }

          .trackerz-owner-main-grid {
            grid-template-columns: 1fr;
          }

          .trackerz-owner-add-company {
          border: none;
          background: #172033;
          color: #ffffff;
          border-radius: 8px;
          padding: 10px 15px;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
          white-space: nowrap;
        }

        .trackerz-owner-add-company:hover {
          background: #263247;
        }

        .trackerz-owner-company-message {
          margin: 0 0 16px;
          padding: 11px 13px;
          border: 1px solid #d9e8dd;
          border-radius: 8px;
          background: #f6fbf7;
          color: #25613a;
          font-size: 12px;
          line-height: 1.45;
        }

        .trackerz-owner-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 22px;
          background: rgba(15, 23, 42, .38);
        }

        .trackerz-owner-modal {
          width: min(520px, 100%);
          max-height: calc(100vh - 44px);
          overflow-y: auto;
          background: #ffffff;
          border: 1px solid #e2e7ee;
          border-radius: 12px;
          box-shadow: 0 18px 50px rgba(15, 23, 42, .16);
        }

        .trackerz-owner-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 20px 21px 16px;
          border-bottom: 1px solid #edf0f4;
        }

        .trackerz-owner-modal-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 750;
          color: #172033;
        }

        .trackerz-owner-modal-header p {
          margin: 5px 0 0;
          color: #7a8495;
          font-size: 12px;
          line-height: 1.45;
        }

        .trackerz-owner-modal-close {
          width: 32px;
          height: 32px;
          flex: 0 0 32px;
          border: 1px solid #dbe2ea;
          border-radius: 7px;
          background: #ffffff;
          color: #5f6b7a;
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
        }

        .trackerz-owner-modal-form {
          padding: 18px 21px 21px;
        }

        .trackerz-owner-form-field {
          margin-bottom: 14px;
        }

        .trackerz-owner-form-field:last-child {
          margin-bottom: 0;
        }

        .trackerz-owner-form-field label {
          display: block;
          margin-bottom: 6px;
          color: #3f4a5a;
          font-size: 12px;
          font-weight: 750;
        }

        .trackerz-owner-form-required {
          color: #b42318;
        }

        .trackerz-owner-form-input,
        .trackerz-owner-form-select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #d6dde7;
          border-radius: 8px;
          background: #ffffff;
          color: #172033;
          padding: 10px 11px;
          font-size: 13px;
          outline: none;
        }

        .trackerz-owner-form-input:focus,
        .trackerz-owner-form-select:focus {
          border-color: #9aa7b8;
          box-shadow: 0 0 0 3px rgba(100, 116, 139, .10);
        }

        .trackerz-owner-form-help {
          margin: 5px 0 0;
          color: #8a94a5;
          font-size: 11px;
          line-height: 1.4;
        }

        .trackerz-owner-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
          padding-top: 18px;
          margin-top: 18px;
          border-top: 1px solid #edf0f4;
        }

        .trackerz-owner-modal-cancel,
        .trackerz-owner-modal-submit {
          border-radius: 8px;
          padding: 10px 15px;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
        }

        .trackerz-owner-modal-cancel {
          border: 1px solid #d7dde6;
          background: #ffffff;
          color: #374151;
        }

        .trackerz-owner-modal-submit {
          border: 1px solid #172033;
          background: #172033;
          color: #ffffff;
        }

        .trackerz-owner-modal-submit:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .trackerz-owner-title-row {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 600px) {
          .trackerz-owner-page {
            padding: 20px 15px 30px;
          }

          .trackerz-owner-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .trackerz-owner-actions {
            width: 100%;
            justify-content: space-between;
          }

          .trackerz-owner-metrics {
            grid-template-columns: 1fr 1fr;
          }

          .trackerz-owner-title {
            font-size: 25px;
          }

          .trackerz-owner-filters {
            width: 100%;
          }

          .trackerz-owner-select,
          .trackerz-owner-add-company {
            flex: 1;
            min-width: 0;
          }

          .trackerz-owner-modal-backdrop {
            padding: 12px;
          }

          .trackerz-owner-modal {
            max-height: calc(100vh - 24px);
          }

          .trackerz-owner-modal-actions {
            flex-direction: column-reverse;
          }

          .trackerz-owner-modal-cancel,
          .trackerz-owner-modal-submit {
            width: 100%;
          }
        }
      `}</style>

      <div className="trackerz-owner-shell">

        <header className="trackerz-owner-header">
          <div className="trackerz-owner-brand">
            <div className="trackerz-owner-logo">
              T
            </div>

            <div>
              <h1 className="trackerz-owner-brand-name">
                TRACKERZ
              </h1>

              <p className="trackerz-owner-brand-subtitle">
                Owner Management
              </p>
            </div>
          </div>

          <div className="trackerz-owner-actions">
            <span className="trackerz-owner-badge">
              Owner Console
            </span>

            <button
              type="button"
              className="trackerz-owner-logout"
              onClick={handleLogout}
              disabled={signingOut}
            >
              {signingOut
                ? "Signing out..."
                : "Logout"}
            </button>
          </div>
        </header>

        <div className="trackerz-owner-title-row">
          <div>
            <p className="trackerz-owner-kicker">
              Management Overview
            </p>

            <h2 className="trackerz-owner-title">
              Owner Dashboard
            </h2>

            <p className="trackerz-owner-description">
              A simple view of Trackerz operations.
            </p>
          </div>

          <div className="trackerz-owner-filters">
            <select
              className="trackerz-owner-select"
              value={companyFilter}
              onChange={handleCompanyChange}
            >
              {companies.map(
                (company) => (
                  <option
                    key={company}
                    value={company}
                  >
                    {company}
                  </option>
                )
              )}
            </select>

            <select
              className="trackerz-owner-select"
              value={factoryFilter}
              onChange={(event) =>
                setFactoryFilter(
                  event.target.value
                )
              }
            >
              {factories.map(
                (factory) => (
                  <option
                    key={factory}
                    value={factory}
                  >
                    {factory}
                  </option>
                )
              )}
            </select>

            <button
              type="button"
              className="trackerz-owner-add-company"
              onClick={() => {
                setCompanyCreatedMessage("");
                setShowAddCompany(true);
              }}
            >
              + Add Company
            </button>
          </div>
        </div>

        {companyCreatedMessage && (
          <div className="trackerz-owner-company-message">
            {companyCreatedMessage}
          </div>
        )}

        <section className="trackerz-owner-metrics">

          <div className="trackerz-owner-card">
            <div className="trackerz-owner-card-label">
              Companies
            </div>

            <div className="trackerz-owner-card-value">
              {formatNumber(
                demoData.companies
              )}
            </div>

            <div className="trackerz-owner-card-note">
              Registered companies
            </div>
          </div>

          <div className="trackerz-owner-card">
            <div className="trackerz-owner-card-label">
              Factories
            </div>

            <div className="trackerz-owner-card-value">
              {formatNumber(
                demoData.factories
              )}
            </div>

            <div className="trackerz-owner-card-note">
              Active locations
            </div>
          </div>

          <div className="trackerz-owner-card">
            <div className="trackerz-owner-card-label">
              Active Sites
            </div>

            <div className="trackerz-owner-card-value">
              {formatNumber(
                demoData.activeSites
              )}
            </div>

            <div className="trackerz-owner-card-note">
              Current production sites
            </div>
          </div>

          <div className="trackerz-owner-card">
            <div className="trackerz-owner-card-label">
              Physical Panels
            </div>

            <div className="trackerz-owner-card-value">
              {formatNumber(
                demoData.panels
              )}
            </div>

            <div className="trackerz-owner-card-note">
              Panels tracked
            </div>
          </div>

        </section>

        <div className="trackerz-owner-main-grid">

          <section className="trackerz-owner-section">
            <div className="trackerz-owner-section-header">
              <h3>
                Production Status
              </h3>

              <p>
                Current panel movement
              </p>
            </div>

            <div className="trackerz-owner-production-total">
              <strong>
                {formatNumber(
                  productionTotal
                )}
              </strong>

              <span>
                total panels
              </span>
            </div>

            <div className="trackerz-owner-status-list">

              {[
                [
                  "Pending",
                  demoData.production.pending,
                ],
                [
                  "In Production",
                  demoData.production.inProduction,
                ],
                [
                  "Packed",
                  demoData.production.packed,
                ],
                [
                  "Dispatched",
                  demoData.production.dispatched,
                ],
              ].map(
                ([label, value]) => (
                  <div
                    className="trackerz-owner-status-row"
                    key={label}
                  >
                    <span className="trackerz-owner-status-name">
                      {label}
                    </span>

                    <div className="trackerz-owner-status-bar">
                      <div
                        className="trackerz-owner-status-fill"
                        style={{
                          width: `${productionTotal ? (value / productionTotal) * 100 : 0}%`,
                        }}
                      />
                    </div>

                    <span className="trackerz-owner-status-value">
                      {formatNumber(
                        value
                      )}
                    </span>
                  </div>
                )
              )}

            </div>
          </section>

          <section className="trackerz-owner-section">
            <div className="trackerz-owner-section-header">
              <h3>
                Factory Overview
              </h3>

              <p>
                Companies and active factory locations
              </p>
            </div>

            <div className="trackerz-owner-table-wrap">
              <table className="trackerz-owner-table">
                <thead>
                  <tr>
                    <th>
                      Company
                    </th>

                    <th>
                      Factory
                    </th>

                    <th>
                      Sites
                    </th>

                    <th>
                      Panels
                    </th>

                    <th>
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredFactories.map(
                    (factory) => (
                      <tr
                        key={`${factory.company}-${factory.factory}`}
                      >
                        <td>
                          <strong>
                            {factory.company}
                          </strong>
                        </td>

                        <td>
                          {factory.factory}
                        </td>

                        <td>
                          {formatNumber(
                            factory.sites
                          )}
                        </td>

                        <td>
                          {formatNumber(
                            factory.panels
                          )}
                        </td>

                        <td>
                          <span className="trackerz-owner-status">
                            <span className="trackerz-owner-status-dot" />
                            {factory.status}
                          </span>
                        </td>
                      </tr>
                    )
                  )}

                  {filteredFactories.length ===
                    0 && (
                    <tr>
                      <td
                        colSpan="5"
                        style={{
                          textAlign:
                            "center",
                          color:
                            "#8a94a5",
                          padding:
                            "28px 15px",
                        }}
                      >
                        No factories found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

        </div>

        <div className="trackerz-owner-footer-note">
          Trackerz Owner Console
        </div>

        {showAddCompany && (
          <div
            className="trackerz-owner-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeAddCompany();
              }
            }}
          >
            <div
              className="trackerz-owner-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="trackerz-add-company-title"
            >
              <div className="trackerz-owner-modal-header">
                <div>
                  <h3 id="trackerz-add-company-title">
                    Add Company
                  </h3>
                  <p>
                    Create the company profile and its initial Trackerz login details.
                  </p>
                </div>

                <button
                  type="button"
                  className="trackerz-owner-modal-close"
                  onClick={closeAddCompany}
                  aria-label="Close Add Company"
                >
                  ×
                </button>
              </div>

              <form
                className="trackerz-owner-modal-form"
                onSubmit={handleCreateCompanyDemo}
              >
                <div className="trackerz-owner-form-field">
                  <label htmlFor="owner-company-name">
                    Company Name <span className="trackerz-owner-form-required">*</span>
                  </label>
                  <input
                    id="owner-company-name"
                    name="companyName"
                    type="text"
                    className="trackerz-owner-form-input"
                    placeholder="Enter company name"
                    value={companyForm.companyName}
                    onChange={handleCompanyFormChange}
                    autoComplete="organization"
                    required
                  />
                </div>

                <div className="trackerz-owner-form-field">
                  <label htmlFor="owner-company-email">
                    Login Email <span className="trackerz-owner-form-required">*</span>
                  </label>
                  <input
                    id="owner-company-email"
                    name="email"
                    type="email"
                    className="trackerz-owner-form-input"
                    placeholder="company@example.com"
                    value={companyForm.email}
                    onChange={handleCompanyFormChange}
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="trackerz-owner-form-field">
                  <label htmlFor="owner-company-password">
                    Temporary Password <span className="trackerz-owner-form-required">*</span>
                  </label>
                  <input
                    id="owner-company-password"
                    name="password"
                    type="password"
                    className="trackerz-owner-form-input"
                    placeholder="Enter temporary password"
                    value={companyForm.password}
                    onChange={handleCompanyFormChange}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <p className="trackerz-owner-form-help">
                    This will be the initial password for the company login. It will be handled securely by Supabase Auth when the backend is connected.
                  </p>
                </div>

                <div className="trackerz-owner-form-field">
                  <label htmlFor="owner-company-contact">
                    Contact Number
                  </label>
                  <input
                    id="owner-company-contact"
                    name="contact"
                    type="tel"
                    className="trackerz-owner-form-input"
                    placeholder="Enter contact number"
                    value={companyForm.contact}
                    onChange={handleCompanyFormChange}
                    autoComplete="tel"
                  />
                </div>

                <div className="trackerz-owner-form-field">
                  <label htmlFor="owner-company-status">
                    Status
                  </label>
                  <select
                    id="owner-company-status"
                    name="status"
                    className="trackerz-owner-form-select"
                    value={companyForm.status}
                    onChange={handleCompanyFormChange}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div className="trackerz-owner-modal-actions">
                  <button
                    type="button"
                    className="trackerz-owner-modal-cancel"
                    onClick={closeAddCompany}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="trackerz-owner-modal-submit"
                    disabled={
                      !companyForm.companyName.trim() ||
                      !companyForm.email.trim() ||
                      !companyForm.password.trim()
                    }
                  >
                    Create Company
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default OwnerDashboard;
