import express from "express";
import { prisma } from "./lib/prisma.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import "dotenv/config";
import {
  signupSchema,
  signinSchema,
  type SignupInput,
} from "./schemas/auth.js";

const PORT = process.env.PORT;
const app = express();

app.use(express.json());

app.post("/api/auth/signup", async (req, res) => {
  try {
    const result: any = signupSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0].message,
      });
    }
    const userData: SignupInput = result.data;

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const newUser = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: userData.email },
      });
      if (existing) {
        throw new Error("USER_EXISTS");
      }

      return tx.user.create({
        data: {
          username: userData.username,
          email: userData.email,
          password: hashedPassword,
        },
      });
    });

    const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });
    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_EXISTS") {
      return res.status(409).json({
        success: false,
        message: "User already exists, please sign in",
      });
    }
    console.error("Error occured while signing up user ", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/auth/signin", async (req, res) => {
  try {
    const result = signinSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message,
      });
    }

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error("Error occured while signing in user ", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server started at port ${PORT}`);
});
