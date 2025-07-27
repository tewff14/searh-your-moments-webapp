"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Search, Play, Clock, Loader2 } from "lucide-react"
import { apiClient } from "@/lib/api"
import Link from "next/link"

interface VideoItem {
  id: string
  title: string
  thumbnail: string
  duration: string
  indexingStatus: "PENDING" | "INDEXING" | "COMPLETED" | "FAILED"
  createdAt: string
  minioPath: string
}

interface SearchResult {
  timestamp: number
  confidence: number
  description: string
}

export function VideoPlayer() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)

  const [video, setVideo] = useState<VideoItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string>("")

  const videoId = params.id as string
  const initialTimestamp = searchParams.get("t")

  useEffect(() => {
    loadVideo()
  }, [videoId])

  useEffect(() => {
    // Jump to timestamp if provided in URL
    if (initialTimestamp && videoRef.current) {
      const timestamp = Number.parseInt(initialTimestamp)
      videoRef.current.currentTime = timestamp
    }
  }, [initialTimestamp, video])

  useEffect(() => {
    if (video) {
      // Fetch stream URL when video is loaded
      apiClient.getVideoStreamUrl(video.id)
        .then((result) => {
          // Use the correct property from backend response
          setStreamUrl(result.stream_url)
        })
        .catch((err) => {
          setStreamUrl("")
        })
    }
  }, [video])

  // Add this effect to log and reload video when streamUrl changes
  useEffect(() => {
    if (streamUrl) {
      if (videoRef.current) {
        videoRef.current.load()
      }
    }
  }, [streamUrl])

  const loadVideo = async () => {
    try {
      setLoading(true)
      const videoData = await apiClient.getVideo(videoId)
      setVideo(videoData)
    } catch (error) {
      console.error("Failed to load video:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleInVideoSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim() || !video) return

    setIsSearching(true)

    try {
      const results = await apiClient.searchInVideo(videoId, searchQuery, 10)

      // Convert API results to SearchResult format
      const searchResults: SearchResult[] = results.map((result: any) => ({
        timestamp: result.timestamp,
        confidence: result.similarity,
        description: `Frame at ${Math.floor(result.timestamp / 60)}:${String(result.timestamp % 60).padStart(2, "0")}`,
      }))

      setSearchResults(searchResults)
    } catch (error) {
      console.error("Search failed:", error)
    } finally {
      setIsSearching(false)
    }
  }

  const jumpToTimestamp = (timestamp: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestamp
      videoRef.current.play()
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Video not found</h2>
          <Link href="/library">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Library
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 space-x-4">
            <Link href="/library">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Library
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-gray-900">{video.title}</h1>
              <p className="text-sm text-gray-500">
                Duration: {video.duration} • Uploaded {new Date(video.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Badge variant={video.indexingStatus === "COMPLETED" ? "default" : "secondary"}>
              <Clock className="h-3 w-3 mr-1" />
              {video.indexingStatus === "COMPLETED" ? "Ready for Search" : "Processing..."}
            </Badge>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video Player */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-0">
                <video ref={videoRef} controls className="w-full aspect-video rounded-lg" poster={video.thumbnail}>
                  <source src={streamUrl || undefined} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </CardContent>
            </Card>
          </div>

          {/* In-Video Search */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Search className="h-5 w-5" />
                  <span>Search in Video</span>
                </CardTitle>
                <CardDescription>Find specific moments in this video using natural language</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleInVideoSearch} className="space-y-4">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g., 'people swimming', 'sunset', 'beach volleyball'..."
                    disabled={video.indexingStatus !== "COMPLETED"}
                  />
                  <Button
                    type="submit"
                    disabled={isSearching || video.indexingStatus !== "COMPLETED"}
                    className="w-full"
                  >
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    Search This Video
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Found Moments</CardTitle>
                  <CardDescription>Click any timestamp to jump to that moment</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {searchResults.map((result, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                        onClick={() => jumpToTimestamp(result.timestamp)}
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {formatTime(result.timestamp)}
                            </Badge>
                            <span className="text-xs text-green-600 font-medium">
                              {Math.round(result.confidence * 100)}% match
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{result.description}</p>
                        </div>
                        <Button size="sm" variant="ghost">
                          <Play className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Video Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Video Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500">Title</label>
                  <p className="text-sm text-gray-900">{video.title}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Duration</label>
                  <p className="text-sm text-gray-900">{video.duration}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Upload Date</label>
                  <p className="text-sm text-gray-900">{new Date(video.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <p className="text-sm text-gray-900">
                    {video.indexingStatus === "COMPLETED" ? "Indexed and ready for search" : "Processing..."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
