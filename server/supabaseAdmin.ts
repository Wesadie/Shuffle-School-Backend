import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://xhtyynajsnnuxfvfqghg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFqc25udXhmdmZxZ2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0Mjc1NDgsImV4cCI6MjA5OTAwMzU0OH0.5mE-xJlm_Dx8CYdAamFEUMczd_jS0wCpgPjAtBZjNAQ";
const APP_ORIGIN = (
  process.env.RENDER_EXTERNAL_URL ??
  process.env.APP_BASE_URL ??
  "https://shuffle-school.onrender.com"
).replace(/\/$/, "");

let adminClient: SupabaseClient | undefined;
let publicClient: SupabaseClient | undefined;

function getAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!serviceRoleKey) {
    throw new Error("Supabase administrator invitations are not configured");
  }
  adminClient ??= createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

function getPublicClient(): SupabaseClient {
  publicClient ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return publicClient;
}

async function findAuthUserByEmail(email: string, knownUserId?: string): Promise<User | undefined> {
  const admin = getAdminClient().auth.admin;
  if (knownUserId) {
    const { data } = await admin.getUserById(knownUserId);
    if (data.user?.email?.toLowerCase() === email) return data.user;
  }

  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return undefined;
  }
}

export async function inviteAdministratorUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  knownProfileId?: string;
}): Promise<{ user: User; created: boolean }> {
  const admin = getAdminClient().auth.admin;
  const redirectTo = `${APP_ORIGIN}/admin/setup-password`;
  const existingUser = await findAuthUserByEmail(input.email, input.knownProfileId);
  const invitationMetadata = { first_name: input.firstName, last_name: input.lastName };

  if (existingUser) {
    const { data, error } = await admin.updateUserById(existingUser.id, {
      user_metadata: { ...existingUser.user_metadata, ...invitationMetadata },
    });
    if (error || !data.user) throw error ?? new Error("Failed to update the invited Supabase user");

    const { error: emailError } = await getPublicClient().auth.resetPasswordForEmail(input.email, { redirectTo });
    if (emailError) throw emailError;
    return { user: data.user, created: false };
  }

  const { data, error } = await admin.inviteUserByEmail(input.email, {
    data: invitationMetadata,
    redirectTo,
  });
  if (error || !data.user) throw error ?? new Error("Supabase did not create the invited user");
  return { user: data.user, created: true };
}

export async function removeInvitedAuthUser(userId: string): Promise<void> {
  const { error } = await getAdminClient().auth.admin.deleteUser(userId);
  if (error) {
    console.error("[administrators] failed to roll back invited Supabase user", {
      userId,
      message: error.message,
    });
  }
}
