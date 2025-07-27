"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apiClient } from "@/lib/api"

export function AuthDebug() {
  const { user, token } = useAuth()
  const [testResult, setTestResult] = useState<string>("")
  const [loading, setLoading] = useState(false)

  const testAuth = async () => {
    setLoading(true)
    try {
      const result = await apiClient.testAuth()
      setTestResult(`✅ Success: ${JSON.stringify(result, null, 2)}`)
    } catch (error: any) {
      setTestResult(`❌ Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const testHealthCheck = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
      const result = await response.json()
      setTestResult(`✅ Health Check: ${JSON.stringify(result, null, 2)}`)
    } catch (error: any) {
      setTestResult(`❌ Health Check Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>🔧 Authentication Debug</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm space-y-2">
          <p>
            <strong>User ID:</strong> {user.uid}
          </p>
          <p>
            <strong>Email:</strong> {user.email}
          </p>
          <p>
            <strong>Token:</strong> {token ? `${token.substring(0, 20)}...` : "No token"}
          </p>
          <p>
            <strong>Token in localStorage:</strong>{" "}
            {localStorage.getItem("firebase_token") ? "✅ Present" : "❌ Missing"}
          </p>
        </div>

        <div className="flex space-x-2">
          <Button onClick={testHealthCheck} disabled={loading} size="sm">
            Test Health
          </Button>
          <Button onClick={testAuth} disabled={loading} size="sm">
            Test Auth API
          </Button>
        </div>

        {testResult && <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-40">{testResult}</pre>}
      </CardContent>
    </Card>
  )
}
