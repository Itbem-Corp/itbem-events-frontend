import { useEffect, useState } from 'react'

export default function DarkModeToggle() {
    const [isDark, setIsDark] = useState(false)

    useEffect(() => {
        const classList = document.documentElement.classList
        const darkMode = localStorage.getItem('theme') === 'dark' || window.matchMedia('(prefers-color-scheme: dark)').matches
        setIsDark(darkMode)
        classList.toggle('dark', darkMode)
    }, [])

    const toggleTheme = () => {
        const classList = document.documentElement.classList
        const newTheme = isDark ? 'light' : 'dark'
        setIsDark(!isDark)
        classList.toggle('dark', !isDark)
        localStorage.setItem('theme', newTheme)
    }

    return (
        <button
            onClick={toggleTheme}
            className="px-4 py-2 bg-gray-200 dark:bg-zinc-700 rounded text-sm"
        >
            {isDark ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
    )
}
