'use client'

import React, { useEffect, useState } from 'react'
import AppLayout from './AppLayout'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
    const [loading, setLoading] = useState(true)
    const [token, setToken] = useState<string | null>(null)

    useEffect(() => {
        const savedToken = localStorage.getItem('token')

        if (!savedToken) {
            window.location.href = '/login'
        } else {
            setToken(savedToken)
            setLoading(false)
        }
    }, [])

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-white dark:bg-zinc-900">
                <div className="text-center space-y-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mx-auto"></div>
                    <p className="text-sm text-gray-500 dark:text-gray-300">Validando sesión...</p>
                </div>
            </div>
        )
    }

    return <AppLayout>{children}</AppLayout>
}
