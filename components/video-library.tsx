"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Upload, Video, LogOut, Clock, CheckCircle, AlertCircle, Trash2 } from "lucide-react"
import { VideoUpload } from "@/components/video-upload"
import { GlobalSearch } from "@/components/global-search"
import { AuthDebug } from "@/components/auth-debug"
import { apiClient } from "@/lib/api"
import { useRouter } from "next/navigation"

interface VideoItem {
  id: string
  title: string
  thumbnail: string
  duration: string
  indexingStatus: "PENDING" | "INDEXING" | "COMPLETED" | "FAILED"
  createdAt: string
  minioPath: string
}

export function VideoLibrary() {
  const { user, logout } = useAuth()
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchResults, setSearchResults] = useState<VideoItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string>("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string>("")
  const router = useRouter()

  useEffect(() => {
    if (user) {
      loadVideos()
    }
  }, [user])

  const loadVideos = async () => {
    try {
      setLoading(true)
      setError("")
      const userVideos = await apiClient.getUserVideos()
      setVideos(userVideos)
    } catch (error: any) {
      console.error("Failed to load videos:", error)
      setError(`Failed to load videos: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleVideoUpload = async (newVideo: Omit<VideoItem, "id">) => {
    const videoWithId = {
      ...newVideo,
      id: Date.now().toString(),
    }
    setVideos((prev) => [videoWithId, ...prev])
  }

  const handleDelete = async (videoId: string) => {
    console.log("Deleting video:", videoId); // Add this line
    setDeletingId(videoId)
    setDeleteError("")
    try {
      await apiClient.deleteVideo(videoId)
      setVideos((prev) => prev.filter((v) => v.id !== videoId))
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete video.")
    } finally {
      setDeletingId(null)
    }
  }

  const getStatusIcon = (status: VideoItem["indexingStatus"]) => {
    switch (status) {
      case "COMPLETED":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "INDEXING":
        return <Clock className="h-4 w-4 text-yellow-600 animate-pulse" />
      case "PENDING":
        return <Clock className="h-4 w-4 text-gray-600" />
      case "FAILED":
        return <AlertCircle className="h-4 w-4 text-red-600" />
    }
  }

  const getStatusText = (status: VideoItem["indexingStatus"]) => {
    switch (status) {
      case "COMPLETED":
        return "Ready"
      case "INDEXING":
        return "Processing..."
      case "PENDING":
        return "Queued"
      case "FAILED":
        return "Failed"
    }
  }

  const getStatusVariant = (status: VideoItem["indexingStatus"]) => {
    switch (status) {
      case "COMPLETED":
        return "default" as const
      case "INDEXING":
        return "secondary" as const
      case "PENDING":
        return "outline" as const
      case "FAILED":
        return "destructive" as const
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <Video className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Search Your Moment</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, {user?.email}</span>
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Debug Component - Remove in production */}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
            <Button onClick={loadVideos} size="sm" className="mt-2">
              Retry
            </Button>
          </div>
        )}
        {deleteError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{deleteError}</p>
          </div>
        )}

        {/* Global Search */}
        <div className="mb-8">
          <GlobalSearch onSearch={setSearchResults} onSearchStateChange={setIsSearching} videos={videos} />
        </div>

        {/* Upload Button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {searchResults.length > 0 ? "Search Results" : "Your Video Library"}
          </h2>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Upload Video
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upload New Video</DialogTitle>
                <DialogDescription>
                  Upload a video file to add it to your library. It will be processed automatically for semantic search.
                </DialogDescription>
              </DialogHeader>
              <VideoUpload onUpload={handleVideoUpload} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Video Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-video bg-gray-200 rounded-t-lg" />
                <CardContent className="p-4">
                  <div className="h-4 bg-gray-200 rounded mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {(searchResults.length > 0 ? searchResults : videos).map((video) => (
              <div key={video.id} className="relative group">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <div
                    className="relative"
                    onClick={() => router.push(`/video/${video.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <img
                      src={video.thumbnail || "/placeholder.svg?height=200&width=300"}
                      alt={video.title}
                      className="w-full aspect-video object-cover rounded-t-lg"
                    />
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                      {video.duration}
                    </div>
                    <div className="absolute top-2 left-2">
                      <Badge variant={getStatusVariant(video.indexingStatus)} className="text-xs">
                        <span className="flex items-center space-x-1">
                          {getStatusIcon(video.indexingStatus)}
                          <span>{getStatusText(video.indexingStatus)}</span>
                        </span>
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-medium text-gray-900 mb-1 line-clamp-2">{video.title}</h3>
                    <p className="text-sm text-gray-500">Uploaded {new Date(video.createdAt).toLocaleDateString()}</p>
                  </CardContent>
                  <button
                    className="absolute top-2 right-2 z-10 p-1 bg-white rounded-full shadow group-hover:opacity-100 opacity-80 hover:bg-red-100"
                    onClick={async (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (window.confirm("Are you sure you want to delete this video? This action cannot be undone.")) {
                        await handleDelete(video.id);
                      }
                    }}
                    title="Delete video"
                  >
                    <Trash2 className="h-5 w-5 text-red-600" />
                  </button>
                </Card>
              </div>
            ))}
          </div>
        )}

        {!loading && videos.length === 0 && !error && (
          <div className="text-center py-12">
            <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No videos yet</h3>
            <p className="text-gray-500 mb-4">Upload your first video to get started with semantic search</p>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Your First Video
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Upload New Video</DialogTitle>
                  <DialogDescription>
                    Upload a video file to add it to your library. It will be processed automatically for semantic
                    search.
                  </DialogDescription>
                </DialogHeader>
                <VideoUpload onUpload={handleVideoUpload} />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  )
}
