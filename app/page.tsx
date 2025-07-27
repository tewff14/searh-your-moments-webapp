import { redirect } from "next/navigation"

export default function HomePage() {
  // Redirect to library page as the main app entry point
  redirect("/library")
}
