#!/usr/bin/env node
// Helper to create a local admin user for development.
// Usage: node scripts/create-admin-user.js <email> <password> <full_name>
// Example: NODE_PATH=web/continuum/node_modules node scripts/create-admin-user.js admin@example.com password123 "Admin User"

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "mock_service_role_key";
const CLUSTER_ID = "a904128f-7c42-4f32-bb9a-a82fca92cf3d"; // Demo Workspace

async function main() {
  const args = process.argv.slice(2);
  const email = args[0] || "admin@example.com";
  const password = args[1] || "password123";
  const fullName = args[2] || "Demo Admin";

  console.log(`Connecting to local Supabase at ${SUPABASE_URL}...`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`Creating auth user: ${email}...`);
  const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (userErr) {
    if (userErr.message.includes("already exists")) {
      console.log(`User ${email} already exists in auth.users.`);
      // We will proceed to ensure the profile is linked as admin.
    } else {
      throw userErr;
    }
  }

  // Resolve user id.
  let userId;
  if (userData?.user) {
    userId = userData.user.id;
    console.log(`Created user with ID: ${userId}`);
  } else {
    // Resolve existing user id.
    const { data: users, error: getErr } = await supabase.auth.admin.listUsers();
    if (getErr) throw getErr;
    const found = users.users.find(u => u.email === email);
    if (!found) throw new Error("Could not resolve user ID");
    userId = found.id;
  }

  // Update profile full_name if needed.
  console.log("Updating profile...");
  await supabase.from("profiles").upsert({
    id: userId,
    email,
    full_name: fullName,
  });

  // Check cluster membership.
  console.log("Checking cluster membership...");
  const { data: member } = await supabase
    .from("cluster_members")
    .select("role")
    .eq("cluster_id", CLUSTER_ID)
    .eq("user_id", userId)
    .single();

  if (member) {
    if (member.role !== "admin") {
      console.log("User is member but not admin. Promoting to admin...");
      const { error } = await supabase
        .from("cluster_members")
        .update({ role: "admin" })
        .eq("cluster_id", CLUSTER_ID)
        .eq("user_id", userId);
      if (error) throw error;
    }
    console.log("User cluster membership is already configured as admin.");
  } else {
    console.log(`Linking user to Demo Workspace as admin...`);
    const { error } = await supabase.from("cluster_members").insert({
      cluster_id: CLUSTER_ID,
      user_id: userId,
      role: "admin",
    });
    if (error) throw error;
  }

  console.log("\n==================================================");
  console.log("SUCCESS: Dev Admin User Created and Configured!");
  console.log("--------------------------------------------------");
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Workspace Name: Demo Workspace`);
  console.log(`Workspace ID:   ${CLUSTER_ID}`);
  console.log("==================================================\n");
}

main().catch(err => {
  console.error("Error creating user:", err.message || err);
  process.exit(1);
});
