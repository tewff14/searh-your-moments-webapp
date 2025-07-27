const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export class ApiClient {
  private async getAuthHeaders() {
    const token = localStorage.getItem("firebase_token")

    if (!token) {
      throw new Error("No authentication token found")
    }

    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }
  }

  private async getAuthHeadersForFormData() {
    const token = localStorage.getItem("firebase_token")

    if (!token) {
      throw new Error("No authentication token found")
    }

    return {
      Authorization: `Bearer ${token}`,
      // Don't set Content-Type for FormData, let browser set it
    }
  }

  // async createUploadUrl(filename: string, contentType: string) {
  //   const headers = await this.getAuthHeaders()
  //   const response = await fetch(`${API_BASE_URL}/api/videos/create-upload-url`, {
  //     method: "POST",
  //     headers,
  //     body: JSON.stringify({ filename, content_type: contentType }),
  //   })

  //   if (!response.ok) {
  //     const errorText = await response.text()
  //     throw new Error(`Failed to create upload URL: ${response.status} - ${errorText}`)
  //   }
  //   return response.json()
  // }

  // async finalizeUpload(minioPath: string, title: string) {
  //   const headers = await this.getAuthHeaders()
  //   const response = await fetch(`${API_BASE_URL}/api/videos/finalize-upload`, {
  //     method: "POST",
  //     headers,
  //     body: JSON.stringify({ minio_path: minioPath, title }),
  //   })

  //   if (!response.ok) {
  //     const errorText = await response.text()
  //     throw new Error(`Failed to finalize upload: ${response.status} - ${errorText}`)
  //   }
  //   return response.json()
  // }

  /**
   * @deprecated Use createUploadUrl and finalizeUpload instead
   */
  async uploadVideo(file: File, title: string) {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("title", title)

    const headers = await this.getAuthHeadersForFormData()

    const response = await fetch(`${API_BASE_URL}/api/videos/upload`, {
      method: "POST",
      headers,
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Upload failed: ${response.status} - ${errorText}`)
    }

    return response.json()
  }

  async getUserVideos() {
    const headers = await this.getAuthHeaders()

    const response = await fetch(`${API_BASE_URL}/api/videos`, {
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to fetch videos: ${response.status} - ${errorText}`)
    }

    const videos = await response.json()
    // Map snake_case to camelCase for each video
    return videos.map((video: any) => ({
      ...video,
      indexingStatus: video.indexing_status,
      createdAt: video.created_at,
      minioPath: video.minio_path,
      thumbnail: video.thumbnail, // Map thumbnail
      // Optionally map other fields as needed
    }))
  }

  async getVideo(videoId: string) {
    const headers = await this.getAuthHeaders()

    const response = await fetch(`${API_BASE_URL}/api/videos/${videoId}`, {
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to fetch video: ${response.status} - ${errorText}`)
    }

    const video = await response.json()
    // Map snake_case to camelCase for the video object
    return {
      ...video,
      indexingStatus: video.indexing_status,
      createdAt: video.created_at,
      minioPath: video.minio_path,
      thumbnail: video.thumbnail, // Map thumbnail
      // Optionally map other fields as needed
    }
  }

  async globalSearch(query: string, limit = 5) {
    const headers = await this.getAuthHeaders()

    const response = await fetch(`${API_BASE_URL}/api/search/global`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, limit }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Search failed: ${response.status} - ${errorText}`)
    }

    return response.json()
  }

  async searchInVideo(videoId: string, query: string, limit = 10) {
    const headers = await this.getAuthHeaders()

    const response = await fetch(`${API_BASE_URL}/api/search/video/${videoId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, limit }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Search failed: ${response.status} - ${errorText}`)
    }

    return response.json()
  }

  async getVideoStreamUrl(videoId: string) {
    const headers = await this.getAuthHeaders()

    const response = await fetch(`${API_BASE_URL}/api/videos/${videoId}/stream`, {
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get stream URL: ${response.status} - ${errorText}`)
    }

    return response.json()
  }

  async deleteVideo(videoId: string) {
    const headers = await this.getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/api/videos/${videoId}`, {
      method: 'DELETE',
      headers,
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to delete video: ${response.status} - ${errorText}`)
    }
    return true
  }

  // Test endpoint to check authentication
  async testAuth() {
    const headers = await this.getAuthHeaders()

    const response = await fetch(`${API_BASE_URL}/health`, {
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Auth test failed: ${response.status} - ${errorText}`)
    }

    return response.json()
  }
}

export const apiClient = new ApiClient()
