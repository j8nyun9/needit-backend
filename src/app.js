
const express = require("express");

const app = express();

// Render 프록시 뒤에서 실제 클라이언트 IP를 req.ip로 받기 위함 (AI 재생성 제한용)
app.set("trust proxy", 1);

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Voter-Id, Authorization');
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
    .select("id")
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
const authRoutes = require('./routes/auth').createAuthRouter(supabase);
app.use('/api/auth', authRoutes);
// Browsing is public; writes require a valid session.
app.use('/api', authRoutes.optionalAuth);
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  authRoutes.requireAuth(req, res, () => {
    // Use the authenticated student UUID rather than a caller-selected voter ID.
    req.headers['x-voter-id'] = String(req.user.id);
    next();
  });
});
const problemRoutes = require("./routes/problems");

app.use("/api/problems", problemRoutes);
app.use("/api/projects", require("./routes/projects"));
app.use("/api/activities", require("./routes/activities"));
app.use('/api/account', require('./services/account').createAccountRouter(supabase));


app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});
