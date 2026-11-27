import { supabase } from "./supabase";

// Your existing SmartBiz business ID
const BUSINESS_ID = "a7c8c68a-58fd-4277-a291-aca3b6320e27";

export async function getAuthorizedBusiness() {
  // 1. Verify the signed-in user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;

  if (!user) {
    throw new Error(
      "Please sign in with the business owner account."
    );
  }

  // 2. Verify the business exists and belongs to this user
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, owner_id")
    .eq("id", BUSINESS_ID)
    .maybeSingle();

  if (businessError) throw businessError;

  if (!business || business.owner_id !== user.id) {
    throw new Error(
      "Access denied. This account is not the business owner."
    );
  }

  // 3. Verify owner membership
  const { data: membership, error: membershipError } =
    await supabase
      .from("business_members")
      .select("business_id, user_id, role")
      .eq("business_id", BUSINESS_ID)
      .eq("user_id", user.id)
      .maybeSingle();

  if (membershipError) throw membershipError;

  if (!membership || membership.role !== "owner") {
    throw new Error(
      "Owner membership could not be verified. Sync stopped."
    );
  }

  return business;
}