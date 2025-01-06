import { render } from "preact"
import "./index.css"
import Routes from "./routes"
import { Suspense } from "preact/compat"
import { LoaderCircle } from "lucide-react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div class="w-full min-h-screen flex flex-col items-center justify-center space-y-6 mx-auto max-w-xl p-10">
        <Suspense fallback={
          <LoaderCircle size={64} className="animate-spin" />
        }>
          <Routes />
        </Suspense>
        <Toaster />
      </div>
    </QueryClientProvider>
  )
}

render(<App />, document.getElementById("app")!)
