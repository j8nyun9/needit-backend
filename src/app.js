
const express = require("express");

const app = express();

// Allow the deployed frontend and local development to call the API.
const allowedOrigins = new Set([
  'https://needit-frontend.onrender.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.vary('Origin');
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(origin && !allowedOrigins.has(origin) ? 403 : 204);
  }
  next();
});
app.use(express.json());

app.get("/", (req, res) => {
  res.send("NEEDIT Backend Running!");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 4000;


const supabase = require("./config/supabase");

app.get("/db-test", async (req, res) => {
  const { data, error } = await supabase
    .from("problems")
    .select("*")
    .limit(1);

  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    data: data
  });
});
const problemRoutes = require("./routes/problems");

app.use("/api/problems", problemRoutes);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});
