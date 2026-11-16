
const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("NEEDIT Backend Running!");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});
