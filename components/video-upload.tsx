"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Upload, File, X } from "lucide-react"
import { useDropzone } from "react-dropzone"
import { apiClient } from "@/lib/api"

interface VideoUploadProps {
  onUpload: (video: {
    title: string
    thumbnail: string
    duration: string
    indexingStatus: "PENDING" | "INDEXING" | "COMPLETED" | "FAILED"
    createdAt: string
    minioPath: string
  }) => void
}

export function VideoUpload({ onUpload }: VideoUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const videoFile = acceptedFiles[0]
      if (videoFile) {
        setFile(videoFile)
        if (!title) {
          setTitle(videoFile.name.replace(/\.[^/.]+$/, ""))
        }
      }
    },
    [title],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/*": [".mp4", ".mov", ".avi", ".mkv"],
    },
    maxFiles: 1,
  })

  const handleUpload = async () => {
    if (!file || !title) return

    setUploading(true)
    setUploadProgress(0)

    try {
      // Upload to backend
      const result = await apiClient.uploadVideo(file, title)

      const newVideo = {
        title,
        thumbnail: `/placeholder.svg?height=200&width=300&query=${encodeURIComponent(title)} video thumbnail`,
        duration: "0:00", // Will be updated after processing
        indexingStatus: "PENDING" as const,
        createdAt: new Date().toISOString().split("T")[0],
        minioPath: `/videos/${result.video_id}`,
      }

      onUpload(newVideo)
      setFile(null)
      setTitle("")
      setUploadProgress(100)
    } catch (error) {
      console.error("Upload failed:", error)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const removeFile = () => {
    setFile(null)
    setTitle("")
  }

  return (
    <div className="space-y-4">
      {!file ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          {isDragActive ? (
            <p className="text-blue-600">Drop the video file here...</p>
          ) : (
            <div>
              <p className="text-gray-600 mb-1">Drag & drop a video file here, or click to select</p>
              <p className="text-sm text-gray-500">Supports MP4, MOV, AVI, MKV</p>
            </div>
          )}
        </div>
      ) : (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <File className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">{file.name}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={removeFile}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="video-title">Video Title</Label>
              <Input
                id="video-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a title for your video"
              />
            </div>

            {uploading && (
              <div className="space-y-2">
                <span>Uploading...</span>
              </div>
            )}

            <Button onClick={handleUpload} disabled={!title || uploading} className="w-full">
              {uploading ? "Uploading..." : "Upload Video"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
