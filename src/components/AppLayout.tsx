import { SidebarLayout } from './SidebarLayout'
import {
    NavBar,
    NavbarItem,
    NavbarSection,
    NavbarSpacer,
    NavbarDivider
} from './NavBar'
import { SideBar } from './SideBar'
import { Toaster } from 'sonner'
import LogoutButton from "@/components/LogoutButton.tsx";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const sidebar = (
        <div className="p-4 bg-zinc-200 h-full">Sidebar aquí</div>
    )

    const navbar = (
        <NavBar>
            <NavbarSection>
                <NavbarItem href="/" current>Inicio</NavbarItem>
            </NavbarSection>

            <NavbarSection>
                <LogoutButton />
            </NavbarSection>
        </NavBar>
    )

    return (
        <>
            <SidebarLayout navbar={<NavBar />} sidebar={<SideBar />}>
                {children}
            </SidebarLayout>
            <Toaster position="top-right" richColors />
        </>
    )
}
