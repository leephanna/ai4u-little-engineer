import { redirect } from "next/navigation";

// Legacy signup page — replaced by Clerk auth.
// Redirect all traffic to the new Clerk sign-in page.
export default function SignupPage() {
  redirect("/sign-in");
}
