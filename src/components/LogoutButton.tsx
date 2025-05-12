'use client'

import React from 'react'

export default function LogoutButton() {
    const handleLogout = () => {
        localStorage.removeItem('token')
        window.location.href = '/login'
    }

    return (
        <button
            onClick={handleLogout}
            className="text-sm font-medium text-red-600 hover:text-red-400"
        >
            Cerrar sesión
        </button>
    )
}
