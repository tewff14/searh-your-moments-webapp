"use client"
import { AuthGuard } from "@/components/auth-guard"
import { VideoPlayer } from "@/components/video-player"
import { AuthProvider } from "@/components/auth-provider"

export default function VideoPage() {
  return (
    <AuthProvider>
      <AuthGuard>
        <VideoPlayer />
      </AuthGuard>
    </AuthProvider>
  )
}
