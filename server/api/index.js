// Vercel serverless entry point. An Express app is directly compatible with
// Vercel's Node.js runtime (it implements the same (req, res) handler shape
// as Node's http.Server), so no adapter is needed — just export it, no
// .listen() call. vercel.json rewrites every request into this one function,
// and Express's own router does the rest exactly as it does locally.
import { app } from "../src/app.js";

export default app;
