'use client'

export function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 px-4">
            <div className="w-full max-w-md">{children}</div>
        </div>
    )
}
