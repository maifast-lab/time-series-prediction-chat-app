import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import dbConnect from '@/lib/db';
import User from '@/models/User';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      dbId: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        await dbConnect();
        await User.findOneAndUpdate(
          { email: user.email },
          {
            email: user.email,
            name: user.name,
            image: user.image,
            googleId: user.id || account.providerAccountId,
            lastLogin: new Date(),
          },
          { upsert: true, new: true },
        );
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        await dbConnect();
        const dbUser = await User.findOne({ googleId: token.sub });
        if (dbUser) {
          session.user.dbId = dbUser._id.toString();
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};
