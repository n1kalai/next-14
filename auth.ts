import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import { authConfig } from "./auth.config";
import { sql } from "@vercel/postgres";
import { z } from "zod";
import type { User } from "@/app/lib/definitions";
import bcrypt from "bcrypt";

async function getUser(email: string): Promise<User | undefined> {
  try {
    const user = await sql<User>`SELECT * FROM users WHERE email=${email}`;
    return user.rows[0];
  } catch (error) {
    console.error("Failed to fetch user:", error);
    throw new Error("Failed to fetch user.");
  }
}

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      async authorize(credentials) {
        console.log("CREDENTIALS AUTHORIZE", credentials);
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          const user = await getUser(email);
          if (!user) return null;
          const passwordsMatch = await bcrypt.compare(password, user.password);
          if (passwordsMatch) return user;
        }
        console.log("invalid credentials");
        return null;
      },
    }),
    Google({
      profile(profile) {
        console.log("PROFILE", profile);

        return {
          id: profile.email,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          profile,
        };
      },
      account(account) {
        console.log("account AUTHORIZE", account);
        const { refresh_token_expires_in, ...rest } = account;
        const refresh_token_expires_at =
          Math.floor(Date.now() / 1000) + Number(refresh_token_expires_in);
        return {
          ...rest,
          refresh_token_expires_at,
        };
      },
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
          // response_type: "code",
        },
      },
      profile(profile) {
        console.log("FB PROFILE", profile);
        return profile;
      },
    }),
  ],
  debug: true,
});
