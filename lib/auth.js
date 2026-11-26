import GitHubProvider from "next-auth/providers/github";

// Sign-in is optional. With GITHUB_ID / GITHUB_SECRET / NEXTAUTH_SECRET set,
// users can sign in with GitHub and their documents follow their account.
// Without them, each browser gets a private anonymous workspace (lib/owner.js).
export const authEnabled = Boolean(
  process.env.GITHUB_ID && process.env.GITHUB_SECRET && process.env.NEXTAUTH_SECRET
);

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers: authEnabled
    ? [
        GitHubProvider({
          clientId: process.env.GITHUB_ID,
          clientSecret: process.env.GITHUB_SECRET,
        }),
      ]
    : [],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) token.uid = `github:${profile.id}`;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.uid || token.sub;
      return session;
    },
  },
};
