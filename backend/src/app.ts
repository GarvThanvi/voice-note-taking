import express from "express";
import "dotenv/config";

const PORT = process.env.PORT;
const app = express();

app.use(express.json());

app.listen(PORT, () => {
  console.log(`Server started at port ${PORT}`);
});
