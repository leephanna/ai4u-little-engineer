import { redirect } from "next/navigation";

// Legacy login page — replaced by Clerk auth.
// Redirect all traffic to the new Clerk sign-in page.
export default function LoginPage() {
  redirect("/sign-in");
}
