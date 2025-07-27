"use client"
import { AuthGuard } from "@/components/auth-guard"
import { VideoLibrary } from "@/components/video-library"
import { AuthProvider } from "@/components/auth-provider"

export default function LibraryPage() {
  return (
    <AuthProvider>
      <AuthGuard>
        <VideoLibrary />
      </AuthGuard>
    </AuthProvider>
  )
}
