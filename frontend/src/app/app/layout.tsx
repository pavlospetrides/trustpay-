import { Shell } from "@/components/shell";
import { AuthGate } from "@/components/auth-gate";
export default function AppLayout({children}:{children:React.ReactNode}){return <AuthGate><Shell>{children}</Shell></AuthGate>}
