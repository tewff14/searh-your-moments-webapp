"use client"

import { useState } from "react"
import { auth } from "@/lib/firebase"
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function FirebaseTest() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [user, setUser] = useState<any>(null)
  const [message, setMessage] = useState("")

  const testSignUp = async () => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)
      setUser(result.user)
      setMessage("✅ Sign up successful!")
    } catch (error: any) {
      setMessage(`❌ Sign up failed: ${error.message}`)
    }
  }

  const testSignIn = async () => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      setUser(result.user)
      setMessage("✅ Sign in successful!")
    } catch (error: any) {
      setMessage(`❌ Sign in failed: ${error.message}`)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <Card>
        <CardHeader>
          <CardTitle>Firebase Authentication Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex space-x-2">
            <Button onClick={testSignUp}>Sign Up</Button>
            <Button onClick={testSignIn} variant="outline">
              Sign In
            </Button>
          </div>
          {message && <div className="p-3 bg-gray-100 rounded text-sm">{message}</div>}
          {user && (
            <div className="p-3 bg-green-50 rounded text-sm">
              <strong>User ID:</strong> {user.uid}
              <br />
              <strong>Email:</strong> {user.email}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
