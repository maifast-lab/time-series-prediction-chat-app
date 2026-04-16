import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
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

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

const providers: NextAuthOptions['providers'] = [];

if (process.env.NODE_ENV !== 'production') {
  providers.push(
    CredentialsProvider({
      name: 'Local Dev',
      credentials: {
        email: {
          label: 'Email',
          type: 'email',
          placeholder: 'local@maifast.dev',
        },
        name: {
          label: 'Name',
          type: 'text',
          placeholder: 'Local Developer',
        },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === 'string' && credentials.email.trim()
            ? credentials.email.trim().toLowerCase()
            : 'local@maifast.dev';
        const name =
          typeof credentials?.name === 'string' && credentials.name.trim()
            ? credentials.name.trim()
            : 'Local Developer';

        await dbConnect();

        const existingUser = await User.findOne({ email });
        const authSubject = existingUser?.googleId || `local:${email}`;

        const user = await User.findOneAndUpdate(
          { email },
          {
            email,
            name,
            googleId: authSubject,
            lastLogin: new Date(),
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        return {
          id: authSubject,
          email: user.email,
          name: user.name,
          image: user.image ?? null,
        };
      },
    }),
  );
}

if (googleClientId && googleClientSecret) {
  providers.push(
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
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
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
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
