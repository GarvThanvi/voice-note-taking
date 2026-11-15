import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`Server started at port ${PORT}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
