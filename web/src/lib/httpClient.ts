import { treaty } from "@elysiajs/eden"
import type { App } from "api"

const httpClient = treaty<App>(window.location.origin)

export default httpClient
