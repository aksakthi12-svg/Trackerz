import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const INVITE_FROM_EMAIL = Deno.env.get("INVITE_FROM_EMAIL") ?? "";

const allowedPermissions = new Set([
  "management.bills.view",
  "management.bills.create",
  "management.bills.edit",
  "management.bills.delete",
  "management.payments.view",
  "management.payments.record",
  "management.payments.edit",
  "management.payments.delete",
  "management.payables.view",
  "management.payables.create",
  "management.payables.edit",
  "management.payables.delete",
  "management.expenses.view",
  "management.expenses.create",
  "management.expenses.edit",
  "management.expenses.delete",
  "management.reports.view",
  "management.reports.export",
  "management.delivery_challans.view",
  "management.delivery_challans.create",
  "management.delivery_challans.edit",
  "management.delivery_challans.delete",
]);

const allowedRoles = new Set([
  "factory_manager",
  "accounts_manager",
  "accounts_assistant",
  "viewer",
  "custom",
]);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanPermissions(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, boolean> = {};

  for (const [key, enabled] of Object.entries(source)) {
    if (key === "*" && enabled === true) {
      result["*"] = true;
      continue;
    }

    if (allowedPermissions.has(key) && enabled === true) {
      result[key] = true;
    }
  }

  // Read permissions are prerequisites for actions that operate on records.
  const dependencies: Record<string, string[]> = {
    "management.bills.view": ["management.payments.view"],
    "management.bills.create": ["management.bills.view", "management.payments.view"],
    "management.bills.edit": ["management.bills.view", "management.payments.view"],
    "management.bills.delete": ["management.bills.view", "management.payments.view"],
    "management.payments.record": ["management.payments.view", "management.bills.view", "management.payables.view"],
    "management.payments.edit": ["management.payments.view"],
    "management.payments.delete": ["management.payments.view"],
    "management.payables.view": ["management.payments.view"],
    "management.payables.create": ["management.payables.view", "management.payments.view"],
    "management.payables.edit": ["management.payables.view", "management.payments.view"],
    "management.payables.delete": ["management.payables.view", "management.payments.view"],
    "management.expenses.create": ["management.expenses.view"],
    "management.expenses.edit": ["management.expenses.view"],
    "management.expenses.delete": ["management.expenses.view"],
    "management.reports.view": ["management.bills.view", "management.payments.view", "management.payables.view", "management.expenses.view"],
    "management.reports.export": ["management.reports.view"],
    "management.delivery_challans.create": ["management.delivery_challans.view"],
    "management.delivery_challans.edit": ["management.delivery_challans.view"],
    "management.delivery_challans.delete": ["management.delivery_challans.view"],
  };

  for (const [permission, required] of Object.entries(dependencies)) {
    if (result[permission]) {
      for (const dependency of required) {
        result[dependency] = true;
      }
    }
  }

  return result;
}

function roleDefaults(role: string) {
  if (role === "factory_manager") {
    return {
      production_access: true,
      management_access: false,
      permissions: {},
    };
  }

  if (role === "accounts_manager") {
    return {
      production_access: false,
      management_access: true,
      permissions: { "*": true },
    };
  }

  if (role === "accounts_assistant") {
    return {
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
        "management.delivery_challans.view": true,
        "management.delivery_challans.create": true,
        "management.delivery_challans.edit": true,
      },
    };
  }

  return {
    production_access: false,
    management_access: false,
    permissions: {},
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char] || char));
}

async function sendExistingUserEmail(
  to: string,
  companyName: string,
  invitationId: string,
  actionLink?: string,
) {
  if (!RESEND_API_KEY || !INVITE_FROM_EMAIL) return false;

  const link = actionLink ||
    `${APP_URL}/?trackerz-invitation=${encodeURIComponent(invitationId)}`;

  const safeCompanyName = escapeHtml(companyName);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: INVITE_FROM_EMAIL,
      to: [to],
      subject: `You have been invited to ${companyName} on Trackerz`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>Trackerz invitation</h2><p>You have been invited to access <strong>${safeCompanyName}</strong> on Trackerz.</p><p>Open the secure link below, sign in with this email address, and accept the invitation.</p><p><a href="${link}" style="display:inline-block;padding:11px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:7px">Open Trackerz invitation</a></p><p>If you were not expecting this invitation, you can ignore this email.</p></div>`,
    }),
  });

  return response.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, {
      error: "The Supabase Edge Function secrets are not configured.",
    });
  }

  const authorization = req.headers.get("Authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return json(401, { error: "Please sign in first." });
  }

  const userClient = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const admin = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data: userResult, error: userError } =
    await userClient.auth.getUser();

  const caller = userResult?.user;

  if (userError || !caller?.id || !caller.email) {
    return json(401, {
      error: "Your login session is invalid or expired.",
    });
  }

  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return json(400, {
      error: "Request body must be valid JSON.",
    });
  }

  const action = String(body.action || "");

  // A logged-in invitee can view invitations addressed to their verified login email.
  if (action === "my-invitations") {
    const { data: invitations, error } = await admin
      .from("company_invitations")
      .select("id, company_id, email, display_name, role, production_access, management_access, status, expires_at, created_at")
      .ilike("email", caller.email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      return json(400, { error: error.message });
    }

    const companyIds = [
      ...new Set((invitations || []).map((item) => item.company_id)),
    ];

    const companyMap = new Map<number, string>();

    if (companyIds.length) {
      const { data: companies } = await admin
        .from("companies")
        .select("id, company_name")
        .in("id", companyIds);

      for (const company of companies || []) {
        companyMap.set(Number(company.id), company.company_name);
      }
    }

    return json(200, {
      ok: true,
      invitations: (invitations || []).map((item) => ({
        ...item,
        company_name: companyMap.get(Number(item.company_id)) ||
          "Trackerz company",
      })),
    });
  }

  // All management actions below are company-owner only.
  const { data: membership, error: membershipError } = await admin
    .from("company_users")
    .select("company_id")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (membershipError) {
    return json(400, { error: membershipError.message });
  }

  // Invitees do not have a company_users row until they accept.
  if (!membership?.company_id && action !== "accept") {
    return json(403, {
      error: "This login is not linked to a company.",
    });
  }

  const companyId = membership?.company_id
    ? Number(membership.company_id)
    : null;

  let company: {
    id: number;
    company_name: string;
    owner_user_id: string | null;
  } | null = null;

  if (companyId !== null) {
    const { data, error: companyError } = await admin
      .from("companies")
      .select("id, company_name, owner_user_id")
      .eq("id", companyId)
      .single();

    if (companyError || !data) {
      return json(404, { error: "Company record was not found." });
    }

    company = data;
  }

  if (action === "accept") {
    if (!caller.email_confirmed_at) {
      return json(403, {
        error: "Confirm this email address before accepting the company invitation.",
      });
    }

    const invitationId = String(body.invitation_id || "");

    if (!invitationId) {
      return json(400, { error: "Invitation ID is required." });
    }

    const { data: invite, error: inviteError } = await admin
      .from("company_invitations")
      .select("*")
      .eq("id", invitationId)
      .maybeSingle();

    if (inviteError || !invite) {
      return json(404, { error: "Invitation not found." });
    }

    if (String(invite.email).toLowerCase() !== caller.email.toLowerCase()) {
      return json(403, {
        error: "This invitation belongs to a different email address.",
      });
    }

    if (invite.status !== "pending") {
      return json(400, {
        error: "This invitation is no longer pending.",
      });
    }

    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      await admin
        .from("company_invitations")
        .update({ status: "expired" })
        .eq("id", invitationId);

      return json(400, {
        error: "This invitation has expired. Ask the company owner to send a new one.",
      });
    }

    const { data: targetCompany, error: targetCompanyError } = await admin
      .from("companies")
      .select("id, company_name")
      .eq("id", invite.company_id)
      .single();

    if (targetCompanyError || !targetCompany) {
      return json(404, {
        error: "The inviting company no longer exists.",
      });
    }
        const { data: modules, error: modulesError } = await admin
      .from("company_modules")
      .select("production_enabled, management_enabled")
      .eq("company_id", invite.company_id)
      .single();

    if (modulesError || !modules) {
      return json(400, {
        error: "Company module settings are missing.",
      });
    }

    if (invite.production_access && !modules.production_enabled) {
      return json(400, {
        error: "Production is not enabled for this company. Ask the owner to update the invitation.",
      });
    }

    if (invite.management_access && !modules.management_enabled) {
      return json(400, {
        error: "Management is not enabled for this company. Ask the owner to update the invitation.",
      });
    }

    const { data: existingMembership, error: existingMembershipError } =
      await admin
        .from("company_users")
        .select("company_id")
        .eq("user_id", caller.id)
        .maybeSingle();

    if (existingMembershipError) {
      return json(400, {
        error: existingMembershipError.message,
      });
    }

    if (
      existingMembership &&
      Number(existingMembership.company_id) !== Number(invite.company_id)
    ) {
      return json(409, {
        error: "This login is already linked to another Trackerz company. One login can belong to one company only.",
      });
    }

    if (!existingMembership) {
      const { error: addMembershipError } = await admin
        .from("company_users")
        .insert({
          company_id: invite.company_id,
          user_id: caller.id,
        });

      if (addMembershipError) {
        return json(400, {
          error: addMembershipError.message,
        });
      }
    }

    const invitePermissions = cleanPermissions(invite.permissions);

    const { error: accessError } = await admin
      .from("company_user_access")
      .upsert({
        company_id: invite.company_id,
        user_id: caller.id,
        email: caller.email,
        display_name: invite.display_name ||
          caller.user_metadata?.full_name ||
          null,
        role: invite.role,
        production_access: invite.production_access,
        management_access: invite.management_access,
        permissions: invitePermissions,
        status: "active",
        created_by: invite.invited_by,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "company_id,user_id",
      });

    if (accessError) {
      return json(400, { error: accessError.message });
    }

    const { error: markError } = await admin
      .from("company_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invitationId);

    if (markError) {
      return json(400, { error: markError.message });
    }

    await admin.from("company_audit_logs").insert({
      company_id: invite.company_id,
      actor_user_id: caller.id,
      action: "employee.invitation_accepted",
      entity_type: "company_user_access",
      entity_id: caller.id,
      details: {
        email: caller.email,
        role: invite.role,
      },
    });

    return json(200, {
      ok: true,
      company_id: invite.company_id,
      company_name: targetCompany.company_name,
      message: "Invitation accepted. Your company access is ready.",
    });
  }

  if (!company || company.owner_user_id !== caller.id) {
    return json(403, {
      error: "Only the company owner can manage employees.",
    });
  }

  // ------------------------------------------------------------
  // LIST EMPLOYEES AND INVITATIONS
  // ------------------------------------------------------------

  if (action === "list") {
    const [
      { data: employees, error: employeesError },
      { data: invitations, error: invitationsError },
    ] = await Promise.all([
      admin.from("company_user_access")
        .select("id, company_id, user_id, email, display_name, role, production_access, management_access, permissions, status, created_at, updated_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true }),

      admin.from("company_invitations")
        .select("id, email, display_name, role, production_access, management_access, permissions, status, expires_at, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ]);

    if (employeesError) {
      return json(400, { error: employeesError.message });
    }

    if (invitationsError) {
      return json(400, { error: invitationsError.message });
    }

    const employeeRows = (employees || []).map((employee) =>
      employee.user_id === caller.id
        ? { ...employee, email: employee.email || caller.email }
        : employee
    );

    return json(200, {
      ok: true,
      company: {
        id: company.id,
        company_name: company.company_name,
      },
      employees: employeeRows,
      invitations: invitations || [],
    });
  }

  // ------------------------------------------------------------
  // INVITE EMPLOYEE
  // ------------------------------------------------------------

  if (action === "invite") {
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.display_name || "").trim().slice(0, 120) || null;
    const role = String(body.role || "accounts_assistant");

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return json(400, {
        error: "Enter a valid employee email address.",
      });
    }

    if (!allowedRoles.has(role)) {
      return json(400, {
        error: "Invalid employee role.",
      });
    }

    if (email === caller.email.toLowerCase()) {
      return json(400, {
        error: "The company owner is already an owner. Use a different employee email.",
      });
    }

    const defaults = roleDefaults(role);

    const productionAccess =
      typeof body.production_access === "boolean"
        ? body.production_access
        : defaults.production_access;

    const managementAccess =
      typeof body.management_access === "boolean"
        ? body.management_access
        : defaults.management_access;

    const permissions = cleanPermissions(
      body.permissions ?? defaults.permissions,
    );

    if (!productionAccess && !managementAccess) {
      return json(400, {
        error: "Select at least one module for this employee.",
      });
    }

    if (productionAccess && role !== "factory_manager") {
      return json(400, {
        error: "Production access currently requires the Factory Manager role. Custom Production permissions will be added separately.",
      });
    }

    const { data: modules, error: modulesError } = await admin
      .from("company_modules")
      .select("production_enabled, management_enabled")
      .eq("company_id", companyId)
      .single();

    if (modulesError || !modules) {
      return json(400, {
        error: "Company module settings are missing.",
      });
    }

    if (productionAccess && !modules.production_enabled) {
      return json(400, {
        error: "Production is not enabled for this company.",
      });
    }

    if (managementAccess && !modules.management_enabled) {
      return json(400, {
        error: "Management is not enabled for this company.",
      });
    }

    const { data: existingEmployee } = await admin
      .from("company_user_access")
      .select("user_id, status")
      .eq("company_id", companyId)
      .ilike("email", email)
      .maybeSingle();

    if (existingEmployee?.status === "active") {
      return json(409, {
        error: "This employee already has active access.",
      });
    }

    const { data: pendingInvite } = await admin
      .from("company_invitations")
      .select("id")
      .eq("company_id", companyId)
      .ilike("email", email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (pendingInvite) {
      return json(409, {
        error: "A pending invitation already exists for this email address.",
      });
    }

    const rawToken = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = await sha256(rawToken);

    const { data: invitation, error: createError } = await admin
      .from("company_invitations")
      .insert({
        company_id: companyId,
        email,
        display_name: displayName,
        role,
        production_access: productionAccess,
        management_access: managementAccess,
        permissions,
        token_hash: tokenHash,
        status: "pending",
        invited_by: caller.id,
        expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .select("id, email, role, expires_at")
      .single();

    if (createError || !invitation) {
      return json(400, {
        error: createError?.message || "Unable to create invitation.",
      });
    }

    let delivery = "manual_existing_user";
    let emailSent = false;

    const redirectTo = APP_URL || undefined;

    const { error: authInviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          trackerz_invitation_id: invitation.id,
          trackerz_company_id: companyId,
        },
        ...(redirectTo ? { redirectTo } : {}),
      });

    if (!authInviteError) {
      delivery = "supabase_auth_invite";
      emailSent = true;
    } else if (/already|registered|exists/i.test(authInviteError.message || "")) {
      let magicLink: string | undefined;

      const { data: generated } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          ...(redirectTo ? { redirectTo } : {}),
        },
      });

      magicLink = generated?.properties?.action_link;

      emailSent = await sendExistingUserEmail(
        email,
        company.company_name,
        invitation.id,
        magicLink,
      );

      delivery = emailSent
        ? "resend_existing_user"
        : "existing_user_login_required";
    } else {
      await admin
        .from("company_invitations")
        .delete()
        .eq("id", invitation.id);

      return json(400, {
        error: authInviteError.message,
      });
    }

    await admin.from("company_audit_logs").insert({
      company_id: companyId,
      actor_user_id: caller.id,
      action: "employee.invited",
      entity_type: "company_invitations",
      entity_id: invitation.id,
      details: {
        email,
        role,
        production_access: productionAccess,
        management_access: managementAccess,
      },
    });

    return json(200, {
      ok: true,
      invitation,
      email_sent: emailSent,
      delivery,
      message: emailSent
        ? "Invitation created and email sent."
        : "Invitation created. This email already has a Trackerz login; ask the employee to sign in with this email and accept the pending invitation. Configure Resend to email existing users automatically.",
    });
  }

  // ------------------------------------------------------------
  // UPDATE EMPLOYEE PERMISSIONS
  // ------------------------------------------------------------

  if (action === "update-employee") {
    const userId = String(body.user_id || "");
    const role = String(body.role || "custom");

    if (!userId || !allowedRoles.has(role)) {
      return json(400, {
        error: "Valid employee and role are required.",
      });
    }

    if (userId === caller.id) {
      return json(400, {
        error: "Owner access cannot be edited here.",
      });
    }

    const productionAccess = body.production_access === true;
    const managementAccess = body.management_access === true;

    if (!productionAccess && !managementAccess) {
      return json(400, {
        error: "An employee must have at least one module.",
      });
    }

    if (productionAccess && role !== "factory_manager") {
      return json(400, {
        error: "Production access currently requires the Factory Manager role. Custom Production permissions will be added separately.",
      });
    }

    const { data: modules } = await admin
      .from("company_modules")
      .select("production_enabled, management_enabled")
      .eq("company_id", companyId)
      .single();

    if (
      !modules ||
      (productionAccess && !modules.production_enabled) ||
      (managementAccess && !modules.management_enabled)
    ) {
      return json(400, {
        error: "The selected module is not enabled for this company.",
      });
    }

    const { data: employee } = await admin
      .from("company_user_access")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!employee) {
      return json(404, {
        error: "Employee was not found in this company.",
      });
    }

    const { data: activeMembership } = await admin
      .from("company_users")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!activeMembership) {
      return json(409, {
        error: "This employee's membership was revoked. Send a new invitation to restore access.",
      });
    }

    const { error: updateError } = await admin
      .from("company_user_access")
      .update({
        role,
        production_access: productionAccess,
        management_access: managementAccess,
        permissions: cleanPermissions(body.permissions),
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("user_id", userId);

    if (updateError) {
      return json(400, { error: updateError.message });
    }

    await admin.from("company_audit_logs").insert({
      company_id: companyId,
      actor_user_id: caller.id,
      action: "employee.permissions_updated",
      entity_type: "company_user_access",
      entity_id: userId,
      details: {
        role,
        productionAccess,
        managementAccess,
      },
    });

    return json(200, {
      ok: true,
      message: "Employee permissions updated.",
    });
  }

  // ------------------------------------------------------------
  // REVOKE EMPLOYEE ACCESS
  // ------------------------------------------------------------

  if (action === "revoke-employee") {
    const userId = String(body.user_id || "");

    if (!userId || userId === caller.id) {
      return json(400, {
        error: "Select an employee other than the owner.",
      });
    }

    const { error: suspendError } = await admin
      .from("company_user_access")
      .update({
        status: "suspended",
        production_access: false,
        management_access: false,
        permissions: {},
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("user_id", userId);

    if (suspendError) {
      return json(400, { error: suspendError.message });
    }

    const { error: membershipDeleteError } = await admin
      .from("company_users")
      .delete()
      .eq("company_id", companyId)
      .eq("user_id", userId);

    if (membershipDeleteError) {
      return json(400, {
        error: membershipDeleteError.message,
      });
    }

    await admin.from("company_audit_logs").insert({
      company_id: companyId,
      actor_user_id: caller.id,
      action: "employee.access_revoked",
      entity_type: "company_user_access",
      entity_id: userId,
      details: {},
    });

    return json(200, {
      ok: true,
      message: "Employee access revoked.",
    });
  }

  // ------------------------------------------------------------
  // CANCEL PENDING INVITATION
  // ------------------------------------------------------------

  if (action === "cancel-invitation") {
    const invitationId = String(body.invitation_id || "");

    if (!invitationId) {
      return json(400, {
        error: "Invitation ID is required.",
      });
    }

    const { error: cancelError } = await admin
      .from("company_invitations")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      })
      .eq("id", invitationId)
      .eq("company_id", companyId)
      .eq("status", "pending");

    if (cancelError) {
      return json(400, {
        error: cancelError.message,
      });
    }

    await admin.from("company_audit_logs").insert({
      company_id: companyId,
      actor_user_id: caller.id,
      action: "employee.invitation_revoked",
      entity_type: "company_invitations",
      entity_id: invitationId,
      details: {},
    });

    return json(200, {
      ok: true,
      message: "Invitation cancelled.",
    });
  }

  return json(400, {
    error: "Unknown action.",
  });
});