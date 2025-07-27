"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, Loader2, Play } from "lucide-react"
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

interface SearchResult extends VideoItem {
  relevanceScore: number
  matchedTimestamp: number
}

interface GlobalSearchProps {
  onSearch: (results: VideoItem[]) => void
  onSearchStateChange: (isSearching: boolean) => void
  videos: VideoItem[]
}

export function GlobalSearch({ onSearch, onSearchStateChange, videos }: GlobalSearchProps) {
  const [query, setQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setIsSearching(true)
    onSearchStateChange(true)

    try {
      const results = await apiClient.globalSearch(query, 5)

      // Convert API results to SearchResult format
      const searchResults: SearchResult[] = results.map((result: any) => ({
        id: result.video_id.toString(),
        title: result.title,
        thumbnail: `/placeholder.svg?height=200&width=300&query=${encodeURIComponent(result.title)}`,
        duration: "0:00", // Would come from video metadata
        indexingStatus: "COMPLETED" as const,
        createdAt: new Date().toISOString().split("T")[0],
        minioPath: "",
        relevanceScore: result.similarity,
        matchedTimestamp: result.timestamp,
      }))

      setSearchResults(searchResults)
      onSearch(searchResults)
    } catch (error) {
      console.error("Search failed:", error)
    } finally {
      setIsSearching(false)
      onSearchStateChange(false)
    }
  }

  const clearSearch = () => {
    setQuery("")
    setSearchResults([])
    onSearch([])
    onSearchStateChange(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5" />
            <span>Global Semantic Search</span>
          </CardTitle>
          <CardDescription>
            Search across all your videos using natural language. Find specific moments, objects, actions, or scenes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex space-x-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., 'a dog catching a frisbee', 'sunset over mountains', 'cooking pasta'..."
              className="flex-1"
            />
            <Button type="submit" disabled={isSearching || !query.trim()}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
            {searchResults.length > 0 && (
              <Button type="button" variant="outline" onClick={clearSearch}>
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Search Results Summary */}
      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Search Results for "{query}"</CardTitle>
            <CardDescription>Found {searchResults.length} relevant videos ranked by similarity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {searchResults.map((result, index) => (
                <div key={result.id} className="flex items-center space-x-4 p-3 border rounded-lg hover:bg-gray-50">
                  <div className="flex-shrink-0">
                    <Badge variant="secondary" className="text-xs">
                      #{index + 1}
                    </Badge>
                  </div>
                  <img
                    src={result.thumbnail || "/placeholder.svg"}
                    alt={result.title}
                    className="w-16 h-12 object-cover rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{result.title}</h4>
                    <p className="text-sm text-gray-500">
                      Best match at {Math.floor(result.matchedTimestamp / 60)}:
                      {String(result.matchedTimestamp % 60).padStart(2, "0")}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-medium text-green-600">
                      {Math.round(result.relevanceScore * 100)}% match
                    </div>
                    <Link href={`/video/${result.id}?t=${result.matchedTimestamp}`}>
                      <Button size="sm" variant="outline" className="mt-1 bg-transparent">
                        <Play className="h-3 w-3 mr-1" />
                        Watch
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
