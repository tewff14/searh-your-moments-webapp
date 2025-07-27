"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth"
import { auth } from "@/lib/firebase"

interface AuthContextType {
  user: User | null
  loading: boolean
  token: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Get the Firebase ID token
          const idToken = await user.getIdToken()
          setToken(idToken)
          setUser(user)

          // Store token in localStorage for API calls
          localStorage.setItem("firebase_token", idToken)

          console.log("User authenticated, token set")
        } catch (error) {
          console.error("Error getting ID token:", error)
          setToken(null)
          setUser(null)
          localStorage.removeItem("firebase_token")
        }
      } else {
        setToken(null)
        setUser(null)
        localStorage.removeItem("firebase_token")
        console.log("User signed out, token cleared")
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // Refresh token periodically
  useEffect(() => {
    if (user) {
      const refreshToken = async () => {
        try {
          const idToken = await user.getIdToken(true) // Force refresh
          setToken(idToken)
          localStorage.setItem("firebase_token", idToken)
        } catch (error) {
          console.error("Error refreshing token:", error)
        }
      }

      // Refresh token every 50 minutes (tokens expire after 1 hour)
      const interval = setInterval(refreshToken, 50 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [user])

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signUp = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password)
  }

  const logout = async () => {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, token, signIn, signUp, logout }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
